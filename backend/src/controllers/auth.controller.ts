import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { AppError, success, created } from '../utils/response';
import { AuthRequest } from '../middlewares/auth';
import { emailService } from '../config/email';

export const authController = {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, email, password, businessName, businessCategory } = req.body;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw new AppError('El email ya está registrado', 409);

      // SUPER_ADMIN cannot be created via public registration
      const { role: bodyRole } = req.body;
      if (bodyRole === 'SUPER_ADMIN') throw new AppError('No autorizado', 403);

      const hashedPassword = await bcrypt.hash(password, 12);
      const emailVerifyToken = crypto.randomBytes(32).toString('hex');
      const emailVerifyTokenHash = crypto.createHash('sha256').update(emailVerifyToken).digest('hex');

      const user = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            name,
            email,
            password: hashedPassword,
            role: 'ADMIN',
            emailVerifyToken: emailVerifyTokenHash,
          },
          select: { id: true, name: true, email: true, role: true },
        });

        if (businessName) {
          const business = await tx.business.create({
            data: {
              name: businessName,
              category: businessCategory || null,
              ownerId: newUser.id,
              branches: { create: { name: 'Sucursal Principal' } },
            },
            include: { branches: true },
          });
          // Vincular el usuario a la sucursal recién creada
          await tx.user.update({
            where: { id: newUser.id },
            data: { branchId: business.branches[0].id },
          });
          // Seed default expense categories for the new business
          const defaultCategories = [
            'Arriendo', 'Servicios públicos', 'Nómina', 'Transporte',
            'Publicidad', 'Insumos', 'Mantenimiento', 'Otros',
          ];
          await tx.expenseCategory.createMany({
            data: defaultCategories.map((name) => ({ name, businessId: business.id })),
          });
        }

        return newUser;
      });

      // Send verification email (non-blocking)
      emailService.sendVerification(email, name, emailVerifyToken);

      return created(res, user, 'Cuenta creada exitosamente. Revisa tu correo para verificar tu cuenta.');
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
        include: {
          branch: { select: { id: true, businessId: true, business: { select: { id: true, name: true, plan: true } } } },
        },
      });

      if (!user || !(await bcrypt.compare(password, user.password))) {
        throw new AppError('Credenciales inválidas', 401);
      }

      if (!user.isActive) throw new AppError('Cuenta desactivada. Contacta al administrador.', 403);

      const payload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        businessId: user.branch?.businessId,
        branchId: user.branchId ?? undefined,
      };

      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + THIRTY_DAYS),
        },
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
      });

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: THIRTY_DAYS,
      });

      return success(res, {
        accessToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          branchId: user.branchId ?? undefined,
          businessId: user.branch?.businessId ?? undefined,
          businessName: user.branch?.business?.name ?? undefined,
          isEmailVerified: user.isEmailVerified,
          plan: user.branch?.business?.plan || 'free',
        },
      }, 'Sesión iniciada');
    } catch (err) {
      next(err);
    }
  },

  async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.cookies.refreshToken || req.body.refreshToken;
      if (!token) throw new AppError('Refresh token requerido', 401);

      const stored = await prisma.refreshToken.findUnique({ where: { token } });
      if (!stored || stored.expiresAt < new Date()) {
        throw new AppError('Refresh token inválido o expirado', 401);
      }

      // Verify JWT signature before touching DB
      verifyRefreshToken(token);

      // Revalidate user: isActive, role, businessId (can change after token was issued)
      const user = await prisma.user.findUnique({
        where: { id: stored.userId },
        include: {
          branch: { select: { businessId: true } },
        },
      });

      if (!user || !user.isActive || user.deletedAt) {
        await prisma.refreshToken.delete({ where: { token } });
        throw new AppError('Cuenta desactivada o eliminada', 401);
      }

      const payload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        businessId: user.branch?.businessId,
        branchId: user.branchId ?? undefined,
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
        sameSite: 'strict',
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
      res.clearCookie('refreshToken');
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
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true, name: true, email: true, phone: true,
          role: true, avatar: true, isEmailVerified: true,
          branchId: true, lastLogin: true,
          branch: {
            select: {
              id: true, name: true,
              business: { select: { id: true, name: true, currency: true, logo: true, plan: true } },
            },
          },
        },
      });
      if (!user) throw new AppError('Usuario no encontrado', 404);
      return success(res, user);
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
