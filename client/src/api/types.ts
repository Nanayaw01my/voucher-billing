export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'SELLER';
export type VoucherStatus = 'AVAILABLE' | 'ACTIVE' | 'EXPIRED' | 'USED' | 'DISABLED';
export type EntityStatus = 'ACTIVE' | 'INACTIVE';

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  locationId?: string;
}

export interface Named { _id: string; name: string }

export interface Pagination { page: number; limit: number; total: number; pages: number }
export interface Paged<T> { data: T[]; pagination: Pagination }

export interface Package extends Named {
  description?: string;
  durationSeconds?: number;
  dataLimitBytes?: number;
  price: number;
  currency: string;
  mikrotikProfile: string;
  status: EntityStatus;
}

export interface Voucher {
  _id: string;
  code: string;
  username: string;
  profileName: string;
  status: VoucherStatus;
  packageId?: Package | string | null;
  routerId?: Named | string | null;
  locationId?: Named | string | null;
  sellerId?: Named | string | null;
  limitUptimeSeconds?: number;
  dataLimitBytes?: number;
  uptimeUsedSeconds?: number;
  uploadBytes?: number;
  downloadBytes?: number;
  pushedToRouter: boolean;
  lastSyncedAt?: string;
  activatedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface VoucherUsage {
  source: 'accounting' | 'never-synced';
  lastSyncedAt: string | null;
  timeAllowedSeconds: number | null;
  timeUsedSeconds: number | null;
  timeRemainingSeconds: number | null;
  uploadBytes: number | null;
  downloadBytes: number | null;
  totalBytes: number | null;
}

export interface Session {
  _id: string;
  username: string;
  ipAddress?: string;
  macAddress?: string;
  loginTime: string;
  logoutTime?: string;
  durationSeconds?: number;
  uploadBytes?: number;
  downloadBytes?: number;
  totalBytes?: number;
  isOpen: boolean;
  routerId?: Named | string;
}

export interface ActiveUser {
  id: string;
  username: string;
  address?: string;
  macAddress?: string;
  uptimeSeconds: number | null;
  sessionTimeLeftSeconds: number | null;
  bytesIn: number | null;
  bytesOut: number | null;
  totalBytes: number | null;
  loginBy?: string;
  server?: string;
  routerId: string;
  routerName: string;
  voucherId?: string;
  voucherCode?: string;
  packageName?: string;
}

export interface ActiveUsersResponse {
  source: 'router';
  fetchedAt: string;
  users: ActiveUser[];
  degraded: Array<{ routerId: string; routerName: string; reason: string }>;
}

export interface RouterDevice extends Named {
  identity?: string;
  host: string;
  port: number;
  useTls: boolean;
  username: string;
  status: EntityStatus;
  connectionStatus: 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
  routerOsVersion?: string;
  locationId?: Named | string | null;
  lastSeen?: string;
  lastSyncedAt?: string;
  lastError?: string;
}

export interface AccessPointDevice extends Named {
  deviceModel?: string;
  ipAddress?: string;
  macAddress?: string;
  status: EntityStatus;
  reportsStatistics: boolean;
  locationId?: Named | string | null;
  routerId?: Named | string | null;
  lastSeen?: string;
}

export interface LocationRecord extends Named {
  description?: string;
  address?: string;
  status: EntityStatus;
}

export interface Seller extends Named {
  username: string;
  phone?: string;
  role: Role;
  status: EntityStatus;
  locationId?: Named | string | null;
  lastLoginAt?: string;
}

export interface SaleRecord {
  _id: string;
  price: number;
  currency: string;
  paymentMethod: string;
  soldAt: string;
  customerPhone?: string;
  voucherId?: { _id: string; code: string } | string;
  packageId?: Named | string;
  sellerId?: Named | string;
  locationId?: Named | string;
}

export interface ImportPreview {
  batchId: string;
  reference: string;
  filename: string;
  format: 'TXT' | 'CSV' | 'JSON';
  totalRows: number;
  validCount: number;
  duplicateCount: number;
  invalidCount: number;
  sample: Array<{ code: string; username: string; profileName: string; limitUptimeSeconds?: number; line: number }>;
  rejections: Array<{ line: number; raw: string; reason: string; kind: string }>;
}

export interface ImportBatchRecord {
  _id: string;
  reference: string;
  filename: string;
  format: string;
  status: string;
  totalRows: number;
  validCount: number;
  duplicateCount: number;
  invalidCount: number;
  importedCount: number;
  createdBy?: Named;
  createdAt: string;
}

export interface AuditRecord {
  _id: string;
  username?: string;
  action: string;
  entity: string;
  entityId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface Dashboard {
  vouchers: { total: number; available: number; active: number; expired: number; used: number; disabled: number };
  online: { count: number; source: string; fetchedAt: string; degraded: Array<{ routerName: string; reason: string }> };
  sales: {
    today: { count: number; revenue: number };
    week: { count: number; revenue: number };
    month: { count: number; revenue: number };
    daily: Array<{ date: string; count: number; revenue: number }>;
    byPackage: Array<{ packageName: string; count: number; revenue: number }>;
  };
  bandwidth: {
    source: 'accounting';
    todayBytes: number;
    weekBytes: number;
    monthBytes: number;
    daily: Array<{ date: string; bytes: number; sessions: number }>;
    lifetimeBytes: number | null;
  };
  infrastructure: { routers: number; routersOnline: number; accessPoints: number };
}

export interface ReportsResponse {
  range: { from: string; to: string };
  source: 'accounting';
  revenueBySeller: Array<{ name: string; count: number; revenue: number }>;
  revenueByLocation: Array<{ name: string; count: number; revenue: number }>;
  usageByPackage: Array<{ name: string; bytes: number; sessions: number }>;
  usageByRouter: Array<{ name: string; bytes: number; sessions: number }>;
}
