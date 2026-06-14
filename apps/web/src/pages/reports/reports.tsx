import { cn } from '@/lib/utils';
import {
  Boxes,
  Factory,
  Loader2,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Users,
} from 'lucide-react';
import * as React from 'react';
import type { Tab } from './shared';

const SalesReport = React.lazy(() => import('./sales-report'));
const PurchaseReport = React.lazy(() => import('./purchase-report'));
const ManufacturingReport = React.lazy(() => import('./manufacturing-report'));
const GstReport = React.lazy(() => import('./gst-report'));
const StockReport = React.lazy(() => import('./stock-report'));
const ReceivablesReport = React.lazy(() => import('./financial-report'));

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'sales', label: 'Sales Report', icon: <TrendingUp className="h-4 w-4" /> },
  { id: 'purchases', label: 'Purchase Report', icon: <ShoppingCart className="h-4 w-4" /> },
  { id: 'manufacturing', label: 'Manufacturing', icon: <Factory className="h-4 w-4" /> },
  { id: 'gst', label: 'GST (GSTR-1)', icon: <Receipt className="h-4 w-4" /> },
  { id: 'stock', label: 'Stock & Inventory', icon: <Boxes className="h-4 w-4" /> },
  { id: 'receivables', label: 'Financial Aging', icon: <Users className="h-4 w-4" /> },
];

function TabFallback() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function ReportsPage() {
  const [tab, setTab] = React.useState<Tab>('sales');
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Reports</h1>
      <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-none">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 px-3 md:px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all duration-200 whitespace-nowrap',
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>
      <div className="pt-2">
        <React.Suspense fallback={<TabFallback />}>
          {tab === 'sales' && <SalesReport />}
          {tab === 'purchases' && <PurchaseReport />}
          {tab === 'manufacturing' && <ManufacturingReport />}
          {tab === 'gst' && <GstReport />}
          {tab === 'stock' && <StockReport />}
          {tab === 'receivables' && <ReceivablesReport />}
        </React.Suspense>
      </div>
    </div>
  );
}
