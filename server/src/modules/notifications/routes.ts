import { Router } from 'express';
import { z } from 'zod';
import { Notification } from './model';
import { ah, idParam, oid, pageMeta, pageQuery, validate } from '../../utils/http';
import { notFound } from '../../utils/errors';

export const notificationRoutes = Router();
const q = pageQuery.extend({ unread: z.enum(['true', 'false']).optional() });

notificationRoutes.get('/', validate({ query: q }), ah(async (req, res) => {
  const { page, limit, unread } = req.query;
  const filter: any = { userId: oid(req.user.id) };
  if (unread === 'true') filter.readAt = { $exists: false };
  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId: oid(req.user.id), readAt: { $exists: false } }),
  ]);
  res.json({ data: items, unreadCount, meta: pageMeta(page, limit, total) });
}));
notificationRoutes.get('/unread-count', ah(async (req, res) => {
  res.json({ data: { unread: await Notification.countDocuments({ userId: oid(req.user.id), readAt: { $exists: false } }) } });
}));
notificationRoutes.post('/read-all', ah(async (req, res) => {
  const r = await Notification.updateMany({ userId: oid(req.user.id), readAt: { $exists: false } }, { readAt: new Date() });
  res.json({ data: { updated: r.modifiedCount } });
}));
notificationRoutes.post('/:id/read', validate({ params: idParam }), ah(async (req, res) => {
  const n = await Notification.findOneAndUpdate({ _id: req.params.id, userId: oid(req.user.id) }, { readAt: new Date() }, { new: true }).lean();
  if (!n) throw notFound('Notification');
  res.json({ data: n });
}));
