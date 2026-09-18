import { Voucher, Sale, SessionModel, RouterModel, AccessPoint, PackageModel } from '../models';
import { getActiveUsers } from './syncService';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

interface CountRevenue { count: number; revenue: number }
interface ByteBucket { bytes: number }

interface VoucherFacet {
  byStatus: Array<{ _id: string; count: number }>;
  total: Array<{ count: number }>;
  usage: Array<{ upload: number; download: number; synced: number }>;
}

interface SalesFacet {
  today: CountRevenue[];
  week: CountRevenue[];
  month: CountRevenue[];
  daily: Array<{ _id: string; count: number; revenue: number }>;
  byPackage: Array<{ _id: string; count: number; revenue: number }>;
}

interface BandwidthFacet {
  today: ByteBucket[];
  week: ByteBucket[];
  month: ByteBucket[];
  daily: Array<{ _id: string; bytes: number; sessions: number }>;
}

function daysAgo(n: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - n);
  return d;
}

export async function getDashboard() {
  const today = startOfToday();
  const weekStart = daysAgo(6);
  const monthStart = daysAgo(29);

  // One $facet pass over vouchers, one over sales, rather than a query per tile.
  const [voucherFacet] = await Voucher.aggregate<VoucherFacet>([
    {
      $facet: {
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        total: [{ $count: 'count' }],
        usage: [
          {
            $group: {
              _id: null,
              upload: { $sum: { $ifNull: ['$uploadBytes', 0] } },
              download: { $sum: { $ifNull: ['$downloadBytes', 0] } },
              synced: { $sum: { $cond: [{ $ifNull: ['$lastSyncedAt', false] }, 1, 0] } },
            },
          },
        ],
      },
    },
  ]);

  const [salesFacet] = await Sale.aggregate<SalesFacet>([
    { $match: { soldAt: { $gte: monthStart } } },
    {
      $facet: {
        today: [{ $match: { soldAt: { $gte: today } } }, { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$price' } } }],
        week: [{ $match: { soldAt: { $gte: weekStart } } }, { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$price' } } }],
        month: [{ $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$price' } } }],
        daily: [
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$soldAt' } }, count: { $sum: 1 }, revenue: { $sum: '$price' } } },
          { $sort: { _id: 1 } },
        ],
        byPackage: [
          { $group: { _id: '$packageId', count: { $sum: 1 }, revenue: { $sum: '$price' } } },
          { $sort: { revenue: -1 } },
          { $limit: 10 },
        ],
      },
    },
  ]);

  const statusCounts: Record<string, number> = {};
  for (const row of voucherFacet?.byStatus ?? []) statusCounts[row._id] = row.count;

  const bandwidth = await SessionModel.aggregate<BandwidthFacet>([
    { $match: { loginTime: { $gte: monthStart } } },
    {
      $facet: {
        today: [{ $match: { loginTime: { $gte: today } } }, { $group: { _id: null, bytes: { $sum: { $ifNull: ['$totalBytes', 0] } } } }],
        week: [{ $match: { loginTime: { $gte: weekStart } } }, { $group: { _id: null, bytes: { $sum: { $ifNull: ['$totalBytes', 0] } } } }],
        month: [{ $group: { _id: null, bytes: { $sum: { $ifNull: ['$totalBytes', 0] } } } }],
        daily: [
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$loginTime' } }, bytes: { $sum: { $ifNull: ['$totalBytes', 0] } }, sessions: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]);

  const [routerTotal, routersOnline, accessPointTotal, packageDocs, activeUsers] = await Promise.all([
    RouterModel.countDocuments({ status: 'ACTIVE' }),
    RouterModel.countDocuments({ status: 'ACTIVE', connectionStatus: 'ONLINE' }),
    AccessPoint.countDocuments({ status: 'ACTIVE' }),
    PackageModel.find({ status: 'ACTIVE' }).select('name').lean(),
    getActiveUsers(),
  ]);

  const packageNames = new Map(packageDocs.map((p) => [String(p._id), p.name]));
  const first = <T>(arr: T[] | undefined): T | undefined => arr?.[0];

  return {
    vouchers: {
      total: first(voucherFacet?.total)?.count ?? 0,
      available: statusCounts.AVAILABLE ?? 0,
      active: statusCounts.ACTIVE ?? 0,
      expired: statusCounts.EXPIRED ?? 0,
      used: statusCounts.USED ?? 0,
      disabled: statusCounts.DISABLED ?? 0,
    },
    online: {
      count: activeUsers.users.length,
      source: activeUsers.source,
      fetchedAt: activeUsers.fetchedAt,
      degraded: activeUsers.degraded,
    },
    sales: {
      today: { count: first(salesFacet?.today)?.count ?? 0, revenue: first(salesFacet?.today)?.revenue ?? 0 },
      week: { count: first(salesFacet?.week)?.count ?? 0, revenue: first(salesFacet?.week)?.revenue ?? 0 },
      month: { count: first(salesFacet?.month)?.count ?? 0, revenue: first(salesFacet?.month)?.revenue ?? 0 },
      daily: (salesFacet?.daily ?? []).map((row) => ({ date: row._id, count: row.count, revenue: row.revenue })),
      byPackage: (salesFacet?.byPackage ?? []).map((row) => ({
        packageName: packageNames.get(String(row._id)) ?? 'Unassigned',
        count: row.count,
        revenue: row.revenue,
      })),
    },
    bandwidth: {
      // Explicitly accounting data collected by the sync worker, not live counters.
      source: 'accounting' as const,
      todayBytes: first(bandwidth[0]?.today)?.bytes ?? 0,
      weekBytes: first(bandwidth[0]?.week)?.bytes ?? 0,
      monthBytes: first(bandwidth[0]?.month)?.bytes ?? 0,
      daily: (bandwidth[0]?.daily ?? []).map((row) => ({ date: row._id, bytes: row.bytes, sessions: row.sessions })),
      // Null when nothing has ever been synced -- zero would be a false claim.
      lifetimeBytes: (first(voucherFacet?.usage)?.synced ?? 0) > 0
        ? (first(voucherFacet?.usage)?.upload ?? 0) + (first(voucherFacet?.usage)?.download ?? 0)
        : null,
    },
    infrastructure: {
      routers: routerTotal,
      routersOnline,
      accessPoints: accessPointTotal,
    },
  };
}

export async function getReports(params: { from?: Date; to?: Date }) {
  const from = params.from ?? daysAgo(29);
  const to = params.to ?? new Date();

  const [revenueBySeller, revenueByLocation, usageByPackage, usageByRouter] = await Promise.all([
    Sale.aggregate([
      { $match: { soldAt: { $gte: from, $lte: to } } },
      { $group: { _id: '$sellerId', count: { $sum: 1 }, revenue: { $sum: '$price' } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'seller' } },
      { $project: { name: { $ifNull: [{ $first: '$seller.name' }, 'Unassigned'] }, count: 1, revenue: 1 } },
      { $sort: { revenue: -1 } },
    ]),
    Sale.aggregate([
      { $match: { soldAt: { $gte: from, $lte: to } } },
      { $group: { _id: '$locationId', count: { $sum: 1 }, revenue: { $sum: '$price' } } },
      { $lookup: { from: 'locations', localField: '_id', foreignField: '_id', as: 'location' } },
      { $project: { name: { $ifNull: [{ $first: '$location.name' }, 'Unassigned'] }, count: 1, revenue: 1 } },
      { $sort: { revenue: -1 } },
    ]),
    SessionModel.aggregate([
      { $match: { loginTime: { $gte: from, $lte: to }, voucherId: { $ne: null } } },
      { $lookup: { from: 'vouchers', localField: 'voucherId', foreignField: '_id', as: 'voucher' } },
      { $group: { _id: { $first: '$voucher.packageId' }, bytes: { $sum: { $ifNull: ['$totalBytes', 0] } }, sessions: { $sum: 1 } } },
      { $lookup: { from: 'packages', localField: '_id', foreignField: '_id', as: 'package' } },
      { $project: { name: { $ifNull: [{ $first: '$package.name' }, 'Unassigned'] }, bytes: 1, sessions: 1 } },
      { $sort: { bytes: -1 } },
    ]),
    SessionModel.aggregate([
      { $match: { loginTime: { $gte: from, $lte: to } } },
      { $group: { _id: '$routerId', bytes: { $sum: { $ifNull: ['$totalBytes', 0] } }, sessions: { $sum: 1 } } },
      { $lookup: { from: 'routers', localField: '_id', foreignField: '_id', as: 'router' } },
      { $project: { name: { $ifNull: [{ $first: '$router.name' }, 'Unassigned'] }, bytes: 1, sessions: 1 } },
      { $sort: { bytes: -1 } },
    ]),
  ]);

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    source: 'accounting' as const,
    revenueBySeller,
    revenueByLocation,
    usageByPackage,
    usageByRouter,
  };
}
