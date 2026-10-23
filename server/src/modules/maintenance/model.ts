import { Schema, model } from 'mongoose';
export const CATEGORIES = ['plumbing', 'electrical', 'structural', 'doors_locks', 'appliances', 'cleaning', 'other'] as const;
const maintSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    tenancyId: { type: Schema.Types.ObjectId, ref: 'Tenancy', required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, enum: CATEGORIES, required: true },
    title: { type: String, required: true, maxlength: 140 },
    description: { type: String, required: true, maxlength: 3000 },
    priority: { type: String, enum: ['low', 'normal', 'high', 'emergency'], default: 'normal' },
    status: { type: String, enum: ['submitted', 'acknowledged', 'assigned', 'in_progress', 'waiting_for_parts', 'resolved', 'closed', 'reopened'], default: 'submitted' },
    assignedStaffId: { type: Schema.Types.ObjectId, ref: 'User' },
    attachments: [{ _id: false, key: String, name: String, mime: String, size: Number, by: Schema.Types.ObjectId, at: Date }],
    comments: [{ _id: false, authorId: Schema.Types.ObjectId, authorType: { type: String, enum: ['tenant', 'staff'] }, message: { type: String, maxlength: 2000 }, internal: { type: Boolean, default: false }, at: Date }],
    history: [{ _id: false, status: String, at: Date, by: Schema.Types.ObjectId, note: String }],
    // Costs are tracked separately from rent/payments. actual cost mirrors into an Expense (category maintenance).
    estimateMinor: { type: Number, min: 0 }, actualMinor: { type: Number, min: 0 }, currency: String,
    resolution: { type: String, maxlength: 2000 },
    resolvedAt: Date,
  },
  { timestamps: true }
);
maintSchema.index({ companyId: 1, status: 1, priority: 1, createdAt: -1 });
maintSchema.index({ propertyId: 1, createdAt: -1 });
maintSchema.index({ tenantId: 1, createdAt: -1 });
maintSchema.index({ assignedStaffId: 1, status: 1 });
export const MaintenanceRequest = model<any>('MaintenanceRequest', maintSchema);
