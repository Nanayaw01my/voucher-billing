import { useState } from 'react';
import { api } from '../api/endpoints';
import { useSubmit } from '../hooks/useApi';
import { Panel, Field, Notice, ErrorNotice } from './ui';

interface ScopeOption {
  id: string;
  label: string;
  detail: string;
}

const SCOPES: ScopeOption[] = [
  {
    id: 'vouchers',
    label: 'Vouchers and everything derived from them',
    detail:
      'Every voucher, session record, sale and import batch. These reference each other, so they clear together — keeping sales while deleting vouchers would leave sales pointing at nothing.',
  },
  {
    id: 'configuration',
    label: 'Configuration',
    detail: 'Packages, locations, routers and access points. You would set these up again from scratch, including re-entering your MikroTik credentials.',
  },
  {
    id: 'auditLogs',
    label: 'Audit log',
    detail: 'The record of who did what. The reset itself is still recorded afterwards.',
  },
];

/** Clearing data is irreversible, so the control states plainly what survives. */
export function DangerZone({ onDone }: { onDone: () => void }) {
  const [scopes, setScopes] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const reset = useSubmit(async () => {
    const response = await api.system.reset(scopes);
    const summary = Object.entries(response.deleted)
      .filter(([, count]) => count > 0)
      .map(([name, count]) => `${count.toLocaleString()} ${name}`)
      .join(', ');
    setResult(summary ? `Cleared ${summary}. ${response.note}` : `Nothing needed clearing. ${response.note}`);
    setScopes([]);
    setTyped('');
    onDone();
    return response;
  });

  const toggle = (id: string) =>
    setScopes((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const ready = scopes.length > 0 && typed.trim().toUpperCase() === 'RESET';

  return (
    <Panel title="Clear data">
      <div className="space-y-4 p-4">
        <ErrorNotice message={reset.error} />
        {result && <Notice kind="warn">{result}</Notice>}

        <p className="text-sm text-muted">
          Choose what to remove. This cannot be undone, so export anything you still need first.
        </p>

        <div className="space-y-2">
          {SCOPES.map((scope) => (
            <label key={scope.id} className="flex items-start gap-2 border border-hairline p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 accent-[#1b5fb0]"
                checked={scopes.includes(scope.id)}
                onChange={() => toggle(scope.id)}
              />
              <span>
                {scope.label}
                <span className="mt-1 block text-xs text-muted">{scope.detail}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="notice-error">
          <strong>Two things are never removed.</strong> User accounts stay, so you cannot lock
          yourself out. And nothing is deleted from the MikroTik — your vouchers exist there as real
          hotspot users, and customers using them stay connected. This clears records in this system
          only.
        </div>

        {scopes.length > 0 && (
          <Field label="Type RESET to confirm">
            <input
              className="field font-mono"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="RESET"
            />
          </Field>
        )}

        <button
          className="btn border-danger bg-danger text-paper hover:bg-danger/90 disabled:opacity-40"
          disabled={!ready || reset.busy}
          onClick={() => void reset.run()}
        >
          {reset.busy ? 'Clearing…' : `Clear ${scopes.length || 'nothing'} selected`}
        </button>
      </div>
    </Panel>
  );
}
