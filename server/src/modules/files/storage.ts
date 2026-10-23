import fs from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';
import { env } from '../../config/env';
import { signFile } from '../../utils/signedUrl';
import { Sniffed } from '../../utils/sniff';

/**
 * Storage abstraction (local disk implementation). Swap for S3/GCS by re-implementing these 4 functions.
 *  - public/<name>   : listing images, served by static route with long cache
 *  - private/<name>  : contracts, receipts, tenant attachments; ONLY reachable via short-lived signed URLs
 */
const root = () => path.resolve(env.UPLOAD_DIR);
export const publicDir = () => path.join(root(), 'public');
export const privateDir = () => path.join(root(), 'private');

export async function ensureStorage() {
  await fs.mkdir(publicDir(), { recursive: true });
  await fs.mkdir(privateDir(), { recursive: true });
}
export async function saveFile(buf: Buffer, type: Sniffed, visibility: 'public' | 'private') {
  const name = `${randomBytes(16).toString('hex')}.${type.ext}`; // server-generated; client filename is never used on disk
  await fs.writeFile(path.join(visibility === 'public' ? publicDir() : privateDir(), name), buf, { flag: 'wx' });
  return { key: `${visibility}/${name}`, name };
}
export async function removeFile(key: string) {
  const [vis, name] = key.split('/');
  if (!['public', 'private'].includes(vis) || !/^[a-f0-9]{32}\.\w+$/.test(name ?? '')) return;
  await fs.rm(path.join(vis === 'public' ? publicDir() : privateDir(), name), { force: true });
}
export const publicUrl = (key: string) => `${env.PUBLIC_API_URL}/media/${key.replace(/^public\//, '')}`;
export function signedUrl(key: string, ttlSec = 600) {
  const exp = Date.now() + ttlSec * 1000;
  const name = key.replace(/^private\//, '');
  return `${env.PUBLIC_API_URL}/api/v1/files/${name}?exp=${exp}&sig=${signFile(env.FILE_SIGNING_SECRET, key, exp)}`;
}
