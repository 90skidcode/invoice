import { LogFollowUpDialog } from '@/components/log-followup-dialog';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { StatCard } from '@/pages/reports/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Phone, PhoneCall, TrendingUp, UserPlus, Users } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

interface FollowUpRow {
  id: string;
  name: string;
  phone: string;
  status: string;
  next_follow_up_at: string | null;
  notes: string | null;
}

interface DashboardData {
  today_followups: FollowUpRow[];
  overdue_followups: FollowUpRow[];
  stats: {
    total_active: number;
    new_this_week: number;
    by_status: { status: string; count: number }[];
    by_source: { source_id: string | null; source_name: string; count: number }[];
    conversion_rate: string;
  };
}

function FollowUpList({
  rows,
  emptyLabel,
  onLog,
  onOpen,
  overdue,
}: Readonly<{
  rows: FollowUpRow[];
  emptyLabel: string;
  onLog: (id: string) => void;
  onOpen: (id: string) => void;
  overdue?: boolean;
}>) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div
          key={r.id}
          className="flex items-center justify-between rounded-lg border border-border bg-card p-3 hover:bg-muted/30 transition-colors"
        >
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(r.id)}>
            <div className="flex items-center gap-2">
              <span className="font-medium">{r.name}</span>
              <StatusBadge status={r.status} className="text-[10px]" />
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="tabular-nums">{r.phone}</span>
              {r.notes && <span className="truncate">· {r.notes}</span>}
            </div>
          </button>
          <Button
            variant={overdue ? 'destructive' : 'outline'}
            size="sm"
            iconLeft={<Phone className="h-3.5 w-3.5" />}
            onClick={() => onLog(r.id)}
          >
            Log Follow-up
          </Button>
        </div>
      ))}
    </div>
  );
}

export function LeadsDashboardTab() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [followUpLeadId, setFollowUpLeadId] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['leads-dashboard'],
    queryFn: () => api.get<DashboardData>('/leads/dashboard'),
  });

  function refetch() {
    queryClient.invalidateQueries({ queryKey: ['leads-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['leads'] });
  }

  if (isLoading || !data) {
    return <div className="py-12 text-center text-muted-foreground">Loading…</div>;
  }

  const currentStatus =
    [...data.today_followups, ...data.overdue_followups].find((r) => r.id === followUpLeadId)
      ?.status ?? 'new';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active Leads" value={data.stats.total_active} icon={<Users className="h-4 w-4" />} />
        <StatCard
          label="New This Week"
          value={data.stats.new_this_week}
          icon={<UserPlus className="h-4 w-4" />}
        />
        <StatCard
          label="Conversion Rate"
          value={`${data.stats.conversion_rate}%`}
          icon={<TrendingUp className="h-4 w-4" />}
          className="bg-primary/5 border-primary/20"
        />
        <StatCard
          label="Missed Follow-ups"
          value={data.overdue_followups.length}
          icon={<AlertTriangle className="h-4 w-4" />}
          className={data.overdue_followups.length > 0 ? 'border-destructive/30 bg-destructive/5' : ''}
        />
      </div>

      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <PhoneCall className="h-4 w-4" /> Call Today ({data.today_followups.length})
        </h2>
        <FollowUpList
          rows={data.today_followups}
          emptyLabel="No follow-ups scheduled for today."
          onLog={setFollowUpLeadId}
          onOpen={(id) => navigate(`/leads/${id}`)}
        />
      </div>

      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
          <AlertTriangle className="h-4 w-4" /> Missed / Overdue ({data.overdue_followups.length})
        </h2>
        <FollowUpList
          rows={data.overdue_followups}
          emptyLabel="Nothing overdue — nice work."
          onLog={setFollowUpLeadId}
          onOpen={(id) => navigate(`/leads/${id}`)}
          overdue
        />
      </div>

      {data.stats.by_source.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold">Leads by Source</h2>
          <div className="flex flex-wrap gap-2">
            {data.stats.by_source.map((s) => (
              <span
                key={s.source_id ?? 'none'}
                className="rounded-full bg-muted px-3 py-1 text-xs font-medium"
              >
                {s.source_name}: {s.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {followUpLeadId && (
        <LogFollowUpDialog
          leadId={followUpLeadId}
          currentStatus={currentStatus}
          onClose={() => setFollowUpLeadId(null)}
          onLogged={refetch}
        />
      )}
    </div>
  );
}
