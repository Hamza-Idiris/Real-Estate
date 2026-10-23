export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
export const badRequest = (m: string, code = 'BAD_REQUEST', d?: unknown) => new AppError(400, code, m, d);
export const unauthorized = (m = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', m);
export const forbidden = (m = 'You do not have permission to perform this action') => new AppError(403, 'FORBIDDEN', m);
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (m: string, code = 'CONFLICT') => new AppError(409, code, m);
