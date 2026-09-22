import { useState } from 'react';
import { api } from '../api/endpoints';
import { useAsync, useSubmit } from '../hooks/useApi';
import { PageHeader, Panel, TableWrap, Loading, Empty, ErrorNotice, StatusChip, Modal, Field, Notice } from '../components/ui';
import { formatDateTime, nameOf } from '../lib/format';
import type { RouterDevice } from '../api/types';

const BLANK = { name: '', host: '', port: '8728', useTls: false, username: '', password: '', locationId: '', status: 'ACTIVE' };

export function RoutersPage() {
  const routers = useAsync(() => api.routers.list(), []);
  const locations = useAsync(() => api.locations.list(), []);
  const [editing, setEditing] = useState<RouterDevice | null>(null);
  const [form, setForm] = useState(BLANK);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = useSubmit(async () => {
    const body: Record<string, unknown> = {
      name: form.name, host: form.host, port: Number(form.port), useTls: form.useTls,
      username: form.username, locationId: form.locationId || undefined, status: form.status,
    };
    if (form.password) body.password = form.password;
    if (editing) await api.routers.update(editing._id, body);
    else await api.routers.create({ ...body, password: form.password });
    setOpen(false); setEditing(null); setForm(BLANK); routers.reload();
  });

  const test = useSubmit(async (id: string) => {
    const result = await api.routers.test(id);
    setMessage(result.ok
      ? `Connected: ${result.identity} running RouterOS ${result.version}.`
      : `Could not connect: ${result.error}`);
    routers.reload();
  });

  const sync = useSubmit(async (id: string) => {
    const result = await api.routers.sync(id);
    setMessage(`Sync finished: ${result.opened} session(s) opened, ${result.closed} closed, ${result.updated} voucher(s) updated.`);
    routers.reload();
  });

  const adopt = useSubmit(async (id: string) => {
    const result = await api.routers.adopt(id);
    setMessage(
      `Found ${result.found.toLocaleString()} hotspot user(s) on the router: ` +
        `${result.adopted.toLocaleString()} added here, ${result.alreadyKnown.toLocaleString()} already known` +
        (result.skipped.length ? `, ${result.skipped.length} skipped (first: ${result.skipped[0]?.reason})` : '') + '.',
    );
    routers.reload();
  });

  const push = useSubmit(async (id: string) => {
    const result = await api.routers.push(id);
    setMessage(result.failed.length
      ? `Pushed ${result.pushed}; ${result.failed.length} failed (first: ${result.failed[0]?.reason}).`
      : `Pushed ${result.pushed} voucher(s) to the router.`);
    routers.reload();
  });

  const startEdit = (router: RouterDevice) => {
    setEditing(router);
    setForm({
      name: router.name, host: router.host, port: String(router.port), useTls: router.useTls,
      username: router.username, password: '',
      locationId: typeof router.locationId === 'object' ? router.locationId?._id ?? '' : router.locationId ?? '',
      status: router.status,
    });
    setOpen(true);
  };

  return (
    <>
      <PageHeader
        title="MikroTik routers"
        description="Credentials are encrypted at rest and never leave the backend. Add a router per location as the network grows."
        actions={<button className="btn-primary" onClick={() => { setEditing(null); setForm(BLANK); setOpen(true); }}>Add router</button>}
      />
      <ErrorNotice message={routers.error ?? test.error ?? sync.error ?? push.error ?? adopt.error} />
      {message && <div className="mb-4"><Notice kind="warn">{message}</Notice></div>}

      <Panel>
        {routers.loading && !routers.data ? <Loading /> : !routers.data?.data.length ? (
          <Empty>No routers added yet. Add your MikroTik to start syncing.</Empty>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Name</th><th className="th">Host</th><th className="th">Identity</th>
                  <th className="th">RouterOS</th><th className="th">Connection</th><th className="th">Location</th>
                  <th className="th">Last synced</th><th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {routers.data.data.map((router) => (
                  <tr key={router._id} className="hover:bg-wash">
                    <td className="td font-medium">{router.name}</td>
                    <td className="td font-mono text-xs">{router.host}:{router.port}{router.useTls ? ' (TLS)' : ''}</td>
                    <td className="td text-muted">{router.identity ?? '—'}</td>
                    <td className="td text-muted">{router.routerOsVersion ?? '—'}</td>
                    <td className="td">
                      <StatusChip status={router.connectionStatus} />
                      {router.lastError && <div className="mt-1 max-w-[16rem] whitespace-normal text-xs text-muted">{router.lastError}</div>}
                    </td>
                    <td className="td text-muted">{nameOf(router.locationId)}</td>
                    <td className="td text-muted">{formatDateTime(router.lastSyncedAt)}</td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1">
                        <button className="btn-quiet px-2 py-1 text-xs" disabled={test.busy} onClick={() => void test.run(router._id)}>Test</button>
                        <button className="btn-quiet px-2 py-1 text-xs" disabled={sync.busy} onClick={() => void sync.run(router._id)}>Sync</button>
                        <button className="btn-quiet px-2 py-1 text-xs" disabled={push.busy} onClick={() => void push.run(router._id)}>Push</button>
                        <button className="btn-quiet px-2 py-1 text-xs" disabled={adopt.busy} onClick={() => void adopt.run(router._id)}>Pull vouchers</button>
                        <button className="btn-quiet px-2 py-1 text-xs" onClick={() => startEdit(router)}>Edit</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Panel>

      {open && (
        <Modal title={editing ? `Edit ${editing.name}` : 'Add a router'} onClose={() => setOpen(false)}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save.run(); }}>
            <ErrorNotice message={save.error} />
            <Field label="Name"><input className="field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <Field label="Host or IP"><input className="field font-mono" required value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} /></Field>
              <Field label="API port" hint="8728, or 8729 for TLS.">
                <input className="field" type="number" required value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-black" checked={form.useTls} onChange={(e) => setForm({ ...form, useTls: e.target.checked, port: e.target.checked ? '8729' : '8728' })} />
              Use api-ssl (TLS)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="API username"><input className="field font-mono" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
              <Field label="API password" hint={editing ? 'Leave blank to keep it.' : undefined}>
                <input className="field" type="password" autoComplete="new-password" required={!editing}
                  value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </Field>
            </div>
            <Field label="Location">
              <select className="field" value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                <option value="">Not assigned</option>
                {locations.data?.data.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
              </select>
            </Field>
            <Notice>
              The router needs its API service enabled (<code className="font-mono">/ip service enable api</code>) and the
              account should be limited to what this system uses: read, write and the hotspot policies.
            </Notice>
            <div className="flex gap-2">
              <button className="btn-primary" disabled={save.busy}>{save.busy ? 'Saving…' : 'Save router'}</button>
              <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
