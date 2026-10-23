import { Schema, model } from 'mongoose';
const slot = { _id: false, start: Date, end: Date };
const bookingSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    contact: { name: { type: String, required: true, maxlength: 120 }, phone: { type: String, required: true, maxlength: 30 }, email: { type: String, maxlength: 254 } },
    message: { type: String, maxlength: 1000 },
    requestedSlots: [slot],
    confirmedStart: Date, // all timestamps are stored in UTC; clients render in company.timezone
    confirmedEnd: Date,
    proposedStart: Date,
    proposedEnd: Date,
    assignedStaffId: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'confirmed', 'alternative_proposed', 'completed', 'cancelled', 'rejected', 'no_show'], default: 'pending' },
    isActive: { type: Boolean, default: true }, // pending | confirmed | alternative_proposed
    outcomeNote: { type: String, maxlength: 1000 },
    history: [{ _id: false, status: String, at: Date, by: Schema.Types.ObjectId, note: String }],
  },
  { timestamps: true }
);
// DB-level safeguards: slots sit on a fixed grid so "same start" == "overlap".
bookingSchema.index({ assignedStaffId: 1, confirmedStart: 1 }, { unique: true, partialFilterExpression: { status: 'confirmed' } });
bookingSchema.index({ propertyId: 1, confirmedStart: 1 }, { unique: true, partialFilterExpression: { status: 'confirmed' } });
bookingSchema.index({ propertyId: 1, customerId: 1 }, { unique: true, partialFilterExpression: { isActive: true } });
bookingSchema.index({ companyId: 1, status: 1, confirmedStart: 1 });
bookingSchema.index({ customerId: 1, createdAt: -1 });
export const ViewingBooking = model<any>('ViewingBooking', bookingSchema);
