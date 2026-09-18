import { useState, type FormEvent } from 'react';
import { api } from '../api/endpoints';
import { useAsync, useSubmit } from '../hooks/useApi';
import { PageHeader, Panel, Field, ErrorNotice, Notice } from '../components/ui';

export function GenerateVouchersPage() {
  const packages = useAsync(() => api.packages.list(), []);
  const routers = useAsync(() => api.routers.list(), []);
  const locations = useAsync(() => api.locations.list(), []);

  const [form, setForm] = useState({
    packageId: '', quantity: 100, codeLength: 8, charset: 'UNAMBIGUOUS',
    prefix: '', passwordMode: 'SAME', routerId: '', locationId: '', pushToRouter: false,
  });
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.vouchers.generate>> | null>(null);

  const generate = useSubmit(async () => {
    const response = await api.vouchers.generate({
      packageId: form.packageId,
      quantity: Number(form.quantity),
      codeLength: Number(form.codeLength),
      charset: form.charset,
      prefix: form.prefix || undefined,
      passwordMode: form.passwordMode,
      routerId: form.routerId || undefined,
      locationId: form.locationId || undefined,
      pushToRouter: form.pushToRouter,
    });
    setResult(response);
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setResult(null);
    void generate.run();
  };

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <>
      <PageHeader
        title="Generate vouchers"
        description="Codes are checked for uniqueness before insertion; the database unique index is the final guarantee."
      />
      <ErrorNotice message={generate.error} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Settings">
          <form onSubmit={onSubmit} className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Package">
                <select className="field" required value={form.packageId} onChange={(e) => set('packageId', e.target.value)}>
                  <option value="">Choose a package</option>
                  {packages.data?.data.filter((p) => p.status === 'ACTIVE').map((p) => (
                    <option key={p._id} value={p._id}>{p.name} — {p.mikrotikProfile}</option>
                  ))}
                </select>
              </Field>
              <Field label="Quantity" hint="Up to 10,000 per batch.">
                <input className="field" type="number" min={1} max={10000} required
                  value={form.quantity} onChange={(e) => set('quantity', Number(e.target.value))} />
              </Field>
              <Field label="Code length">
                <input className="field" type="number" min={4} max={20} required
                  value={form.codeLength} onChange={(e) => set('codeLength', Number(e.target.value))} />
              </Field>
              <Field label="Code format">
                <select className="field" value={form.charset} onChange={(e) => set('charset', e.target.value)}>
                  <option value="UNAMBIGUOUS">Uppercase, no 0/O/1/I/L</option>
                  <option value="ALPHANUMERIC">Uppercase letters and digits</option>
                  <option value="NUMERIC">Digits only</option>
                </select>
              </Field>
              <Field label="Prefix" hint="Optional, letters and digits only.">
                <input className="field" maxLength={8} value={form.prefix} onChange={(e) => set('prefix', e.target.value.toUpperCase())} />
              </Field>
              <Field label="Password">
                <select className="field" value={form.passwordMode} onChange={(e) => set('passwordMode', e.target.value)}>
                  <option value="SAME">Same as the voucher code</option>
                  <option value="RANDOM">A separate random password</option>
                </select>
              </Field>
              <Field label="Router" hint="Required if you want these pushed to MikroTik.">
                <select className="field" value={form.routerId} onChange={(e) => set('routerId', e.target.value)}>
                  <option value="">Not assigned</option>
                  {routers.data?.data.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
                </select>
              </Field>
              <Field label="Location">
                <select className="field" value={form.locationId} onChange={(e) => set('locationId', e.target.value)}>
                  <option value="">Not assigned</option>
                  {locations.data?.data.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
                </select>
              </Field>
            </div>

            <label className="flex items-start gap-2 border border-hairline p-3 text-sm">
              <input type="checkbox" className="mt-0.5 accent-black" checked={form.pushToRouter}
                onChange={(e) => set('pushToRouter', e.target.checked)} />
              <span>
                Create these as hotspot users on the selected MikroTik straight away.
                <span className="mt-1 block text-xs text-muted">
                  If the router is unreachable the vouchers are still saved here and can be pushed later from the Routers page.
                </span>
              </span>
            </label>

            <button className="btn-primary w-full sm:w-auto" disabled={generate.busy}>
              {generate.busy ? 'Generating…' : `Generate ${form.quantity} voucher${Number(form.quantity) === 1 ? '' : 's'}`}
            </button>
          </form>
        </Panel>

        <Panel title="Result">
          {!result ? (
            <div className="p-4 text-sm text-muted">Generated codes will be listed here.</div>
          ) : (
            <div className="space-y-3 p-4">
              <Notice kind="warn">{result.generated.toLocaleString()} voucher(s) created.</Notice>
              {result.push && (
                <Notice kind={result.push.failed.length ? 'warn' : 'info'}>
                  Pushed {result.push.pushed} to MikroTik
                  {result.push.failed.length > 0 && `; ${result.push.failed.length} failed: ${result.push.failed[0]?.reason}`}
                </Notice>
              )}
              <div className="max-h-80 overflow-y-auto border border-hairline p-2 font-mono text-xs leading-6">
                {result.codes.map((code) => <div key={code}>{code}</div>)}
                {result.generated > result.codes.length && (
                  <div className="pt-2 text-muted">…and {(result.generated - result.codes.length).toLocaleString()} more. See the Vouchers page.</div>
                )}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
