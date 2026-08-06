import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { AppError, success, created } from '../utils/response';
import { AuthRequest } from '../middlewares/auth';
import { emailService } from '../config/email';

// Días de prueba gratis al crear una cuenta de Ventrix Contable. Al vencer, la
// agenda queda en solo-lectura hasta que el contador pague el plan (Wompi
// extiende planExpiresAt como en el POS). Cambiar aquí ajusta la prueba.
const DIAS_PRUEBA_CONTABLE = 7;

// ── Cuentas del usuario (POS + Contable bajo un mismo login) ──────────────────
// Un usuario dueño puede tener varios negocios (POS y Contable). Un empleado
// tiene solo el de su sucursal. Cada "cuenta" resuelve a qué sucursal se ancla
// el token: el aislamiento multi-tenant viaja SIEMPRE en el token, así que basta
// con reemitirlo apuntando a otro negocio para "cambiar de cuenta".
type Account = { businessId?: string; branchId?: string; businessName?: string; businessType: string; plan: string };

const USER_ACCOUNTS_INCLUDE = {
  branch: { select: { id: true, businessId: true, business: { select: { id: true, name: true, plan: true, type: true } } } },
  businesses: {
    where: { deletedAt: null },
    select: {
      id: true, name: true, plan: true, type: true,
      branches: { select: { id: true }, orderBy: { createdAt: 'asc' as const }, take: 1 },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildAccounts(user: any): Account[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const owned: Account[] = (user.businesses || []).map((b: any) => ({
    businessId: b.id,
    // El negocio de su sucursal asignada usa esa misma sucursal; los demás
    // (p. ej. la cuenta Contable) usan su Bodega Principal como ancla técnica.
    branchId: b.id === user.branch?.businessId ? (user.branchId ?? undefined) : b.branches[0]?.id,
    businessName: b.name,
    businessType: b.type || 'pos',
    plan: b.plan || 'free',
  }));
  if (owned.length > 0) return owned;
  // Empleado (no es dueño de ningún negocio): su único acceso es el de su sucursal.
  if (user.branch?.businessId) {
    return [{
      businessId: user.branch.businessId,
      branchId: user.branchId ?? undefined,
      businessName: user.branch.business?.name,
      businessType: user.branch.business?.type || 'pos',
      plan: user.branch.business?.plan || 'free',
    }];
  }
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function defaultAccount(user: any, accounts: Account[]): Account | undefined {
  // Preferir el negocio de la sucursal asignada (su "casa"); si no, el primero.
  return accounts.find((a) => a.businessId === user.branch?.businessId) || accounts[0];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function userResponse(user: any, account?: Account) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    branchId: account?.branchId,
    businessId: account?.businessId,
    businessName: account?.businessName,
    isEmailVerified: user.isEmailVerified,
    plan: account?.plan || 'free',
    // Producto de la cuenta ACTIVA: "pos" o "contable". El frontend redirige con esto.
    businessType: account?.businessType || 'pos',
  };
}

// Lista pública de cuentas para el selector del frontend (sin datos internos).
function publicAccounts(accounts: Account[]) {
  return accounts.map((a) => ({ businessId: a.businessId, businessType: a.businessType, businessName: a.businessName, plan: a.plan }));
}

// Emite una sesión (access + refresh + cookie) apuntando a un negocio concreto.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function issueSession(res: Response, user: any, account: Account): Promise<string> {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    businessId: account.businessId,
    branchId: account.branchId,
  };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  await prisma.refreshToken.create({
    data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + THIRTY_DAYS) },
  });
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    maxAge: THIRTY_DAYS,
  });
  return accessToken;
}

// Crea un negocio (POS o Contable) para un dueño, con su Bodega Principal y —solo
// en POS— las categorías de gasto y medios de pago por defecto. Reutilizado por
// el registro (assignBranch: true, el usuario nuevo se ancla a esta sucursal) y
// por "activar producto" (assignBranch: false, conserva su sucursal principal).
async function createBusinessForOwner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  opts: { userId: string; businessName: string; businessType: string; businessCategory?: string | null; assignBranch: boolean },
) {
  const { userId, businessName, businessType, businessCategory, assignBranch } = opts;
  const trialExpiresAt = businessType === 'contable'
    ? new Date(Date.now() + DIAS_PRUEBA_CONTABLE * 24 * 60 * 60 * 1000)
    : null;

  const business = await client.business.create({
    data: {
      name: businessName,
      type: businessType,
      category: businessCategory || null,
      planExpiresAt: trialExpiresAt,
      ownerId: userId,
      branches: { create: { name: 'Bodega Principal', createdById: userId } },
    },
    include: { branches: true },
  });

  if (assignBranch) {
    await client.user.update({ where: { id: userId }, data: { branchId: business.branches[0].id } });
  }

  if (businessType !== 'contable') {
    const defaultCategories = [
      'Arriendo', 'Servicios públicos', 'Nómina', 'Transporte',
      'Publicidad', 'Insumos', 'Mantenimiento', 'Otros',
    ];
    await client.expenseCategory.createMany({
      data: defaultCategories.map((name) => ({ name, businessId: business.id })),
    });
    await client.paymentAccount.createMany({
      data: [
        { name: 'Efectivo',      type: 'CASH',  legacyEnum: 'CASH',      order: 0 },
        { name: 'Transferencia', type: 'BANK',  legacyEnum: 'TRANSFER',  order: 1 },
        { name: 'Nequi',         type: 'OTHER', legacyEnum: 'NEQUI',     order: 2 },
        { name: 'Daviplata',     type: 'OTHER', legacyEnum: 'DAVIPLATA', order: 3 },
        { name: 'Tarjeta',       type: 'BANK',  legacyEnum: 'CARD',      order: 4 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ].map((a) => ({ ...a, type: a.type as any, legacyEnum: a.legacyEnum as any, businessId: business.id })),
    });
  }

  return business;
}

export const authController = {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, email, password, businessName, businessCategory } = req.body;
      // Producto que se está creando. Solo "contable" activa la Agenda; cualquier
      // otro valor (o su ausencia) cae en "pos", que es el comportamiento de
      // siempre — así una petición vieja del registro del POS sigue funcionando.
      const businessType = req.body.businessType === 'contable' ? 'contable' : 'pos';

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw new AppError('El email ya está registrado', 409);

      // SUPER_ADMIN cannot be created via public registration
      const { role: bodyRole } = req.body;
      if (bodyRole === 'SUPER_ADMIN') throw new AppError('No autorizado', 403);

      const hashedPassword = await bcrypt.hash(password, 12);

      const verificationToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');

      const user = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            name,
            email,
            password: hashedPassword,
            role: 'ADMIN',
            isEmailVerified: false,
            emailVerifyToken: tokenHash,
          },
          select: { id: true, name: true, email: true, role: true },
        });

        if (businessName) {
          // Crea el negocio + Bodega Principal (ancla técnica del businessId) y
          // ancla al usuario recién creado a esa sucursal. Contable arranca con
          // la prueba gratis; POS siembra categorías de gasto y medios de pago.
          await createBusinessForOwner(tx, {
            userId: newUser.id, businessName, businessType, businessCategory, assignBranch: true,
          });
        }

        return newUser;
      });

      // Fire-and-forget — no bloqueamos la respuesta si el email falla
      emailService.sendVerification(email, name, verificationToken).catch(() => {});

      return created(res, user, 'Cuenta creada. Por favor verifica tu correo electrónico para iniciar sesión.');
    } catch (err) {
      next(err);
    }
  },

  async verifyEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;

      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const user = await prisma.user.findFirst({
        where: { emailVerifyToken: tokenHash, isEmailVerified: false },
      });

      if (!user) throw new AppError('Token inválido o cuenta ya verificada', 400);

      await prisma.user.update({
        where: { id: user.id },
        data: { isEmailVerified: true, emailVerifyToken: null },
      });

      return success(res, null, 'Correo verificado exitosamente. Ya puedes iniciar sesión.');
    } catch (err) {
      next(err);
    }
  },

  async resendVerification(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.body;

      const user = await prisma.user.findUnique({ where: { email } });

      // No revelar si el email existe o no
      if (!user || user.isEmailVerified) {
        return success(res, null, 'Si el correo existe y no está verificado, recibirás un email.');
      }

      const newToken = crypto.randomBytes(32).toString('hex');
      const newTokenHash = crypto.createHash('sha256').update(newToken).digest('hex');
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerifyToken: newTokenHash },
      });

      emailService.sendVerification(user.email, user.name, newToken);

      return success(res, null, 'Si el correo existe y no está verificado, recibirás un email.');
    } catch (err) {
      next(err);
    }
  },

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;

      const user = await prisma.user.findUnique({
        where: { email, deletedAt: null },
        include: USER_ACCOUNTS_INCLUDE,
      });

      if (!user || !(await bcrypt.compare(password, user.password))) {
        throw new AppError('Credenciales inválidas', 401);
      }

      if (!user.isActive) throw new AppError('Cuenta desactivada. Contacta al administrador.', 403);
      if (!user.isEmailVerified) throw new AppError('Verifica tu correo electrónico antes de iniciar sesión.', 403);

      // Cuentas a las que puede entrar este correo (POS y/o Contable). Se abre la
      // sesión en la de por defecto; si hay varias, el frontend muestra el selector.
      const accounts = buildAccounts(user);
      const account = defaultAccount(user, accounts) || ({ businessType: 'pos', plan: 'free' } as Account);

      const accessToken = await issueSession(res, user, account);

      // Opportunistic cleanup of expired tokens — keeps the table from growing unbounded.
      // Fire-and-forget; login must not fail because of cleanup.
      prisma.refreshToken.deleteMany({
        where: { userId: user.id, expiresAt: { lt: new Date() } },
      }).catch(() => {});

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
      });

      return success(res, {
        accessToken,
        user: userResponse(user, account),
        // Todas las cuentas del correo. Si son >1, el frontend deja elegir a cuál entrar.
        accounts: publicAccounts(accounts),
      }, 'Sesión iniciada');
    } catch (err) {
      next(err);
    }
  },

  async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.cookies.refreshToken;
      if (!token) throw new AppError('Refresh token requerido', 401);

      const stored = await prisma.refreshToken.findUnique({ where: { token } });
      if (!stored || stored.expiresAt < new Date()) {
        throw new AppError('Refresh token inválido o expirado', 401);
      }

      // Verify JWT signature before touching DB. Se conserva el negocio activo
      // que traía el token (si el usuario cambió de cuenta, no se debe "resetear").
      const oldPayload = verifyRefreshToken(token);

      // Revalidate user: isActive, role, businessId (can change after token was issued)
      const user = await prisma.user.findUnique({
        where: { id: stored.userId },
        include: USER_ACCOUNTS_INCLUDE,
      });

      if (!user || !user.isActive || user.deletedAt) {
        await prisma.refreshToken.delete({ where: { token } });
        throw new AppError('Cuenta desactivada o eliminada', 401);
      }

      // Mantener la cuenta activa del token; si ya no tiene acceso (negocio
      // borrado, dejó de ser dueño), caer a la de por defecto.
      const accounts = buildAccounts(user);
      const account = accounts.find((a) => a.businessId === oldPayload.businessId)
        || defaultAccount(user, accounts)
        || ({ businessType: 'pos', plan: 'free' } as Account);

      const payload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        businessId: account.businessId,
        branchId: account.branchId,
      };

      // Rotation: delete old token, issue a new one
      const newRefreshToken = generateRefreshToken(payload);
      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

      await prisma.$transaction([
        prisma.refreshToken.delete({ where: { token } }),
        prisma.refreshToken.create({
          data: { token: newRefreshToken, userId: user.id, expiresAt: new Date(Date.now() + THIRTY_DAYS) },
        }),
      ]);

      res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        maxAge: THIRTY_DAYS,
      });

      const newAccessToken = generateAccessToken(payload);
      return success(res, { accessToken: newAccessToken });
    } catch (err) {
      next(err);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.cookies.refreshToken || req.body.refreshToken;
      if (token) {
        await prisma.refreshToken.deleteMany({ where: { token } });
      }
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      });
      return success(res, null, 'Sesión cerrada');
    } catch (err) {
      next(err);
    }
  },

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.body;
      const user = await prisma.user.findUnique({ where: { email } });

      // Don't reveal if email exists
      if (!user) return success(res, null, 'Si el email existe, recibirás un correo.');

      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await prisma.user.update({
        where: { id: user.id },
        data: { resetPasswordToken: resetTokenHash, resetPasswordExpires: expires },
      });

      await cache.set(`reset:${resetTokenHash}`, user.id, 3600);

      emailService.sendPasswordReset(user.email, user.name, resetToken);

      return success(res, null, 'Si el email existe, recibirás un correo.');
    } catch (err) {
      next(err);
    }
  },

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { token, password } = req.body;

      const resetHash = crypto.createHash('sha256').update(token).digest('hex');
      const user = await prisma.user.findFirst({
        where: {
          resetPasswordToken: resetHash,
          resetPasswordExpires: { gt: new Date() },
        },
      });

      if (!user) throw new AppError('Token inválido o expirado', 400);

      const hashed = await bcrypt.hash(password, 12);
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashed, resetPasswordToken: null, resetPasswordExpires: null },
      });

      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
      await cache.del(`reset:${resetHash}`);

      return success(res, null, 'Contraseña actualizada exitosamente');
    } catch (err) {
      next(err);
    }
  },

  async me(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      // La cuenta ACTIVA vive en el token (branchId/businessId), no en la sucursal
      // asignada del usuario: así, tras "cambiar de cuenta", /me refleja el negocio
      // correcto. Se carga la sucursal activa aparte para traer currency/logo.
      const [user, activeBranch] = await Promise.all([
        prisma.user.findFirst({
          where: { id: req.user!.userId, isActive: true, deletedAt: null },
          select: {
            id: true, name: true, email: true, phone: true,
            role: true, avatar: true, isEmailVerified: true,
            branchId: true, lastLogin: true,
            ...USER_ACCOUNTS_INCLUDE,
          },
        }),
        req.user!.branchId
          ? prisma.branch.findUnique({
              where: { id: req.user!.branchId },
              select: {
                id: true, name: true,
                business: { select: { id: true, name: true, currency: true, logo: true, plan: true, type: true } },
              },
            })
          : Promise.resolve(null),
      ]);
      if (!user) throw new AppError('Usuario no encontrado', 404);

      const accounts = buildAccounts(user);
      // Se sustituye la sucursal asignada por la ACTIVA (la del token) y se expone
      // la lista de cuentas para el selector del menú.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { businesses, branch, ...rest } = user as any;
      return success(res, {
        ...rest,
        branchId: activeBranch?.id ?? rest.branchId,
        branch: activeBranch,
        accounts: publicAccounts(accounts),
      });
    } catch (err) {
      next(err);
    }
  },

  // Cambia la cuenta activa (POS ↔ Contable) del mismo correo: reemite el token
  // apuntando al negocio elegido. Todo el aislamiento va en el token, así que
  // con esto el resto del sistema opera sobre el negocio nuevo sin más cambios.
  async switchBusiness(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { businessId } = req.body;
      if (!businessId) throw new AppError('businessId requerido', 400);

      const user = await prisma.user.findFirst({
        where: { id: req.user!.userId, isActive: true, deletedAt: null },
        include: USER_ACCOUNTS_INCLUDE,
      });
      if (!user) throw new AppError('Usuario no encontrado', 404);

      const accounts = buildAccounts(user);
      const account = accounts.find((a) => a.businessId === businessId);
      if (!account) throw new AppError('No tienes acceso a esa cuenta', 403);

      const accessToken = await issueSession(res, user, account);
      return success(res, {
        accessToken,
        user: userResponse(user, account),
        accounts: publicAccounts(accounts),
      }, 'Cuenta cambiada');
    } catch (err) {
      next(err);
    }
  },

  // Activa el otro producto (POS o Contable) bajo el MISMO login: crea el negocio
  // hermano sin pedir otro correo ni otra clave. Solo el dueño (ADMIN) puede.
  async activarProducto(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const { businessName, businessCategory } = req.body;
      const businessType = req.body.businessType === 'contable' ? 'contable' : 'pos';
      if (!businessName || !String(businessName).trim()) {
        throw new AppError('El nombre del negocio es obligatorio', 400);
      }

      const already = await prisma.business.count({ where: { ownerId: userId, type: businessType, deletedAt: null } });
      if (already > 0) {
        throw new AppError(`Ya tienes una cuenta ${businessType === 'contable' ? 'de Contador' : 'de POS'} con este correo`, 409);
      }

      const business = await prisma.$transaction((tx) =>
        createBusinessForOwner(tx, {
          userId, businessName: String(businessName).trim(), businessType, businessCategory, assignBranch: false,
        }),
      );

      return created(res, {
        businessId: business.id,
        businessType,
        businessName: business.name,
      }, 'Producto activado. Ya puedes cambiar a esta cuenta desde el menú.');
    } catch (err) {
      next(err);
    }
  },

  async googleAuth(req: Request, res: Response, next: NextFunction) {
    try {
      const { accessToken: googleToken } = req.body;
      if (!googleToken) throw new AppError('Token de Google requerido', 400);

      const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
      if (!GOOGLE_CLIENT_ID) {
        throw new AppError('Google OAuth no está configurado en el servidor', 503);
      }

      // Validate audience: tokeninfo verifies the token was issued for THIS application.
      // userinfo alone cannot do this — a valid token from any Google app would pass.
      const tokenInfoRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(googleToken)}`,
      );
      if (!tokenInfoRes.ok) throw new AppError('Token de Google inválido o expirado', 401);

      const tokenInfo = await tokenInfoRes.json() as { aud?: string; sub?: string; error?: string };
      if (tokenInfo.error || tokenInfo.aud !== GOOGLE_CLIENT_ID) {
        throw new AppError('Token de Google no válido para esta aplicación', 401);
      }

      // Token is authentic and scoped to our app — fetch full user profile
      const gRes = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo`, {
        headers: { Authorization: `Bearer ${googleToken}` },
      });
      if (!gRes.ok) throw new AppError('Token de Google inválido o expirado', 401);

      const { sub: googleId, email, name: googleName, picture: avatar } = await gRes.json() as {
        sub: string; email: string; name: string; picture?: string;
      };

      if (!email) throw new AppError('No se pudo obtener el correo de Google', 400);

      const INCLUDE_BRANCH = {
        branch: {
          select: {
            id: true,
            businessId: true,
            business: { select: { id: true, name: true, plan: true } },
          },
        },
      } as const;

      let user = await prisma.user.findFirst({
        where: { OR: [{ email }, { googleId }], deletedAt: null },
        include: INCLUDE_BRANCH,
      });

      if (user) {
        // Link Google account if not already linked
        if (!user.googleId) {
          await prisma.user.update({
            where: { id: user.id },
            data: { googleId, avatar: avatar || user.avatar },
          });
        }
      } else {
        // New user — create account + business in one transaction
        const randomPwd = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
        const defaultCategories = [
          'Arriendo', 'Servicios públicos', 'Nómina', 'Transporte',
          'Publicidad', 'Insumos', 'Mantenimiento', 'Otros',
        ];

        user = await prisma.$transaction(async (tx) => {
          const newUser = await tx.user.create({
            data: {
              name: googleName || email.split('@')[0],
              email,
              password: randomPwd,
              googleId,
              avatar: avatar || null,
              role: 'ADMIN',
              isEmailVerified: true,
            },
            include: INCLUDE_BRANCH,
          });

          const business = await tx.business.create({
            data: {
              name: `Negocio de ${newUser.name}`,
              ownerId: newUser.id,
              branches: { create: { name: 'Bodega Principal', createdById: newUser.id } },
            },
            include: { branches: true },
          });

          await tx.user.update({
            where: { id: newUser.id },
            data: { branchId: business.branches[0].id },
          });

          await tx.expenseCategory.createMany({
            data: defaultCategories.map((n) => ({ name: n, businessId: business.id })),
          });

          return tx.user.findUniqueOrThrow({
            where: { id: newUser.id },
            include: INCLUDE_BRANCH,
          });
        });
      }

      if (!user!.isActive) throw new AppError('Cuenta desactivada. Contacta al administrador.', 403);

      const jwtPayload = {
        userId: user!.id,
        email: user!.email,
        role: user!.role,
        businessId: user!.branch?.businessId,
        branchId: user!.branchId ?? undefined,
      };

      const accessToken = generateAccessToken(jwtPayload);
      const refreshToken = generateRefreshToken(jwtPayload);
      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

      await prisma.refreshToken.create({
        data: { token: refreshToken, userId: user!.id, expiresAt: new Date(Date.now() + THIRTY_DAYS) },
      });

      prisma.refreshToken.deleteMany({
        where: { userId: user!.id, expiresAt: { lt: new Date() } },
      }).catch(() => {});

      await prisma.user.update({ where: { id: user!.id }, data: { lastLogin: new Date() } });

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        maxAge: THIRTY_DAYS,
      });

      return success(res, {
        accessToken,
        user: {
          id: user!.id,
          name: user!.name,
          email: user!.email,
          role: user!.role,
          avatar: user!.avatar,
          branchId: user!.branchId ?? undefined,
          businessId: user!.branch?.businessId ?? undefined,
          businessName: user!.branch?.business?.name ?? undefined,
          isEmailVerified: user!.isEmailVerified,
          plan: user!.branch?.business?.plan || 'free',
        },
      }, 'Sesión iniciada con Google');
    } catch (err) {
      next(err);
    }
  },

  async changePassword(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { currentPassword, newPassword } = req.body;

      const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
      if (!user) throw new AppError('Usuario no encontrado', 404);

      if (!(await bcrypt.compare(currentPassword, user.password))) {
        throw new AppError('Contraseña actual incorrecta', 400);
      }

      const hashed = await bcrypt.hash(newPassword, 12);
      await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

      return success(res, null, 'Contraseña actualizada');
    } catch (err) {
      next(err);
    }
  },
};
