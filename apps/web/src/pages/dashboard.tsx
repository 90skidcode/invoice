import { Button } from '@/components/ui/button';
import { PriceDisplay } from '@/components/ui/price-display';
import { AlertTriangle, Package, Receipt, TrendingDown, TrendingUp, Users } from 'lucide-react';
import type * as React from 'react';

interface KpiCard {
  label: string;
  value: string;
  delta?: string;
  trend?: 'up' | 'down';
  icon: React.ReactNode;
  onClick?: () => void;
}

const kpiCards: KpiCard[] = [
  {
    label: "Today's Sales",
    value: '₹ 0.00',
    delta: '+0%',
    trend: 'up',
    icon: <Receipt className="h-5 w-5 text-primary" />,
  },
  {
    label: "Today's Collection",
    value: '₹ 0.00',
    delta: '+0%',
    trend: 'up',
    icon: <TrendingUp className="h-5 w-5 text-success" />,
  },
  {
    label: 'Stock Value',
    value: '₹ 0.00',
    icon: <Package className="h-5 w-5 text-warning" />,
  },
  {
    label: 'Receivables',
    value: '₹ 0.00',
    icon: <Users className="h-5 w-5 text-muted-foreground" />,
  },
];

function KpiCardView({ card }: { card: KpiCard }) {
  return (
    <div
      className="rounded-lg border border-border bg-card p-4 cursor-pointer hover:shadow-sm transition-shadow"
      onClick={card.onClick}
      role={card.onClick ? 'button' : undefined}
      tabIndex={card.onClick ? 0 : undefined}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {card.label}
        </p>
        {card.icon}
      </div>
      <p className="text-2xl font-bold tabular-nums text-foreground">{card.value}</p>
      {card.delta && (
        <p
          className={`mt-1 text-xs flex items-center gap-1 ${card.trend === 'up' ? 'text-success' : 'text-destructive'}`}
        >
          {card.trend === 'up' ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          {card.delta} vs yesterday
        </p>
      )}
    </div>
  );
}

export function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Good morning!</h1>
          <p className="text-muted-foreground text-sm">Counter 1 · Synced</p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" size="sm">
            New Invoice
          </Button>
          <Button variant="outline" size="sm">
            Add Item
          </Button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpiCards.map((card) => (
          <KpiCardView key={card.label} card={card} />
        ))}
      </div>

      {/* Alerts */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <h2 className="font-semibold text-sm">Alerts</h2>
        </div>
        <div className="p-4 text-sm text-muted-foreground text-center">
          No alerts right now. You're all caught up!
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold text-sm">Recent Transactions</h2>
          <Button variant="ghost" size="sm">
            View All
          </Button>
        </div>
        <div className="p-4 text-sm text-muted-foreground text-center">
          No transactions today. Make your first sale!
        </div>
      </div>
    </div>
  );
}
