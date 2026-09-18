import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/endpoints';
import { useAsync, usePolling, useSubmit } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { PageHeader, Panel, TableWrap, Loading, Empty, ErrorNotice, Notice, Field, Stat } from '../components/ui';
import { formatBytes, formatDuration, formatDateTime } from '../lib/format';

type SortKey = 'username' | 'uptimeSeconds' | 'totalBytes' | 'routerName';

export function ActiveUsersPage() {
  const { can } = useAuth();
  const routers = useAsync(() => api.routers.list(), []);
  const [routerId, setRouterId] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('uptimeSeconds');

  // Live router state: polled, never read from the local database.
  const { data, loading, error, reload } = usePolling(() => api.activeUsers.list(routerId || undefined), 15_000, [routerId]);

  const disconnect = useSubmit(async (id: string, router: string) => {
    await api.activeUsers.disconnect(id, router);
    reload();
  });

  const rows = useMemo(() => {
    const list = (data?.users ?? []).filter((user) => {
      if (!search) return true;
      const needle = search.toLowerCase();
      return (
        user.username.toLowerCase().includes(needle) ||
        user.address?.toLowerCase().includes(needle) ||
        user.macAddress?.toLowerCase().includes(needle)
      );
    });
    return [...list].sort((a, b) => {
      if (sort === 'username') return a.username.localeCompare(b.username);
      if (sort === 'routerName') return a.routerName.localeCompare(b.routerName);
      return (b[sort] ?? 0) - (a[sort] ?? 0);
    });
  }, [data, search, sort]);

  return (
    <>
      <PageHeader
        title="Active users"
        description="Read live from /ip hotspot active on each router. This page does not use stored data."
        actions={<button className="btn-quiet" onClick={reload}>Refresh</button>}
      />
      <ErrorNotice message={error ?? disconnect.error} />

      {data && data.degraded.length > 0 && (
        <div className="mb-4">
          <Notice kind="warn">
            This list is incomplete — {data.degraded.map((d) => `${d.routerName} (${d.reason})`).join('; ')}.
          </Notice>
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Online now" value={rows.length} hint={data ? `as of ${formatDateTime(data.fetchedAt)}` : undefined} />
        <Field label="Search">
          <input className="field" placeholder="Username, IP or MAC" value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
        <Field label="Router">
          <select className="field" value={routerId} onChange={(e) => setRouterId(e.target.value)}>
            <option value="">All routers</option>
            {routers.data?.data.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Sort by">
          <select className="field" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="uptimeSeconds">Longest session</option>
            <option value="totalBytes">Most data</option>
            <option value="username">Username</option>
            <option value="routerName">Router</option>
          </select>
        </Field>
      </div>

      <Panel>
        {loading && !data ? (
          <Loading label="Reading live sessions from MikroTik…" />
        ) : rows.length === 0 ? (
          <Empty>No customers are connected right now.</Empty>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Voucher</th><th className="th">IP</th><th className="th">MAC</th>
                  <th className="th">Login method</th><th className="th">Session</th><th className="th">Time left</th>
                  <th className="th">Down</th><th className="th">Up</th><th className="th">Total</th>
                  <th className="th">Router</th><th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((user) => (
                  <tr key={`${user.routerId}-${user.id}`} className="hover:bg-wash">
                    <td className="td font-mono font-semibold">
                      {user.voucherId
                        ? <Link to={`/vouchers/${user.voucherId}`} className="underline-offset-2 hover:underline">{user.username}</Link>
                        : user.username}
                      {user.packageName && <div className="font-sans text-xs font-normal text-muted">{user.packageName}</div>}
                    </td>
                    <td className="td font-mono text-xs">{user.address ?? '—'}</td>
                    <td className="td font-mono text-xs">{user.macAddress ?? '—'}</td>
                    <td className="td text-muted">{user.loginBy ?? '—'}</td>
                    <td className="td tabular-nums">{formatDuration(user.uptimeSeconds)}</td>
                    <td className="td tabular-nums">{formatDuration(user.sessionTimeLeftSeconds)}</td>
                    <td className="td tabular-nums">{formatBytes(user.bytesOut)}</td>
                    <td className="td tabular-nums">{formatBytes(user.bytesIn)}</td>
                    <td className="td tabular-nums font-medium">{formatBytes(user.totalBytes)}</td>
                    <td className="td text-muted">{user.routerName}</td>
                    <td className="td">
                      {can('SUPER_ADMIN', 'ADMIN') && (
                        <button
                          className="btn-quiet px-2 py-1 text-xs"
                          disabled={disconnect.busy}
                          onClick={() => void disconnect.run(user.id, user.routerId)}
                        >
                          Disconnect
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Panel>

      <p className="mt-3 text-xs text-muted">
        Device details are limited to what MikroTik reports. Access points in bridge mode expose no per-client
        information, so no access point column is shown unless a router supplies it.
      </p>
    </>
  );
}
