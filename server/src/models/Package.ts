import { Schema, model, type Document, type Types } from 'mongoose';
import { ENTITY_STATUSES, type EntityStatus } from './types';

export interface IPackage extends Document<Types.ObjectId> {
  name: string;
  description?: string;
  /** Session time allowance in seconds. Null for data-only packages. */
  durationSeconds?: number;
  /** Total data allowance in bytes. Null for time-only packages. */
  dataLimitBytes?: number;
  price: number;
  currency: string;
  mikrotikProfile: string;
  status: EntityStatus;
  createdAt: Date;
  updatedAt: Date;
}

const packageSchema = new Schema<IPackage>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true },
    durationSeconds: { type: Number, min: 0 },
    dataLimitBytes: { type: Number, min: 0 },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'GHS' },
    mikrotikProfile: { type: String, required: true, trim: true },
    status: { type: String, enum: ENTITY_STATUSES, default: 'ACTIVE' },
  },
  { timestamps: true },
);

export const PackageModel = model<IPackage>('Package', packageSchema);
