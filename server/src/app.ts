import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import { env, corsOrigins } from './config/env';
import { logger } from './config/logger';
import { errorHandler, notFoundHandler } from './middleware/error';
import { companyCtx, companyParams, requireAuth, requirePlatformAdmin } from './middleware/auth';
import { validate } from './utils/http';
import { authRoutes, profileRoutes } from './modules/auth/routes';
import { companyCreateRoutes, companyRoutes, invitationRoutes, myCompaniesRoutes } from './modules/companies/routes';
import { propertyRoutes, publicPropertyRoutes } from './modules/properties/routes';
import { bookingRoutes, myBookingRoutes } from './modules/bookings/routes';
import { applicationRoutes, myApplicationRoutes } from './modules/applications/routes';
import { myTenancyRoutes, tenancyRoutes } from './modules/tenancies/routes';
import { invoiceRoutes, myInvoiceRoutes, myPaymentRoutes } from './modules/payments/routes';
import { expenseRoutes } from './modules/expenses/routes';
import { maintenanceRoutes, myMaintenanceRoutes, EMERGENCY_DISCLAIMER } from './modules/maintenance/routes';
import { notificationRoutes } from './modules/notifications/routes';
import { reportRoutes } from './modules/reports/routes';
import { adminRoutes } from './modules/admin/routes';
import { fileRoutes } from './modules/files/routes';
import { publicDir } from './modules/files/storage';
import { MOCK_NOTICE } from './domain/mockPayments';
import { User } from './modules/auth/model';
import { ViewingBooking } from './modules/bookings/model';
import { RentalApplication } from './modules/applications/model';
import { ah } from './utils/http';

export function buildApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  app.use((req: any, res, next) => { req.id = req.headers['x-request-id']?.toString().slice(0, 64) || randomUUID(); res.setHeader('X-Request-Id', req.id); next(); });
  app.use(pinoHttp({ logger, genReqId: (req: any) => req.id, autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false } }));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })); // listing images are embedded by the web/mobile apps
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || corsOrigins.includes(origin)) return cb(null, true);
      // In development, allow localhost ports (e.g. Flutter Web random ports)
      if (env.NODE_ENV === 'development' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'], maxAge: 600,
  }));
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));
  app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } } }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
  app.get('/health/ready', (_req, res) => {
    const ok = mongoose.connection.readyState === 1;
    res.status(ok ? 200 : 503).json({ status: ok ? 'ready' : 'degraded', db: ok ? 'up' : 'down' });
  });
  app.use('/media', express.static(publicDir(), { maxAge: '7d', immutable: true, index: false, dotfiles: 'deny', setHeaders: (r) => r.setHeader('X-Content-Type-Options', 'nosniff') }));

  const v1 = express.Router();
  v1.get('/meta', (_req, res) => res.json({ data: { paymentEnvironment: 'MOCK', paymentNotice: MOCK_NOTICE, notifications: 'in-app only (no email/push provider configured)', emergencyDisclaimer: EMERGENCY_DISCLAIMER, viewingSlotMinutes: env.VIEWING_SLOT_MINUTES } }));
  v1.use('/auth', authRoutes);
  v1.use('/public/properties', publicPropertyRoutes);
  v1.use('/files', fileRoutes);

  // ---- authenticated ----
  v1.use(requireAuth);
  v1.use('/me/profile', profileRoutes);
  v1.get('/me/data-export', ah(async (req, res) => { // privacy: access to own personal data
    const [user, bookings, applications] = await Promise.all([User.findById(req.user.id).lean(), ViewingBooking.find({ customerId: req.user.id }).lean(), RentalApplication.find({ applicantId: req.user.id }).select('-documents.key').lean()]);
    res.set('Cache-Control', 'no-store').json({ data: { profile: user && { email: (user as any).email, name: (user as any).name, phone: (user as any).phone }, bookings, applications } });
  }));
  v1.use('/me/companies', myCompaniesRoutes);
  v1.use('/me/bookings', myBookingRoutes);
  v1.use('/me/applications', myApplicationRoutes);
  v1.use('/me/tenancies', myTenancyRoutes);
  v1.use('/me/invoices', myInvoiceRoutes);
  v1.use('/me/payments', myPaymentRoutes);
  v1.use('/me/maintenance', myMaintenanceRoutes);
  v1.use('/notifications', notificationRoutes);
  v1.use('/invitations', invitationRoutes);
  v1.use('/companies', companyCreateRoutes);

  // ---- company workspace (membership resolved server-side) ----
  const co = express.Router({ mergeParams: true });
  co.use(companyCtx);
  co.use('/', companyRoutes);
  co.use('/properties', propertyRoutes);
  co.use('/bookings', bookingRoutes);
  co.use('/applications', applicationRoutes);
  co.use('/tenancies', tenancyRoutes);
  co.use('/invoices', invoiceRoutes);
  co.use('/expenses', expenseRoutes);
  co.use('/maintenance', maintenanceRoutes);
  co.use('/reports', reportRoutes);
  v1.use('/companies/:companyId', validate({ params: companyParams }), co);

  v1.use('/admin', requirePlatformAdmin, adminRoutes);
  app.use('/api/v1', v1);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
