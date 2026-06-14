import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import {
  BarChart3,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Factory,
  LayoutDashboard,
  MoreHorizontal,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  X,
} from 'lucide-react';
import * as React from 'react';
import { NavLink } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: React.ReactNode;
}

export const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: <LayoutDashboard className="h-5 w-5" /> },
  { id: 'invoices', label: 'Invoices', path: '/invoices', icon: <Receipt className="h-5 w-5" /> },
  { id: 'customers', label: 'Customers', path: '/customers', icon: <Users className="h-5 w-5" /> },
  { id: 'items', label: 'Items', path: '/items', icon: <Package className="h-5 w-5" /> },
  { id: 'stock', label: 'Stock', path: '/stock', icon: <Boxes className="h-5 w-5" /> },
  { id: 'purchases', label: 'Purchases', path: '/purchases', icon: <ShoppingCart className="h-5 w-5" /> },
  { id: 'vendors', label: 'Vendors', path: '/vendors', icon: <Truck className="h-5 w-5" /> },
  { id: 'manufacturing', label: 'Manufacturing', path: '/manufacturing/boms', icon: <Factory className="h-5 w-5" /> },
  { id: 'payments', label: 'Payments', path: '/payments', icon: <CreditCard className="h-5 w-5" /> },
  { id: 'reports', label: 'Reports', path: '/reports', icon: <BarChart3 className="h-5 w-5" /> },
  { id: 'settings', label: 'Settings', path: '/settings', icon: <Settings className="h-5 w-5" /> },
];

// Items shown directly in the mobile bottom bar (rest go in "More" sheet)
export const BOTTOM_NAV_IDS = ['dashboard', 'invoices', 'customers', 'items', 'stock'];

// ── Desktop Sidebar ────────────────────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: Readonly<SidebarProps>) {
  const user = useAuthStore((s) => s.user);

  const activeItems = React.useMemo(() => {
    if (user?.role === 'super_admin') {
      const adminItem: NavItem = {
        id: 'admin',
        label: 'Super Admin',
        path: '/admin',
        icon: <ShieldCheck className="h-5 w-5" />,
      };
      const list = [...navItems];
      list.splice(-1, 0, adminItem);
      return list;
    }
    return navItems;
  }, [user]);

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col border-r border-border bg-background transition-all duration-200',
        collapsed ? 'w-14' : 'w-56',
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-border px-3 shrink-0">
        {!collapsed && (
          <span className="font-bold text-primary text-lg tracking-tight">Counter</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={cn('ml-auto h-7 w-7 shrink-0', collapsed && 'mx-auto')}
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {activeItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                isActive && 'bg-accent text-accent-foreground font-medium',
                collapsed && 'justify-center px-0',
              )
            }
            title={collapsed ? item.label : undefined}
          >
            {item.icon}
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

// ── Mobile Bottom Navigation ───────────────────────────────────────────────────

interface MobileBottomNavProps {
  onMoreClick: () => void;
}

export function MobileBottomNav({ onMoreClick }: Readonly<MobileBottomNavProps>) {
  const bottomItems = navItems.filter((n) => BOTTOM_NAV_IDS.includes(n.id));

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-stretch border-t border-border bg-background" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {bottomItems.map((item) => (
        <NavLink
          key={item.id}
          to={item.path}
          end={item.path === '/'}
          className={({ isActive }) =>
            cn(
              'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors',
              isActive
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )
          }
        >
          {item.icon}
          <span>{item.label}</span>
        </NavLink>
      ))}

      {/* More button */}
      <button
        type="button"
        onClick={onMoreClick}
        className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <MoreHorizontal className="h-5 w-5" />
        <span>More</span>
      </button>
    </nav>
  );
}

// ── Mobile Full-Screen Nav Sheet ───────────────────────────────────────────────

interface MobileNavSheetProps {
  onClose: () => void;
}

export function MobileNavSheet({ onClose }: Readonly<MobileNavSheetProps>) {
  const user = useAuthStore((s) => s.user);

  const allItems = React.useMemo(() => {
    if (user?.role === 'super_admin') {
      const adminItem: NavItem = {
        id: 'admin',
        label: 'Super Admin',
        path: '/admin',
        icon: <ShieldCheck className="h-5 w-5" />,
      };
      const list = [...navItems];
      list.splice(-1, 0, adminItem);
      return list;
    }
    return navItems;
  }, [user]);

  // Close on Escape
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 md:hidden"
        onClick={onClose}
        aria-hidden
      />
      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background rounded-t-2xl border-t border-border max-h-[80vh] overflow-y-auto">
        {/* Handle */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="h-1 w-10 rounded-full bg-muted mx-auto" />
        </div>
        <div className="flex items-center justify-between px-4 pb-2">
          <span className="font-bold text-primary text-lg tracking-tight">Counter</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="pb-8 pt-1">
          {allItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-4 px-5 py-3 text-base transition-colors',
                  isActive
                    ? 'text-primary font-medium bg-primary/5'
                    : 'text-foreground hover:bg-accent',
                )
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </>
  );
}
