import { usePolling } from '../hooks/useApi';
import { api } from '../api/endpoints';
import { PageHeader, Stat, Panel, Loading, ErrorNotice, Notice } from '../components/ui';
import { BarChart, LineChart, RankedBars } from '../components/charts';
import { formatBytes, formatMoney, formatDateTime } from '../lib/format';

export function DashboardPage() {
  const { data, loading, error, reload } = usePolling(() => api.dashboard(), 30_000);

  if (loading && !data) return <Loading />;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Voucher stock and sales come from this system. Online users come live from MikroTik."
        actions={<button className="btn-quiet" onClick={reload}>Refresh</button>}
      />
      <ErrorNotice message={error} />

      {data && (
        <div className="space-y-6">
          {data.online.degraded.length > 0 && (
            <Notice kind="warn">
              {data.online.degraded.length} router(s) could not be reached, so the online count below is incomplete:{' '}
              {data.online.degraded.map((d) => `${d.routerName} (${d.reason})`).join('; ')}
            </Notice>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Stat label="Online now" value={data.online.count} hint={`live from MikroTik · ${formatDateTime(data.online.fetchedAt)}`} />
            <Stat label="Total vouchers" value={data.vouchers.total.toLocaleString()} />
            <Stat label="Available" value={data.vouchers.available.toLocaleString()} />
            <Stat label="Active" value={data.vouchers.active.toLocaleString()} />
            <Stat label="Expired" value={data.vouchers.expired.toLocaleString()} />
            <Stat label="Used" value={data.vouchers.used.toLocaleString()} />
            <Stat label="Disabled" value={data.vouchers.disabled.toLocaleString()} />
            <Stat
              label="Routers online"
              value={`${data.infrastructure.routersOnline}/${data.infrastructure.routers}`}
              hint={`${data.infrastructure.accessPoints} access point(s) registered`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Today's sales" value={data.sales.today.count} />
            <Stat label="Today's revenue" value={formatMoney(data.sales.today.revenue)} />
            <Stat label="This week" value={formatMoney(data.sales.week.revenue)} hint={`${data.sales.week.count} vouchers`} />
            <Stat label="This month" value={formatMoney(data.sales.month.revenue)} hint={`${data.sales.month.count} vouchers`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Revenue, last 30 days">
              <div className="p-3">
                <LineChart
                  data={data.sales.daily.map((d) => ({ label: d.date.slice(5), value: d.revenue }))}
                  valueFormat={(v) => formatMoney(v).replace('.00', '')}
                />
              </div>
            </Panel>

            <Panel title="Data used, last 30 days">
              <div className="p-3">
                <BarChart
                  data={data.bandwidth.daily.map((d) => ({ label: d.date.slice(5), value: d.bytes }))}
                  valueFormat={(v) => formatBytes(v)}
                />
                <p className="px-1 pt-2 text-[11px] text-muted">
                  Collected from MikroTik accounting by the sync worker — historical, not live counters.
                </p>
              </div>
            </Panel>

            <Panel title="Revenue by package">
              <RankedBars
                data={data.sales.byPackage.map((p) => ({ label: p.packageName, value: p.revenue }))}
                format={(v) => formatMoney(v)}
              />
            </Panel>

            <Panel title="Bandwidth summary">
              <div className="grid grid-cols-2 gap-px bg-hairline">
                <div className="bg-paper p-4">
                  <div className="text-xs uppercase tracking-wide text-muted">Today</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums">{formatBytes(data.bandwidth.todayBytes)}</div>
                </div>
                <div className="bg-paper p-4">
                  <div className="text-xs uppercase tracking-wide text-muted">This week</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums">{formatBytes(data.bandwidth.weekBytes)}</div>
                </div>
                <div className="bg-paper p-4">
                  <div className="text-xs uppercase tracking-wide text-muted">This month</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums">{formatBytes(data.bandwidth.monthBytes)}</div>
                </div>
                <div className="bg-paper p-4">
                  <div className="text-xs uppercase tracking-wide text-muted">All time</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums">
                    {data.bandwidth.lifetimeBytes === null ? 'Not synced' : formatBytes(data.bandwidth.lifetimeBytes)}
                  </div>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
