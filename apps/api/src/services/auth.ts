import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import type { TokenPair } from '@takip/shared';
import { RefreshToken, User } from '../db/models/index.js';
import { AppError } from '../lib/errors.js';
import { clock } from './clock.js';

const ACCESS_TTL_S = 15 * 60;
const REFRESH_TTL_S = 30 * 24 * 60 * 60;
const ISSUER = 'takip-api';

export interface AuthSecrets {
  accessSecret: string;
  refreshSecret: string;
}

const key = (s: string) => new TextEncoder().encode(s);
const unauthorized = (message = 'Oturum geçersiz, tekrar giriş yap') =>
  new AppError(401, 'UNAUTHORIZED', message);

// Kullanıcı yokken de aynı sürede yanıt vermek için sahte hash.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= argon2.hash('takip-dummy-password'));

async function issuePair(userId: string, secrets: AuthSecrets): Promise<TokenPair> {
  const nowS = Math.floor(clock.now().getTime() / 1000);
  const jti = randomUUID();
  const accessToken = await new SignJWT({ typ: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt(nowS)
    .setExpirationTime(nowS + ACCESS_TTL_S)
    .sign(key(secrets.accessSecret));
  const refreshToken = await new SignJWT({ typ: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setJti(jti)
    .setIssuedAt(nowS)
    .setExpirationTime(nowS + REFRESH_TTL_S)
    .sign(key(secrets.refreshSecret));
  await RefreshToken.create({ userId, jti, expiresAt: new Date((nowS + REFRESH_TTL_S) * 1000) });
  return { accessToken, refreshToken };
}

export async function login(
  email: string,
  password: string,
  secrets: AuthSecrets,
): Promise<TokenPair> {
  const user = await User.findOne({ email: email.toLowerCase() });
  const ok = await argon2.verify(user?.passwordHash ?? (await getDummyHash()), password);
  if (!user || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'E-posta veya şifre hatalı');
  return issuePair(user.id as string, secrets);
}

async function verifyRefresh(token: string, secrets: AuthSecrets) {
  try {
    const { payload } = await jwtVerify(token, key(secrets.refreshSecret), {
      issuer: ISSUER,
      currentDate: clock.now(),
    });
    if (payload.typ !== 'refresh' || !payload.sub || !payload.jti) throw unauthorized();
    return { userId: payload.sub, jti: payload.jti };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw unauthorized();
  }
}

/** Refresh token döndürülür (rotation). Kullanılmış bir token tekrar gelirse tüm oturumlar kapatılır. */
export async function refresh(token: string, secrets: AuthSecrets): Promise<TokenPair> {
  const { userId, jti } = await verifyRefresh(token, secrets);
  const stored = await RefreshToken.findOneAndDelete({ jti, userId });
  if (!stored) {
    await RefreshToken.deleteMany({ userId });
    throw unauthorized();
  }
  return issuePair(userId, secrets);
}

export async function logout(token: string, secrets: AuthSecrets): Promise<void> {
  try {
    const { jti } = await verifyRefresh(token, secrets);
    await RefreshToken.deleteOne({ jti });
  } catch {
    // Geçersiz token ile çıkış da başarılı sayılır.
  }
}

export async function verifyAccessToken(token: string, secret: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      issuer: ISSUER,
      currentDate: clock.now(),
    });
    if (payload.typ !== 'access' || !payload.sub) throw unauthorized();
    return payload.sub;
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired)
      throw new AppError(401, 'TOKEN_EXPIRED', 'Oturum süresi doldu');
    if (err instanceof AppError) throw err;
    throw unauthorized();
  }
}
