import { Router } from 'express';
import path from 'path';
import { verifyFile } from '../../utils/signedUrl';
import { env } from '../../config/env';
import { privateDir } from './storage';
import { notFound } from '../../utils/errors';

/** GET /api/v1/files/:name?exp=&sig=  — private files, time-limited HMAC links. Never cached. */
export const fileRoutes = Router();
fileRoutes.get('/:name', (req, res, next) => {
  const name = req.params.name;
  if (!/^[a-f0-9]{32}\.\w+$/.test(name)) return next(notFound('File'));
  const ok = verifyFile(env.FILE_SIGNING_SECRET, `private/${name}`, Number(req.query.exp), String(req.query.sig ?? ''));
  if (!ok) return next(notFound('File'));
  res.set({ 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
  res.sendFile(path.join(privateDir(), name), (e) => e && next(notFound('File')));
});
