import { Schema, model, type Document, type Types } from 'mongoose';
import { ENTITY_STATUSES, type EntityStatus } from './types';

export interface ILocation extends Document<Types.ObjectId> {
  name: string;
  description?: string;
  address?: string;
  status: EntityStatus;
  createdAt: Date;
  updatedAt: Date;
}

const locationSchema = new Schema<ILocation>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true },
    address: { type: String, trim: true },
    status: { type: String, enum: ENTITY_STATUSES, default: 'ACTIVE' },
  },
  { timestamps: true },
);

export const Location = model<ILocation>('Location', locationSchema);
