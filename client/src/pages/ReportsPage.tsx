import { useState } from 'react';
import { api } from '../api/endpoints';
import { useAsync } from '../hooks/useApi';
import { PageHeader, Panel, Loading, ErrorNotice, Field, Notice } from '../components/ui';
import { RankedBars } from '../components/charts';
import { formatBytes, formatMoney } from '../lib/format';

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function ReportsPage() {
  const [from, setFrom] = useState(isoDaysAgo(29));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const { data, loading, error } = useAsync(() => api.reports({ from, to }), [from, to]);

  return (
    <>
      <PageHeader title="Reports" description="Revenue and usage over a date range." />
      <ErrorNotice message={error} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="From"><input className="field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className="field" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>

      <div className="mb-4">
        <Notice>
          Usage figures come from MikroTik accounting collected by the sync worker, so they cover the period since
          syncing was enabled — they are not a reconstruction of traffic from before that.
        </Notice>
      </div>

      {loading && !data ? <Loading /> : data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Revenue by seller">
            <RankedBars data={data.revenueBySeller.map((r) => ({ label: r.name, value: r.revenue }))} format={(v) => formatMoney(v)} />
          </Panel>
          <Panel title="Revenue by location">
            <RankedBars data={data.revenueByLocation.map((r) => ({ label: r.name, value: r.revenue }))} format={(v) => formatMoney(v)} />
          </Panel>
          <Panel title="Data used by package">
            <RankedBars data={data.usageByPackage.map((r) => ({ label: r.name, value: r.bytes }))} format={(v) => formatBytes(v)} />
          </Panel>
          <Panel title="Data used by router">
            <RankedBars data={data.usageByRouter.map((r) => ({ label: r.name, value: r.bytes }))} format={(v) => formatBytes(v)} />
          </Panel>
        </div>
      )}
    </>
  );
}
