/**
 * The business name, in one place. Everything user-facing reads from here, so
 * renaming the system is a single edit rather than a hunt through the pages.
 */
export const BRAND_NAME = 'EUNISET LOVE';

/** The sidebar stacks the name over two lines on wide screens. */
export const BRAND_LINES = ['EUNISET', 'LOVE'] as const;

/** Printed on voucher cards until an operator overrides it in Settings. */
export const DEFAULT_HOTSPOT_NAME = BRAND_NAME;
