import { z } from 'zod';
import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Voucher, SessionModel, Sale, VOUCHER_STATUSES } from '../models';
import { paginationSchema, paginate, sortSpec } from '../utils/pagination';
import { queryOf } from '../middleware/validate';
import { ApiError } from '../utils/apiError';
import { generateVouchers } from '../services/voucherGenerator';
import { previewImport, confirmImport, cancelImport } from '../services/voucherImporter';
import { pushVouchersToRouter } from '../services/syncService';
import { routerPool } from '../services/mikrotik';
import { recordAudit } from '../services/auditService';
import { actorFrom } from '../middleware/auth';
import { decryptSecret } from '../utils/crypto';
import { env } from '../config/env';
import { toCsv } from '../utils/csv';
import { ImportBatch } from '../models';

const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), 'Not a valid identifier');

export const listVouchersSchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.enum(VOUCHER_STATUSES).optional(),
  packageId: objectId.optional(),
  routerId: objectId.optional(),
  locationId: objectId.optional(),
  sellerId: objectId.optional(),
  importBatchId: objectId.optional(),
  profileName: z.string().trim().max(120).optional(),
});

const SORTABLE = ['createdAt', 'code', 'status', 'expiresAt', 'activatedAt'];

function buildFilter(query: z.infer<typeof listVouchersSchema>): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.packageId) filter.packageId = query.packageId;
  if (query.routerId) filter.routerId = query.routerId;
  if (query.locationId) filter.locationId = query.locationId;
  if (query.sellerId) filter.sellerId = query.sellerId;
  if (query.importBatchId) filter.importBatchId = query.importBatchId;
  if (query.profileName) filter.profileName = query.profileName;
  if (query.search) {
    // Escaped so a user-typed search string cannot become a pattern.
    const safe = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ code: new RegExp(safe, 'i') }, { username: new RegExp(safe, 'i') }];
  }
  return filter;
}

export async function listVouchers(req: Request, res: Response): Promise<void> {
  const query = queryOf<z.infer<typeof listVouchersSchema>>(req);
  const filter = buildFilter(query);
  // A seller only ever sees the stock assigned to them.
  if (req.user?.role === 'SELLER') filter.sellerId = req.user.id;

  const [data, total] = await Promise.all([
    Voucher.find(filter)
      .sort(sortSpec(query, SORTABLE, 'createdAt'))
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate('packageId', 'name price currency')
      .populate('routerId', 'name')
      .populate('locationId', 'name')
      .lean(),
    Voucher.countDocuments(filter),
  ]);

  res.json(paginate(data, total, query));
}

export async function getVoucher(req: Request, res: Response): Promise<void> {
  const voucher = await Voucher.findById(req.params.id)
    .populate('packageId', 'name price currency mikrotikProfile durationSeconds dataLimitBytes')
    .populate('routerId', 'name host connectionStatus')
    .populate('locationId', 'name')
    .populate('sellerId', 'name username');
  if (!voucher) throw ApiError.notFound('That voucher does not exist.');

  const [sessions, sale] = await Promise.all([
    SessionModel.find({ voucherId: voucher._id }).sort({ loginTime: -1 }).limit(50).lean(),
    Sale.findOne({ voucherId: voucher._id }).populate('sellerId', 'name username').lean(),
  ]);

  const limit = voucher.limitUptimeSeconds ?? null;
  const used = voucher.uptimeUsedSeconds ?? null;

  res.json({
    voucher,
    usage: {
      // Labelled so the UI never presents un-synced vouchers as "0 used".
      source: voucher.lastSyncedAt ? ('accounting' as const) : ('never-synced' as const),
      lastSyncedAt: voucher.lastSyncedAt ?? null,
      timeAllowedSeconds: limit,
      timeUsedSeconds: used,
      timeRemainingSeconds: limit !== null && used !== null ? Math.max(0, limit - used) : null,
      uploadBytes: voucher.uploadBytes ?? null,
      downloadBytes: voucher.downloadBytes ?? null,
      totalBytes:
        voucher.uploadBytes !== undefined && voucher.downloadBytes !== undefined
          ? voucher.uploadBytes + voucher.downloadBytes
          : null,
    },
    sessions,
    sale,
  });
}

/** The printed card needs the plaintext, so this is a separate, audited route. */
export async function revealVoucherSecret(req: Request, res: Response): Promise<void> {
  const voucher = await Voucher.findById(req.params.id).select('+encryptedPassword');
  if (!voucher) throw ApiError.notFound('That voucher does not exist.');
  await recordAudit(actorFrom(req), 'VOUCHER_UPDATED', 'Voucher', String(voucher._id), { revealed: true });
  res.json({ code: voucher.code, username: voucher.username, password: decryptSecret(voucher.encryptedPassword, env.voucherSecretKey) });
}

export const generateSchema = z.object({
  packageId: objectId,
  quantity: z.number().int().min(1).max(10_000),
  codeLength: z.number().int().min(4).max(20).default(8),
  charset: z.enum(['UNAMBIGUOUS', 'ALPHANUMERIC', 'NUMERIC']).default('UNAMBIGUOUS'),
  prefix: z.string().trim().max(8).regex(/^[A-Za-z0-9]*$/, 'Prefix must be letters and digits only').optional(),
  passwordMode: z.enum(['SAME', 'RANDOM']).default('SAME'),
  passwordLength: z.number().int().min(4).max(20).optional(),
  routerId: objectId.optional(),
  locationId: objectId.optional(),
  profileOverride: z.string().trim().max(120).optional(),
  pushToRouter: z.boolean().default(false),
});

export async function generate(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof generateSchema>;
  if (body.pushToRouter && !body.routerId) {
    throw ApiError.badRequest('Choose a router before asking to push these vouchers to MikroTik.');
  }

  const result = await generateVouchers({ ...body, createdBy: new Types.ObjectId(req.user!.id) });
  await recordAudit(actorFrom(req), 'VOUCHER_GENERATED', 'Voucher', undefined, {
    quantity: result.generated, packageId: body.packageId,
  });

  let push: Awaited<ReturnType<typeof pushVouchersToRouter>> | undefined;
  if (body.pushToRouter && body.routerId) {
    // A push failure must not lose the generated stock -- it stays in Mongo,
    // flagged pushedToRouter:false, and can be retried from the router page.
    try {
      push = await pushVouchersToRouter(body.routerId);
      await recordAudit(actorFrom(req), 'VOUCHER_PUSHED', 'Router', body.routerId, { pushed: push.pushed, failed: push.failed.length });
    } catch (err) {
      push = { pushed: 0, failed: [{ code: 'all', reason: err instanceof Error ? err.message : 'router unreachable' }] };
    }
  }

  res.status(201).json({
    generated: result.generated,
    codes: result.codes.slice(0, 50),
    ...(push ? { push } : {}),
  });
}

export const importPreviewSchema = z.object({
  packageId: objectId.optional(),
  routerId: objectId.optional(),
  locationId: objectId.optional(),
  defaultProfile: z.string().trim().max(120).optional(),
});

export async function importPreviewHandler(req: Request, res: Response): Promise<void> {
  const file = req.file;
  if (!file) throw ApiError.badRequest('Attach a .txt, .csv or .json file to import.');
  const body = req.body as z.infer<typeof importPreviewSchema>;

  const preview = await previewImport({
    filename: file.originalname,
    content: file.buffer.toString('utf8'),
    ...(body.packageId ? { packageId: body.packageId } : {}),
    ...(body.routerId ? { routerId: body.routerId } : {}),
    ...(body.locationId ? { locationId: body.locationId } : {}),
    ...(body.defaultProfile ? { defaultProfile: body.defaultProfile } : {}),
    createdBy: new Types.ObjectId(req.user!.id),
  });

  res.json(preview);
}

export async function importConfirmHandler(req: Request, res: Response): Promise<void> {
  const result = await confirmImport(req.params.batchId as string);
  await recordAudit(actorFrom(req), 'VOUCHER_IMPORTED', 'ImportBatch', req.params.batchId, { ...result });
  res.json(result);
}

export async function importCancelHandler(req: Request, res: Response): Promise<void> {
  await cancelImport(req.params.batchId as string);
  res.json({ ok: true });
}

export async function listImportBatches(req: Request, res: Response): Promise<void> {
  const query = queryOf<z.infer<typeof paginationSchema>>(req);
  const [data, total] = await Promise.all([
    ImportBatch.find()
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate('createdBy', 'name username')
      .lean(),
    ImportBatch.countDocuments(),
  ]);
  res.json(paginate(data, total, query));
}

export const updateVoucherSchema = z.object({
  packageId: objectId.optional(),
  routerId: objectId.optional(),
  locationId: objectId.optional(),
  sellerId: objectId.optional(),
  profileName: z.string().trim().max(120).optional(),
  status: z.enum(VOUCHER_STATUSES).optional(),
});

export async function updateVoucher(req: Request, res: Response): Promise<void> {
  const voucher = await Voucher.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
  if (!voucher) throw ApiError.notFound('That voucher does not exist.');
  await recordAudit(actorFrom(req), 'VOUCHER_UPDATED', 'Voucher', String(voucher._id), req.body as Record<string, unknown>);
  res.json(voucher);
}

export async function disableVoucher(req: Request, res: Response): Promise<void> {
  const voucher = await Voucher.findById(req.params.id);
  if (!voucher) throw ApiError.notFound('That voucher does not exist.');

  voucher.status = 'DISABLED';
  voucher.disabledAt = new Date();
  await voucher.save();

  // Mongo is updated regardless; the router is best-effort and reported honestly.
  let router: { ok: boolean; reason?: string } = { ok: false, reason: 'no router assigned to this voucher' };
  if (voucher.routerId) {
    const outcome = await routerPool.tryWith(String(voucher.routerId), async (service) => {
      await service.setHotspotUserDisabled(voucher.username, true);
      await service.disconnectByUsername(voucher.username);
    });
    router = outcome.ok ? { ok: true } : { ok: false, reason: outcome.reason };
  }

  await recordAudit(actorFrom(req), 'VOUCHER_DISABLED', 'Voucher', String(voucher._id), { routerSynced: router.ok });
  res.json({ voucher, router });
}

export async function deleteVoucher(req: Request, res: Response): Promise<void> {
  const voucher = await Voucher.findById(req.params.id);
  if (!voucher) throw ApiError.notFound('That voucher does not exist.');
  if (voucher.saleId) throw ApiError.conflict('This voucher has been sold and cannot be deleted. Disable it instead.');

  if (voucher.routerId) {
    await routerPool.tryWith(String(voucher.routerId), (service) => service.removeHotspotUser(voucher.username));
  }
  await voucher.deleteOne();
  await recordAudit(actorFrom(req), 'VOUCHER_DELETED', 'Voucher', String(voucher._id), { code: voucher.code });
  res.json({ ok: true });
}

export async function getVoucherSessions(req: Request, res: Response): Promise<void> {
  const query = queryOf<z.infer<typeof paginationSchema>>(req);
  const filter = { voucherId: req.params.id };
  const [data, total] = await Promise.all([
    SessionModel.find(filter).sort({ loginTime: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    SessionModel.countDocuments(filter),
  ]);
  res.json(paginate(data, total, query));
}

export async function exportVouchers(req: Request, res: Response): Promise<void> {
  const query = queryOf<z.infer<typeof listVouchersSchema>>(req);
  const filter = buildFilter(query);
  if (req.user?.role === 'SELLER') filter.sellerId = req.user.id;

  // Capped: an export is a report, not a database dump.
  const rows = await Voucher.find(filter).sort({ createdAt: -1 }).limit(50_000).populate('packageId', 'name').lean();
  const csv = toCsv(
    rows.map((row) => ({
      code: row.code,
      username: row.username,
      package: (row.packageId as unknown as { name?: string })?.name ?? '',
      profile: row.profileName,
      status: row.status,
      createdAt: row.createdAt,
      activatedAt: row.activatedAt ?? '',
      uploadBytes: row.uploadBytes ?? '',
      downloadBytes: row.downloadBytes ?? '',
    })),
    [
      { key: 'code', label: 'Code' },
      { key: 'username', label: 'Username' },
      { key: 'package', label: 'Package' },
      { key: 'profile', label: 'MikroTik profile' },
      { key: 'status', label: 'Status' },
      { key: 'createdAt', label: 'Created' },
      { key: 'activatedAt', label: 'Activated' },
      { key: 'uploadBytes', label: 'Upload bytes' },
      { key: 'downloadBytes', label: 'Download bytes' },
    ],
  );

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="vouchers-${Date.now()}.csv"`);
  res.send(csv);
}

/** Bulk card data for printing. Returns plaintext codes, so it is admin-only and audited. */
export const printSchema = z.object({ ids: z.array(objectId).min(1).max(500) });

export async function printVouchers(req: Request, res: Response): Promise<void> {
  const { ids } = req.body as z.infer<typeof printSchema>;
  const vouchers = await Voucher.find({ _id: { $in: ids } }).select('+encryptedPassword').populate('packageId', 'name price currency').lean();
  await recordAudit(actorFrom(req), 'VOUCHER_UPDATED', 'Voucher', undefined, { printed: vouchers.length });

  res.json({
    cards: vouchers.map((voucher) => ({
      code: voucher.code,
      username: voucher.username,
      password: decryptSecret(voucher.encryptedPassword as string, env.voucherSecretKey),
      packageName: (voucher.packageId as unknown as { name?: string })?.name ?? '',
      price: (voucher.packageId as unknown as { price?: number })?.price ?? null,
      currency: (voucher.packageId as unknown as { currency?: string })?.currency ?? 'GHS',
    })),
  });
}
