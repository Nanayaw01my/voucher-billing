import { useState } from 'react';
import { api } from '../api/endpoints';
import { useAsync, useSubmit } from '../hooks/useApi';
import { PageHeader, Panel, Field, ErrorNotice, Notice, TableWrap, Empty, Stat } from '../components/ui';
import { formatDateTime } from '../lib/format';
import type { ImportPreview } from '../api/types';

const EXAMPLE = '/ip hotspot user add name=D4BKB3UD password=D4BKB3UD profile="VOUCHER-24H-1CODE" limit-uptime=24h';

export function ImportVouchersPage() {
  const packages = useAsync(() => api.packages.list(), []);
  const routers = useAsync(() => api.routers.list(), []);
  const locations = useAsync(() => api.locations.list(), []);
  const batches = useAsync(() => api.vouchers.batches(), []);

  const [file, setFile] = useState<File | null>(null);
  const [packageId, setPackageId] = useState('');
  const [routerId, setRouterId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [done, setDone] = useState<{ reference: string; imported: number; skipped: number } | null>(null);

  const upload = useSubmit(async () => {
    if (!file) return null;
    const formData = new FormData();
    formData.append('file', file);
    if (packageId) formData.append('packageId', packageId);
    if (routerId) formData.append('routerId', routerId);
    if (locationId) formData.append('locationId', locationId);
    const result = await api.vouchers.importPreview(formData);
    setPreview(result);
    setDone(null);
    return result;
  });

  const confirm = useSubmit(async (batchId: string) => {
    const result = await api.vouchers.importConfirm(batchId);
    setDone(result);
    setPreview(null);
    batches.reload();
    return result;
  });

  const cancel = useSubmit(async (batchId: string) => {
    await api.vouchers.importCancel(batchId);
    setPreview(null);
    batches.reload();
  });

  return (
    <>
      <PageHeader
        title="Import vouchers"
        description="Upload existing stock as MikroTik commands, CSV or JSON. Nothing is written until you confirm the preview."
      />
      <ErrorNotice message={upload.error ?? confirm.error ?? cancel.error} />

      {done && (
        <div className="mb-4">
          <Notice kind="warn">
            Batch {done.reference}: {done.imported.toLocaleString()} voucher(s) imported
            {done.skipped > 0 && `, ${done.skipped} skipped`}.
          </Notice>
        </div>
      )}

      {!preview && (
        <Panel title="Upload a file">
          <div className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="File" hint=".txt, .csv or .json — up to 8 MB.">
                <input className="field" type="file" accept=".txt,.csv,.json"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </Field>
              <Field label="Package" hint="Used for pricing and as the fallback profile.">
                <select className="field" value={packageId} onChange={(e) => setPackageId(e.target.value)}>
                  <option value="">Not assigned</option>
                  {packages.data?.data.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Router">
                <select className="field" value={routerId} onChange={(e) => setRouterId(e.target.value)}>
                  <option value="">Not assigned</option>
                  {routers.data?.data.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
                </select>
              </Field>
              <Field label="Location">
                <select className="field" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                  <option value="">Not assigned</option>
                  {locations.data?.data.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
                </select>
              </Field>
            </div>

            <div className="border border-hairline p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted">Expected TXT format</div>
              <code className="mt-2 block overflow-x-auto whitespace-pre font-mono text-xs">{EXAMPLE}</code>
              <p className="mt-2 text-xs text-muted">
                Only <code className="font-mono">/ip hotspot user add</code> is accepted. Lines are parsed into fields —
                nothing from the file is ever executed.
              </p>
            </div>

            <button className="btn-primary" disabled={!file || upload.busy} onClick={() => void upload.run()}>
              {upload.busy ? 'Checking file…' : 'Check file'}
            </button>
          </div>
        </Panel>
      )}

      {preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Found" value={preview.totalRows.toLocaleString()} />
            <Stat label="Valid" value={preview.validCount.toLocaleString()} />
            <Stat label="Duplicates" value={preview.duplicateCount.toLocaleString()} />
            <Stat label="Invalid" value={preview.invalidCount.toLocaleString()} />
          </div>

          <Notice kind="warn">
            Batch {preview.reference} · {preview.filename} · detected as {preview.format}.
            Nothing has been saved yet.
          </Notice>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={`Will be imported (${preview.validCount.toLocaleString()})`}>
              {preview.sample.length === 0 ? (
                <Empty>No valid rows in this file.</Empty>
              ) : (
                <TableWrap>
                  <table className="w-full">
                    <thead>
                      <tr><th className="th">Line</th><th className="th">Code</th><th className="th">Profile</th></tr>
                    </thead>
                    <tbody>
                      {preview.sample.map((row) => (
                        <tr key={row.code}>
                          <td className="td text-muted">{row.line}</td>
                          <td className="td font-mono">{row.code}</td>
                          <td className="td">{row.profileName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
              {preview.validCount > preview.sample.length && (
                <p className="border-t border-hairline px-4 py-2 text-xs text-muted">
                  Showing the first {preview.sample.length} of {preview.validCount.toLocaleString()}.
                </p>
              )}
            </Panel>

            <Panel title={`Rejected (${(preview.duplicateCount + preview.invalidCount).toLocaleString()})`}>
              {preview.rejections.length === 0 ? (
                <Empty>Nothing was rejected.</Empty>
              ) : (
                <TableWrap>
                  <table className="w-full">
                    <thead>
                      <tr><th className="th">Line</th><th className="th">Reason</th><th className="th">Kind</th></tr>
                    </thead>
                    <tbody>
                      {preview.rejections.map((row, index) => (
                        <tr key={`${row.line}-${index}`}>
                          <td className="td text-muted">{row.line}</td>
                          <td className="td whitespace-normal">{row.reason}</td>
                          <td className="td text-muted">{row.kind.replace(/_/g, ' ').toLowerCase()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </Panel>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary"
              disabled={confirm.busy || preview.validCount === 0}
              onClick={() => void confirm.run(preview.batchId)}
            >
              {confirm.busy ? 'Importing…' : `Import ${preview.validCount.toLocaleString()} voucher(s)`}
            </button>
            <button className="btn-quiet" disabled={cancel.busy} onClick={() => void cancel.run(preview.batchId)}>
              Cancel this import
            </button>
          </div>
        </div>
      )}

      <div className="mt-6">
        <Panel title="Import history">
          {!batches.data?.data.length ? (
            <Empty>No imports yet.</Empty>
          ) : (
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Batch</th><th className="th">File</th><th className="th">Status</th>
                    <th className="th">Found</th><th className="th">Imported</th><th className="th">Duplicates</th>
                    <th className="th">Invalid</th><th className="th">By</th><th className="th">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.data.data.map((batch) => (
                    <tr key={batch._id}>
                      <td className="td font-mono">{batch.reference}</td>
                      <td className="td">{batch.filename}</td>
                      <td className="td">{batch.status}</td>
                      <td className="td tabular-nums">{batch.totalRows}</td>
                      <td className="td tabular-nums">{batch.importedCount}</td>
                      <td className="td tabular-nums">{batch.duplicateCount}</td>
                      <td className="td tabular-nums">{batch.invalidCount}</td>
                      <td className="td text-muted">{batch.createdBy?.name ?? '—'}</td>
                      <td className="td text-muted">{formatDateTime(batch.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Panel>
      </div>
    </>
  );
}
