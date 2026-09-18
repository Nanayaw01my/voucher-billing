import { useMemo, useState } from 'react';
import { api } from '../api/endpoints';
import { useAsync, useSubmit } from '../hooks/useApi';
import { PageHeader, Panel, TableWrap, Pager, Loading, Empty, ErrorNotice, Modal, Field } from '../components/ui';
import { formatDateTime, formatMoney, nameOf } from '../lib/format';

export function SalesPage() {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [voucherSearch, setVoucherSearch] = useState('');
  const [selectedVoucher, setSelectedVoucher] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [customerPhone, setCustomerPhone] = useState('');

  const query = useMemo(() => ({ page, limit: 25 }), [page]);
  const sales = useAsync(() => api.sales.list(query), [query]);

  // Only unsold, available stock can be handed to a customer.
  const available = useAsync(
    () => api.vouchers.list({ status: 'AVAILABLE', limit: 20, search: voucherSearch || undefined }),
    [voucherSearch],
  );

  const sell = useSubmit(async () => {
    await api.sales.create({
      voucherId: selectedVoucher,
      paymentMethod,
      customerPhone: customerPhone || undefined,
    });
    setOpen(false);
    setSelectedVoucher('');
    setCustomerPhone('');
    sales.reload();
    available.reload();
  });

  return (
    <>
      <PageHeader
        title="Sales"
        actions={
          <>
            <button className="btn-quiet" onClick={() => void api.sales.exportCsv()}>Export CSV</button>
            <button className="btn-primary" onClick={() => setOpen(true)}>Record a sale</button>
          </>
        }
      />
      <ErrorNotice message={sales.error} />

      <Panel>
        {sales.loading && !sales.data ? <Loading /> : !sales.data?.data.length ? (
          <Empty>No sales recorded yet.</Empty>
        ) : (
          <>
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Sold</th><th className="th">Voucher</th><th className="th">Package</th>
                    <th className="th">Seller</th><th className="th">Location</th><th className="th">Method</th><th className="th">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.data.data.map((sale) => (
                    <tr key={sale._id} className="hover:bg-wash">
                      <td className="td text-muted">{formatDateTime(sale.soldAt)}</td>
                      <td className="td font-mono">
                        {typeof sale.voucherId === 'object' ? sale.voucherId?.code : '—'}
                      </td>
                      <td className="td">{nameOf(sale.packageId)}</td>
                      <td className="td">{nameOf(sale.sellerId)}</td>
                      <td className="td text-muted">{nameOf(sale.locationId)}</td>
                      <td className="td text-muted">{sale.paymentMethod.replace(/_/g, ' ').toLowerCase()}</td>
                      <td className="td tabular-nums font-medium">{formatMoney(sale.price, sale.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <Pager page={sales.data.pagination.page} pages={sales.data.pagination.pages} total={sales.data.pagination.total} onChange={setPage} />
          </>
        )}
      </Panel>

      {open && (
        <Modal title="Record a sale" onClose={() => setOpen(false)}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void sell.run(); }}>
            <ErrorNotice message={sell.error} />
            <Field label="Find a voucher" hint="Only available, unsold vouchers are listed.">
              <input className="field" placeholder="Type part of a code" value={voucherSearch} onChange={(e) => setVoucherSearch(e.target.value)} />
            </Field>
            <Field label="Voucher">
              <select className="field font-mono" required value={selectedVoucher} onChange={(e) => setSelectedVoucher(e.target.value)}>
                <option value="">Choose a voucher</option>
                {available.data?.data.map((voucher) => (
                  <option key={voucher._id} value={voucher._id}>
                    {voucher.code} — {nameOf(voucher.packageId, 'no package')}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Payment method">
              <select className="field" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="CASH">Cash</option>
                <option value="MOBILE_MONEY">Mobile money</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>
            <Field label="Customer phone" hint="Optional.">
              <input className="field" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <button className="btn-primary" disabled={sell.busy || !selectedVoucher}>{sell.busy ? 'Saving…' : 'Record sale'}</button>
              <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
