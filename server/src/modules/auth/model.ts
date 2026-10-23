import { Schema, model } from 'mongoose';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 30 },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    platformRole: { type: String, enum: ['none', 'super_admin'], default: 'none' },
    failedLogins: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },
    resetTokenHash: { type: String, select: false },
    resetExpiresAt: { type: Date, select: false },
  },
  { timestamps: true }
);
export const User = model<any>('User', userSchema);

const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    familyId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    userAgent: { type: String, maxlength: 200 },
  },
  { timestamps: true }
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 }); // purge a week after expiry
export const RefreshSession = model<any>('RefreshSession', sessionSchema);

export const publicUser = (u: any) => ({
  id: String(u._id), email: u.email, name: u.name, phone: u.phone, platformRole: u.platformRole, createdAt: u.createdAt,
});
