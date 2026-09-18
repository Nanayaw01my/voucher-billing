import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { authenticate, requireAdmin, requireSuperAdmin } from '../middleware/auth';
import { authLimiter, heavyLimiter } from '../middleware/rateLimit';
import { paginationSchema } from '../utils/pagination';

import * as auth from '../controllers/authController';
import * as vouchers from '../controllers/voucherController';
import * as resources from '../controllers/resourceControllers';
import * as network from '../controllers/networkController';

// Import files are held in memory and parsed; they are never written to disk
// and never handed to a shell.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (/\.(txt|csv|json)$/i.test(file.originalname)) return cb(null, true);
    cb(new Error('Only .txt, .csv and .json files can be imported'));
  },
});

const idParam = z.object({ id: z.string().min(1) });
const api = Router();

/* auth */
api.post('/auth/login', authLimiter, validate(auth.loginSchema), asyncHandler(auth.login));
api.get('/auth/me', authenticate, asyncHandler(auth.me));
api.post('/auth/logout', authenticate, asyncHandler(auth.logout));

// Everything past this point requires a valid session.
api.use(authenticate);

/* vouchers */
api.get('/vouchers', validate(vouchers.listVouchersSchema, 'query'), asyncHandler(vouchers.listVouchers));
api.get('/vouchers/export', validate(vouchers.listVouchersSchema, 'query'), asyncHandler(vouchers.exportVouchers));
api.post('/vouchers/generate', requireAdmin, heavyLimiter, validate(vouchers.generateSchema), asyncHandler(vouchers.generate));
api.post('/vouchers/print', requireAdmin, validate(vouchers.printSchema), asyncHandler(vouchers.printVouchers));
api.post(
  '/vouchers/import/preview',
  requireAdmin,
  heavyLimiter,
  upload.single('file'),
  validate(vouchers.importPreviewSchema),
  asyncHandler(vouchers.importPreviewHandler),
);
api.post('/vouchers/import/:batchId/confirm', requireAdmin, asyncHandler(vouchers.importConfirmHandler));
api.post('/vouchers/import/:batchId/cancel', requireAdmin, asyncHandler(vouchers.importCancelHandler));
api.get('/import-batches', requireAdmin, validate(paginationSchema, 'query'), asyncHandler(vouchers.listImportBatches));
api.get('/vouchers/:id', validate(idParam, 'params'), asyncHandler(vouchers.getVoucher));
api.get('/vouchers/:id/secret', requireAdmin, asyncHandler(vouchers.revealVoucherSecret));
api.get('/vouchers/:id/sessions', validate(paginationSchema, 'query'), asyncHandler(vouchers.getVoucherSessions));
api.patch('/vouchers/:id', requireAdmin, validate(vouchers.updateVoucherSchema), asyncHandler(vouchers.updateVoucher));
api.post('/vouchers/:id/disable', requireAdmin, asyncHandler(vouchers.disableVoucher));
api.delete('/vouchers/:id', requireSuperAdmin, asyncHandler(vouchers.deleteVoucher));

/* live network */
api.get('/active-users', validate(network.activeUsersSchema, 'query'), asyncHandler(network.listActiveUsers));
api.post('/active-users/:id/disconnect', requireAdmin, validate(network.disconnectSchema), asyncHandler(network.disconnectActiveUser));

/* packages */
api.get('/packages', asyncHandler(resources.listPackages));
api.post('/packages', requireAdmin, validate(resources.packageSchema), asyncHandler(resources.createPackage));
api.patch('/packages/:id', requireAdmin, asyncHandler(resources.updatePackage));
api.delete('/packages/:id', requireAdmin, asyncHandler(resources.deletePackage));

/* sales */
api.get('/sales', validate(resources.listSalesSchema, 'query'), asyncHandler(resources.listSales));
api.get('/sales/export', asyncHandler(resources.exportSales));
api.post('/sales', validate(resources.saleSchema), asyncHandler(resources.createSale));

/* sellers */
api.get('/sellers', requireAdmin, asyncHandler(resources.listSellers));
api.post('/sellers', requireAdmin, validate(resources.sellerSchema), asyncHandler(resources.createSeller));
api.patch('/sellers/:id', requireAdmin, validate(resources.sellerUpdateSchema), asyncHandler(resources.updateSeller));

/* routers */
api.get('/routers', requireAdmin, asyncHandler(resources.listRouters));
api.post('/routers', requireAdmin, validate(resources.routerSchema), asyncHandler(resources.createRouter));
api.patch('/routers/:id', requireAdmin, validate(resources.routerUpdateSchema), asyncHandler(resources.updateRouter));
api.delete('/routers/:id', requireSuperAdmin, asyncHandler(resources.deleteRouter));
api.post('/routers/:id/test', requireAdmin, asyncHandler(resources.testRouter));
api.post('/routers/:id/sync', requireAdmin, heavyLimiter, asyncHandler(resources.syncRouterHandler));
api.post('/routers/:id/push', requireAdmin, heavyLimiter, asyncHandler(resources.pushRouterHandler));
api.get('/routers/:id/profiles', requireAdmin, asyncHandler(resources.routerProfiles));

/* locations & access points */
api.get('/locations', asyncHandler(resources.listLocations));
api.post('/locations', requireAdmin, validate(resources.locationSchema), asyncHandler(resources.createLocation));
api.patch('/locations/:id', requireAdmin, asyncHandler(resources.updateLocation));
api.get('/access-points', asyncHandler(resources.listAccessPoints));
api.post('/access-points', requireAdmin, validate(resources.accessPointSchema), asyncHandler(resources.createAccessPoint));
api.patch('/access-points/:id', requireAdmin, asyncHandler(resources.updateAccessPoint));

/* sessions, reporting, audit */
api.get('/sessions', validate(resources.listSessionsSchema, 'query'), asyncHandler(resources.listSessions));
api.get('/dashboard', asyncHandler(network.dashboard));
api.get('/reports', requireAdmin, validate(network.reportsSchema, 'query'), asyncHandler(network.reports));
api.get('/audit-logs', requireAdmin, validate(resources.listAuditSchema, 'query'), asyncHandler(resources.listAuditLogs));

export default api;
