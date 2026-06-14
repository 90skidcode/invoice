import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth-store';
import { Bell, LogOut, Menu, Search, Wifi, WifiOff } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

interface TopBarProps {
  onMobileMenuOpen: () => void;
}

export function TopBar({ onMobileMenuOpen }: Readonly<TopBarProps>) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const org = useAuthStore((s) => s.org);
  const logout = useAuthStore((s) => s.logout);
  const [syncing] = React.useState(true);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);

  const initial = user?.name?.charAt(0)?.toUpperCase() ?? '?';

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="flex h-14 items-center gap-2 border-b border-border bg-background px-3 md:px-4 shrink-0">
      {/* Mobile: hamburger (opens full nav sheet) */}
      <button
        type="button"
        className="md:hidden flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        onClick={onMobileMenuOpen}
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile: brand name */}
      <span className="md:hidden font-bold text-primary text-base tracking-tight">Counter</span>

      {/* Desktop: global search */}
      <div className="hidden md:flex flex-1 max-w-sm">
        <Input
          type="search"
          placeholder="Search… (Ctrl+K)"
          prefix={<Search className="h-4 w-4" />}
          className="h-8"
        />
      </div>

      <div className="ml-auto flex items-center gap-2 md:gap-3">
        {/* Mobile: search icon */}
        <button
          type="button"
          className="md:hidden flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          onClick={() => setSearchOpen((o) => !o)}
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </button>

        {org && <span className="text-sm font-medium hidden sm:inline">{org.name}</span>}

        {/* Sync status */}
        <span
          className={`hidden sm:flex items-center gap-1 text-xs ${syncing ? 'text-success' : 'text-warning'}`}
          title={syncing ? 'Synced' : 'Sync pending'}
        >
          {syncing ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          <span className="hidden md:inline">{syncing ? 'Synced' : 'Offline'}</span>
        </span>

        {/* Notifications */}
        <Button variant="ghost" size="icon" aria-label="Notifications" className="h-8 w-8">
          <Bell className="h-4 w-4" />
        </Button>

        {/* User avatar + dropdown */}
        <div className="relative">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold"
            aria-label="User menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {initial}
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
              <div className="absolute right-0 z-20 mt-2 w-44 rounded-md border border-border bg-popover py-1 shadow-md">
                <div className="px-3 py-2 text-sm">
                  <p className="font-medium truncate">{user?.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
                </div>
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Mobile: expandable search bar (shown below header when open) */}
      {searchOpen && (
        <div className="md:hidden absolute top-14 left-0 right-0 z-20 bg-background border-b border-border px-3 py-2">
          <Input
            type="search"
            placeholder="Search…"
            prefix={<Search className="h-4 w-4" />}
            className="h-9"
            autoFocus
            onBlur={() => setSearchOpen(false)}
          />
        </div>
      )}
    </header>
  );
}
