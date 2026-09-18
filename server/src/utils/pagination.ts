import { z } from 'zod';

export const MAX_PAGE_SIZE = 200;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export function paginate<T>(data: T[], total: number, query: PaginationQuery): Paginated<T> {
  return {
    data,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

/** Only fields on this list may be sorted, so `sort` can never reach into a document. */
export function sortSpec(query: PaginationQuery, allowed: string[], fallback: string): Record<string, 1 | -1> {
  const field = query.sort && allowed.includes(query.sort) ? query.sort : fallback;
  return { [field]: query.order === 'asc' ? 1 : -1 };
}
