import { Schema, model, type Document, type Types } from 'mongoose';

export const PAYMENT_METHODS = ['CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface ISale extends Document<Types.ObjectId> {
  voucherId: Types.ObjectId;
  packageId?: Types.ObjectId;
  price: number;
  currency: string;
  sellerId: Types.ObjectId;
  locationId?: Types.ObjectId;
  paymentMethod: PaymentMethod;
  customerPhone?: string;
  note?: string;
  soldAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const saleSchema = new Schema<ISale>(
  {
    voucherId: { type: Schema.Types.ObjectId, ref: 'Voucher', required: true, unique: true },
    packageId: { type: Schema.Types.ObjectId, ref: 'Package' },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'GHS' },
    sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location' },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'CASH' },
    customerPhone: { type: String, trim: true },
    note: { type: String, trim: true },
    soldAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

saleSchema.index({ soldAt: -1 });
saleSchema.index({ sellerId: 1, soldAt: -1 });
saleSchema.index({ locationId: 1, soldAt: -1 });

export const Sale = model<ISale>('Sale', saleSchema);
