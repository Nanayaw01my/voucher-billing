import { useState } from 'react';
import { api } from '../api/endpoints';
import { useAsync, useSubmit } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { PageHeader, Panel, TableWrap, Loading, Empty, ErrorNotice, StatusChip, Modal, Field } from '../components/ui';
import { formatBytes, formatDuration, formatMoney } from '../lib/format';
import type { Package } from '../api/types';

const BLANK = { name: '', description: '', hours: '', gigabytes: '', price: '', mikrotikProfile: '', status: 'ACTIVE' };

export function PackagesPage() {
  const { can } = useAuth();
  const packages = useAsync(() => api.packages.list(), []);
  const [editing, setEditing] = useState<Package | null>(null);
  const [form, setForm] = useState(BLANK);
  const [open, setOpen] = useState(false);

  const save = useSubmit(async () => {
    const body: Record<string, unknown> = {
      name: form.name,
      description: form.description || undefined,
      price: Number(form.price),
      mikrotikProfile: form.mikrotikProfile,
      status: form.status,
      currency: 'GHS',
    };
    if (form.hours) body.durationSeconds = Math.round(Number(form.hours) * 3600);
    if (form.gigabytes) body.dataLimitBytes = Math.round(Number(form.gigabytes) * 1024 ** 3);

    if (editing) await api.packages.update(editing._id, body);
    else await api.packages.create(body);

    setOpen(false);
    setEditing(null);
    setForm(BLANK);
    packages.reload();
  });

  const remove = useSubmit(async (id: string) => {
    await api.packages.remove(id);
    packages.reload();
  });

  const startEdit = (pkg: Package) => {
    setEditing(pkg);
    setForm({
      name: pkg.name,
      description: pkg.description ?? '',
      hours: pkg.durationSeconds ? String(pkg.durationSeconds / 3600) : '',
      gigabytes: pkg.dataLimitBytes ? String(pkg.dataLimitBytes / 1024 ** 3) : '',
      price: String(pkg.price),
      mikrotikProfile: pkg.mikrotikProfile,
      status: pkg.status,
    });
    setOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Packages"
        description="Each package maps to a MikroTik user profile. The profile must already exist on the router."
        actions={can('SUPER_ADMIN', 'ADMIN') && (
          <button className="btn-primary" onClick={() => { setEditing(null); setForm(BLANK); setOpen(true); }}>
            New package
          </button>
        )}
      />
      <ErrorNotice message={packages.error ?? remove.error} />

      <Panel>
        {packages.loading && !packages.data ? <Loading /> : !packages.data?.data.length ? (
          <Empty>No packages configured yet.</Empty>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Name</th><th className="th">Time</th><th className="th">Data</th>
                  <th className="th">Price</th><th className="th">MikroTik profile</th><th className="th">Status</th><th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {packages.data.data.map((pkg) => (
                  <tr key={pkg._id} className="hover:bg-wash">
                    <td className="td font-medium">{pkg.name}</td>
                    <td className="td">{pkg.durationSeconds ? formatDuration(pkg.durationSeconds) : '—'}</td>
                    <td className="td">{pkg.dataLimitBytes ? formatBytes(pkg.dataLimitBytes) : '—'}</td>
                    <td className="td tabular-nums">{formatMoney(pkg.price, pkg.currency)}</td>
                    <td className="td font-mono text-xs">{pkg.mikrotikProfile}</td>
                    <td className="td"><StatusChip status={pkg.status} /></td>
                    <td className="td">
                      {can('SUPER_ADMIN', 'ADMIN') && (
                        <div className="flex gap-2">
                          <button className="btn-quiet px-2 py-1 text-xs" onClick={() => startEdit(pkg)}>Edit</button>
                          <button className="btn-quiet px-2 py-1 text-xs" disabled={remove.busy} onClick={() => void remove.run(pkg._id)}>Delete</button>
                        </div>
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
        <Modal title={editing ? `Edit ${editing.name}` : 'New package'} onClose={() => setOpen(false)}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save.run(); }}>
            <ErrorNotice message={save.error} />
            <Field label="Name"><input className="field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Description"><input className="field" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Hours" hint="Leave blank for a data-only package.">
                <input className="field" type="number" min={0} step="0.5" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
              </Field>
              <Field label="Gigabytes" hint="Leave blank for a time-only package.">
                <input className="field" type="number" min={0} step="0.5" value={form.gigabytes} onChange={(e) => setForm({ ...form, gigabytes: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price">
                <input className="field" type="number" min={0} step="0.01" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </Field>
              <Field label="Status">
                <select className="field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
                </select>
              </Field>
            </div>
            <Field label="MikroTik profile" hint="Must match a profile under /ip hotspot user profile.">
              <input className="field font-mono" required value={form.mikrotikProfile} onChange={(e) => setForm({ ...form, mikrotikProfile: e.target.value })} />
            </Field>
            <div className="flex gap-2">
              <button className="btn-primary" disabled={save.busy}>{save.busy ? 'Saving…' : 'Save package'}</button>
              <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
