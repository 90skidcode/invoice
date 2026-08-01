import { FormRenderer } from '@/components/forms/form-renderer';
import type { FormValues } from '@/components/forms/types';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { type ColumnDef, DataTable } from '@/components/ui/data-table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FilterSheet, FilterTrigger } from '@/components/ui/filter-sheet';
import { Input } from '@/components/ui/input';
import { DateTimeDisplay } from '@/components/ui/price-display';
import { TablePagination } from '@/components/ui/table-pagination';
import { LogFollowUpDialog } from '@/components/log-followup-dialog';
import { TagPicker, type SelectedTag } from '@/components/tag-picker';
import { leadFormSchema } from '@/forms/lead.form';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone, Plus, Search, UserPlus } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { uuidv7 } from 'uuidv7';

interface LeadRow {
  id: string;
  name: string;
  phone: string;
  company_name: string | null;
  source_id: string | null;
  status: string;
  assigned_to: string | null;
  next_follow_up_at: string | null;
  tags: { id: string; name: string; color: string | null }[];
}

interface LeadSource {
  id: string;
  name: string;
  badge_color: string;
}

interface LeadStatusOption {
  id: string;
  name: string;
  slug: string;
}

interface ListResponse {
  data: LeadRow[];
  page: {
    limit: number;
    offset: number;
    total: number;
  };
}

function isOverdue(nextFollowUpAt: string | null): boolean {
  if (!nextFollowUpAt) return false;
  return new Date(nextFollowUpAt).getTime() < Date.now();
}

export function LeadsListTab() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [formOpen, setFormOpen] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [followUpLeadId, setFollowUpLeadId] = React.useState<string | null>(null);
  const [selectedTags, setSelectedTags] = React.useState<SelectedTag[]>([]);

  // Advanced filter state
  const [showAdvancedFilter, setShowAdvancedFilter] = React.useState(false);
  const [filterSelectedTags, setFilterSelectedTags] = React.useState<SelectedTag[]>([]);
  const [filterCustomerName, setFilterCustomerName] = React.useState('');
  const [filterPhone, setFilterPhone] = React.useState('');
  const [filterDateFrom, setFilterDateFrom] = React.useState('');
  const [filterDateTo, setFilterDateTo] = React.useState('');

  // Pagination state
  const [page, setPage] = React.useState(0);
  const pageSize = 20;

  const { data: sources } = useQuery<LeadSource[]>({
    queryKey: ['lead-sources'],
    queryFn: () => api.get<LeadSource[]>('/lead-sources'),
  });
  const sourceMap = React.useMemo(
    () => new Map((sources ?? []).map((s) => [s.id, s])),
    [sources],
  );

  const { data: statuses } = useQuery<LeadStatusOption[]>({
    queryKey: ['lead-statuses'],
    queryFn: () => api.get<LeadStatusOption[]>('/lead-statuses'),
  });
  const statusFilters = [
    { value: '', label: 'All' },
    ...(statuses ?? []).map((s) => ({ value: s.slug, label: s.name })),
  ];

  const filterTagIds = filterSelectedTags.filter((t) => t.id).map((t) => t.id as string);

  // Build query parameters
  const query = new URLSearchParams();
  if (search) query.set('q', search);
  if (statusFilter) query.set('status', statusFilter);
  if (filterTagIds.length > 0) query.set('tag_ids', filterTagIds.join(','));
  if (filterCustomerName) query.set('customer_name', filterCustomerName);
  if (filterPhone) query.set('phone', filterPhone);
  if (filterDateFrom) query.set('next_follow_up_from', filterDateFrom);
  if (filterDateTo) query.set('next_follow_up_to', filterDateTo);
  query.set('limit', String(pageSize));
  query.set('offset', String(page * pageSize));

  const { data: listData, isLoading, error } = useQuery<ListResponse>({
    queryKey: ['leads', search, statusFilter, filterTagIds, filterCustomerName, filterPhone, filterDateFrom, filterDateTo, page],
    queryFn: () => api.get<ListResponse>(`/leads?${query.toString()}`),
  });

  const leadRows = listData?.data ?? [];
  const pageInfo = listData?.page;
  const hasActiveFilters =
    filterTagIds.length > 0 || !!filterCustomerName || !!filterPhone || !!filterDateFrom || !!filterDateTo;

  function openCreate() {
    setFormError(null);
    setSelectedTags([]);
    setFormOpen(true);
  }

  async function handleSubmit(values: FormValues) {
    setFormError(null);
    setSaving(true);
    const payload = {
      client_id: uuidv7(),
      name: values['name'],
      phone: values['phone'],
      email: values['email'] || null,
      company_name: values['company_name'] || null,
      source_id: values['source_id'] || null,
      status: values['status'] || 'new',
      assigned_to: values['assigned_to'] || null,
      referred_by_customer_id: values['referred_by_customer_id'] || null,
      notes: values['notes'] || null,
      tag_ids: selectedTags.filter((t) => t.id).map((t) => t.id),
      new_tag_names: selectedTags.filter((t) => !t.id).map((t) => t.name),
    };
    try {
      await api.post('/leads', payload);
      setFormOpen(false);
      setPage(0);
      await queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save lead');
    } finally {
      setSaving(false);
    }
  }

  function clearAdvancedFilters() {
    setFilterSelectedTags([]);
    setFilterCustomerName('');
    setFilterPhone('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setPage(0);
  }

  const columns = React.useMemo<ColumnDef<LeadRow, unknown>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <>
            {row.original.name}
            {row.original.company_name && (
              <div className="text-xs text-muted-foreground">{row.original.company_name}</div>
            )}
          </>
        ),
      },
      {
        id: 'phone',
        header: 'Phone',
        cell: ({ row }) => row.original.phone,
        meta: { className: 'tabular-nums' },
      },
      {
        id: 'source',
        header: 'Source',
        meta: { hideOnMobile: true },
        cell: ({ row }) => {
          const source = row.original.source_id ? sourceMap.get(row.original.source_id) : null;
          return source ? (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${source.badge_color}`}>
              {source.name}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        id: 'tags',
        header: 'Tags',
        meta: { hideOnMobile: true },
        cell: ({ row }) =>
          row.original.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {row.original.tags.map((tag) => (
                <span
                  key={tag.id}
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    tag.color ?? 'bg-gray-100 text-gray-800',
                  )}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { align: 'center' },
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'next_follow_up',
        header: 'Next Follow-up',
        meta: { hideOnMobile: true },
        cell: ({ row }) => {
          const overdue = isOverdue(row.original.next_follow_up_at);
          return (
            <span className={overdue ? 'font-semibold text-destructive' : 'text-muted-foreground'}>
              {row.original.next_follow_up_at ? (
                <DateTimeDisplay value={row.original.next_follow_up_at} />
              ) : (
                '—'
              )}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<Phone className="h-3.5 w-3.5" />}
            onClick={(e) => {
              e.stopPropagation();
              setFollowUpLeadId(row.original.id);
            }}
          >
            Log
          </Button>
        ),
      },
    ],
    [sourceMap],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button variant="primary" size="sm" iconLeft={<Plus className="h-4 w-4" />} onClick={openCreate}>
          Add Lead
        </Button>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent size="lg" title="New Lead">
          <div className="mb-4">
            <TagPicker selectedTags={selectedTags} onChange={setSelectedTags} />
          </div>
          <FormRenderer
            schema={leadFormSchema}
            onSubmit={handleSubmit}
            onCancel={() => setFormOpen(false)}
            submitting={saving}
            error={formError}
          />
        </DialogContent>
      </Dialog>

      {followUpLeadId && (
        <LogFollowUpDialog
          leadId={followUpLeadId}
          currentStatus={leadRows.find((l) => l.id === followUpLeadId)?.status ?? 'new'}
          onClose={() => setFollowUpLeadId(null)}
          onLogged={() => {
            setPage(0);
            queryClient.invalidateQueries({ queryKey: ['leads'] });
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full md:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone…"
            className="pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1 border border-border overflow-x-auto">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => {
                setStatusFilter(f.value);
                setPage(0);
              }}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-semibold whitespace-nowrap transition-colors',
                statusFilter === f.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <FilterTrigger
          active={hasActiveFilters}
          onOpen={() => setShowAdvancedFilter(true)}
          onClear={clearAdvancedFilters}
        />
      </div>

      <FilterSheet
        open={showAdvancedFilter}
        onOpenChange={setShowAdvancedFilter}
        description="Narrow down leads by tags, customer details, and follow-up date"
        hasActiveFilters={hasActiveFilters}
        onClear={clearAdvancedFilters}
      >
        <TagPicker
          selectedTags={filterSelectedTags}
          onChange={(tags) => {
            setFilterSelectedTags(tags);
            setPage(0);
          }}
        />

        <div>
          <label htmlFor="filter-customer-name" className="text-sm font-medium mb-1.5 block">
            Customer Name
          </label>
          <Input
            id="filter-customer-name"
            placeholder="Search customer name…"
            value={filterCustomerName}
            onChange={(e) => {
              setFilterCustomerName(e.target.value);
              setPage(0);
            }}
          />
        </div>

        <div>
          <label htmlFor="filter-phone" className="text-sm font-medium mb-1.5 block">
            Phone Number
          </label>
          <Input
            id="filter-phone"
            placeholder="Search phone…"
            value={filterPhone}
            onChange={(e) => {
              setFilterPhone(e.target.value);
              setPage(0);
            }}
          />
        </div>

        <div>
          <label htmlFor="filter-date-from" className="text-sm font-medium mb-1.5 block">
            Next Follow-up Date Range
          </label>
          <div className="flex gap-2">
            <Input
              id="filter-date-from"
              type="date"
              value={filterDateFrom}
              onChange={(e) => {
                setFilterDateFrom(e.target.value);
                setPage(0);
              }}
              className="flex-1"
            />
            <Input
              id="filter-date-to"
              type="date"
              value={filterDateTo}
              onChange={(e) => {
                setFilterDateTo(e.target.value);
                setPage(0);
              }}
              className="flex-1"
            />
          </div>
        </div>
      </FilterSheet>

      <DataTable
        columns={columns}
        data={leadRows}
        isLoading={isLoading}
        error={error}
        errorMessage="Failed to load leads"
        emptyIcon={<UserPlus className="h-10 w-10 opacity-30" />}
        emptyTitle="No leads yet"
        emptyDescription="Add your first lead to start tracking follow-ups"
        onRowClick={(row) => navigate(`/leads/${row.id}`)}
        getRowId={(row) => row.id}
      />

      {pageInfo && <TablePagination page={pageInfo} onPageChange={(offset) => setPage(offset / pageSize)} />}
    </div>
  );
}
