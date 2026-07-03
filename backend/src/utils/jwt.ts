import jwt from 'jsonwebtoken';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  businessId?: string;
  branchId?: string;
}

function getSecret(name: string): string {
  const value = process.env[name] ?? '';
  if (value.length < 32) {
    throw new Error(`[CONFIG] ${name} must be set and at least 32 characters.`);
  }
  return value;
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, getSecret('JWT_SECRET'), {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  } as jwt.SignOptions);
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, getSecret('JWT_REFRESH_SECRET'), {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, getSecret('JWT_SECRET')) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, getSecret('JWT_REFRESH_SECRET')) as TokenPayload;
}