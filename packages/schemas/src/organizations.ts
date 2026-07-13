/**
 * Organization codes and configurations
 * Shared between backend (seed, API) and frontend (login, etc.)
 */

export const ORGANIZATIONS = {
  SYSTEM_ADMIN: {
    code: 'SYSTEM-01',
    name: 'System Admin',
    description: 'System Administration Platform',
  },
  COCOGLO: {
    code: 'COCOGLO-01',
    name: 'Cocoglo',
    description: 'Cocoglo Retail',
  },
} as const;

export type OrgKey = keyof typeof ORGANIZATIONS;

/**
 * Get all available organization codes
 */
export function getAvailableOrgs() {
  return Object.entries(ORGANIZATIONS).map(([key, org]) => ({
    code: org.code,
    name: org.name,
    description: org.description,
  }));
}

/**
 * Get org by code
 */
export function getOrgByCode(code: string) {
  return getAvailableOrgs().find((org) => org.code === code);
}

/**
 * Default org code (used in login if not specified)
 */
export const DEFAULT_ORG_CODE = ORGANIZATIONS.COCOGLO.code;
