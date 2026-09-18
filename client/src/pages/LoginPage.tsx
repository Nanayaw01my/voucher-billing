import { useState, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useSubmit } from '../hooks/useApi';
import { ErrorNotice, Field } from '../components/ui';

export function LoginPage() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { run, busy, error } = useSubmit(signIn);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void run(username, password);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-lg font-semibold uppercase tracking-widest text-brand">Hotspot Vouchers</h1>
          <p className="mt-2 text-xs text-muted">Starlink → MikroTik → Access points</p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-5">
          <ErrorNotice message={error} />
          <Field label="Username">
            <input
              className="field" value={username} autoComplete="username" autoFocus
              onChange={(e) => setUsername(e.target.value)} required
            />
          </Field>
          <Field label="Password">
            <input
              className="field" type="password" value={password} autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)} required
            />
          </Field>
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted">
          Hotspot customers authenticate against MikroTik directly.
          This dashboard being offline does not interrupt their access.
        </p>
      </div>
    </div>
  );
}
