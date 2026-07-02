import jwt from 'jsonwebtoken';

// Fail fast at module load — prevents the server from starting with weak/missing secrets
const JWT_SECRET = process.env.JWT_SECRET ?? '';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? '';

if (JWT_SECRET.length < 32) {
  throw new Error('[CONFIG] JWT_SECRET must be set and at least 32 characters. Update your .env file.');
}
if (JWT_REFRESH_SECRET.length < 32) {
  throw new Error('[CONFIG] JWT_REFRESH_SECRET must be set and at least 32 characters. Update your .env file.');
}

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  businessId?: string;
  branchId?: string;
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  } as jwt.SignOptions);
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_REFRESH_SECRET) as TokenPayload;
}
