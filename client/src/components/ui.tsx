import type { ReactNode } from 'react';

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-hairline pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 no-print">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Panel({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wide">{title}</h2>}
          {actions && <div className="flex gap-2 no-print">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn'; children: ReactNode }) {
  return (
    <div className={`border px-3 py-2 text-sm ${kind === 'warn' ? 'border-ink bg-wash font-medium' : 'border-hairline text-muted'}`}>
      {children}
    </div>
  );
}

export function ErrorNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-4 border-2 border-ink bg-wash px-3 py-2 text-sm font-medium">
      {message}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-muted">{children}</div>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="px-4 py-10 text-center text-sm text-muted">{label}</div>;
}

/** Horizontally scrollable on phones rather than squeezing columns. */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

export function StatusChip({ status }: { status: string }) {
  // Status is carried by border weight and case, never by colour.
  const strong = status === 'ACTIVE' || status === 'ONLINE' || status === 'AVAILABLE';
  return <span className={strong ? 'chip' : 'chip-quiet'}>{status.replace(/_/g, ' ')}</span>;
}

export function Pager({
  page, pages, total, onChange,
}: { page: number; pages: number; total: number; onChange: (page: number) => void }) {
  return (
    <div className="flex flex-col gap-2 border-t border-hairline px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between no-print">
      <span className="text-muted tabular-nums">
        Page {page} of {pages} · {total.toLocaleString()} record{total === 1 ? '' : 's'}
      </span>
      <div className="flex gap-2">
        <button className="btn-quiet" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
        <button className="btn-quiet" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto border border-ink bg-paper">
        <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide">{title}</h2>
          <button className="btn-quiet px-2 py-1" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
