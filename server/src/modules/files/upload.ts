import multer from 'multer';
import { badRequest } from '../../utils/errors';
import { sniffFile, Sniffed } from '../../utils/sniff';

const mem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10 } });
export const uploadOne = mem.single('file');

/** Validates REAL content (magic bytes) against an allowlist; client MIME/filename are ignored. */
export function checkUpload(file: Express.Multer.File | undefined, allow: Array<Sniffed['kind']>): { buf: Buffer; type: Sniffed; originalName: string } {
  if (!file) throw badRequest('A file is required (multipart field "file")', 'FILE_REQUIRED');
  const type = sniffFile(file.buffer);
  if (!type || !allow.includes(type.kind)) throw badRequest(`Unsupported file type. Allowed: ${allow.join(', ')}`, 'UNSUPPORTED_FILE_TYPE');
  return { buf: file.buffer, type, originalName: (file.originalname || 'file').replace(/[^\w.\- ]/g, '_').slice(0, 100) };
}
