import { Schema, model, type Document, type Types } from 'mongoose';
import { ENTITY_STATUSES, ROUTER_STATUSES, type EntityStatus, type RouterStatus } from './types';

export interface IRouter extends Document<Types.ObjectId> {
  name: string;
  identity?: string;
  host: string;
  port: number;
  useTls: boolean;
  username: string;
  /** AES-256-GCM envelope, never returned by the API. */
  encryptedPassword: string;
  locationId?: Types.ObjectId;
  status: EntityStatus;
  connectionStatus: RouterStatus;
  routerOsVersion?: string;
  lastSeen?: Date;
  lastSyncedAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const routerSchema = new Schema<IRouter>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    identity: { type: String, trim: true },
    host: { type: String, required: true, trim: true },
    // 8728 = api, 8729 = api-ssl. Both require /ip service to have it enabled.
    port: { type: Number, default: 8728 },
    useTls: { type: Boolean, default: false },
    username: { type: String, required: true, trim: true },
    encryptedPassword: { type: String, required: true, select: false },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location' },
    status: { type: String, enum: ENTITY_STATUSES, default: 'ACTIVE' },
    connectionStatus: { type: String, enum: ROUTER_STATUSES, default: 'UNKNOWN' },
    routerOsVersion: { type: String },
    lastSeen: { type: Date },
    lastSyncedAt: { type: Date },
    lastError: { type: String },
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

routerSchema.index({ locationId: 1 });

export const RouterModel = model<IRouter>('Router', routerSchema);
