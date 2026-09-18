import { useState } from 'react';
import { api } from '../api/endpoints';
import { useAsync, useSubmit } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { PageHeader, Panel, TableWrap, Loading, Empty, ErrorNotice, StatusChip, Modal, Field, Notice } from '../components/ui';
import { formatDateTime, nameOf } from '../lib/format';
import type { AccessPointDevice } from '../api/types';

const BLANK = { name: '', deviceModel: '', ipAddress: '', macAddress: '', locationId: '', routerId: '', status: 'ACTIVE', reportsStatistics: false };

export function AccessPointsPage() {
  const { can } = useAuth();
  const accessPoints = useAsync(() => api.accessPoints.list(), []);
  const locations = useAsync(() => api.locations.list(), []);
  const routers = useAsync(() => api.routers.list(), []);
  const [editing, setEditing] = useState<AccessPointDevice | null>(null);
  const [form, setForm] = useState(BLANK);
  const [open, setOpen] = useState(false);

  const save = useSubmit(async () => {
    const body: Record<string, unknown> = {
      name: form.name,
      deviceModel: form.deviceModel || undefined,
      ipAddress: form.ipAddress || undefined,
      macAddress: form.macAddress || undefined,
      locationId: form.locationId || undefined,
      routerId: form.routerId || undefined,
      status: form.status,
      reportsStatistics: form.reportsStatistics,
    };
    if (editing) await api.accessPoints.update(editing._id, body);
    else await api.accessPoints.create(body);
    setOpen(false); setEditing(null); setForm(BLANK); accessPoints.reload();
  });

  return (
    <>
      <PageHeader
        title="Access points"
        description="An inventory record. Most outdoor APs bridge traffic and expose nothing to query, so telemetry is opt-in per device."
        actions={can('SUPER_ADMIN', 'ADMIN') && (
          <button className="btn-primary" onClick={() => { setEditing(null); setForm(BLANK); setOpen(true); }}>Add access point</button>
        )}
      />
      <ErrorNotice message={accessPoints.error} />

      <div className="mb-4">
        <Notice>
          This system does not invent access point statistics. A device is only shown as reporting when you mark it as such
          and a source for that data exists.
        </Notice>
      </div>

      <Panel>
        {accessPoints.loading && !accessPoints.data ? <Loading /> : !accessPoints.data?.data.length ? (
          <Empty>No access points registered yet.</Empty>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Name</th><th className="th">Model</th><th className="th">IP</th><th className="th">MAC</th>
                  <th className="th">Location</th><th className="th">Router</th><th className="th">Telemetry</th>
                  <th className="th">Status</th><th className="th">Last seen</th><th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {accessPoints.data.data.map((ap) => (
                  <tr key={ap._id} className="hover:bg-wash">
                    <td className="td font-medium">{ap.name}</td>
                    <td className="td text-muted">{ap.deviceModel ?? '—'}</td>
                    <td className="td font-mono text-xs">{ap.ipAddress ?? '—'}</td>
                    <td className="td font-mono text-xs">{ap.macAddress ?? '—'}</td>
                    <td className="td text-muted">{nameOf(ap.locationId)}</td>
                    <td className="td text-muted">{nameOf(ap.routerId)}</td>
                    <td className="td text-muted">{ap.reportsStatistics ? 'Reports statistics' : 'None available'}</td>
                    <td className="td"><StatusChip status={ap.status} /></td>
                    <td className="td text-muted">{formatDateTime(ap.lastSeen)}</td>
                    <td className="td">
                      {can('SUPER_ADMIN', 'ADMIN') && (
                        <button className="btn-quiet px-2 py-1 text-xs"
                          onClick={() => {
                            setEditing(ap);
                            setForm({
                              name: ap.name, deviceModel: ap.deviceModel ?? '', ipAddress: ap.ipAddress ?? '', macAddress: ap.macAddress ?? '',
                              locationId: typeof ap.locationId === 'object' ? ap.locationId?._id ?? '' : ap.locationId ?? '',
                              routerId: typeof ap.routerId === 'object' ? ap.routerId?._id ?? '' : ap.routerId ?? '',
                              status: ap.status, reportsStatistics: ap.reportsStatistics,
                            });
                            setOpen(true);
                          }}>
                          Edit
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

      {open && (
        <Modal title={editing ? `Edit ${editing.name}` : 'Add an access point'} onClose={() => setOpen(false)}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save.run(); }}>
            <ErrorNotice message={save.error} />
            <Field label="Name"><input className="field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Model"><input className="field" value={form.deviceModel} onChange={(e) => setForm({ ...form, deviceModel: e.target.value })} /></Field>
              <Field label="IP address"><input className="field font-mono" value={form.ipAddress} onChange={(e) => setForm({ ...form, ipAddress: e.target.value })} /></Field>
            </div>
            <Field label="MAC address"><input className="field font-mono" value={form.macAddress} onChange={(e) => setForm({ ...form, macAddress: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Location">
                <select className="field" value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                  <option value="">Not assigned</option>
                  {locations.data?.data.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
                </select>
              </Field>
              <Field label="Router">
                <select className="field" value={form.routerId} onChange={(e) => setForm({ ...form, routerId: e.target.value })}>
                  <option value="">Not assigned</option>
                  {routers.data?.data.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
                </select>
              </Field>
            </div>
            <label className="flex items-start gap-2 border border-hairline p-3 text-sm">
              <input type="checkbox" className="mt-0.5 accent-black" checked={form.reportsStatistics}
                onChange={(e) => setForm({ ...form, reportsStatistics: e.target.checked })} />
              <span>This device exposes usable statistics
                <span className="mt-1 block text-xs text-muted">Leave unticked for a plain bridged AP.</span>
              </span>
            </label>
            <div className="flex gap-2">
              <button className="btn-primary" disabled={save.busy}>{save.busy ? 'Saving…' : 'Save access point'}</button>
              <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
