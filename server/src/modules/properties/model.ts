import { Schema, model } from 'mongoose';
import { CURRENCIES } from '../../utils/money';

export const PROPERTY_TYPES = ['apartment', 'house', 'villa', 'office', 'shop', 'land', 'warehouse', 'other'] as const;

const propertySchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    reference: { type: String, required: true, unique: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, trim: true, maxlength: 5000, default: '' },
    type: { type: String, enum: PROPERTY_TYPES, required: true },
    transaction: { type: String, enum: ['rent', 'sale'], required: true },
    priceMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: CURRENCIES, required: true },
    rentFrequency: { type: String, enum: ['monthly', 'quarterly', 'yearly'] },
    depositMinor: { type: Number, min: 0, default: 0 },
    fees: [{ _id: false, name: { type: String, maxlength: 80 }, amountMinor: { type: Number, min: 0 } }],
    location: {
      country: { type: String, required: true, maxlength: 80 },
      city: { type: String, required: true, maxlength: 80 },
      district: { type: String, maxlength: 80 },
      address: { type: String, maxlength: 200 }, // private: never returned by public endpoints
      lat: { type: Number, min: -90, max: 90 },
      lng: { type: Number, min: -180, max: 180 },
    },
    bedrooms: { type: Number, min: 0, max: 50, default: 0 },
    bathrooms: { type: Number, min: 0, max: 50, default: 0 },
    sizeSqm: { type: Number, min: 0 },
    furnished: { type: Boolean, default: false },
    amenities: [{ type: String, maxlength: 40 }],
    media: [{ _id: false, key: String, url: String, alt: { type: String, maxlength: 160 }, order: Number }],
    // listingStatus = marketing state; occupancyStatus = physical/commercial state. Availability is derived on the server.
    listingStatus: { type: String, enum: ['draft', 'published', 'unpublished', 'archived'], default: 'draft' },
    occupancyStatus: { type: String, enum: ['available', 'occupied', 'maintenance'], default: 'available' },
    verified: { type: Boolean, default: false },
    assignedStaffIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    publishedAt: Date,
    archivedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    lockCounter: { type: Number, default: 0 }, // bumped inside transactions to serialise tenancy activation per property
  },
  { timestamps: true }
);
propertySchema.index({ companyId: 1, listingStatus: 1, occupancyStatus: 1 });
propertySchema.index({ companyId: 1, branchId: 1 });
propertySchema.index({ listingStatus: 1, occupancyStatus: 1, transaction: 1, 'location.city': 1, priceMinor: 1 });
propertySchema.index({ listingStatus: 1, occupancyStatus: 1, publishedAt: -1 });
propertySchema.index({ title: 'text', description: 'text', 'location.city': 'text', 'location.district': 'text' });
export const Property = model<any>('Property', propertySchema);

export const isAvailable = (p: any) => p.listingStatus === 'published' && p.occupancyStatus === 'available';
export const publicProperty = (p: any, company?: any) => ({
  id: String(p._id), reference: p.reference, title: p.title, description: p.description, type: p.type, transaction: p.transaction,
  priceMinor: p.priceMinor, currency: p.currency, rentFrequency: p.rentFrequency, depositMinor: p.depositMinor, fees: p.fees,
  location: { country: p.location?.country, city: p.location?.city, district: p.location?.district, lat: p.location?.lat, lng: p.location?.lng },
  bedrooms: p.bedrooms, bathrooms: p.bathrooms, sizeSqm: p.sizeSqm, furnished: p.furnished, amenities: p.amenities,
  media: [...(p.media ?? [])].sort((a: any, b: any) => a.order - b.order).map((m: any) => ({ url: m.url, alt: m.alt })),
  verified: p.verified, available: isAvailable(p), publishedAt: p.publishedAt,
  company: company ? { name: company.name } : undefined,
});
