import crypto from 'crypto';
import type { Types } from 'mongoose';
import { Voucher, PackageModel } from '../models';
import { encryptSecret } from '../utils/crypto';
import { env } from '../config/env';
import { ApiError } from '../utils/apiError';

// No 0/O/1/I/L -- these are the characters customers mistype off a printed card.
const UNAMBIGUOUS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const FULL_ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const NUMERIC = '0123456789';

export type CodeCharset = 'UNAMBIGUOUS' | 'ALPHANUMERIC' | 'NUMERIC';

export interface GenerateOptions {
  packageId: string;
  quantity: number;
  codeLength: number;
  charset: CodeCharset;
  prefix?: string;
  /** SAME: password equals the code (what the existing stock uses). */
  passwordMode: 'SAME' | 'RANDOM';
  passwordLength?: number;
  routerId?: string;
  locationId?: string;
  profileOverride?: string;
  createdBy: Types.ObjectId;
}

function alphabetFor(charset: CodeCharset): string {
  if (charset === 'NUMERIC') return NUMERIC;
  if (charset === 'ALPHANUMERIC') return FULL_ALPHANUMERIC;
  return UNAMBIGUOUS;
}

/** Rejection sampling keeps the distribution uniform across the alphabet. */
export function randomCode(length: number, alphabet: string): string {
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  let out = '';
  while (out.length < length) {
    for (const byte of crypto.randomBytes(length * 2)) {
      if (byte >= limit) continue;
      out += alphabet[byte % alphabet.length];
      if (out.length === length) break;
    }
  }
  return out;
}

/**
 * Builds `quantity` codes that collide neither with each other nor with any
 * voucher already in Mongo. The unique index on `vouchers.code` is the final
 * guarantee; this pre-check just keeps the insert from bouncing.
 */
async function buildUniqueCodes(options: GenerateOptions): Promise<string[]> {
  const alphabet = alphabetFor(options.charset);
  const prefix = (options.prefix ?? '').toUpperCase();
  const space = alphabet.length ** options.codeLength;
  if (space < options.quantity * 10) {
    throw ApiError.badRequest(
      `A code length of ${options.codeLength} cannot safely produce ${options.quantity} unique codes. Use a longer code.`,
    );
  }

  const chosen = new Set<string>();
  let attempts = 0;
  const maxAttempts = options.quantity * 50;

  while (chosen.size < options.quantity) {
    if (attempts++ > maxAttempts) {
      throw ApiError.badRequest('Could not generate enough unique codes. Try a longer code length.');
    }
    const batch: string[] = [];
    while (batch.length < options.quantity - chosen.size) {
      const candidate = prefix + randomCode(options.codeLength, alphabet);
      if (!chosen.has(candidate)) batch.push(candidate);
    }
    const taken = await Voucher.find({ code: { $in: batch } }).select('code').lean();
    const takenSet = new Set(taken.map((doc) => doc.code));
    for (const code of batch) if (!takenSet.has(code)) chosen.add(code);
  }

  return [...chosen];
}

export interface GeneratedVoucherSummary {
  generated: number;
  codes: string[];
}

export async function generateVouchers(options: GenerateOptions): Promise<GeneratedVoucherSummary> {
  const pkg = await PackageModel.findById(options.packageId);
  if (!pkg) throw ApiError.notFound('That package no longer exists.');
  if (pkg.status !== 'ACTIVE') throw ApiError.badRequest('That package is inactive and cannot be sold.');

  const codes = await buildUniqueCodes(options);
  const profileName = options.profileOverride ?? pkg.mikrotikProfile;
  const passwordAlphabet = alphabetFor(options.charset);

  const documents = codes.map((code) => {
    const password = options.passwordMode === 'SAME'
      ? code
      : randomCode(options.passwordLength ?? 8, passwordAlphabet);
    return {
      code,
      username: code,
      encryptedPassword: encryptSecret(password, env.voucherSecretKey),
      packageId: pkg._id,
      profileName,
      limitUptimeSeconds: pkg.durationSeconds,
      dataLimitBytes: pkg.dataLimitBytes,
      status: 'AVAILABLE' as const,
      routerId: options.routerId,
      locationId: options.locationId,
      pushedToRouter: false,
    };
  });

  // Chunked so a 10,000-voucher generation does not build one enormous write.
  const CHUNK = 500;
  for (let i = 0; i < documents.length; i += CHUNK) {
    await Voucher.insertMany(documents.slice(i, i + CHUNK), { ordered: false });
  }

  return { generated: documents.length, codes };
}
