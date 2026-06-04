import { Button } from '@/components/ui/button';
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
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  Wrench,
} from 'lucide-react';
import * as React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: React.ReactNode;
  children?: NavItem[];
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'billing', label: 'Billing', path: '/billing', icon: <Receipt className="h-4 w-4" /> },
  { id: 'invoices', label: 'Invoices', path: '/invoices', icon: <Receipt className="h-4 w-4" /> },
  { id: 'customers', label: 'Customers', path: '/customers', icon: <Users className="h-4 w-4" /> },
  { id: 'items', label: 'Items', path: '/items', icon: <Package className="h-4 w-4" /> },
  { id: 'stock', label: 'Stock', path: '/stock', icon: <Boxes className="h-4 w-4" /> },
  {
    id: 'purchases',
    label: 'Purchases',
    path: '/purchases',
    icon: <ShoppingCart className="h-4 w-4" />,
  },
  { id: 'vendors', label: 'Vendors', path: '/vendors', icon: <Truck className="h-4 w-4" /> },
  {
    id: 'payments',
    label: 'Payments',
    path: '/payments',
    icon: <CreditCard className="h-4 w-4" />,
  },
  { id: 'reports', label: 'Reports', path: '/reports', icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'settings', label: 'Settings', path: '/settings', icon: <Settings className="h-4 w-4" /> },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const user = useAuthStore((s) => s.user);

  const activeItems = React.useMemo(() => {
    if (user?.role === 'super_admin') {
      const adminItem: NavItem = {
        id: 'admin',
        label: 'Super Admin',
        path: '/admin',
        icon: <ShieldCheck className="h-4 w-4" />,
      };
      const list = [...navItems];
      // Insert right before Settings (which is the last item)
      list.splice(list.length - 1, 0, adminItem);
      return list;
    }
    return navItems;
  }, [user]);

  return (
    <aside
      className={cn(
        'flex flex-col border-r border-border bg-background transition-all duration-200',
        collapsed ? 'w-14' : 'w-56',
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-border px-3">
        {!collapsed && (
          <span className="font-bold text-primary text-lg tracking-tight">Counter</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={cn('ml-auto h-7 w-7', collapsed && 'mx-auto')}
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
