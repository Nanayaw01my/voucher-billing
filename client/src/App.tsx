import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { VouchersPage } from './pages/VouchersPage';
import { VoucherDetailPage } from './pages/VoucherDetailPage';
import { GenerateVouchersPage } from './pages/GenerateVouchersPage';
import { ImportVouchersPage } from './pages/ImportVouchersPage';
import { ActiveUsersPage } from './pages/ActiveUsersPage';
import { PackagesPage } from './pages/PackagesPage';
import { SalesPage } from './pages/SalesPage';
import { SellersPage } from './pages/SellersPage';
import { RoutersPage } from './pages/RoutersPage';
import { AccessPointsPage } from './pages/AccessPointsPage';
import { LocationsPage } from './pages/LocationsPage';
import { ReportsPage } from './pages/ReportsPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { SettingsPage } from './pages/SettingsPage';
import { PrintVouchersPage } from './pages/PrintVouchersPage';

export function App() {
  const { user, ready } = useAuth();

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center bg-paper text-sm text-muted">Loading…</div>;
  }
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      {/* Printing gets its own bare route so a card sheet has no chrome on it. */}
      <Route path="/vouchers/print" element={<PrintVouchersPage />} />
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="/vouchers" element={<VouchersPage />} />
        <Route path="/vouchers/generate" element={<GenerateVouchersPage />} />
        <Route path="/vouchers/import" element={<ImportVouchersPage />} />
        <Route path="/vouchers/:id" element={<VoucherDetailPage />} />
        <Route path="/active-users" element={<ActiveUsersPage />} />
        <Route path="/packages" element={<PackagesPage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/sellers" element={<SellersPage />} />
        <Route path="/routers" element={<RoutersPage />} />
        <Route path="/access-points" element={<AccessPointsPage />} />
        <Route path="/locations" element={<LocationsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/audit-logs" element={<AuditLogsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
