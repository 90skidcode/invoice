// Role → permission keys. Owner gets the wildcard; others get scoped sets.
// hasPermission(ctx, key) treats '*' as "all" (see context.ts).
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['*'],
  owner: ['*'],
  admin: [
    'item.view',
    'item.create',
    'item.edit',
    'item.delete',
    'item.view_cost',
    'item.edit_cost',
    'invoice.create',
    'invoice.edit',
    'invoice.void',
    'customer.view',
    'customer.create',
    'customer.edit',
    'purchase.create',
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

export function permissionsForRole(role: string): string[] {
  return ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS['viewer'] ?? [];
}
