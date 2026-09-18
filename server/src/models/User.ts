import { Schema, model, type Document, type Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES, ENTITY_STATUSES, type Role, type EntityStatus } from './types';

export interface IUser extends Document<Types.ObjectId> {
  name: string;
  username: string;
  phone?: string;
  passwordHash: string;
  role: Role;
  locationId?: Types.ObjectId;
  status: EntityStatus;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  verifyPassword(candidate: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, default: 'SELLER' },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location' },
    status: { type: String, enum: ENTITY_STATUSES, default: 'ACTIVE' },
    lastLoginAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete (ret as Record<string, unknown>).passwordHash;
        return ret;
      },
    },
  },
);

userSchema.methods.verifyPassword = function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.passwordHash);
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export const User = model<IUser>('User', userSchema);
