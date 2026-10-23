import { Schema, model } from 'mongoose';
import { CURRENCIES } from '../../utils/money';
import { ROLES } from '../../domain/permissions';

const companySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    country: { type: String, required: true, maxlength: 80 },
    timezone: { type: String, default: 'Africa/Mogadishu' },
    currency: { type: String, enum: CURRENCIES, default: 'USD' },
    contact: { email: String, phone: String },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    settings: {
      requireCompletedViewing: { type: Boolean, default: false },
      expenseApprovalThresholdMinor: { type: Number, default: 50_000 },
    },
  },
  { timestamps: true }
);
export const Company = model<any>('Company', companySchema);

const branchSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    city: { type: String, trim: true, maxlength: 80 },
    country: { type: String, trim: true, maxlength: 80 },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
  },
  { timestamps: true }
);
branchSchema.index({ companyId: 1, name: 1 }, { unique: true });
export const Branch = model<any>('Branch', branchSchema);

const membershipSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ROLES, required: true },
    permissions: [String],
    scope: { type: String, enum: ['all', 'assigned'], default: 'assigned' },
    branchIds: [{ type: Schema.Types.ObjectId, ref: 'Branch' }],
    propertyIds: [{ type: Schema.Types.ObjectId, ref: 'Property' }],
    status: { type: String, enum: ['invited', 'active', 'deactivated'], default: 'invited' },
    inviteTokenHash: { type: String, select: false },
    inviteExpiresAt: { type: Date },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
membershipSchema.index({ companyId: 1, userId: 1 }, { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } });
membershipSchema.index({ companyId: 1, email: 1 }, { unique: true });
membershipSchema.index({ userId: 1, status: 1 });
membershipSchema.index({ inviteTokenHash: 1 }, { sparse: true });
export const Membership = model<any>('Membership', membershipSchema);
