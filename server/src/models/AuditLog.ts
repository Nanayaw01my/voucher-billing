import { Schema, model, type Document, type Types } from 'mongoose';

export const AUDIT_ACTIONS = [
  'LOGIN', 'LOGOUT', 'LOGIN_FAILED',
  'VOUCHER_GENERATED', 'VOUCHER_IMPORTED', 'VOUCHER_UPDATED', 'VOUCHER_DISABLED',
  'VOUCHER_DELETED', 'VOUCHER_PUSHED',
  'SELLER_CREATED', 'SELLER_UPDATED', 'SELLER_DISABLED', 'ADMIN_PASSWORD_RESET',
  'PACKAGE_CREATED', 'PACKAGE_UPDATED', 'PACKAGE_DELETED',
  'ROUTER_CREATED', 'ROUTER_UPDATED', 'ROUTER_DELETED', 'ROUTER_TESTED',
  'LOCATION_CREATED', 'LOCATION_UPDATED',
  'ACCESS_POINT_CREATED', 'ACCESS_POINT_UPDATED',
  'SALE_CREATED',
  'USER_DISCONNECTED',
  'SYSTEM_RESET',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface IAuditLog extends Document<Types.ObjectId> {
  userId?: Types.ObjectId;
  username?: string;
  action: AuditAction;
  entity: string;
  entityId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

const auditLogSchema = new Schema<IAuditLog>({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  username: { type: String },
  action: { type: String, enum: AUDIT_ACTIONS, required: true },
  entity: { type: String, required: true },
  entityId: { type: String },
  ipAddress: { type: String },
  metadata: { type: Schema.Types.Mixed },
  timestamp: { type: Date, default: () => new Date() },
});

auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema);
