import * as React from 'react';
import { PAGE_PERMISSION_GROUPS, roleHasPermission } from '@/lib/page-permissions';

export interface PermissionOverride {
  permission_key: string;
  allowed: boolean;
}

interface Props {
  role: string;
  overrides: PermissionOverride[];
  onChange?: (overrides: PermissionOverride[]) => void;
  readonly?: boolean;
}

function getEffective(role: string, overrides: PermissionOverride[], key: string): boolean {
  const ov = overrides.find((o) => o.permission_key === key);
  if (ov !== undefined) return ov.allowed;
  return roleHasPermission(role, key);
}

function isOverridden(overrides: PermissionOverride[], key: string): boolean {
  return overrides.some((o) => o.permission_key === key);
}

export function PageAccessMatrix({ role, overrides, onChange, readonly = false }: Props) {
  const isFullAccess = (role === 'owner' || role === 'super_admin');

  function toggle(key: string) {
    if (readonly || !onChange) return;
    const current = getEffective(role, overrides, key);
    const roleDefault = roleHasPermission(role, key);
    const newAllowed = !current;

    if (newAllowed === roleDefault) {
      // Back to role default — remove override
      onChange(overrides.filter((o) => o.permission_key !== key));
    } else {
      // Set an explicit override
      const without = overrides.filter((o) => o.permission_key !== key);
      onChange([...without, { permission_key: key, allowed: newAllowed }]);
    }
  }

  return (
    <div className="space-y-1">
      {isFullAccess && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700 mb-3">
          This role has unrestricted access to all features. Individual permissions cannot be restricted.
        </div>
      )}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs w-40">Page</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">Permissions</th>
            </tr>
          </thead>
          <tbody>
            {PAGE_PERMISSION_GROUPS.map((group) => (
              <tr key={group.path} className="border-b border-border last:border-0">
                <td className="px-3 py-2.5 font-medium text-xs text-foreground align-top pt-3">
                  {group.page}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-2">
                    {group.permissions.map((perm) => {
                      const effective = isFullAccess || getEffective(role, overrides, perm.key);
                      const overridden = !isFullAccess && isOverridden(overrides, perm.key);
                      const roleDefault = roleHasPermission(role, perm.key);

                      return (
                        <button
                          key={perm.key}
                          type="button"
                          disabled={readonly || isFullAccess}
                          onClick={() => toggle(perm.key)}
                          title={
                            isFullAccess
                              ? 'Full access role'
                              : overridden
                                ? `Override: ${effective ? 'Granted' : 'Denied'} (role default: ${roleDefault ? 'granted' : 'denied'})`
                                : `Role default: ${roleDefault ? 'granted' : 'denied'}`
                          }
                          className={[
                            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                            'border',
                            readonly || isFullAccess ? 'cursor-default' : 'cursor-pointer hover:opacity-80',
                            effective
                              ? overridden
                                ? 'bg-blue-100 border-blue-300 text-blue-700'
                                : 'bg-green-50 border-green-200 text-green-700'
                              : overridden
                                ? 'bg-red-50 border-red-200 text-red-500 line-through'
                                : 'bg-muted border-border text-muted-foreground',
                          ].join(' ')}
                        >
                          <span
                            className={[
                              'w-1.5 h-1.5 rounded-full',
                              effective
                                ? overridden ? 'bg-blue-500' : 'bg-green-500'
                                : overridden ? 'bg-red-400' : 'bg-muted-foreground/40',
                            ].join(' ')}
                          />
                          {perm.label}
                          {overridden && (
                            <span className="text-[9px] opacity-60">{effective ? '+' : '−'}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readonly && !isFullAccess && (
        <p className="text-[11px] text-muted-foreground px-0.5">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />Role default&nbsp;&nbsp;
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />Override granted&nbsp;&nbsp;
          <span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" />Override denied
        </p>
      )}
    </div>
  );
}
