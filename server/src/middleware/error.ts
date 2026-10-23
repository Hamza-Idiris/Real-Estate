import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';
import { logger } from '../config/logger';
import { env } from '../config/env';

export const notFoundHandler = (_req: Request, res: Response) =>
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });

export function errorHandler(err: any, req: any, res: Response, _next: NextFunction) {
  const requestId = req.id;
  const send = (status: number, code: string, message: string, details?: unknown) =>
    res.status(status).json({ error: { code, message, details, requestId } });

  if (err instanceof AppError) return send(err.status, err.code, err.message, err.details);
  if (err instanceof ZodError)
    return send(400, 'VALIDATION_ERROR', 'Request validation failed', err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  if (err?.name === 'CastError') return send(400, 'BAD_REQUEST', 'Malformed identifier or value');
  if (err?.name === 'ValidationError') return send(400, 'VALIDATION_ERROR', 'Request validation failed');
  if (err?.code === 11000) return send(409, 'DUPLICATE', 'A record with these details already exists');
  if (err?.code === 'LIMIT_FILE_SIZE') return send(413, 'FILE_TOO_LARGE', 'File exceeds the size limit');
  if (err?.name === 'MulterError') return send(400, 'UPLOAD_ERROR', 'Invalid upload');
  if (err?.type === 'entity.too.large') return send(413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
  if (err?.type === 'entity.parse.failed') return send(400, 'BAD_JSON', 'Malformed JSON body');

  logger.error({ err, requestId, path: req.originalUrl }, 'unhandled error');
  return send(500, 'INTERNAL_ERROR', env.NODE_ENV === 'production' ? 'Something went wrong' : String(err?.message ?? 'Something went wrong'));
}
