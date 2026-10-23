import { NextFunction, Response } from 'express';
import { Types } from 'mongoose';
import { z, ZodTypeAny } from 'zod';

export const ah =
  (fn: (req: any, res: Response, next: NextFunction) => Promise<any>) =>
  (req: any, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

/** Validates and REPLACES params/query/body with parsed (stripped, coerced) values. */
export const validate = (s: { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny }) => {
  const handler: any = (req: any, _res: Response, next: NextFunction) => {
    try {
      if (s.params) req.params = s.params.parse(req.params);
      if (s.query) req.query = s.query.parse(req.query);
      if (s.body) req.body = s.body.parse(req.body ?? {});
      next();
    } catch (e) {
      next(e);
    }
  };
  handler.isValidator = { params: !!s.params, query: !!s.query, body: !!s.body }; // tag for the security inventory test
  return handler;
};

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const idParam = z.object({ id: objectId });
export const oid = (v: string | Types.ObjectId) => new Types.ObjectId(String(v));

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const pageMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  pages: Math.max(1, Math.ceil(total / limit)),
});
export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date')
  .transform((v) => new Date(v));
