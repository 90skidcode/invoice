import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api-client';
import { getDeviceId } from '@/lib/device';
import { type AuthOrg, type AuthUser, useAuthStore } from '@/stores/auth-store';
import { LogIn, AlertCircle, CheckSquare } from 'lucide-react';
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
    const envOrgCode = import.meta.env.VITE_ORG_CODE;
    if (envOrgCode) return envOrgCode;

    const hostname = globalThis.location.hostname;
    const regex = /(?:^|\.)([a-z]+)\.(?:in|local|dev)$/i;
    const match = regex.exec(hostname);
    if (match) {
      const orgName = match[1].toUpperCase();
      return `${orgName}-01`;
    }

    return '';
  };

  const [phone, setPhone] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [rememberMe, setRememberMe] = React.useState(false);
  const [orgCode] = React.useState(getOrgCodeFromUrl());
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    setPhone(value);
  };

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    setPin(value);
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
    <div className="min-h-screen flex bg-gray-50">
      {/* Left Side - Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-6 sm:px-8 lg:px-12 py-12">
        {/* Logo */}
        <div className="mb-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center">
              <LogIn className="h-5 w-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900">Counter</span>
          </div>
        </div>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Welcome back!</h1>
          <p className="text-gray-600">Enter your phone and PIN to access your account.</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 flex gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Phone Field */}
          <div>
            <label htmlFor="phone" className="block text-sm font-semibold text-gray-900 mb-2">
              Phone Number
            </label>
            <Input
              id="phone"
              type="text"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="Enter your phone number"
              value={phone}
              onChange={handlePhoneChange}
              maxLength={10}
              required
              className="h-12 bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:ring-blue-600 rounded-lg"
            />
            <p className="text-xs text-gray-500 mt-1">
              {phone.length}/10 digits
            </p>
          </div>

          {/* PIN Field */}
          <div>
            <label htmlFor="pin" className="block text-sm font-semibold text-gray-900 mb-2">
              PIN
            </label>
            <Input
              id="pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Enter your PIN"
              value={pin}
              onChange={handlePinChange}
              required
              className="h-12 bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:ring-blue-600 rounded-lg"
            />
            <p className="text-xs text-gray-500 mt-1">
              {pin.length}/4 digits
            </p>
          </div>

          {/* Remember Me */}
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setRememberMe(!rememberMe)}
              className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 transition-colors"
            >
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                rememberMe ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
              }`}>
                {rememberMe && <CheckSquare className="h-3.5 w-3.5 text-white" />}
              </div>
              <span>Remember me</span>
            </button>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            variant="primary"
            loading={loading}
            className="w-full h-12 text-base font-semibold rounded-lg mt-6"
            disabled={loading || phone.length !== 10 || pin.length < 4}
          >
            {loading ? 'Signing In...' : 'Log In'}
          </Button>
        </form>
      </div>

      {/* Right Side - Decorative */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 via-blue-700 to-purple-900 relative overflow-hidden items-center justify-center p-12">
        {/* Decorative Elements */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Large circle top left */}
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />

          {/* Large circle bottom right */}
          <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />

          {/* Geometric shapes */}
          <svg className="absolute inset-0 w-full h-full opacity-30" viewBox="0 0 400 600" xmlns="http://www.w3.org/2000/svg">
            {/* Triangles */}
            <polygon points="80,150 120,220 40,220" fill="rgba(255,255,255,0.1)" />
            <polygon points="300,100 350,180 250,180" fill="rgba(255,255,255,0.08)" />

            {/* Circles */}
            <circle cx="150" cy="400" r="60" fill="rgba(255,255,255,0.05)" />
            <circle cx="320" cy="350" r="80" fill="rgba(34,211,238,0.1)" />

            {/* Lines */}
            <line x1="50" y1="500" x2="350" y2="500" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
            <line x1="80" y1="550" x2="320" y2="550" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

            {/* Squares */}
            <rect x="320" y="200" width="60" height="60" fill="rgba(255,255,255,0.08)" />
            <rect x="60" y="300" width="50" height="50" fill="rgba(34,211,238,0.12)" />

            {/* Diamonds */}
            <polygon points="200,80 220,100 200,120 180,100" fill="rgba(255,193,7,0.3)" />
          </svg>
        </div>

        {/* Content */}
        <div className="relative z-10 text-white max-w-md">
          <h2 className="text-4xl font-bold mb-4">Manage your business effortlessly.</h2>
          <p className="text-blue-100 text-lg">Counter helps you streamline billing, inventory, and sales in one powerful platform.</p>

          {/* Feature dots */}
          <div className="mt-12 flex gap-8">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-yellow-300" />
              <span className="text-sm">Fast & Reliable</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-cyan-300" />
              <span className="text-sm">Secure</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
