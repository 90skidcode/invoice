import * as React from 'react';
import { Outlet } from 'react-router-dom';
import { MobileBottomNav, MobileNavSheet, Sidebar } from './sidebar';
import { TopBar } from './top-bar';

export function AppLayout() {
  // Start collapsed on desktop; mobile sidebar is not used (bottom nav instead)
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar — hidden on mobile via sidebar.tsx */}
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((c) => !c)} />

      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <TopBar onMobileMenuOpen={() => setMobileMenuOpen(true)} />
        {/* pb-16 on mobile reserves space above the fixed bottom nav */}
        <main className="flex-1 overflow-auto p-4 pb-20 md:pb-4">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileBottomNav onMoreClick={() => setMobileMenuOpen(true)} />

      {/* Mobile full-menu sheet */}
      {mobileMenuOpen && <MobileNavSheet onClose={() => setMobileMenuOpen(false)} />}
    </div>
  );
}
