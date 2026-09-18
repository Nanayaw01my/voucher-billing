import { useState } from 'react';
import { api } from '../api/endpoints';
import { useAsync, useSubmit } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { PageHeader, Panel, TableWrap, Loading, Empty, ErrorNotice, StatusChip, Modal, Field } from '../components/ui';
import type { LocationRecord } from '../api/types';

const BLANK = { name: '', description: '', address: '', status: 'ACTIVE' };

export function LocationsPage() {
  const { can } = useAuth();
  const locations = useAsync(() => api.locations.list(), []);
  const [editing, setEditing] = useState<LocationRecord | null>(null);
  const [form, setForm] = useState(BLANK);
  const [open, setOpen] = useState(false);

  const save = useSubmit(async () => {
    const body = { ...form, description: form.description || undefined, address: form.address || undefined };
    if (editing) await api.locations.update(editing._id, body);
    else await api.locations.create(body);
    setOpen(false); setEditing(null); setForm(BLANK); locations.reload();
  });

  return (
    <>
      <PageHeader
        title="Locations"
        description="A location groups the routers, access points, sellers and vouchers at one site."
        actions={can('SUPER_ADMIN', 'ADMIN') && (
          <button className="btn-primary" onClick={() => { setEditing(null); setForm(BLANK); setOpen(true); }}>Add location</button>
        )}
      />
      <ErrorNotice message={locations.error} />

      <Panel>
        {locations.loading && !locations.data ? <Loading /> : !locations.data?.data.length ? (
          <Empty>No locations yet.</Empty>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr><th className="th">Name</th><th className="th">Address</th><th className="th">Description</th><th className="th">Status</th><th className="th"></th></tr>
              </thead>
              <tbody>
                {locations.data.data.map((location) => (
                  <tr key={location._id} className="hover:bg-wash">
                    <td className="td font-medium">{location.name}</td>
                    <td className="td text-muted">{location.address ?? '—'}</td>
                    <td className="td whitespace-normal text-muted">{location.description ?? '—'}</td>
                    <td className="td"><StatusChip status={location.status} /></td>
                    <td className="td">
                      {can('SUPER_ADMIN', 'ADMIN') && (
                        <button className="btn-quiet px-2 py-1 text-xs"
                          onClick={() => { setEditing(location); setForm({ name: location.name, description: location.description ?? '', address: location.address ?? '', status: location.status }); setOpen(true); }}>
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
        <Modal title={editing ? `Edit ${editing.name}` : 'Add a location'} onClose={() => setOpen(false)}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save.run(); }}>
            <ErrorNotice message={save.error} />
            <Field label="Name"><input className="field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Address"><input className="field" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label="Description"><input className="field" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <Field label="Status">
              <select className="field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
              </select>
            </Field>
            <div className="flex gap-2">
              <button className="btn-primary" disabled={save.busy}>{save.busy ? 'Saving…' : 'Save location'}</button>
              <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
