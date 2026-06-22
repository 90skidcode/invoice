import { Input } from '@/components/ui/input';
import { api } from '@/lib/api-client';
import { getDeviceId } from '@/lib/device';
import { type AuthOrg, type AuthUser, useAuthStore } from '@/stores/auth-store';
import { AlertCircle, Eye, EyeOff, LogIn } from 'lucide-react';
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

  const getOrgCodeFromUrl = () => {
    const envOrgCode = 'VEDHASCULT-953'; //|| import.meta.env['VITE_ORG_CODE'];
    if (envOrgCode) return envOrgCode;
    const hostname = globalThis.location.hostname;
    const regex = /(?:^|\.)([a-z]+)\.(?:in|local|dev)$/i;
    const match = regex.exec(hostname);
    if (match?.[1]) return `${match[1].toUpperCase()}-01`;
    return '';
  };

  const [phone, setPhone] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [showPin, setShowPin] = React.useState(false);
  const [orgCode] = React.useState(getOrgCodeFromUrl());
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(e.target.value.replace(/\D/g, ''));
  };
  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPin(e.target.value.replace(/\D/g, ''));
  };

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
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* ── Left: Dark hero panel ─────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-4/5 relative overflow-hidden flex-col"
        style={{ backgroundColor: '#0a1628' }}
      >
        {/* Top tagline */}
        <p className="absolute top-8 left-10 right-10 text-sm text-white/50">
          Simplified billing &amp; inventory for your business.
        </p>

        {/* Large decorative circle */}
        <div
          className="absolute"
          style={{
            width: '480px',
            height: '480px',
            borderRadius: '50%',
            border: '1px solid rgba(59,130,246,0.15)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
        <div
          className="absolute"
          style={{
            width: '340px',
            height: '340px',
            borderRadius: '50%',
            border: '1px solid rgba(59,130,246,0.08)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />

        {/* Phone mockup */}
        <div className="absolute" style={{ top: '50%', left: '50%', transform: 'translate(-44%, -46%)' }}>
          {/* Phone shell */}
          <div
            className="relative"
            style={{
              width: '200px',
              height: '400px',
              backgroundColor: '#111',
              borderRadius: '32px',
              border: '8px solid #1e3a5f',
              boxShadow: '0 40px 80px rgba(0,0,0,0.6)',
              overflow: 'hidden',
            }}
          >
            {/* Phone screen */}
            <div className="w-full h-full p-3 flex flex-col gap-2" style={{ backgroundColor: '#0f1f3d' }}>
              {/* Status bar */}
              <div className="flex justify-between items-center px-1">
                <span className="text-white/40 text-xs">9:41</span>
                <div className="flex gap-1">
                  <div className="w-1 h-1 rounded-full bg-white/40" />
                  <div className="w-1 h-1 rounded-full bg-white/40" />
                  <div className="w-1 h-1 rounded-full bg-white/40" />
                </div>
              </div>
              {/* App header */}
              <div className="px-1">
                <p className="text-white/30 text-[9px]">Week 4 · 10 Jul</p>
                <p className="text-white text-2xl font-bold">₹8,97,456</p>
              </div>
              {/* Bar chart */}
              <div className="flex items-end gap-1.5 px-1 mt-1" style={{ height: '60px' }}>
                {([40, 65, 50, 80, 55, 70, 90, 45] as const).map((h, i) => (
                  <div
                    key={h * 10 + i}
                    className="flex-1 rounded-sm"
                    style={{
                      height: `${h}%`,
                      backgroundColor: i === 6 ? '#3b82f6' : 'rgba(59,130,246,0.35)',
                    }}
                  />
                ))}
              </div>
              {/* Day labels */}
              <div className="flex justify-between px-1">
                {(['M1', 'T1', 'W1', 'T2', 'F1', 'S1', 'S2', 'M2'] as const).map((d) => (
                  <span key={d} className="text-white/30 text-[8px]">{d[0]}</span>
                ))}
              </div>
              {/* Divider */}
              <div className="h-px bg-white/5 mx-1 mt-1" />
              {/* Category row */}
              <div className="px-1">
                <p className="text-white/30 text-[9px] mb-1.5">Category</p>
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                      <span className="text-white/60 text-[9px]">Sales</span>
                    </div>
                    <span className="text-white/60 text-[9px]">₹9,50,000</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                      <span className="text-white/60 text-[9px]">Purchases</span>
                    </div>
                    <span className="text-white/60 text-[9px]">₹7,85,000</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      <span className="text-white/60 text-[9px]">Returns</span>
                    </div>
                    <span className="text-white/60 text-[9px]">₹50,000</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Hero text */}
        <div className="absolute bottom-20 left-10 right-10">
          <h2 className="text-5xl font-bold text-white leading-tight">
            Manage your<br />
            <span className="text-blue-400">business</span>
          </h2>
        </div>

        {/* Bottom nav dots */}
        <div className="absolute bottom-8 left-10 flex gap-2">
          <div className="w-6 h-1.5 rounded-full bg-blue-400/70" />
          <div className="w-1.5 h-1.5 rounded-full bg-white/30" />
          <div className="w-1.5 h-1.5 rounded-full bg-white/30" />
        </div>
      </div>

      {/* ── Right: Form panel ─────────────────────────────────────────────────── */}
      <div className="w-full lg:w-1/2 flex flex-col min-h-screen bg-white">
        {/* Top bar */}
        <div className="flex items-center px-8 py-6">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{
                background: 'conic-gradient(from 0deg, #2563eb, #06b6d4, #3b82f6, #1d4ed8, #2563eb)',
              }}
            >
              <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center">
                <LogIn className="h-2.5 w-2.5 text-blue-700" />
              </div>
            </div>
            <span className="text-xl font-bold text-gray-900">Counter</span>
          </div>
        </div>

        {/* Form area */}
        <div className="flex-1 flex flex-col justify-center px-4 sm:px-8 lg:px-10 xl:px-14 py-4">
          <h1 className="text-4xl font-bold text-gray-900 mb-8">Sign In</h1>

          {/* Error */}
          {error && (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-3.5 flex gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Phone */}
            <div className="relative">
              <Input
                id="phone"
                type="text"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="Phone Number"
                value={phone}
                onChange={handlePhoneChange}
                maxLength={10}
                autoFocus={true}
                required
                className="h-14 bg-white border border-gray-200 text-gray-900 placeholder:text-gray-400 rounded-full text-base px-6 focus:border-blue-400 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>

            {/* PIN */}
            <div className="relative">
              <Input
                id="pin"
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                autoComplete="off"
                placeholder="PIN"
                value={pin}
                onChange={handlePinChange}
                required
                className="h-14 bg-white border border-gray-200 text-gray-900 placeholder:text-gray-400 rounded-full text-base px-6 pr-14 focus:border-blue-400 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
              >
                {showPin ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
              </button>
            </div>

            {/* Forgot PIN */}
            <div className="text-left">
              <button type="button" className="text-sm font-medium text-blue-600">
                Forgot PIN?
              </button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || phone.length !== 10 || pin.length < 4}
              className="w-full h-14 rounded-full text-white text-base font-semibold flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
              style={{ background: 'linear-gradient(to right, #2563eb, #06b6d4)' }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Signing in…
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                  Sign In
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-6 text-xs text-gray-400">
          <span>© 2025 Counter. All rights reserved.</span>
          <button type="button" className="hover:text-gray-600 transition-colors">Contact Us</button>
        </div>
      </div>
    </div>
  );
}
