import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  name: string;
  role: string;
  branches: { id: string; name: string }[];
}

export interface AuthOrg {
  id: string;
  name: string;
  gstin: string | null;
  industry_profile: string;
  state_code: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  org: AuthOrg | null;
  permissions: string[];
  isAuthenticated: () => boolean;
  hasPermission: (key: string) => boolean;
  setSession: (session: {
    access_token: string;
    refresh_token: string;
    user: AuthUser;
    org: AuthOrg;
    permissions: string[];
  }) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      org: null,
      permissions: [],
      isAuthenticated: () => !!get().accessToken,
      hasPermission: (key) => {
        const perms = get().permissions;
        return perms.includes('*') || perms.includes(key);
      },
      setSession: (session) => {
        // Mirror to localStorage so the bare fetch client (api-client.ts) can read them.
        localStorage.setItem('counter_access_token', session.access_token);
        localStorage.setItem('counter_org_id', session.org.id);
        set({
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          user: session.user,
          org: session.org,
          permissions: session.permissions,
        });
      },
      logout: () => {
        localStorage.removeItem('counter_access_token');
        localStorage.removeItem('counter_org_id');
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          org: null,
          permissions: [],
        });
      },
    }),
    { name: 'counter-auth' },
  ),
);
