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

  // Create business + branch
  const business = await prisma.business.upsert({
    where: { ownerId: admin.id },
    update: {},
    create: {
      name: 'Mi Negocio',
      ownerId: admin.id,
      currency: 'COP',
      country: 'Colombia',
      branches: {
        create: { name: 'Sucursal Principal', address: 'Dirección principal' },
      },
    },
    include: { branches: true },
  });

  const branch = business.branches[0];

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

  // Default categories
  const categories = ['Alimentos', 'Bebidas', 'Aseo', 'Electrónica', 'Ropa', 'Papelería', 'Salud', 'General'];
  for (const name of categories) {
    await prisma.category.create({ data: { name } }).catch(() => {});
  }

  // Sample products
  const cat = await prisma.category.findFirst({ where: { name: 'Alimentos' } });
  if (cat) {
    const sampleProducts = [
      { code: 'P001', name: 'Arroz Diana 1kg', costPrice: 2500, salePrice: 3200, stock: 50, minStock: 10 },
      { code: 'P002', name: 'Aceite Vegetal 900ml', costPrice: 7800, salePrice: 9500, stock: 30, minStock: 5 },
      { code: 'P003', name: 'Azúcar Blanca 1kg', costPrice: 2800, salePrice: 3500, stock: 40, minStock: 10 },
      { code: 'P004', name: 'Sal Refisal 500g', costPrice: 900, salePrice: 1200, stock: 60, minStock: 15 },
    ];
    for (const p of sampleProducts) {
      await prisma.product.create({
        data: { ...p, branchId: branch.id, categoryId: cat.id, unit: 'unit' },
      }).catch(() => {});
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
