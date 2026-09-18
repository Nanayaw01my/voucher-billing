import { useState } from 'react';
import { Modal, Field, Notice, ErrorNotice } from './ui';

interface Props {
  title: string;
  /** What is about to be destroyed, in the operator's own terms. */
  summary: string;
  count: number;
  /** Typing this exactly is required before the action unlocks. */
  confirmWord: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (alsoRemoveFromRouter: boolean) => void;
}

/**
 * Deleting vouchers cannot be undone, so it asks for the batch reference (or
 * DELETE) to be typed rather than relying on a single click.
 */
export function ConfirmDelete({ title, summary, count, confirmWord, busy, error, onCancel, onConfirm }: Props) {
  const [typed, setTyped] = useState('');
  const [alsoRemoveFromRouter, setAlsoRemoveFromRouter] = useState(false);
  const matches = typed.trim().toUpperCase() === confirmWord.toUpperCase();

  return (
    <Modal title={title} onClose={onCancel}>
      <div className="space-y-4">
        <ErrorNotice message={error} />
        <p className="text-sm">{summary}</p>

        <div className="notice-error">
          This permanently removes {count.toLocaleString()} voucher record
          {count === 1 ? '' : 's'} from this system. It cannot be undone.
          Vouchers that have already been sold are kept, not deleted.
        </div>

        <label className="flex items-start gap-2 border border-hairline p-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 accent-[#1b5fb0]"
            checked={alsoRemoveFromRouter}
            onChange={(e) => setAlsoRemoveFromRouter(e.target.checked)}
          />
          <span>
            Also delete these hotspot users from the MikroTik
            <span className="mt-1 block text-xs text-muted">
              Leave this off to clear the records here only. Imported vouchers already exist on the
              router — ticking this deletes the real hotspot users, which disconnects anyone using them.
            </span>
          </span>
        </label>

        {alsoRemoveFromRouter && (
          <Notice kind="warn">
            The router will be changed as well. If it cannot be reached, the records here are still
            cleared and the failures are listed.
          </Notice>
        )}

        <Field label={`Type ${confirmWord} to confirm`}>
          <input
            className="field font-mono"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmWord}
            autoFocus
          />
        </Field>

        <div className="flex gap-2">
          <button
            className="btn border-danger bg-danger text-paper hover:bg-danger/90 disabled:opacity-40"
            disabled={!matches || busy}
            onClick={() => onConfirm(alsoRemoveFromRouter)}
          >
            {busy ? 'Deleting…' : `Delete ${count.toLocaleString()} voucher${count === 1 ? '' : 's'}`}
          </button>
          <button type="button" className="btn-quiet" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}
