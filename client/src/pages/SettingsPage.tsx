import { useEffect, useState } from 'react';
import { api } from '../api/endpoints';
import { useAuth } from '../hooks/useAuth';
import { useAsync, useSubmit } from '../hooks/useApi';
import { DEFAULT_HOTSPOT_NAME } from '../lib/brand';
import { PageHeader, Panel, Field, ErrorNotice, Notice, Loading, TableWrap, Empty } from '../components/ui';

export function SettingsPage() {
  const { user, can } = useAuth();
  const [hotspotName, setHotspotName] = useState(() => localStorage.getItem('voucher.hotspotName') ?? DEFAULT_HOTSPOT_NAME);
  const [password, setPassword] = useState('');
  const [saved, setSaved] = useState(false);

  const routers = useAsync(() => (can('SUPER_ADMIN', 'ADMIN') ? api.routers.list() : Promise.resolve({ data: [] })), []);
  const [profileRouter, setProfileRouter] = useState('');
  const profiles = useAsync(
    () => (profileRouter ? api.routers.profiles(profileRouter) : Promise.resolve({ data: [] })),
    [profileRouter],
  );

  useEffect(() => { localStorage.setItem('voucher.hotspotName', hotspotName); }, [hotspotName]);

  const changePassword = useSubmit(async () => {
    if (!user) return;
    await api.sellers.update(user.id, { password });
    setPassword('');
    setSaved(true);
  });

  return (
    <>
      <PageHeader title="Settings" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Your account">
          <div className="space-y-4 p-4">
            {saved && <Notice kind="warn">Password updated.</Notice>}
            <ErrorNotice message={changePassword.error} />
            <div className="text-sm">
              <div className="font-medium">{user?.name}</div>
              <div className="text-muted">{user?.username} · {user?.role.replace(/_/g, ' ').toLowerCase()}</div>
            </div>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void changePassword.run(); }}>
              <Field label="New password" hint="At least 8 characters.">
                <input className="field" type="password" minLength={8} autoComplete="new-password"
                  value={password} onChange={(e) => { setPassword(e.target.value); setSaved(false); }} />
              </Field>
              <button className="btn-primary" disabled={changePassword.busy || password.length < 8}>
                {changePassword.busy ? 'Saving…' : 'Change password'}
              </button>
            </form>
          </div>
        </Panel>

        <Panel title="Printing">
          <div className="space-y-4 p-4">
            <Field label="Hotspot name on voucher cards" hint="Stored in this browser only.">
              <input className="field" value={hotspotName} onChange={(e) => setHotspotName(e.target.value.toUpperCase())} />
            </Field>
            <Notice>
              The interface is intentionally a single white-and-black theme, so voucher cards print cleanly on any printer.
            </Notice>
          </div>
        </Panel>

        {can('SUPER_ADMIN', 'ADMIN') && (
          <Panel title="MikroTik profiles">
            <div className="space-y-3 p-4">
              <Field label="Read profiles from" hint="Lists /ip hotspot user profile on the selected router.">
                <select className="field" value={profileRouter} onChange={(e) => setProfileRouter(e.target.value)}>
                  <option value="">Choose a router</option>
                  {routers.data?.data.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
                </select>
              </Field>
              <ErrorNotice message={profiles.error} />
              {profileRouter && (profiles.loading ? <Loading /> : !profiles.data?.data.length ? (
                <Empty>No profiles returned.</Empty>
              ) : (
                <TableWrap>
                  <table className="w-full">
                    <thead>
                      <tr><th className="th">Profile</th><th className="th">Rate limit</th><th className="th">Accounting</th></tr>
                    </thead>
                    <tbody>
                      {profiles.data.data.map((profile) => (
                        <tr key={profile.name}>
                          <td className="td font-mono">{profile.name}</td>
                          <td className="td text-muted">{profile.rateLimit ?? '—'}</td>
                          <td className="td text-muted">
                            {profile.accountingEnabled ? 'On' : 'Off — usage cannot be reported for this profile'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              ))}
            </div>
          </Panel>
        )}

        <Panel title="How this system relates to MikroTik">
          <div className="space-y-2 p-4 text-sm leading-relaxed text-muted">
            <p>MikroTik authenticates hotspot customers, enforces bandwidth and holds the live session state.</p>
            <p>This application manages voucher stock, sales, sellers, packages and reporting, and synchronises with each router.</p>
            <p>If this dashboard is unavailable, customers keep signing in against MikroTik exactly as before.</p>
          </div>
        </Panel>
      </div>
    </>
  );
}
