import { Schema, model, type Document, type Types } from 'mongoose';

/**
 * Append-only record of a customer's time on the network. Rows are closed once
 * and never rewritten, so historical reporting stays stable.
 */
export interface ISession extends Document<Types.ObjectId> {
  voucherId?: Types.ObjectId;
  routerId: Types.ObjectId;
  locationId?: Types.ObjectId;
  username: string;
  ipAddress?: string;
  macAddress?: string;
  loginTime: Date;
  logoutTime?: Date;
  durationSeconds?: number;
  uploadBytes?: number;
  downloadBytes?: number;
  totalBytes?: number;
  terminationReason?: string;
  /** Open sessions are still on the router; closed ones came from accounting. */
  isOpen: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<ISession>(
  {
    voucherId: { type: Schema.Types.ObjectId, ref: 'Voucher' },
    routerId: { type: Schema.Types.ObjectId, ref: 'Router', required: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location' },
    username: { type: String, required: true, trim: true },
    ipAddress: { type: String },
    macAddress: { type: String, uppercase: true },
    loginTime: { type: Date, required: true },
    logoutTime: { type: Date },
    durationSeconds: { type: Number },
    uploadBytes: { type: Number },
    downloadBytes: { type: Number },
    totalBytes: { type: Number },
    terminationReason: { type: String },
    isOpen: { type: Boolean, default: true },
  },
  { timestamps: true },
);

sessionSchema.index({ voucherId: 1, loginTime: -1 });
sessionSchema.index({ routerId: 1, loginTime: -1 });
sessionSchema.index({ loginTime: -1 });
// Serves the sync worker's "which sessions are still open on this router?" query.
sessionSchema.index({ routerId: 1, username: 1, isOpen: 1 });

export const SessionModel = model<ISession>('Session', sessionSchema);
