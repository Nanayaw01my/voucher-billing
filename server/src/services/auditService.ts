import type { Types } from 'mongoose';
import { AuditLog, type AuditAction } from '../models';
import { logger } from '../config/logger';

export interface AuditActor {
  id?: Types.ObjectId | string;
  username?: string;
  ipAddress?: string;
}

/** Audit writes must never break the action they describe, so failures only log. */
export async function recordAudit(
  actor: AuditActor,
  action: AuditAction,
  entity: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await AuditLog.create({
      userId: actor.id,
      username: actor.username,
      action,
      entity,
      entityId,
      ipAddress: actor.ipAddress,
      metadata,
      timestamp: new Date(),
    });
  } catch (err) {
    logger.error('Failed to write audit log', { action, entity, error: (err as Error).message });
  }
}
