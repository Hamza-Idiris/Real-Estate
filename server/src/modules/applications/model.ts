import { Schema, model } from 'mongoose';
const applicationSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    applicantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['draft', 'submitted', 'under_review', 'information_required', 'approved', 'rejected', 'withdrawn', 'expired'], default: 'draft' },
    isOpen: { type: Boolean, default: true },
    // Deliberately minimal personal data: no ID numbers, no bank details.
    form: {
      fullName: { type: String, maxlength: 120 }, phone: { type: String, maxlength: 30 }, email: { type: String, maxlength: 254 },
      occupants: { type: Number, min: 1, max: 20 }, employmentStatus: { type: String, enum: ['employed', 'self_employed', 'student', 'other'] },
      desiredMoveIn: Date, desiredTermMonths: { type: Number, min: 1, max: 60 }, notes: { type: String, maxlength: 1000 },
    },
    documents: [{ _id: false, key: String, name: String, mime: String, size: Number, uploadedAt: Date }],
    infoRequests: [{ _id: false, message: String, requestedBy: Schema.Types.ObjectId, requestedAt: Date, response: String, respondedAt: Date }],
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decisionNote: { type: String, maxlength: 1000 },
    history: [{ _id: false, status: String, at: Date, by: Schema.Types.ObjectId, note: String }],
  },
  { timestamps: true }
);
applicationSchema.index({ propertyId: 1, applicantId: 1 }, { unique: true, partialFilterExpression: { isOpen: true } });
applicationSchema.index({ companyId: 1, status: 1, createdAt: -1 });
applicationSchema.index({ applicantId: 1, createdAt: -1 });
export const RentalApplication = model<any>('RentalApplication', applicationSchema);
