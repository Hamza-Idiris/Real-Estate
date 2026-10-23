import { Schema, model } from 'mongoose';
const auditSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company' },
    action: { type: String, required: true },
    entityType: String,
    entityId: String,
    outcome: { type: String, enum: ['success', 'denied', 'failure'], default: 'success' },
    meta: Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
auditSchema.index({ companyId: 1, createdAt: -1 });
auditSchema.index({ actorId: 1, createdAt: -1 });
auditSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
export const AuditLog = model<any>('AuditLog', auditSchema);
