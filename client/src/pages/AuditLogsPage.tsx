import { useMemo, useState } from 'react';
import { api } from '../api/endpoints';
import { useAsync } from '../hooks/useApi';
import { PageHeader, Panel, TableWrap, Pager, Loading, Empty, ErrorNotice, Field } from '../components/ui';
import { formatDateTime } from '../lib/format';

const ACTIONS = [
  'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'VOUCHER_GENERATED', 'VOUCHER_IMPORTED', 'VOUCHER_DISABLED',
  'VOUCHER_DELETED', 'VOUCHER_PUSHED', 'SALE_CREATED', 'SELLER_CREATED', 'SELLER_DISABLED',
  'PACKAGE_CREATED', 'ROUTER_CREATED', 'ROUTER_TESTED', 'USER_DISCONNECTED',
];

export function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const query = useMemo(() => ({ page, limit: 50, action: action || undefined }), [page, action]);
  const logs = useAsync(() => api.auditLogs(query), [query]);

  return (
    <>
      <PageHeader title="Audit log" description="Every sensitive action, with who did it and when. Credentials are never recorded." />
      <ErrorNotice message={logs.error} />

      <div className="mb-4 max-w-xs">
        <Field label="Action">
          <select className="field" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
            <option value="">All actions</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ').toLowerCase()}</option>)}
          </select>
        </Field>
      </div>

      <Panel>
        {logs.loading && !logs.data ? <Loading /> : !logs.data?.data.length ? (
          <Empty>Nothing recorded for this filter.</Empty>
        ) : (
          <>
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">When</th><th className="th">Who</th><th className="th">Action</th>
                    <th className="th">Entity</th><th className="th">IP</th><th className="th">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.data.data.map((log) => (
                    <tr key={log._id}>
                      <td className="td text-muted">{formatDateTime(log.timestamp)}</td>
                      <td className="td">{log.username ?? '—'}</td>
                      <td className="td font-medium">{log.action.replace(/_/g, ' ').toLowerCase()}</td>
                      <td className="td text-muted">{log.entity}</td>
                      <td className="td font-mono text-xs text-muted">{log.ipAddress ?? '—'}</td>
                      <td className="td max-w-xs truncate font-mono text-xs text-muted">
                        {log.metadata ? JSON.stringify(log.metadata) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <Pager page={logs.data.pagination.page} pages={logs.data.pagination.pages} total={logs.data.pagination.total} onChange={setPage} />
          </>
        )}
      </Panel>
    </>
  );
}
