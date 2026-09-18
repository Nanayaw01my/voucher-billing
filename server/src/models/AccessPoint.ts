import { Schema, model, type Document, type Types } from 'mongoose';
import { ENTITY_STATUSES, type EntityStatus } from './types';

export interface IAccessPoint extends Document<Types.ObjectId> {
  name: string;
  deviceModel?: string;
  ipAddress?: string;
  macAddress?: string;
  locationId?: Types.ObjectId;
  routerId?: Types.ObjectId;
  status: EntityStatus;
  /**
   * Many outdoor APs are dumb bridges and expose no statistics at all.
   * When false the UI shows "no telemetry" rather than inventing zeros.
   */
  reportsStatistics: boolean;
  lastSeen?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const accessPointSchema = new Schema<IAccessPoint>(
  {
    name: { type: String, required: true, trim: true },
    deviceModel: { type: String, trim: true },
    ipAddress: { type: String, trim: true },
    macAddress: { type: String, trim: true, uppercase: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location' },
    routerId: { type: Schema.Types.ObjectId, ref: 'Router' },
    status: { type: String, enum: ENTITY_STATUSES, default: 'ACTIVE' },
    reportsStatistics: { type: Boolean, default: false },
    lastSeen: { type: Date },
  },
  { timestamps: true },
);

accessPointSchema.index({ locationId: 1 });

export const AccessPoint = model<IAccessPoint>('AccessPoint', accessPointSchema);
