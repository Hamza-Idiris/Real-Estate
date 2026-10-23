import { Schema, model } from 'mongoose';
import { CURRENCIES } from '../../utils/money';
export const EXPENSE_CATEGORIES = ['maintenance', 'utilities', 'taxes', 'insurance', 'salaries', 'supplies', 'marketing', 'other'] as const;
const expenseSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property' },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    maintenanceRequestId: { type: Schema.Types.ObjectId, ref: 'MaintenanceRequest' },
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
    amountMinor: { type: Number, required: true, min: 1 }, currency: { type: String, enum: CURRENCIES, required: true },
    date: { type: Date, required: true },
    vendor: { type: String, maxlength: 120 }, description: { type: String, maxlength: 1000 },
    receiptKey: String, // private file
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' }, decidedAt: Date, decisionNote: { type: String, maxlength: 500 },
  },
  { timestamps: true }
);
expenseSchema.index({ companyId: 1, date: -1 });
expenseSchema.index({ companyId: 1, status: 1, category: 1, date: -1 });
expenseSchema.index({ propertyId: 1, date: -1 });
expenseSchema.index({ maintenanceRequestId: 1 }, { unique: true, partialFilterExpression: { maintenanceRequestId: { $type: 'objectId' } } });
export const Expense = model<any>('Expense', expenseSchema);
