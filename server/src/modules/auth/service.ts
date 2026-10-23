import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { User, RefreshSession } from './model';
import { conflict, unauthorized, badRequest } from '../../utils/errors';
import { randomToken, sha256 } from '../../utils/ids';

const COST = 12;
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-password', COST);
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;

export const signAccess = (userId: string) =>
  jwt.sign({}, env.JWT_ACCESS_SECRET, { subject: userId, issuer: 'estateflow', algorithm: 'HS256', expiresIn: `${env.ACCESS_TOKEN_TTL_MIN}m` });

async function issueSession(userId: string, familyId = randomUUID(), userAgent?: string) {
  const refreshToken = randomToken();
  await RefreshSession.create({
    userId, familyId, tokenHash: sha256(refreshToken), userAgent: userAgent?.slice(0, 200),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
  });
  return { accessToken: signAccess(userId), refreshToken, expiresIn: env.ACCESS_TOKEN_TTL_MIN * 60, tokenType: 'Bearer' as const };
}

export async function register(i: { email: string; password: string; name: string; phone?: string }, ua?: string) {
  const exists = await User.exists({ email: i.email });
  if (exists) throw conflict('An account with this email already exists', 'EMAIL_TAKEN');
  const user = await User.create({ email: i.email, name: i.name, phone: i.phone, passwordHash: await bcrypt.hash(i.password, COST) });
  return { user, tokens: await issueSession(String(user._id), undefined, ua) };
}

export async function login(email: string, password: string, ua?: string) {
  const user: any = await User.findOne({ email }).select('+passwordHash +failedLogins +lockUntil');
  const generic = unauthorized('Invalid email or password');
  if (!user) { await bcrypt.compare(password, DUMMY_HASH); throw generic; }
  if (user.lockUntil && user.lockUntil > new Date()) { await bcrypt.compare(password, DUMMY_HASH); throw generic; }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    user.failedLogins = (user.failedLogins ?? 0) + 1;
    if (user.failedLogins >= MAX_FAILS) { user.lockUntil = new Date(Date.now() + LOCK_MS); user.failedLogins = 0; }
    await user.save();
    throw generic;
  }
  if (user.status !== 'active') throw generic;
  if (user.failedLogins || user.lockUntil) { user.failedLogins = 0; user.lockUntil = undefined; await user.save(); }
  return { user, tokens: await issueSession(String(user._id), undefined, ua) };
}

/** Rotating refresh tokens with reuse detection: replaying a rotated token revokes the whole family. */
export async function refresh(token: string, ua?: string) {
  const hash = sha256(token);
  const now = new Date();
  const claimed: any = await RefreshSession.findOneAndUpdate(
    { tokenHash: hash, revokedAt: { $exists: false }, expiresAt: { $gt: now } },
    { revokedAt: now }
  ).lean();
  if (!claimed) {
    const old: any = await RefreshSession.findOne({ tokenHash: hash }).lean();
    if (old) await RefreshSession.updateMany({ familyId: old.familyId, revokedAt: { $exists: false } }, { revokedAt: now });
    throw unauthorized('Invalid refresh token');
  }
  const user: any = await User.findById(claimed.userId).select('status').lean();
  if (!user || user.status !== 'active') throw unauthorized('Invalid refresh token');
  return issueSession(String(claimed.userId), claimed.familyId, ua);
}

export async function logout(token: string) {
  await RefreshSession.updateOne({ tokenHash: sha256(token), revokedAt: { $exists: false } }, { revokedAt: new Date() });
}
export const revokeAllSessions = (userId: string) =>
  RefreshSession.updateMany({ userId, revokedAt: { $exists: false } }, { revokedAt: new Date() });

export async function changePassword(userId: string, current: string, next: string) {
  const user: any = await User.findById(userId).select('+passwordHash');
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) throw badRequest('Current password is incorrect', 'WRONG_PASSWORD');
  user.passwordHash = await bcrypt.hash(next, COST);
  await user.save();
  await revokeAllSessions(userId);
}

/** No email provider: in non-production the token is logged; in production it is never returned or logged. */
export async function forgotPassword(email: string) {
  const user: any = await User.findOne({ email }).select('_id');
  if (!user) return;
  const token = randomToken(32);
  await User.updateOne({ _id: user._id }, { resetTokenHash: sha256(token), resetExpiresAt: new Date(Date.now() + 30 * 60_000) });
  if (env.NODE_ENV !== 'production') logger.warn({ email, resetToken: token }, 'DEV ONLY: password reset token (no email provider configured)');
}
export async function resetPassword(token: string, password: string) {
  const user: any = await User.findOne({ resetTokenHash: sha256(token), resetExpiresAt: { $gt: new Date() } }).select('+resetTokenHash');
  if (!user) throw badRequest('Reset link is invalid or expired', 'INVALID_RESET_TOKEN');
  user.passwordHash = await bcrypt.hash(password, COST);
  user.resetTokenHash = undefined; user.resetExpiresAt = undefined; user.failedLogins = 0; user.lockUntil = undefined;
  await user.save();
  await revokeAllSessions(String(user._id));
}
