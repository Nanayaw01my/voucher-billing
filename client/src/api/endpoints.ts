import { request, withQuery, download } from './client';
import type {
  ActiveUsersResponse, AuditRecord, AuthUser, Dashboard, ImportBatchRecord, ImportPreview,
  LocationRecord, Package, Paged, ReportsResponse, RouterDevice, AccessPointDevice, SaleRecord,
  Seller, Session, Voucher, VoucherUsage,
} from './types';

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<{ token: string; user: AuthUser }>('/auth/login', { method: 'POST', body: { username, password } }),
    me: () => request<{ user: AuthUser }>('/auth/me'),
    logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  },

  vouchers: {
    list: (query: Record<string, string | number | undefined>) =>
      request<Paged<Voucher>>(withQuery('/vouchers', query)),
    get: (id: string) =>
      request<{ voucher: Voucher; usage: VoucherUsage; sessions: Session[]; sale: SaleRecord | null }>(`/vouchers/${id}`),
    secret: (id: string) => request<{ code: string; username: string; password: string }>(`/vouchers/${id}/secret`),
    generate: (body: Record<string, unknown>) =>
      request<{ generated: number; codes: string[]; push?: { pushed: number; failed: Array<{ code: string; reason: string }> } }>(
        '/vouchers/generate', { method: 'POST', body },
      ),
    disable: (id: string) => request<unknown>(`/vouchers/${id}/disable`, { method: 'POST' }),
    remove: (id: string) => request<unknown>(`/vouchers/${id}`, { method: 'DELETE' }),
    bulkDelete: (body: { ids?: string[]; importBatchId?: string; alsoRemoveFromRouter: boolean }) =>
      request<{
        deleted: number;
        skippedSold: number;
        routerRemoved: number;
        routerFailures: Array<{ code: string; reason: string }>;
      }>('/vouchers/bulk-delete', { method: 'POST', body }),
    print: (ids: string[]) =>
      request<{ cards: Array<{ code: string; username: string; password: string; packageName: string; price: number | null; currency: string }> }>(
        '/vouchers/print', { method: 'POST', body: { ids } },
      ),
    exportCsv: (query: Record<string, string | number | undefined>) =>
      download(withQuery('/vouchers/export', query), `vouchers-${Date.now()}.csv`),
    importPreview: (formData: FormData) =>
      request<ImportPreview>('/vouchers/import/preview', { method: 'POST', formData }),
    importConfirm: (batchId: string) =>
      request<{ reference: string; imported: number; skipped: number }>(`/vouchers/import/${batchId}/confirm`, { method: 'POST' }),
    importCancel: (batchId: string) => request<{ ok: true }>(`/vouchers/import/${batchId}/cancel`, { method: 'POST' }),
    batches: () => request<Paged<ImportBatchRecord>>('/import-batches?limit=50'),
  },

  activeUsers: {
    list: (routerId?: string) => request<ActiveUsersResponse>(withQuery('/active-users', { routerId })),
    disconnect: (id: string, routerId: string) =>
      request<{ ok: true }>(`/active-users/${id}/disconnect`, { method: 'POST', body: { routerId } }),
  },

  packages: {
    list: () => request<{ data: Package[] }>('/packages'),
    create: (body: Record<string, unknown>) => request<Package>('/packages', { method: 'POST', body }),
    update: (id: string, body: Record<string, unknown>) => request<Package>(`/packages/${id}`, { method: 'PATCH', body }),
    remove: (id: string) => request<{ ok: true }>(`/packages/${id}`, { method: 'DELETE' }),
  },

  sales: {
    list: (query: Record<string, string | number | undefined>) => request<Paged<SaleRecord>>(withQuery('/sales', query)),
    create: (body: Record<string, unknown>) => request<SaleRecord>('/sales', { method: 'POST', body }),
    exportCsv: () => download('/sales/export', `sales-${Date.now()}.csv`),
  },

  sellers: {
    list: () => request<{ data: Seller[] }>('/sellers'),
    create: (body: Record<string, unknown>) => request<Seller>('/sellers', { method: 'POST', body }),
    update: (id: string, body: Record<string, unknown>) => request<Seller>(`/sellers/${id}`, { method: 'PATCH', body }),
  },

  routers: {
    list: () => request<{ data: RouterDevice[] }>('/routers'),
    create: (body: Record<string, unknown>) => request<RouterDevice>('/routers', { method: 'POST', body }),
    update: (id: string, body: Record<string, unknown>) => request<RouterDevice>(`/routers/${id}`, { method: 'PATCH', body }),
    remove: (id: string) => request<{ ok: true }>(`/routers/${id}`, { method: 'DELETE' }),
    test: (id: string) => request<{ ok: boolean; identity?: string; version?: string; error?: string }>(`/routers/${id}/test`, { method: 'POST' }),
    sync: (id: string) => request<{ opened: number; closed: number; updated: number }>(`/routers/${id}/sync`, { method: 'POST' }),
    push: (id: string) => request<{ pushed: number; failed: Array<{ code: string; reason: string }> }>(`/routers/${id}/push`, { method: 'POST', body: {} }),
    profiles: (id: string) => request<{ data: Array<{ name: string; rateLimit?: string; accountingEnabled: boolean }> }>(`/routers/${id}/profiles`),
  },

  locations: {
    list: () => request<{ data: LocationRecord[] }>('/locations'),
    create: (body: Record<string, unknown>) => request<LocationRecord>('/locations', { method: 'POST', body }),
    update: (id: string, body: Record<string, unknown>) => request<LocationRecord>(`/locations/${id}`, { method: 'PATCH', body }),
  },

  accessPoints: {
    list: () => request<{ data: AccessPointDevice[] }>('/access-points'),
    create: (body: Record<string, unknown>) => request<AccessPointDevice>('/access-points', { method: 'POST', body }),
    update: (id: string, body: Record<string, unknown>) => request<AccessPointDevice>(`/access-points/${id}`, { method: 'PATCH', body }),
  },

  sessions: {
    list: (query: Record<string, string | number | undefined>) => request<Paged<Session>>(withQuery('/sessions', query)),
  },

  dashboard: () => request<Dashboard>('/dashboard'),
  reports: (query: Record<string, string | undefined>) => request<ReportsResponse>(withQuery('/reports', query)),
  auditLogs: (query: Record<string, string | number | undefined>) => request<Paged<AuditRecord>>(withQuery('/audit-logs', query)),
};
