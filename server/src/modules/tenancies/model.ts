import { Schema, model } from 'mongoose';
import { CURRENCIES } from '../../utils/money';
const tenancySchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'RentalApplication' },
    renewedFromId: { type: Schema.Types.ObjectId, ref: 'Tenancy' },
    status: { type: String, enum: ['pending', 'active', 'expired', 'terminated', 'renewed'], default: 'pending' },
    terms: {
      startDate: { type: Date, required: true }, endDate: { type: Date, required: true }, // endDate inclusive, UTC midnight
      rentMinor: { type: Number, required: true, min: 1 }, currency: { type: String, enum: CURRENCIES, required: true },
      frequency: { type: String, enum: ['monthly', 'quarterly', 'yearly'], required: true }, dueDay: { type: Number, min: 1, max: 28, default: 1 },
      depositMinor: { type: Number, min: 0, default: 0 },
      fees: [{ _id: false, name: String, amountMinor: Number }],
      renewalTerms: { type: String, maxlength: 1000 }, noticeDays: { type: Number, min: 0, max: 180, default: 30 },
    },
    // Rental contract: immutable snapshot of the agreed terms + document reference (private file, signed URL on access).
    contract: { reference: String, version: { type: Number, default: 1 }, generatedAt: Date, documentKey: String },
    acceptance: { tenantAt: Date, companyAt: Date, companyBy: { type: Schema.Types.ObjectId, ref: 'User' } },
    depositPendingAcknowledgedAt: Date,
    activatedAt: Date, activatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    termination: { at: Date, effectiveDate: Date, reason: { type: String, maxlength: 1000 }, by: { type: Schema.Types.ObjectId, ref: 'User' } },
    expiryReminderSentAt: Date,
  },
  { timestamps: true }
);
// DB guard: at most ONE active tenancy per property at any time.
tenancySchema.index({ propertyId: 1 }, { unique: true, partialFilterExpression: { status: 'active' } });
tenancySchema.index({ applicationId: 1 }, { unique: true, partialFilterExpression: { applicationId: { $type: 'objectId' } } });
tenancySchema.index({ companyId: 1, status: 1, 'terms.endDate': 1 });
tenancySchema.index({ tenantId: 1, status: 1 });
tenancySchema.index({ propertyId: 1, status: 1 });
export const Tenancy = model<any>('Tenancy', tenancySchema);
