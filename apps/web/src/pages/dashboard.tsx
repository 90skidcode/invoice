import { Button } from '@/components/ui/button';
import { PriceDisplay } from '@/components/ui/price-display';
import { AlertTriangle, Package, Receipt, TrendingDown, TrendingUp, Users } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { formatIndianNumber } from '@counter/utils';

interface KpiCard {
  label: string;
  value: string;
  delta?: string;
  trend?: 'up' | 'down';
  icon: React.ReactNode;
  onClick?: () => void;
}

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

interface SalesSummaryResponse {
  from: string;
  to: string;
  totals: {
    count: number;
    taxable: string;
    cgst: string;
    sgst: string;
    igst: string;
    grand: string;
    collected: string;
  };
  daily: Array<{ date: string; count: number; grand: string }>;
}

interface StockValuationResponse {
  total_value: string;
  total_sale_value: string;
  items: Array<{
    item_id: string;
    name: string;
    qty: string;
    avg_cost: string;
    sale_price: string;
    value: string;
    sale_value: string;
  }>;
}

interface ReceivablesResponse {
  total_receivable: string;
  as_of: string;
  aging: {
    current: string;
    '1_30': string;
    '31_60': string;
    '61_90': string;
    '90_plus': string;
  };
  customers: Array<{
    customer_id: string;
    name: string;
    balance: string;
  }>;
}

interface LowStockResponse {
  items: Array<{
    id: string;
    sku: string;
    name: string;
    current_stock: string;
    reorder_level: string;
    reorder_qty: string;
  }>;
}

interface UnpaidInvoice {
  id: string;
  invoice_no: string;
  customer_name: string | null;
  balance_due: string;
  invoice_date: string;
  days_overdue: number;
}

interface Transaction {
  id: string;
  invoice_no: string;
  invoice_date: string;
  customer_name: string | null;
  grand_total: string;
  balance_due: string;
  status: string;
  payment_status: string;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);

  // Fetch today's sales
  const { data: salesData } = useQuery<SalesSummaryResponse>({
    queryKey: ['sales-summary', today],
    queryFn: () =>
      api.get<SalesSummaryResponse>(`/reports/sales/summary?date_from=${today}&date_to=${today}`),
  });

  // Fetch stock valuation
  const { data: stockData } = useQuery<StockValuationResponse>({
    queryKey: ['stock-valuation'],
    queryFn: () => api.get<StockValuationResponse>('/reports/stock/valuation'),
  });

  // Fetch receivables
  const { data: receivablesData } = useQuery<ReceivablesResponse>({
    queryKey: ['receivables'],
    queryFn: () => api.get<ReceivablesResponse>(`/reports/financial/receivables?as_of=${today}`),
  });

  // Fetch low stock alerts
  const { data: lowStockData } = useQuery<LowStockResponse>({
    queryKey: ['low-stock'],
    queryFn: () => api.get<LowStockResponse>('/reports/stock/low'),
  });

  // Fetch unpaid invoices for alerts
  const { data: unpaidInvoices } = useQuery<Transaction[]>({
    queryKey: ['unpaid-invoices'],
    queryFn: () => api.get<Transaction[]>('/invoices?payment_status=unpaid&limit=10'),
  });

  // Fetch recent transactions
  const { data: transactionsData } = useQuery<Transaction[]>({
    queryKey: ['recent-invoices'],
    queryFn: () => api.get<Transaction[]>('/invoices?limit=5'),
  });

  const salesTotal = salesData?.totals?.grand ?? '0.00';
  const collectionTotal = salesData?.totals?.collected ?? '0.00';
  const stockTotal = stockData?.total_value ?? '0.00';
  const receivablesTotal = receivablesData?.total_receivable ?? '0.00';
  const transactions = Array.isArray(transactionsData) ? transactionsData : [];
  const alerts = [
    ...(lowStockData?.items
      ? lowStockData.items.map((item) => ({
          type: 'stock',
          message: `${item.name}: Only ${item.current_stock} units left`,
          severity: 'warning' as const,
          onClick: undefined,
        }))
      : []),
    ...(Array.isArray(unpaidInvoices)
      ? unpaidInvoices.slice(0, 3).map((inv) => ({
          type: 'payment',
          message: `${inv.invoice_no}: ${formatIndianNumber(inv.balance_due, 2, '')} unpaid`,
          severity: 'danger' as const,
          onClick: () => navigate(`/invoices?id=${inv.id}`),
        }))
      : []),
  ];

  const kpiCards: KpiCard[] = [
    {
      label: "Today's Sales",
      value: formatIndianNumber(salesTotal),
      delta: '+0%',
      trend: 'up',
      icon: <Receipt className="h-5 w-5 text-primary" />,
    },
    {
      label: "Today's Collection",
      value: formatIndianNumber(collectionTotal),
      delta: '+0%',
      trend: 'up',
      icon: <TrendingUp className="h-5 w-5 text-success" />,
    },
    {
      label: 'Stock Value',
      value: formatIndianNumber(stockTotal),
      icon: <Package className="h-5 w-5 text-warning" />,
    },
    {
      label: 'Receivables',
      value: formatIndianNumber(receivablesTotal),
      icon: <Users className="h-5 w-5 text-muted-foreground" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Good morning!</h1>
          <p className="text-muted-foreground text-sm">Counter 1 · Synced</p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={() => navigate('/billing')}>
            New Invoice
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/items')}>
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
        {alerts.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            No alerts right now. You're all caught up!
          </div>
        ) : (
          <div className="divide-y divide-border">
            {alerts.map((alert) => (
              <button
                key={`${alert.type}-${alert.message}`}
                onClick={alert.onClick}
                disabled={!alert.onClick}
                className={`w-full px-4 py-3 text-sm flex items-start gap-3 text-left border-0 bg-transparent ${
                  alert.severity === 'danger'
                    ? 'bg-destructive/5 text-destructive'
                    : 'bg-warning/5 text-warning'
                } ${alert.onClick ? 'cursor-pointer hover:bg-opacity-100 transition-colors' : 'cursor-default'}`}
              >
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{alert.message}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Recent Transactions */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold text-sm">Recent Transactions</h2>
          <Button variant="ghost" size="sm" onClick={() => navigate('/invoices')}>
            View All
          </Button>
        </div>
        {transactions.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            No transactions yet. Make your first sale!
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Invoice</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Customer</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Amount</th>
                <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((txn) => (
                <tr
                  key={txn.id}
                  className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer"
                  onClick={() => navigate(`/invoices?id=${txn.id}`)}
                >
                  <td className="px-4 py-2.5 font-mono text-xs">{txn.invoice_no}</td>
                  <td className="px-4 py-2.5">{txn.customer_name ?? 'Walk-in'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatIndianNumber(txn.grand_total)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                        txn.payment_status === 'unpaid'
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-success/10 text-success'
                      }`}
                    >
                      {txn.payment_status === 'unpaid' ? 'Unpaid' : 'Paid'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
