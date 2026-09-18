import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/endpoints';
import { useAsync, useSubmit } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { PageHeader, Panel, Loading, ErrorNotice, StatusChip, TableWrap, Empty, Notice } from '../components/ui';
import { formatBytes, formatDateTime, formatDuration, formatMoney, nameOf } from '../lib/format';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-hairline px-4 py-2.5 text-sm first:border-t-0">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export function VoucherDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const { data, loading, error, reload } = useAsync(() => api.vouchers.get(id), [id]);
  const [secret, setSecret] = useState<string | null>(null);

  const reveal = useSubmit(async () => {
    const result = await api.vouchers.secret(id);
    setSecret(result.password);
  });
  const disable = useSubmit(async () => {
    await api.vouchers.disable(id);
    reload();
  });

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorNotice message={error ?? 'That voucher could not be loaded.'} />;

  const { voucher, usage, sessions, sale } = data;

  return (
    <>
      <PageHeader
        title={voucher.code}
        description={`MikroTik profile ${voucher.profileName}`}
        actions={
          <>
            <Link className="btn-quiet" to={`/vouchers/print?ids=${voucher._id}`}>Print card</Link>
            {can('SUPER_ADMIN', 'ADMIN') && voucher.status !== 'DISABLED' && (
              <button className="btn-secondary" disabled={disable.busy} onClick={() => void disable.run()}>
                Disable voucher
              </button>
            )}
          </>
        }
      />
      <ErrorNotice message={error ?? disable.error ?? reveal.error} />

      {usage.source === 'never-synced' && (
        <div className="mb-4">
          <Notice kind="warn">
            This voucher has never been read back from its router, so no usage figures are available yet.
            Blank values below mean "unknown", not zero.
          </Notice>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Voucher">
          <Row label="Status" value={<StatusChip status={voucher.status} />} />
          <Row label="Username" value={<span className="font-mono">{voucher.username}</span>} />
          <Row
            label="Password"
            value={
              secret ? <span className="font-mono">{secret}</span>
              : can('SUPER_ADMIN', 'ADMIN')
                ? <button className="btn-quiet px-2 py-1 text-xs" disabled={reveal.busy} onClick={() => void reveal.run()}>Reveal</button>
                : <span className="text-muted">Hidden</span>
            }
          />
          <Row label="Package" value={nameOf(voucher.packageId)} />
          <Row label="MikroTik profile" value={voucher.profileName} />
          <Row label="Router" value={nameOf(voucher.routerId)} />
          <Row label="Location" value={nameOf(voucher.locationId)} />
          <Row label="Pushed to router" value={voucher.pushedToRouter ? 'Yes' : 'No'} />
          <Row label="Created" value={formatDateTime(voucher.createdAt)} />
          <Row label="Activated" value={formatDateTime(voucher.activatedAt)} />
          <Row label="Expires" value={formatDateTime(voucher.expiresAt)} />
        </Panel>

        <Panel title="Usage" actions={<span className="chip-quiet">{usage.source === 'accounting' ? 'accounting' : 'never synced'}</span>}>
          <Row label="Time allowed" value={formatDuration(usage.timeAllowedSeconds)} />
          <Row label="Time used" value={formatDuration(usage.timeUsedSeconds)} />
          <Row label="Time remaining" value={formatDuration(usage.timeRemainingSeconds)} />
          <Row label="Download" value={formatBytes(usage.downloadBytes)} />
          <Row label="Upload" value={formatBytes(usage.uploadBytes)} />
          <Row label="Total" value={formatBytes(usage.totalBytes)} />
          <Row label="Last synced" value={formatDateTime(usage.lastSyncedAt)} />
        </Panel>

        {sale && (
          <Panel title="Sale">
            <Row label="Price" value={formatMoney(sale.price, sale.currency)} />
            <Row label="Seller" value={nameOf(sale.sellerId)} />
            <Row label="Payment method" value={sale.paymentMethod} />
            <Row label="Sold at" value={formatDateTime(sale.soldAt)} />
            {sale.customerPhone && <Row label="Customer" value={sale.customerPhone} />}
          </Panel>
        )}

        <Panel title="Session history" actions={<span className="chip-quiet">{sessions.length} record(s)</span>}>
          {sessions.length === 0 ? (
            <Empty>No sessions recorded for this voucher yet.</Empty>
          ) : (
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Login</th>
                    <th className="th">Duration</th>
                    <th className="th">IP</th>
                    <th className="th">MAC</th>
                    <th className="th">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr key={session._id}>
                      <td className="td">{formatDateTime(session.loginTime)}</td>
                      <td className="td">{session.isOpen ? 'Open now' : formatDuration(session.durationSeconds)}</td>
                      <td className="td font-mono text-xs">{session.ipAddress ?? '—'}</td>
                      <td className="td font-mono text-xs">{session.macAddress ?? '—'}</td>
                      <td className="td tabular-nums">{formatBytes(session.totalBytes)}</td>
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
