import { AppLayout } from '@/components/layout/app-layout';
import { LoginPage } from '@/pages/login';
import { useAuthStore } from '@/stores/auth-store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';

const DashboardPage = lazy(() => import('@/pages/dashboard').then((m) => ({ default: m.DashboardPage })));
const PosPage = lazy(() => import('@/pages/billing/pos').then((m) => ({ default: m.PosPage })));
const InvoicesListPage = lazy(() => import('@/pages/invoices/invoices-list').then((m) => ({ default: m.InvoicesListPage })));
const CreditNotePage = lazy(() => import('@/pages/returns/credit-note').then((m) => ({ default: m.CreditNotePage })));
const ItemsListPage = lazy(() => import('@/pages/items/items-list').then((m) => ({ default: m.ItemsListPage })));
const StockPage = lazy(() => import('@/pages/stock/stock').then((m) => ({ default: m.StockPage })));
const CustomersListPage = lazy(() => import('@/pages/customers/customers-list').then((m) => ({ default: m.CustomersListPage })));
const VendorsListPage = lazy(() => import('@/pages/vendors/vendors-list').then((m) => ({ default: m.VendorsListPage })));
const PurchasesListPage = lazy(() => import('@/pages/purchases/purchases-list').then((m) => ({ default: m.PurchasesListPage })));
const PurchaseEntryPage = lazy(() => import('@/pages/purchases/purchase-entry').then((m) => ({ default: m.PurchaseEntryPage })));
const BomListPage = lazy(() => import('@/pages/manufacturing/bom-list').then((m) => ({ default: m.BomListPage })));
const BomFormPage = lazy(() => import('@/pages/manufacturing/bom-form').then((m) => ({ default: m.BomFormPage })));
const ProductionListPage = lazy(() => import('@/pages/manufacturing/production-list').then((m) => ({ default: m.ProductionListPage })));
const ProductionFormPage = lazy(() => import('@/pages/manufacturing/production-form').then((m) => ({ default: m.ProductionFormPage })));
const ReceiptPage = lazy(() => import('@/pages/payments/receipt').then((m) => ({ default: m.ReceiptPage })));
const ReportsPage = lazy(() => import('@/pages/reports/reports').then((m) => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('@/pages/settings/settings').then((m) => ({ default: m.SettingsPage })));
const SuperAdminPage = lazy(() => import('@/pages/admin/organizations').then((m) => ({ default: m.SuperAdminPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
});

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center py-24">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    </div>
  );
}

function RequireAuth({ children }: Readonly<{ children: ReactNode }>) {
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
            <Route
              index
              element={
                <Suspense fallback={<PageLoader />}>
                  <DashboardPage />
                </Suspense>
              }
            />
            <Route path="billing" element={<Suspense fallback={<PageLoader />}><PosPage /></Suspense>} />
            <Route path="invoices" element={<Suspense fallback={<PageLoader />}><InvoicesListPage /></Suspense>} />
            <Route path="returns/:invoiceId" element={<Suspense fallback={<PageLoader />}><CreditNotePage /></Suspense>} />
            <Route path="items" element={<Suspense fallback={<PageLoader />}><ItemsListPage /></Suspense>} />
            <Route path="stock" element={<Suspense fallback={<PageLoader />}><StockPage /></Suspense>} />
            <Route path="customers" element={<Suspense fallback={<PageLoader />}><CustomersListPage /></Suspense>} />
            <Route path="vendors" element={<Suspense fallback={<PageLoader />}><VendorsListPage /></Suspense>} />
            <Route path="purchases" element={<Suspense fallback={<PageLoader />}><PurchasesListPage /></Suspense>} />
            <Route path="purchases/new" element={<Suspense fallback={<PageLoader />}><PurchaseEntryPage /></Suspense>} />
            <Route path="purchases/:id/edit" element={<Suspense fallback={<PageLoader />}><PurchaseEntryPage /></Suspense>} />
            <Route path="manufacturing/boms" element={<Suspense fallback={<PageLoader />}><BomListPage /></Suspense>} />
            <Route path="manufacturing/boms/new" element={<Suspense fallback={<PageLoader />}><BomFormPage /></Suspense>} />
            <Route path="manufacturing/boms/:id/edit" element={<Suspense fallback={<PageLoader />}><BomFormPage /></Suspense>} />
            <Route path="manufacturing/production" element={<Suspense fallback={<PageLoader />}><ProductionListPage /></Suspense>} />
            <Route path="manufacturing/production/new" element={<Suspense fallback={<PageLoader />}><ProductionFormPage /></Suspense>} />
            <Route path="payments" element={<Suspense fallback={<PageLoader />}><ReceiptPage /></Suspense>} />
            <Route path="reports" element={<Suspense fallback={<PageLoader />}><ReportsPage /></Suspense>} />
            <Route path="settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
            <Route path="admin" element={<Suspense fallback={<PageLoader />}><SuperAdminPage /></Suspense>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
