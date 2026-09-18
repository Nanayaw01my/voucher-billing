import type { Types } from 'mongoose';
import { ImportBatch, Voucher, PackageModel, type IImportRejection, type IStagedVoucher } from '../models';
import { parseMikrotikUserCommand } from './parser/mikrotikCommandParser';
import { parseCsv, parseJson } from './parser/tabularParser';
import { encryptSecret } from '../utils/crypto';
import { env } from '../config/env';
import { ApiError } from '../utils/apiError';

export type ImportFormat = 'TXT' | 'CSV' | 'JSON';

export interface PreviewInput {
  filename: string;
  content: string;
  packageId?: string;
  routerId?: string;
  locationId?: string;
  /** Used when the source file carries no profile column. */
  defaultProfile?: string;
  createdBy: Types.ObjectId;
}

export interface ImportPreview {
  batchId: string;
  reference: string;
  filename: string;
  format: ImportFormat;
  totalRows: number;
  validCount: number;
  duplicateCount: number;
  invalidCount: number;
  sample: Array<Pick<IStagedVoucher, 'code' | 'username' | 'profileName' | 'limitUptimeSeconds' | 'line'>>;
  rejections: IImportRejection[];
}

export function detectFormat(filename: string, content: string): ImportFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) return 'CSV';
  if (lower.endsWith('.json')) return 'JSON';
  if (lower.endsWith('.txt')) return 'TXT';
  const head = content.trimStart();
  if (head.startsWith('[') || head.startsWith('{')) return 'JSON';
  if (head.startsWith('/ip')) return 'TXT';
  return 'CSV';
}

async function nextReference(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await ImportBatch.countDocuments({ reference: new RegExp(`^IMP-${year}-`) });
  return `IMP-${year}-${String(count + 1).padStart(5, '0')}`;
}

/**
 * Parses and validates the whole file, then stores it as a PENDING batch.
 * Nothing reaches the vouchers collection until confirmImport runs, so an
 * import is never silently partial.
 */
export async function previewImport(input: PreviewInput): Promise<ImportPreview> {
  const format = detectFormat(input.filename, input.content);

  let defaultProfile = input.defaultProfile;
  if (!defaultProfile && input.packageId) {
    const pkg = await PackageModel.findById(input.packageId);
    defaultProfile = pkg?.mikrotikProfile;
  }

  const staged: IStagedVoucher[] = [];
  const rejections: IImportRejection[] = [];
  const seenInFile = new Set<string>();
  let totalRows = 0;

  const consider = (result: ReturnType<typeof parseMikrotikUserCommand>, raw: string, line: number) => {
    totalRows += 1;
    if (!result.ok) {
      rejections.push({ line, raw, reason: result.reason, kind: 'INVALID' });
      return;
    }
    const row = result.value;
    if (seenInFile.has(row.code)) {
      rejections.push({ line, raw, reason: `code ${row.code} appears more than once in this file`, kind: 'DUPLICATE_IN_FILE' });
      return;
    }
    seenInFile.add(row.code);
    staged.push({
      code: row.code,
      username: row.username,
      password: row.password,
      profileName: row.profileName,
      ...(row.limitUptimeSeconds !== undefined ? { limitUptimeSeconds: row.limitUptimeSeconds } : {}),
      ...(row.dataLimitBytes !== undefined ? { dataLimitBytes: row.dataLimitBytes } : {}),
      line,
    });
  };

  if (format === 'TXT') {
    const lines = input.content.split(/\r?\n/);
    lines.forEach((raw, index) => {
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith('#')) return; // blank lines are not rows
      consider(parseMikrotikUserCommand(trimmed), trimmed, index + 1);
    });
  } else {
    const parsed = format === 'CSV'
      ? parseCsv(input.content, { ...(defaultProfile ? { profile: defaultProfile } : {}) })
      : parseJson(input.content, { ...(defaultProfile ? { profile: defaultProfile } : {}) });
    parsed.rows.forEach((row, index) => consider(row, parsed.raw[index] ?? '', index + (format === 'CSV' ? 2 : 1)));
  }

  // Collision check against what is already stored, in chunks so a 10k file
  // does not build a single enormous $in.
  const existing = new Set<string>();
  const codes = staged.map((row) => row.code);
  for (let i = 0; i < codes.length; i += 1000) {
    const found = await Voucher.find({ code: { $in: codes.slice(i, i + 1000) } }).select('code').lean();
    for (const doc of found) existing.add(doc.code);
  }

  const accepted: IStagedVoucher[] = [];
  for (const row of staged) {
    if (existing.has(row.code)) {
      rejections.push({ line: row.line, raw: row.code, reason: `voucher ${row.code} already exists`, kind: 'DUPLICATE_IN_DB' });
    } else {
      accepted.push(row);
    }
  }

  const duplicateCount = rejections.filter((r) => r.kind !== 'INVALID').length;
  const invalidCount = rejections.filter((r) => r.kind === 'INVALID').length;

  const batch = await ImportBatch.create({
    reference: await nextReference(),
    filename: input.filename,
    format,
    status: 'PENDING',
    totalRows,
    validCount: accepted.length,
    duplicateCount,
    invalidCount,
    importedCount: 0,
    staged: accepted,
    // Cap what we persist so one hostile file cannot bloat a document.
    rejections: rejections.slice(0, 500),
    packageId: input.packageId,
    routerId: input.routerId,
    locationId: input.locationId,
    createdBy: input.createdBy,
  });

  return {
    batchId: String(batch._id),
    reference: batch.reference,
    filename: batch.filename,
    format,
    totalRows,
    validCount: accepted.length,
    duplicateCount,
    invalidCount,
    sample: accepted.slice(0, 25).map(({ code, username, profileName, limitUptimeSeconds, line }) => ({
      code, username, profileName, limitUptimeSeconds, line,
    })),
    rejections: rejections.slice(0, 100),
  };
}

export interface ConfirmResult {
  reference: string;
  imported: number;
  skipped: number;
}

export async function confirmImport(batchId: string): Promise<ConfirmResult> {
  const batch = await ImportBatch.findById(batchId).select('+staged');
  if (!batch) throw ApiError.notFound('That import batch no longer exists.');
  if (batch.status !== 'PENDING') {
    throw ApiError.conflict(`Import ${batch.reference} was already ${batch.status.toLowerCase()}.`);
  }

  const pkg = batch.packageId ? await PackageModel.findById(batch.packageId) : null;
  const documents = batch.staged.map((row) => ({
    code: row.code,
    username: row.username,
    encryptedPassword: encryptSecret(row.password, env.voucherSecretKey),
    packageId: batch.packageId,
    profileName: row.profileName,
    limitUptimeSeconds: row.limitUptimeSeconds ?? pkg?.durationSeconds,
    dataLimitBytes: row.dataLimitBytes ?? pkg?.dataLimitBytes,
    status: 'AVAILABLE' as const,
    routerId: batch.routerId,
    locationId: batch.locationId,
    importBatchId: batch._id,
    // These already exist on the router -- that is where the file came from.
    pushedToRouter: true,
    pushedAt: new Date(),
  }));

  let imported = 0;
  const CHUNK = 500;
  try {
    for (let i = 0; i < documents.length; i += CHUNK) {
      const slice = documents.slice(i, i + CHUNK);
      const result = await Voucher.insertMany(slice, { ordered: false, rawResult: true } as never);
      imported += (result as unknown as { insertedCount: number }).insertedCount ?? slice.length;
    }
  } catch (err) {
    // insertMany with ordered:false keeps going past duplicates; anything that
    // lands here is a real failure, and the batch records it.
    const writeErrors = (err as { writeErrors?: unknown[] }).writeErrors;
    if (!writeErrors) {
      batch.status = 'FAILED';
      batch.error = err instanceof Error ? err.message : 'unknown error';
      batch.staged = [];
      await batch.save();
      throw ApiError.unprocessable(`Import ${batch.reference} failed: ${batch.error}`);
    }
    imported = documents.length - writeErrors.length;
  }

  batch.status = 'COMPLETED';
  batch.importedCount = imported;
  batch.confirmedAt = new Date();
  batch.staged = []; // plaintext passwords only live until confirmation
  await batch.save();

  return { reference: batch.reference, imported, skipped: documents.length - imported };
}

export async function cancelImport(batchId: string): Promise<void> {
  const batch = await ImportBatch.findById(batchId);
  if (!batch) throw ApiError.notFound('That import batch no longer exists.');
  if (batch.status !== 'PENDING') throw ApiError.conflict('Only a pending import can be cancelled.');
  batch.status = 'CANCELLED';
  batch.staged = [];
  await batch.save();
}
