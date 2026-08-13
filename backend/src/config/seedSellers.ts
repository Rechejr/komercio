import bcrypt from 'bcryptjs';
import { prisma } from './database';
import { logger } from './logger';

// Vendedoras iniciales del portal. El `email` es solo un IDENTIFICADOR de login
// (no recibe correo). El `slug` coincide con /planes?v=<slug>. Se crean una vez
// (idempotente) con una contraseña temporal; cada una la cambia al entrar.
const SELLERS = [
  { name: 'Franklin Vargas', slug: 'franklin', email: 'franklin@ventrix.lat', phone: '573225338424' },
  { name: 'Lina Pantoja',    slug: 'lina',     email: 'lina@ventrix.lat',     phone: '573156132525' },
  { name: 'Viviana Ortega',  slug: 'viviana',  email: 'viviana@ventrix.lat',  phone: '573152393608' },
];

export async function seedSellers() {
  try {
    const tempPw = process.env.SELLER_SEED_PASSWORD || 'Ventrix2026';
    for (const s of SELLERS) {
      const exists = await prisma.seller.findFirst({ where: { OR: [{ email: s.email }, { slug: s.slug }] } });
      if (exists) continue;
      await prisma.seller.create({ data: { ...s, password: await bcrypt.hash(tempPw, 12) } });
      logger.info(`[seed] vendedora creada: ${s.name} (${s.email})`);
    }
  } catch (err) {
    logger.warn(`[seed] seedSellers falló (no crítico): ${(err as { message?: string })?.message || err}`);
  }
}
