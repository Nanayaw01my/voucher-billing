import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { Role } from '../api/types';
import { BRAND_NAME, BRAND_LINES } from '../lib/brand';

interface NavItem { to: string; label: string; roles?: Role[] }

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/vouchers', label: 'Vouchers' },
  { to: '/vouchers/generate', label: 'Generate Vouchers', roles: ['SUPER_ADMIN', 'ADMIN'] },
  { to: '/vouchers/import', label: 'Import Vouchers', roles: ['SUPER_ADMIN', 'ADMIN'] },
  { to: '/active-users', label: 'Active Users' },
  { to: '/packages', label: 'Packages' },
  { to: '/sales', label: 'Sales' },
  { to: '/sellers', label: 'Sellers', roles: ['SUPER_ADMIN', 'ADMIN'] },
  { to: '/routers', label: 'Routers', roles: ['SUPER_ADMIN', 'ADMIN'] },
  { to: '/access-points', label: 'Access Points' },
  { to: '/locations', label: 'Locations' },
  { to: '/reports', label: 'Reports', roles: ['SUPER_ADMIN', 'ADMIN'] },
  { to: '/audit-logs', label: 'Audit Logs', roles: ['SUPER_ADMIN', 'ADMIN'] },
  { to: '/settings', label: 'Settings' },
];

export function Layout() {
  const { user, signOut, can } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const visible = NAV.filter((item) => !item.roles || can(...item.roles));

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Phone header: the operator often manages this from a handset. */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-hairline bg-paper px-4 py-3 lg:hidden no-print">
        <button className="btn-quiet px-2 py-1" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Toggle navigation">
          ☰
        </button>
        <span className="text-sm font-semibold uppercase tracking-widest text-brand">{BRAND_NAME}</span>
        <button className="btn-quiet px-2 py-1 text-xs" onClick={() => void signOut()}>Sign out</button>
      </header>

      <div className="flex">
        <aside
          className={`${open ? 'block' : 'hidden'} fixed inset-x-0 top-[57px] z-30 max-h-[calc(100vh-57px)] overflow-y-auto border-b border-ink bg-paper px-3 py-3
                      lg:sticky lg:top-0 lg:block lg:h-screen lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r lg:border-hairline no-print`}
        >
          <div className="mb-6 hidden px-2 lg:block">
            {BRAND_LINES.map((line) => (
              <div key={line} className="text-sm font-semibold uppercase tracking-widest text-brand">
                {line}
              </div>
            ))}
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Starlink → MikroTik → Access points
            </p>
          </div>

          <nav className="space-y-0.5">
            {visible.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `block border-l-2 px-3 py-2 text-sm transition-colors ${
                    isActive && location.pathname === item.to
                      ? 'border-brand bg-brand-tint font-semibold text-brand'
                      : 'border-transparent text-muted hover:border-brand-border hover:text-brand'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-6 hidden border-t border-hairline px-3 pt-4 lg:block">
            <div className="text-sm font-medium">{user?.name}</div>
            <div className="text-xs text-muted">{user?.role.replace('_', ' ').toLowerCase()}</div>
            <button className="btn-quiet mt-3 w-full text-xs" onClick={() => void signOut()}>Sign out</button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
