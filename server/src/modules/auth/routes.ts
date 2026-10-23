import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as svc from './service';
import { publicUser, User } from './model';
import { ah, validate } from '../../utils/http';
import { requireAuth } from '../../middleware/auth';
import { audit } from '../audit/service';

const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } } });
const email = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(10, 'Use at least 10 characters').max(128)
  .refine((p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p), 'Use upper and lower case letters and a number');

export const authRoutes = Router();
authRoutes.use(limiter);

authRoutes.post('/register', validate({ body: z.object({ email, password: passwordSchema, name: z.string().trim().min(2).max(120), phone: z.string().trim().max(30).optional() }).strict() }),
  ah(async (req, res) => {
    const { user, tokens } = await svc.register(req.body, req.get('user-agent'));
    res.status(201).json({ data: { user: publicUser(user), ...tokens } });
  }));

authRoutes.post('/login', validate({ body: z.object({ email, password: z.string().min(1).max(128) }).strict() }),
  ah(async (req, res) => {
    const { user, tokens } = await svc.login(req.body.email, req.body.password, req.get('user-agent'));
    res.json({ data: { user: publicUser(user), ...tokens } });
  }));

authRoutes.post('/refresh', validate({ body: z.object({ refreshToken: z.string().min(20).max(200) }).strict() }),
  ah(async (req, res) => res.json({ data: await svc.refresh(req.body.refreshToken, req.get('user-agent')) })));

authRoutes.post('/logout', validate({ body: z.object({ refreshToken: z.string().min(20).max(200) }).strict() }),
  ah(async (req, res) => { await svc.logout(req.body.refreshToken); res.status(204).end(); }));

authRoutes.post('/forgot-password', validate({ body: z.object({ email }).strict() }),
  ah(async (req, res) => { await svc.forgotPassword(req.body.email); res.status(202).json({ data: { message: 'If the account exists, reset instructions were generated. (No email provider is configured; see docs.)' } }); }));

authRoutes.post('/reset-password', validate({ body: z.object({ token: z.string().min(20).max(200), password: passwordSchema }).strict() }),
  ah(async (req, res) => { await svc.resetPassword(req.body.token, req.body.password); res.status(204).end(); }));

authRoutes.post('/change-password', requireAuth, validate({ body: z.object({ currentPassword: z.string().max(128), newPassword: passwordSchema }).strict() }),
  ah(async (req, res) => {
    await svc.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
    await audit(req, { action: 'auth.password_changed', entityType: 'User', entityId: req.user.id });
    res.status(204).end();
  }));

export const profileRoutes = Router();
profileRoutes.get('/', ah(async (req, res) => {
  const u = await User.findById(req.user.id).lean();
  res.json({ data: publicUser(u) });
}));
profileRoutes.patch('/', validate({ body: z.object({ name: z.string().trim().min(2).max(120).optional(), phone: z.string().trim().max(30).optional() }).strict() }),
  ah(async (req, res) => {
    const u = await User.findByIdAndUpdate(req.user.id, { $set: req.body }, { new: true }).lean();
    res.json({ data: publicUser(u) });
  }));
