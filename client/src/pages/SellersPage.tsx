import { useState } from 'react';
import { api } from '../api/endpoints';
import { useAsync, useSubmit } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { PageHeader, Panel, TableWrap, Loading, Empty, ErrorNotice, StatusChip, Modal, Field } from '../components/ui';
import { formatDateTime, nameOf } from '../lib/format';
import type { Seller } from '../api/types';

const BLANK = { name: '', username: '', phone: '', password: '', role: 'SELLER', locationId: '', status: 'ACTIVE' };

export function SellersPage() {
  const { can } = useAuth();
  const sellers = useAsync(() => api.sellers.list(), []);
  const locations = useAsync(() => api.locations.list(), []);
  const [editing, setEditing] = useState<Seller | null>(null);
  const [form, setForm] = useState(BLANK);
  const [open, setOpen] = useState(false);

  const save = useSubmit(async () => {
    const body: Record<string, unknown> = {
      name: form.name,
      phone: form.phone || undefined,
      role: form.role,
      locationId: form.locationId || undefined,
      status: form.status,
    };
    if (form.password) body.password = form.password;

    if (editing) await api.sellers.update(editing._id, body);
    else await api.sellers.create({ ...body, username: form.username, password: form.password });

    setOpen(false);
    setEditing(null);
    setForm(BLANK);
    sellers.reload();
  });

  const startEdit = (seller: Seller) => {
    setEditing(seller);
    setForm({
      name: seller.name, username: seller.username, phone: seller.phone ?? '', password: '',
      role: seller.role, locationId: typeof seller.locationId === 'object' ? seller.locationId?._id ?? '' : seller.locationId ?? '',
      status: seller.status,
    });
    setOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Sellers and administrators"
        description="A seller can sell vouchers and see their own sales. Only a super administrator can create admin accounts."
        actions={<button className="btn-primary" onClick={() => { setEditing(null); setForm(BLANK); setOpen(true); }}>New user</button>}
      />
      <ErrorNotice message={sellers.error} />

      <Panel>
        {sellers.loading && !sellers.data ? <Loading /> : !sellers.data?.data.length ? (
          <Empty>No users yet.</Empty>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Name</th><th className="th">Username</th><th className="th">Role</th>
                  <th className="th">Phone</th><th className="th">Location</th><th className="th">Status</th>
                  <th className="th">Last sign-in</th><th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {sellers.data.data.map((seller) => (
                  <tr key={seller._id} className="hover:bg-wash">
                    <td className="td font-medium">{seller.name}</td>
                    <td className="td font-mono text-xs">{seller.username}</td>
                    <td className="td">{seller.role.replace(/_/g, ' ').toLowerCase()}</td>
                    <td className="td text-muted">{seller.phone ?? '—'}</td>
                    <td className="td text-muted">{nameOf(seller.locationId)}</td>
                    <td className="td"><StatusChip status={seller.status} /></td>
                    <td className="td text-muted">{formatDateTime(seller.lastLoginAt)}</td>
                    <td className="td"><button className="btn-quiet px-2 py-1 text-xs" onClick={() => startEdit(seller)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Panel>

      {open && (
        <Modal title={editing ? `Edit ${editing.name}` : 'New user'} onClose={() => setOpen(false)}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save.run(); }}>
            <ErrorNotice message={save.error} />
            <Field label="Full name"><input className="field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            {!editing && (
              <Field label="Username" hint="Letters, digits, dot, dash and underscore.">
                <input className="field font-mono" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </Field>
            )}
            <Field label={editing ? 'New password' : 'Password'} hint={editing ? 'Leave blank to keep the current one.' : 'At least 8 characters.'}>
              <input className="field" type="password" autoComplete="new-password" required={!editing}
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label="Phone"><input className="field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Role">
                <select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="SELLER">Seller</option>
                  {can('SUPER_ADMIN') && <option value="ADMIN">Admin</option>}
                  {can('SUPER_ADMIN') && <option value="SUPER_ADMIN">Super admin</option>}
                </select>
              </Field>
              <Field label="Status">
                <select className="field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="ACTIVE">Active</option><option value="INACTIVE">Disabled</option>
                </select>
              </Field>
            </div>
            <Field label="Location">
              <select className="field" value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                <option value="">Not assigned</option>
                {locations.data?.data.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
              </select>
            </Field>
            <div className="flex gap-2">
              <button className="btn-primary" disabled={save.busy}>{save.busy ? 'Saving…' : 'Save user'}</button>
              <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
