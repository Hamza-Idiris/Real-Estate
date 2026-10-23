import { Schema, model } from 'mongoose';
import { CURRENCIES } from '../../utils/money';
const base = { companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true }, propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true } };

const invoiceSchema = new Schema(
  {
    ...base,
    tenancyId: { type: Schema.Types.ObjectId, ref: 'Tenancy', required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['rent', 'deposit', 'fee'], required: true },
    key: { type: String, required: true }, // e.g. rent:2026-11-01 | deposit | fee:<n> — makes generation idempotent
    number: { type: String, required: true, unique: true },
    lineItems: [{ _id: false, description: String, amountMinor: Number }],
    totalMinor: { type: Number, required: true, min: 1 },
    paidMinor: { type: Number, default: 0, min: 0 },
    currency: { type: String, enum: CURRENCIES, required: true },
    issueDate: Date, dueDate: { type: Date, required: true }, periodStart: Date, periodEnd: Date,
    // 'overdue' is NOT stored; it is derived from dueDate + status at read time.
    status: { type: String, enum: ['issued', 'partially_paid', 'paid', 'void'], default: 'issued' },
    environment: { type: String, enum: ['MOCK'], default: 'MOCK' },
    dueSoonNotifiedAt: Date, overdueNotifiedAt: Date,
  },
  { timestamps: true }
);
invoiceSchema.index({ tenancyId: 1, key: 1 }, { unique: true });
invoiceSchema.index({ companyId: 1, dueDate: 1 });
invoiceSchema.index({ companyId: 1, status: 1, dueDate: 1 });
invoiceSchema.index({ tenantId: 1, dueDate: -1 });
export const Invoice = model<any>('Invoice', invoiceSchema);

const attemptSchema = new Schema(
  {
    ...base,
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amountMinor: { type: Number, required: true, min: 1 }, currency: { type: String, enum: CURRENCIES, required: true },
    scenario: { type: String, enum: ['success', 'failure', 'pending'], default: 'success' },
    status: { type: String, enum: ['initiated', 'pending', 'succeeded', 'failed'], default: 'initiated' },
    failureReason: String,
    reference: { type: String, required: true, unique: true },
    environment: { type: String, enum: ['MOCK'], default: 'MOCK' },
    idempotencyKey: { type: String, required: true, maxlength: 100 },
    initiatedBy: { type: Schema.Types.ObjectId, ref: 'User' }, initiatedByRole: { type: String, enum: ['tenant', 'staff'] },
  },
  { timestamps: true }
);
attemptSchema.index({ invoiceId: 1, idempotencyKey: 1 }, { unique: true });
attemptSchema.index({ tenantId: 1, createdAt: -1 });
export const PaymentAttempt = model<any>('PaymentAttempt', attemptSchema);

const txSchema = new Schema(
  {
    ...base,
    tenancyId: { type: Schema.Types.ObjectId, ref: 'Tenancy', required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
    invoiceType: { type: String, enum: ['rent', 'deposit', 'fee'], required: true }, // immutable snapshot for reporting
    tenantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['payment', 'reversal'], required: true },
    attemptId: { type: Schema.Types.ObjectId, ref: 'PaymentAttempt' },
    reversesTransactionId: { type: Schema.Types.ObjectId, ref: 'PaymentTransaction' },
    amountMinor: { type: Number, required: true, min: 1 }, // always positive; `type` gives the sign
    currency: { type: String, enum: CURRENCIES, required: true },
    reference: { type: String, required: true, unique: true },
    environment: { type: String, enum: ['MOCK'], default: 'MOCK' },
    applied: { type: Boolean, default: false }, // invoice balance updated exactly once
    voided: { type: Boolean, default: false },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' }, reason: { type: String, maxlength: 500 },
  },
  { timestamps: true }
);
txSchema.index({ attemptId: 1 }, { unique: true, partialFilterExpression: { attemptId: { $type: 'objectId' } } }); // exactly-once per attempt
txSchema.index({ reversesTransactionId: 1 }, { unique: true, partialFilterExpression: { reversesTransactionId: { $type: 'objectId' } } });
txSchema.index({ companyId: 1, createdAt: -1 });
txSchema.index({ invoiceId: 1 });
txSchema.index({ tenantId: 1, createdAt: -1 });
export const PaymentTransaction = model<any>('PaymentTransaction', txSchema);
