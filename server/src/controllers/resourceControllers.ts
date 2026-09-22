import { z } from 'zod';
import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import {
  PackageModel, Location, RouterModel, AccessPoint, User, hashPassword,
  Voucher, Sale, SessionModel, AuditLog, ENTITY_STATUSES, ROLES, PAYMENT_METHODS,
} from '../models';
import { paginationSchema, paginate } from '../utils/pagination';
import { queryOf } from '../middleware/validate';
import { ApiError } from '../utils/apiError';
import { encryptSecret } from '../utils/crypto';
import { env } from '../config/env';
import { routerPool, testRouterConnection } from '../services/mikrotik';
import { syncRouter, pushVouchersToRouter, adoptVouchersFromRouter } from '../services/syncService';
import { recordAudit } from '../services/auditService';
import { actorFrom } from '../middleware/auth';
import { toCsv } from '../utils/csv';

const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), 'Not a valid identifier');

/* ------------------------------------------------------------------ packages */

export const packageSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400).optional(),
  durationSeconds: z.number().int().min(0).optional(),
  dataLimitBytes: z.number().int().min(0).optional(),
  price: z.number().min(0),
  currency: z.string().trim().length(3).default('GHS'),
  mikrotikProfile: z.string().trim().min(1).max(120),
  status: z.enum(ENTITY_STATUSES).default('ACTIVE'),
}).refine((v) => v.durationSeconds || v.dataLimitBytes, {
  message: 'A package needs either a time limit or a data limit',
  path: ['durationSeconds'],
});

export async function listPackages(_req: Request, res: Response): Promise<void> {
  res.json({ data: await PackageModel.find().sort({ price: 1 }).lean() });
}

export async function createPackage(req: Request, res: Response): Promise<void> {
  const created = await PackageModel.create(req.body);
  await recordAudit(actorFrom(req), 'PACKAGE_CREATED', 'Package', String(created._id), { name: created.name });
  res.status(201).json(created);
}

export async function updatePackage(req: Request, res: Response): Promise<void> {
  const updated = await PackageModel.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
  if (!updated) throw ApiError.notFound('That package does not exist.');
  await recordAudit(actorFrom(req), 'PACKAGE_UPDATED', 'Package', String(updated._id));
  res.json(updated);
}

export async function deletePackage(req: Request, res: Response): Promise<void> {
  const inUse = await Voucher.countDocuments({ packageId: req.params.id });
  if (inUse > 0) {
    throw ApiError.conflict(`${inUse} voucher(s) still use this package. Set it to inactive instead of deleting it.`);
  }
  const deleted = await PackageModel.findByIdAndDelete(req.params.id);
  if (!deleted) throw ApiError.notFound('That package does not exist.');
  await recordAudit(actorFrom(req), 'PACKAGE_DELETED', 'Package', String(req.params.id));
  res.json({ ok: true });
}

/* ----------------------------------------------------------------- locations */

export const locationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400).optional(),
  address: z.string().trim().max(200).optional(),
  status: z.enum(ENTITY_STATUSES).default('ACTIVE'),
});

export async function listLocations(_req: Request, res: Response): Promise<void> {
  res.json({ data: await Location.find().sort({ name: 1 }).lean() });
}

export async function createLocation(req: Request, res: Response): Promise<void> {
  const created = await Location.create(req.body);
  await recordAudit(actorFrom(req), 'LOCATION_CREATED', 'Location', String(created._id), { name: created.name });
  res.status(201).json(created);
}

export async function updateLocation(req: Request, res: Response): Promise<void> {
  const updated = await Location.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
  if (!updated) throw ApiError.notFound('That location does not exist.');
  await recordAudit(actorFrom(req), 'LOCATION_UPDATED', 'Location', String(updated._id));
  res.json(updated);
}

/* ------------------------------------------------------------------- routers */

export const routerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65535).default(8728),
  useTls: z.boolean().default(false),
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(200),
  locationId: objectId.optional(),
  status: z.enum(ENTITY_STATUSES).default('ACTIVE'),
});

export const routerUpdateSchema = routerSchema.partial();

export async function listRouters(_req: Request, res: Response): Promise<void> {
  res.json({ data: await RouterModel.find().sort({ name: 1 }).populate('locationId', 'name').lean() });
}

export async function createRouter(req: Request, res: Response): Promise<void> {
  const { password, ...rest } = req.body as z.infer<typeof routerSchema>;
  const created = await RouterModel.create({ ...rest, encryptedPassword: encryptSecret(password, env.routerSecretKey) });
  await recordAudit(actorFrom(req), 'ROUTER_CREATED', 'Router', String(created._id), { name: created.name, host: created.host });
  res.status(201).json(created.toJSON());
}

export async function updateRouter(req: Request, res: Response): Promise<void> {
  const { password, ...rest } = req.body as z.infer<typeof routerUpdateSchema>;
  const update: Record<string, unknown> = { ...rest };
  if (password) update.encryptedPassword = encryptSecret(password, env.routerSecretKey);

  const updated = await RouterModel.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
  if (!updated) throw ApiError.notFound('That router does not exist.');
  // Drop any pooled connection so the new credentials take effect at once.
  routerPool.release(String(updated._id));
  await recordAudit(actorFrom(req), 'ROUTER_UPDATED', 'Router', String(updated._id));
  res.json(updated.toJSON());
}

export async function deleteRouter(req: Request, res: Response): Promise<void> {
  const attached = await Voucher.countDocuments({ routerId: req.params.id });
  if (attached > 0) throw ApiError.conflict(`${attached} voucher(s) are assigned to this router. Reassign them first.`);
  const deleted = await RouterModel.findByIdAndDelete(req.params.id);
  if (!deleted) throw ApiError.notFound('That router does not exist.');
  routerPool.release(String(req.params.id));
  await recordAudit(actorFrom(req), 'ROUTER_DELETED', 'Router', String(req.params.id));
  res.json({ ok: true });
}

/** Tests either a stored router or an unsaved set of credentials from the form. */
export async function testRouter(req: Request, res: Response): Promise<void> {
  const router = await RouterModel.findById(req.params.id).select('+encryptedPassword');
  if (!router) throw ApiError.notFound('That router does not exist.');

  const { decryptSecret } = await import('../utils/crypto');
  const result = await testRouterConnection({
    host: router.host,
    port: router.port,
    username: router.username,
    password: decryptSecret(router.encryptedPassword, env.routerSecretKey),
    useTls: router.useTls,
  });

  await RouterModel.updateOne({ _id: router._id }, {
    $set: {
      connectionStatus: result.ok ? 'ONLINE' : 'OFFLINE',
      ...(result.ok ? { lastSeen: new Date(), identity: result.identity, routerOsVersion: result.version } : { lastError: result.error }),
    },
  });
  await recordAudit(actorFrom(req), 'ROUTER_TESTED', 'Router', String(router._id), { ok: result.ok });

  res.json(result);
}

export async function syncRouterHandler(req: Request, res: Response): Promise<void> {
  res.json(await syncRouter(req.params.id as string));
}

export async function pushRouterHandler(req: Request, res: Response): Promise<void> {
  const ids = (req.body as { voucherIds?: string[] }).voucherIds;
  res.json(await pushVouchersToRouter(req.params.id as string, ids));
}

/** Pulls in stock that exists on the router but not in this system. */
export async function adoptRouterVouchers(req: Request, res: Response): Promise<void> {
  const result = await adoptVouchersFromRouter(req.params.id as string);
  await recordAudit(actorFrom(req), 'VOUCHER_IMPORTED', 'Router', req.params.id, {
    source: 'router adoption', found: result.found, adopted: result.adopted,
  });
  res.json(result);
}

export async function routerProfiles(req: Request, res: Response): Promise<void> {
  const outcome = await routerPool.tryWith(req.params.id as string, (service) => service.listProfiles());
  if (!outcome.ok) throw ApiError.badRequest(`Could not read profiles: ${outcome.reason}`);
  res.json({ data: outcome.value });
}

/* -------------------------------------------------------------- access points */

export const accessPointSchema = z.object({
  name: z.string().trim().min(1).max(80),
  deviceModel: z.string().trim().max(80).optional(),
  ipAddress: z.string().trim().max(45).optional(),
  macAddress: z.string().trim().max(17).optional(),
  locationId: objectId.optional(),
  routerId: objectId.optional(),
  status: z.enum(ENTITY_STATUSES).default('ACTIVE'),
  reportsStatistics: z.boolean().default(false),
});

export async function listAccessPoints(_req: Request, res: Response): Promise<void> {
  res.json({
    data: await AccessPoint.find().sort({ name: 1 }).populate('locationId', 'name').populate('routerId', 'name').lean(),
  });
}

export async function createAccessPoint(req: Request, res: Response): Promise<void> {
  const created = await AccessPoint.create(req.body);
  await recordAudit(actorFrom(req), 'ACCESS_POINT_CREATED', 'AccessPoint', String(created._id), { name: created.name });
  res.status(201).json(created);
}

export async function updateAccessPoint(req: Request, res: Response): Promise<void> {
  const updated = await AccessPoint.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
  if (!updated) throw ApiError.notFound('That access point does not exist.');
  await recordAudit(actorFrom(req), 'ACCESS_POINT_UPDATED', 'AccessPoint', String(updated._id));
  res.json(updated);
}

/* ------------------------------------------------------------------- sellers */

export const sellerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  username: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/, 'Letters, digits, dot, dash and underscore only').toLowerCase(),
  phone: z.string().trim().max(24).optional(),
  password: z.string().min(8, 'Use at least 8 characters').max(128),
  role: z.enum(ROLES).default('SELLER'),
  locationId: objectId.optional(),
  status: z.enum(ENTITY_STATUSES).default('ACTIVE'),
});

export const sellerUpdateSchema = sellerSchema.partial().omit({ username: true });

export async function listSellers(_req: Request, res: Response): Promise<void> {
  res.json({ data: await User.find().sort({ name: 1 }).populate('locationId', 'name').lean() });
}

export async function createSeller(req: Request, res: Response): Promise<void> {
  const { password, ...rest } = req.body as z.infer<typeof sellerSchema>;
  // Only a SUPER_ADMIN may mint another administrator.
  if (rest.role !== 'SELLER' && req.user?.role !== 'SUPER_ADMIN') {
    throw ApiError.forbidden('Only a super administrator can create admin accounts.');
  }
  const created = await User.create({ ...rest, passwordHash: await hashPassword(password) });
  await recordAudit(actorFrom(req), 'SELLER_CREATED', 'User', String(created._id), { username: created.username, role: created.role });
  res.status(201).json(created.toJSON());
}

export async function updateSeller(req: Request, res: Response): Promise<void> {
  const { password, role, ...rest } = req.body as z.infer<typeof sellerUpdateSchema>;
  if (role && role !== 'SELLER' && req.user?.role !== 'SUPER_ADMIN') {
    throw ApiError.forbidden('Only a super administrator can change a role to admin.');
  }
  const update: Record<string, unknown> = { ...rest, ...(role ? { role } : {}) };
  if (password) update.passwordHash = await hashPassword(password);

  const updated = await User.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
  if (!updated) throw ApiError.notFound('That user does not exist.');
  await recordAudit(
    actorFrom(req),
    update.status === 'INACTIVE' ? 'SELLER_DISABLED' : 'SELLER_UPDATED',
    'User',
    String(updated._id),
  );
  res.json(updated.toJSON());
}

/* --------------------------------------------------------------------- sales */

export const saleSchema = z.object({
  voucherId: objectId,
  price: z.number().min(0).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).default('CASH'),
  customerPhone: z.string().trim().max(24).optional(),
  note: z.string().trim().max(200).optional(),
  sellerId: objectId.optional(),
});

export const listSalesSchema = paginationSchema.extend({
  sellerId: objectId.optional(),
  locationId: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export async function listSales(req: Request, res: Response): Promise<void> {
  const query = queryOf<z.infer<typeof listSalesSchema>>(req);
  const filter: Record<string, unknown> = {};
  if (query.sellerId) filter.sellerId = query.sellerId;
  if (query.locationId) filter.locationId = query.locationId;
  if (query.from || query.to) {
    filter.soldAt = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
  }
  // A seller only sees their own book.
  if (req.user?.role === 'SELLER') filter.sellerId = req.user.id;

  const [data, total] = await Promise.all([
    Sale.find(filter)
      .sort({ soldAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate('voucherId', 'code')
      .populate('packageId', 'name')
      .populate('sellerId', 'name username')
      .populate('locationId', 'name')
      .lean(),
    Sale.countDocuments(filter),
  ]);
  res.json(paginate(data, total, query));
}

export async function createSale(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof saleSchema>;
  // A seller always books against themselves, whatever the payload claims.
  const sellerId = req.user?.role === 'SELLER' ? req.user.id : (body.sellerId ?? req.user!.id);

  const voucher = await Voucher.findById(body.voucherId).populate('packageId', 'name price currency');
  if (!voucher) throw ApiError.notFound('That voucher does not exist.');
  if (voucher.saleId) throw ApiError.conflict('That voucher has already been sold.');
  if (voucher.status === 'DISABLED') throw ApiError.badRequest('That voucher is disabled and cannot be sold.');
  if (req.user?.role === 'SELLER' && voucher.sellerId && String(voucher.sellerId) !== req.user.id) {
    throw ApiError.forbidden('That voucher is assigned to another seller.');
  }

  const pkg = voucher.packageId as unknown as { _id?: Types.ObjectId; price?: number; currency?: string } | undefined;
  const price = body.price ?? pkg?.price;
  if (price === undefined) throw ApiError.badRequest('This voucher has no package price. Enter a price for the sale.');

  const sale = await Sale.create({
    voucherId: voucher._id,
    packageId: pkg?._id,
    price,
    currency: pkg?.currency ?? 'GHS',
    sellerId,
    locationId: voucher.locationId,
    paymentMethod: body.paymentMethod,
    customerPhone: body.customerPhone,
    note: body.note,
    soldAt: new Date(),
  });

  voucher.saleId = sale._id as Types.ObjectId;
  voucher.sellerId = new Types.ObjectId(sellerId);
  await voucher.save();

  await recordAudit(actorFrom(req), 'SALE_CREATED', 'Sale', String(sale._id), { voucher: voucher.code, price });
  res.status(201).json(sale);
}

export async function exportSales(req: Request, res: Response): Promise<void> {
  const rows = await Sale.find(req.user?.role === 'SELLER' ? { sellerId: req.user.id } : {})
    .sort({ soldAt: -1 }).limit(50_000)
    .populate('voucherId', 'code').populate('packageId', 'name').populate('sellerId', 'name')
    .lean();

  const csv = toCsv(
    rows.map((row) => ({
      soldAt: row.soldAt,
      voucher: (row.voucherId as unknown as { code?: string })?.code ?? '',
      package: (row.packageId as unknown as { name?: string })?.name ?? '',
      seller: (row.sellerId as unknown as { name?: string })?.name ?? '',
      price: row.price,
      currency: row.currency,
      paymentMethod: row.paymentMethod,
    })),
    [
      { key: 'soldAt', label: 'Sold at' },
      { key: 'voucher', label: 'Voucher' },
      { key: 'package', label: 'Package' },
      { key: 'seller', label: 'Seller' },
      { key: 'price', label: 'Price' },
      { key: 'currency', label: 'Currency' },
      { key: 'paymentMethod', label: 'Payment method' },
    ],
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="sales-${Date.now()}.csv"`);
  res.send(csv);
}

/* ------------------------------------------------------------------ sessions */

export const listSessionsSchema = paginationSchema.extend({
  routerId: objectId.optional(),
  username: z.string().trim().max(64).optional(),
  open: z.coerce.boolean().optional(),
});

export async function listSessions(req: Request, res: Response): Promise<void> {
  const query = queryOf<z.infer<typeof listSessionsSchema>>(req);
  const filter: Record<string, unknown> = {};
  if (query.routerId) filter.routerId = query.routerId;
  if (query.username) filter.username = query.username;
  if (query.open !== undefined) filter.isOpen = query.open;

  const [data, total] = await Promise.all([
    SessionModel.find(filter)
      .sort({ loginTime: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate('routerId', 'name')
      .lean(),
    SessionModel.countDocuments(filter),
  ]);
  res.json(paginate(data, total, query));
}

/* ----------------------------------------------------------------- audit logs */

export const listAuditSchema = paginationSchema.extend({
  action: z.string().trim().max(40).optional(),
  userId: objectId.optional(),
});

export async function listAuditLogs(req: Request, res: Response): Promise<void> {
  const query = queryOf<z.infer<typeof listAuditSchema>>(req);
  const filter: Record<string, unknown> = {};
  if (query.action) filter.action = query.action;
  if (query.userId) filter.userId = query.userId;

  const [data, total] = await Promise.all([
    AuditLog.find(filter).sort({ timestamp: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.json(paginate(data, total, query));
}
