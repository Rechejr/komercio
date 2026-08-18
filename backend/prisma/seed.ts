import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create super admin (developer access — never via registration)
  const superAdminPassword = await bcrypt.hash('SuperAdmin123!', 12);
  await prisma.user.upsert({
    where: { email: 'superadmin@komercio.app' },
    update: {},
    create: {
      name: 'Super Admin',
      email: 'superadmin@komercio.app',
      password: superAdminPassword,
      role: 'SUPER_ADMIN',
      isActive: true,
      isEmailVerified: true,
    },
  });

  // Create admin user
  const hashedPassword = await bcrypt.hash('Admin123!', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@komercio.app' },
    update: {},
    create: {
      name: 'Administrador',
      email: 'admin@komercio.app',
      password: hashedPassword,
      role: 'ADMIN',
      isEmailVerified: true,
    },
  });

  // Negocio + bodega. Ya no se puede hacer upsert por ownerId: desde que un
  // mismo correo puede tener POS y Contable, un dueño tiene VARIOS negocios y
  // ownerId dejó de ser único.
  const business = await prisma.business.findFirst({ where: { ownerId: admin.id, type: 'pos' } })
    ?? await prisma.business.create({
      data: {
        name: 'Mi Negocio',
        ownerId: admin.id,
        type: 'pos',
        currency: 'COP',
        country: 'Colombia',
        // Onboarding ya visto: un negocio recién creado recibe la pantalla de
        // BIENVENIDA, que es un modal a pantalla completa y tapa toda la interfaz.
        // Para un entorno sembrado (desarrollo o E2E) eso estorba: bloquea cada
        // clic hasta que alguien la cierre a mano.
        onboarding: {
          welcomeSeenAt: new Date().toISOString(),
          tourDoneAt: new Date().toISOString(),
          dismissedAt: new Date().toISOString(),
          legacy: true,
        },
      },
    });

  const branch = await prisma.branch.findFirst({ where: { businessId: business.id } })
    ?? await prisma.branch.create({
      data: { name: 'Bodega Principal', address: 'Dirección principal', businessId: business.id, createdById: admin.id },
    });

  await prisma.user.update({ where: { id: admin.id }, data: { branchId: branch.id } });

  // Default expense categories
  const expenseCategories = [
    'Arriendo', 'Servicios públicos', 'Nómina', 'Transporte',
    'Marketing', 'Papelería', 'Mantenimiento', 'Otros',
  ];
  for (const name of expenseCategories) {
    await prisma.expenseCategory.upsert({
      where: { id: name },
      update: {},
      create: { name },
    }).catch(() => prisma.expenseCategory.create({ data: { name } }).catch(() => {}));
  }

  // Default categories (scoped to this business, idempotent)
  const categories = ['Alimentos', 'Bebidas', 'Aseo', 'Electrónica', 'Ropa', 'Papelería', 'Salud', 'General'];
  for (const name of categories) {
    await prisma.category.upsert({
      where: { businessId_name: { businessId: business.id, name } },
      update: {},
      create: { name, businessId: business.id },
    });
  }

  // Sample products
  const cat = await prisma.category.findFirst({ where: { name: 'Alimentos', businessId: business.id } });
  if (cat) {
    const sampleProducts = [
      { code: 'P001', name: 'Arroz Diana 1kg', costPrice: 2500, salePrice: 3200, stock: 50, minStock: 10 },
      { code: 'P002', name: 'Aceite Vegetal 900ml', costPrice: 7800, salePrice: 9500, stock: 30, minStock: 5 },
      { code: 'P003', name: 'Azúcar Blanca 1kg', costPrice: 2800, salePrice: 3500, stock: 40, minStock: 10 },
      { code: 'P004', name: 'Sal Refisal 500g', costPrice: 900, salePrice: 1200, stock: 60, minStock: 15 },
    ];
    for (const p of sampleProducts) {
      // El producto cuelga del NEGOCIO (no de la bodega) desde que existen varias
      // bodegas, y su existencia por bodega va aparte en ProductStock.
      const creado = await prisma.product.create({
        data: { ...p, businessId: business.id, branchId: branch.id, categoryId: cat.id, unit: 'unit' },
      }).catch(() => null);
      if (creado) {
        await prisma.productStock.create({
          data: { productId: creado.id, branchId: branch.id, stock: p.stock },
        }).catch(() => {});
      }
    }
  }

  console.log(`✅ Seed completed!
  Super Admin: superadmin@komercio.app / SuperAdmin123!
  Admin:       admin@komercio.app / Admin123!
  Business:    ${business.name}
  Branch:      ${branch.name}
  `);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
