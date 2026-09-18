import { Schema, model, type Document, type Types } from 'mongoose';
import { IMPORT_STATUSES, type ImportStatus } from './types';

/** A parsed row held between preview and confirmation. Nothing is written to
 *  the vouchers collection until the administrator confirms. */
export interface IStagedVoucher {
  code: string;
  username: string;
  password: string;
  profileName: string;
  limitUptimeSeconds?: number;
  dataLimitBytes?: number;
  line: number;
}

export interface IImportRejection {
  line: number;
  raw: string;
  reason: string;
  kind: 'INVALID' | 'DUPLICATE_IN_FILE' | 'DUPLICATE_IN_DB';
}

export interface IImportBatch extends Document<Types.ObjectId> {
  reference: string;
  filename: string;
  format: 'TXT' | 'CSV' | 'JSON';
  status: ImportStatus;
  totalRows: number;
  validCount: number;
  duplicateCount: number;
  invalidCount: number;
  importedCount: number;
  staged: IStagedVoucher[];
  rejections: IImportRejection[];
  packageId?: Types.ObjectId;
  routerId?: Types.ObjectId;
  locationId?: Types.ObjectId;
  createdBy: Types.ObjectId;
  confirmedAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const stagedVoucherSchema = new Schema<IStagedVoucher>(
  {
    code: { type: String, required: true },
    username: { type: String, required: true },
    password: { type: String, required: true },
    profileName: { type: String, required: true },
    limitUptimeSeconds: { type: Number },
    dataLimitBytes: { type: Number },
    line: { type: Number, required: true },
  },
  { _id: false },
);

const rejectionSchema = new Schema<IImportRejection>(
  {
    line: { type: Number, required: true },
    raw: { type: String, default: '' },
    reason: { type: String, required: true },
    kind: { type: String, enum: ['INVALID', 'DUPLICATE_IN_FILE', 'DUPLICATE_IN_DB'], required: true },
  },
  { _id: false },
);

const importBatchSchema = new Schema<IImportBatch>(
  {
    reference: { type: String, required: true, unique: true },
    filename: { type: String, required: true },
    format: { type: String, enum: ['TXT', 'CSV', 'JSON'], required: true },
    status: { type: String, enum: IMPORT_STATUSES, default: 'PENDING' },
    totalRows: { type: Number, default: 0 },
    validCount: { type: Number, default: 0 },
    duplicateCount: { type: Number, default: 0 },
    invalidCount: { type: Number, default: 0 },
    importedCount: { type: Number, default: 0 },
    // `staged` holds plaintext only until confirmation, then it is cleared.
    staged: { type: [stagedVoucherSchema], default: [], select: false },
    rejections: { type: [rejectionSchema], default: [] },
    packageId: { type: Schema.Types.ObjectId, ref: 'Package' },
    routerId: { type: Schema.Types.ObjectId, ref: 'Router' },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    confirmedAt: { type: Date },
    error: { type: String },
  },
  { timestamps: true },
);

importBatchSchema.index({ createdAt: -1 });

export const ImportBatch = model<IImportBatch>('ImportBatch', importBatchSchema);
