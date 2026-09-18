import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/endpoints';
import { useAsync } from '../hooks/useApi';
import { Loading, ErrorNotice } from '../components/ui';
import { formatMoney } from '../lib/format';

/**
 * A bare print sheet: black on white cards, four to a row, no app chrome.
 * The hotspot name is editable before printing so one deployment can serve
 * several site brandings.
 */
export function PrintVouchersPage() {
  const [params] = useSearchParams();
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean);
  const [hotspotName, setHotspotName] = useState(() => localStorage.getItem('voucher.hotspotName') ?? 'HOTSPOT');

  const { data, loading, error } = useAsync(() => api.vouchers.print(ids), [params.get('ids')]);

  useEffect(() => { localStorage.setItem('voucher.hotspotName', hotspotName); }, [hotspotName]);

  if (loading) return <Loading label="Preparing cards…" />;
  if (error) return <div className="p-6"><ErrorNotice message={error} /></div>;

  return (
    <div className="min-h-screen bg-paper p-4 text-ink sm:p-6">
      <div className="no-print mb-6 flex flex-wrap items-end gap-3 border-b border-hairline pb-4">
        <label className="block">
          <span className="label">Hotspot name on the cards</span>
          <input className="field w-64" value={hotspotName} onChange={(e) => setHotspotName(e.target.value.toUpperCase())} />
        </label>
        <button className="btn-primary" onClick={() => window.print()}>Print {data?.cards.length ?? 0} card(s)</button>
        <button className="btn-quiet" onClick={() => window.close()}>Close</button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {data?.cards.map((card) => (
          <article key={card.code} className="print-card break-inside-avoid border-2 border-ink p-3">
            <div className="text-center text-[10px] font-bold uppercase tracking-widest">{hotspotName}</div>
            <div className="my-3 border-y border-hairline py-3 text-center">
              <div className="text-[9px] uppercase tracking-widest text-muted">Voucher</div>
              <div className="font-mono text-lg font-bold tracking-wider">{card.code}</div>
              {card.password !== card.code && (
                <div className="mt-1 font-mono text-[11px]">pw: {card.password}</div>
              )}
            </div>
            <div className="flex items-baseline justify-between text-[10px] font-semibold uppercase">
              <span>{card.packageName}</span>
              <span>{card.price === null ? '' : formatMoney(card.price, card.currency)}</span>
            </div>
            <ol className="mt-3 space-y-0.5 text-[9px] leading-snug text-muted">
              <li>1. Connect to the Wi-Fi</li>
              <li>2. Open your browser</li>
              <li>3. Enter the voucher code</li>
            </ol>
          </article>
        ))}
      </div>
    </div>
  );
}
