import { Schema, model } from 'mongoose';
const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company' },
    type: { type: String, required: true },
    title: { type: String, required: true, maxlength: 160 },
    body: { type: String, maxlength: 600 },
    link: { type: String, maxlength: 300 }, // app deep link, e.g. /tenant/invoices/<id>
    priority: { type: String, enum: ['normal', 'high', 'emergency'], default: 'normal' },
    readAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
export const Notification = model<any>('Notification', notificationSchema);
