import { AppLayout } from '@/components/layout/app-layout';
import { SuperAdminPage } from '@/pages/admin/organizations';
import { PosPage } from '@/pages/billing/pos';
import { CustomersListPage } from '@/pages/customers/customers-list';
import { DashboardPage } from '@/pages/dashboard';
import { InvoicesListPage } from '@/pages/invoices/invoices-list';
import { ItemsListPage } from '@/pages/items/items-list';
import { LoginPage } from '@/pages/login';
import { ReceiptPage } from '@/pages/payments/receipt';
import { PurchaseEntryPage } from '@/pages/purchases/purchase-entry';
import { ReportsPage } from '@/pages/reports/reports';
import { CreditNotePage } from '@/pages/returns/credit-note';
import { SettingsPage } from '@/pages/settings/settings';
import { StockPage } from '@/pages/stock/stock';
import { VendorsListPage } from '@/pages/vendors/vendors-list';
import { useAuthStore } from '@/stores/auth-store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';

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
            <Route path="admin" element={<SuperAdminPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
