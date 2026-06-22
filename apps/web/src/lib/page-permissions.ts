export interface PermissionDef {
  key: string;
  label: string;
}

export interface PagePermissionGroup {
  page: string;
  path: string;
  permissions: PermissionDef[];
}

export const PAGE_PERMISSION_GROUPS: PagePermissionGroup[] = [
  {
    page: 'Billing / POS',
    path: '/billing',
    permissions: [{ key: 'invoice.create', label: 'Create' }],
  },
  {
    page: 'Invoices',
    path: '/invoices',
    permissions: [
      { key: 'invoice.view', label: 'View' },
      { key: 'invoice.edit', label: 'Edit' },
      { key: 'invoice.void', label: 'Void' },
    ],
  },
  {
    page: 'Items / Catalogue',
    path: '/items',
    permissions: [
      { key: 'item.view', label: 'View' },
      { key: 'item.create', label: 'Create' },
      { key: 'item.edit', label: 'Edit' },
      { key: 'item.delete', label: 'Delete' },
      { key: 'item.view_cost', label: 'View Cost' },
      { key: 'item.edit_cost', label: 'Edit Cost' },
    ],
  },
  {
    page: 'Stock',
    path: '/stock',
    permissions: [{ key: 'stock.manage', label: 'Manage' }],
  },
  {
    page: 'Customers',
    path: '/customers',
    permissions: [
      { key: 'customer.view', label: 'View' },
      { key: 'customer.create', label: 'Create' },
      { key: 'customer.edit', label: 'Edit' },
    ],
  },
  {
    page: 'Vendors',
    path: '/vendors',
    permissions: [
      { key: 'vendor.view', label: 'View' },
      { key: 'vendor.create', label: 'Create' },
      { key: 'vendor.edit', label: 'Edit' },
    ],
  },
  {
    page: 'Purchases',
    path: '/purchases',
    permissions: [
      { key: 'purchase.view', label: 'View' },
      { key: 'purchase.create', label: 'Create' },
    ],
  },
  {
    page: 'Manufacturing',
    path: '/manufacturing',
    permissions: [
      { key: 'bom.view', label: 'BOM View' },
      { key: 'production.view', label: 'Production View' },
    ],
  },
  {
    page: 'Payments',
    path: '/payments',
    permissions: [{ key: 'payment.create', label: 'Create' }],
  },
  {
    page: 'Reports',
    path: '/reports',
    permissions: [{ key: 'report.view', label: 'View' }],
  },
];

// Mirrors the backend ROLE_PERMISSIONS from apps/api/src/permissions.ts
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['*'],
  owner: ['*'],
  admin: [
    'item.view', 'item.create', 'item.edit', 'item.delete', 'item.view_cost', 'item.edit_cost',
    'invoice.create', 'invoice.edit', 'invoice.void',
    'customer.view', 'customer.create', 'customer.edit',
    'purchase.create', 'purchase.view',
    'payment.create',
    'report.view',
    'stock.manage',
  ],
  cashier: ['item.view', 'invoice.create', 'customer.view', 'customer.create', 'payment.create'],
  stock: ['item.view', 'item.create', 'item.edit', 'stock.manage'],
  mechanic: ['item.view', 'job_card.create', 'job_card.edit'],
  accountant: ['report.view', 'payment.create', 'invoice.view', 'customer.view'],
  viewer: ['item.view', 'invoice.view', 'customer.view', 'report.view'],
};

export function roleHasPermission(role: string, key: string): boolean {
  const perms = ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS['viewer'] ?? [];
  return perms.includes('*') || perms.includes(key);
}
