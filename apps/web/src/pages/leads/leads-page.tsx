import { cn } from '@/lib/utils';
import * as React from 'react';
import { LeadsDashboardTab } from './leads-dashboard';
import { LeadsListTab } from './leads-list';

type LeadsTab = 'dashboard' | 'all';

const TABS: { id: LeadsTab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'all', label: 'All Leads' },
];

export function LeadsPage() {
  const [tab, setTab] = React.useState<LeadsTab>('dashboard');

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Leads</h1>
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'dashboard' && <LeadsDashboardTab />}
      {tab === 'all' && <LeadsListTab />}
    </div>
  );
}
