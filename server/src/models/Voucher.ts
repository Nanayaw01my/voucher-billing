import { Schema, model, type Document, type Types } from 'mongoose';
import { VOUCHER_STATUSES, type VoucherStatus } from './types';

export interface IVoucher extends Document<Types.ObjectId> {
  code: string;
  username: string;
  /**
   * AES-256-GCM envelope. A hotspot voucher password must be reproducible --
   * it is printed on the card and pushed verbatim to /ip hotspot user -- so a
   * one-way hash is not an option here. See ARCHITECTURE.md section 8.
   */
  encryptedPassword: string;
  packageId?: Types.ObjectId;
  profileName: string;
  /** Seconds, mirrors MikroTik limit-uptime. */
  limitUptimeSeconds?: number;
  /** Bytes, mirrors MikroTik limit-bytes-total. */
  dataLimitBytes?: number;
  status: VoucherStatus;
  routerId?: Types.ObjectId;
  locationId?: Types.ObjectId;
  importBatchId?: Types.ObjectId;
  sellerId?: Types.ObjectId;
  saleId?: Types.ObjectId;

  /** True once the user exists on its router. */
  pushedToRouter: boolean;
  pushedAt?: Date;

  // Accounting mirror. null (not 0) until the router has actually been read.
  uptimeUsedSeconds?: number;
  uploadBytes?: number;
  downloadBytes?: number;
  lastSyncedAt?: Date;

  activatedAt?: Date;
  expiresAt?: Date;
  disabledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const voucherSchema = new Schema<IVoucher>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    username: { type: String, required: true, trim: true },
    encryptedPassword: { type: String, required: true, select: false },
    packageId: { type: Schema.Types.ObjectId, ref: 'Package' },
    profileName: { type: String, required: true, trim: true },
    limitUptimeSeconds: { type: Number, min: 0 },
    dataLimitBytes: { type: Number, min: 0 },
    status: { type: String, enum: VOUCHER_STATUSES, default: 'AVAILABLE' },
    routerId: { type: Schema.Types.ObjectId, ref: 'Router' },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location' },
    importBatchId: { type: Schema.Types.ObjectId, ref: 'ImportBatch' },
    sellerId: { type: Schema.Types.ObjectId, ref: 'User' },
    saleId: { type: Schema.Types.ObjectId, ref: 'Sale' },
    pushedToRouter: { type: Boolean, default: false },
    pushedAt: { type: Date },
    uptimeUsedSeconds: { type: Number },
    uploadBytes: { type: Number },
    downloadBytes: { type: Number },
    lastSyncedAt: { type: Date },
    activatedAt: { type: Date },
    expiresAt: { type: Date },
    disabledAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete (ret as Record<string, unknown>).encryptedPassword;
        return ret;
      },
    },
  },
);

// Indexes from the brief. `code` and `username` carry the uniqueness/lookup load;
// the compound index serves the list page's default filter+sort.
voucherSchema.index({ username: 1 });
voucherSchema.index({ status: 1, createdAt: -1 });
voucherSchema.index({ routerId: 1 });
voucherSchema.index({ locationId: 1 });
voucherSchema.index({ packageId: 1 });
voucherSchema.index({ importBatchId: 1 });
voucherSchema.index({ sellerId: 1 });

export const Voucher = model<IVoucher>('Voucher', voucherSchema);
