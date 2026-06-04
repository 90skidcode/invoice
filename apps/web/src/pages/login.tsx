import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api-client';
import { getDeviceId } from '@/lib/device';
import { type AuthOrg, type AuthUser, useAuthStore } from '@/stores/auth-store';
import { Loader2, LogIn } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
 
interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: AuthUser;
  org: AuthOrg;
  permissions: string[];
}
 
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((s) => s.setSession);

  const [phone, setPhone] = React.useState('9876543210');
  const [pin, setPin] = React.useState('');
  const [orgCode, setOrgCode] = React.useState('COCOGLO-01');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.post<LoginResponse>('/auth/login', {
        identifier: phone,
        credential: pin,
        credential_type: 'pin',
        org_code: orgCode || undefined,
        device: {
          id: getDeviceId(),
          name: 'Web Browser',
          platform: 'web',
          app_version: '1.0.0',
          install_id: getDeviceId(),
        },
      });
      setSession(data);
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-primary tracking-tight">Counter</h1>
          <p className="text-sm text-muted-foreground">Billing &amp; Inventory</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="phone" className="mb-1 block text-sm font-medium">
              Phone
            </label>
            <Input
              id="phone"
              type="tel"
              autoComplete="username"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="pin" className="mb-1 block text-sm font-medium">
              PIN
            </label>
            <Input
              id="pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div>
            <label htmlFor="orgCode" className="mb-1 block text-sm font-medium">
              Org Code
            </label>
            <Input id="orgCode" value={orgCode} onChange={(e) => setOrgCode(e.target.value)} />
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            loading={loading}
            iconLeft={loading ? undefined : <LogIn className="h-4 w-4" />}
            className="w-full"
          >
            Sign In
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Demo: phone 9876543210 · PIN 1234
        </p>
      </div>
    </div>
  );
}
