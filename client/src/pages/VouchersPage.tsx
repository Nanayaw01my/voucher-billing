import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/endpoints';
import { useAsync, useSubmit } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { PageHeader, Panel, TableWrap, Pager, Loading, Empty, ErrorNotice, StatusChip, Field } from '../components/ui';
import { formatDate, formatBytes, nameOf } from '../lib/format';
import type { VoucherStatus } from '../api/types';

const STATUSES: VoucherStatus[] = ['AVAILABLE', 'ACTIVE', 'EXPIRED', 'USED', 'DISABLED'];

export function VouchersPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [packageId, setPackageId] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);

  const packages = useAsync(() => api.packages.list(), []);
  const query = useMemo(
    () => ({ page, limit: 25, search: search || undefined, status: status || undefined, packageId: packageId || undefined }),
    [page, search, status, packageId],
  );
  const vouchers = useAsync(() => api.vouchers.list(query), [query]);

  const disable = useSubmit(async (id: string) => {
    await api.vouchers.disable(id);
    vouchers.reload();
  });

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));

  return (
    <>
      <PageHeader
        title="Vouchers"
        description="Server-side search and pagination — only the current page is ever loaded."
        actions={
          <>
            <button className="btn-quiet" onClick={() => void api.vouchers.exportCsv(query)}>Export CSV</button>
            {can('SUPER_ADMIN', 'ADMIN') && selected.length > 0 && (
              <button
                className="btn-secondary"
                onClick={() => navigate(`/vouchers/print?ids=${selected.join(',')}`)}
              >
                Print {selected.length} card{selected.length === 1 ? '' : 's'}
              </button>
            )}
            {can('SUPER_ADMIN', 'ADMIN') && <Link className="btn-primary" to="/vouchers/generate">Generate</Link>}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Search">
          <input
            className="field" placeholder="Voucher code or username" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </Field>
        <Field label="Status">
          <select className="field" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Package">
          <select className="field" value={packageId} onChange={(e) => { setPackageId(e.target.value); setPage(1); }}>
            <option value="">All packages</option>
            {packages.data?.data.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
        </Field>
      </div>

      <ErrorNotice message={vouchers.error ?? disable.error} />

      <Panel>
        {vouchers.loading && !vouchers.data ? (
          <Loading />
        ) : !vouchers.data?.data.length ? (
          <Empty>No vouchers match these filters.</Empty>
        ) : (
          <>
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th w-8"></th>
                    <th className="th">Code</th>
                    <th className="th">Package</th>
                    <th className="th">Profile</th>
                    <th className="th">Status</th>
                    <th className="th">On router</th>
                    <th className="th">Data used</th>
                    <th className="th">Created</th>
                    <th className="th"></th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.data.data.map((voucher) => (
                    <tr key={voucher._id} className="hover:bg-wash">
                      <td className="td">
                        <input
                          type="checkbox" className="accent-black"
                          checked={selected.includes(voucher._id)} onChange={() => toggle(voucher._id)}
                          aria-label={`Select ${voucher.code}`}
                        />
                      </td>
                      <td className="td font-mono font-semibold">
                        <Link to={`/vouchers/${voucher._id}`} className="underline-offset-2 hover:underline">{voucher.code}</Link>
                      </td>
                      <td className="td">{nameOf(voucher.packageId)}</td>
                      <td className="td text-muted">{voucher.profileName}</td>
                      <td className="td"><StatusChip status={voucher.status} /></td>
                      <td className="td text-muted">{voucher.pushedToRouter ? 'Yes' : 'Not pushed'}</td>
                      <td className="td tabular-nums">
                        {voucher.lastSyncedAt
                          ? formatBytes((voucher.uploadBytes ?? 0) + (voucher.downloadBytes ?? 0))
                          : <span className="text-muted">Not synced</span>}
                      </td>
                      <td className="td text-muted">{formatDate(voucher.createdAt)}</td>
                      <td className="td">
                        {can('SUPER_ADMIN', 'ADMIN') && voucher.status !== 'DISABLED' && (
                          <button className="btn-quiet px-2 py-1 text-xs" disabled={disable.busy} onClick={() => void disable.run(voucher._id)}>
                            Disable
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <Pager
              page={vouchers.data.pagination.page}
              pages={vouchers.data.pagination.pages}
              total={vouchers.data.pagination.total}
              onChange={setPage}
            />
          </>
        )}
      </Panel>
    </>
  );
}
