import * as React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/app-layout';
import { DashboardPage } from '@/pages/dashboard';
import { PosPage } from '@/pages/billing/pos';
import { ItemsListPage } from '@/pages/items/items-list';
import { CustomersListPage } from '@/pages/customers/customers-list';
import { VendorsListPage } from '@/pages/vendors/vendors-list';
import { PurchaseEntryPage } from '@/pages/purchases/purchase-entry';
import { ReceiptPage } from '@/pages/payments/receipt';
import { ReportsPage } from '@/pages/reports/reports';
import { InvoicesListPage } from '@/pages/invoices/invoices-list';
import { StockPage } from '@/pages/stock/stock';
import { CreditNotePage } from '@/pages/returns/credit-note';
import { SettingsPage } from '@/pages/settings/settings';
import { LoginPage } from '@/pages/login';
import { useAuthStore } from '@/stores/auth-store';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
});

function RequireAuth({ children }: Readonly<{ children: React.ReactNode }>) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="billing" element={<PosPage />} />
            <Route path="invoices" element={<InvoicesListPage />} />
            <Route path="returns/:invoiceId" element={<CreditNotePage />} />
            <Route path="items" element={<ItemsListPage />} />
            <Route path="stock" element={<StockPage />} />
            <Route path="customers" element={<CustomersListPage />} />
            <Route path="vendors" element={<VendorsListPage />} />
            <Route path="purchases" element={<PurchaseEntryPage />} />
            <Route path="payments" element={<ReceiptPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
