export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'SELLER'] as const;
export type Role = (typeof ROLES)[number];

export const VOUCHER_STATUSES = ['AVAILABLE', 'ACTIVE', 'EXPIRED', 'USED', 'DISABLED'] as const;
export type VoucherStatus = (typeof VOUCHER_STATUSES)[number];

export const ENTITY_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type EntityStatus = (typeof ENTITY_STATUSES)[number];

export const IMPORT_STATUSES = ['PENDING', 'COMPLETED', 'CANCELLED', 'FAILED'] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const ROUTER_STATUSES = ['ONLINE', 'OFFLINE', 'UNKNOWN'] as const;
export type RouterStatus = (typeof ROUTER_STATUSES)[number];
