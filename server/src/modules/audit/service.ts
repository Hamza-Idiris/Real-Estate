import { AuditLog } from './model';
import { logger } from '../../config/logger';

const SENSITIVE = /pass|token|secret|authorization|card|cvv|iban|pin/i;
export function scrub(meta: any, depth = 0): any {
  if (meta === null || typeof meta !== 'object' || depth > 4) return meta;
  if (Array.isArray(meta)) return meta.slice(0, 50).map((m) => scrub(m, depth + 1));
  const out: any = {};
  for (const [k, v] of Object.entries(meta)) out[k] = SENSITIVE.test(k) ? '[redacted]' : scrub(v, depth + 1);
  return out;
}

export type AuditInput = {
  action: string; entityType?: string; entityId?: any; companyId?: any;
  outcome?: 'success' | 'denied' | 'failure'; meta?: any;
};
/** Append-only. Never throws: auditing failures are logged but must not break the request. */
export async function audit(req: any, a: AuditInput) {
  try {
    await AuditLog.create({
      actorId: req?.user?.id, companyId: a.companyId ?? req?.company?._id, action: a.action,
      entityType: a.entityType, entityId: a.entityId ? String(a.entityId) : undefined,
      outcome: a.outcome ?? 'success', meta: scrub(a.meta), ip: req?.ip,
    });
  } catch (e) {
    logger.error({ err: e, action: a.action }, 'audit write failed');
  }
}
