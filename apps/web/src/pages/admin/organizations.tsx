import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PageAccessMatrix, type PermissionOverride } from '@/components/ui/page-access-matrix';
import { PriceDisplay } from '@/components/ui/price-display';
import { api } from '@/lib/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { Navigate } from 'react-router-dom';
import {
  Building,
  Building2,
  CheckCircle,
  CreditCard,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Receipt,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  User,
  Users,
} from 'lucide-react';
import * as React from 'react';

interface OrgUserRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: string;
  status: string;
}

interface OrgStatsRow {
  id: string;
  org_code: string;
  name: string;
  legal_name: string | null;
  gstin: string | null;
  pan: string | null;
  state_code: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  upi_id: string | null;
  industry_profile: string;
  plan: 'trial' | 'basic' | 'premium' | 'enterprise';
  is_active: boolean;
  created_at: string;
  invoices_count: number;
  receivables_total: string;
  payables_total: string;
  items_count: number;
}

export function SuperAdminPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  // Org list
  const [search, setSearch] = React.useState('');
  const [formOpen, setFormOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [successInfo, setSuccessInfo] = React.useState<{
    name: string;
    org_code: string;
    phone: string;
    pin: string;
  } | null>(null);

  // Create-org form fields
  const [name, setName] = React.useState('');
  const [legalName, setLegalName] = React.useState('');
  const [gstin, setGstin] = React.useState('');
  const [pan, setPan] = React.useState('');
  const [stateCode, setStateCode] = React.useState('33');
  const [address, setAddress] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [upiId, setUpiId] = React.useState('');
  const [plan, setPlan] = React.useState<'trial' | 'basic' | 'premium' | 'enterprise'>('trial');
  const [ownerName, setOwnerName] = React.useState('');
  const [ownerPhone, setOwnerPhone] = React.useState('');
  const [ownerPin, setOwnerPin] = React.useState('');

  // Org users panel
  const [usersOrgId, setUsersOrgId] = React.useState<string | null>(null);
  const [usersOrgName, setUsersOrgName] = React.useState('');
  const [usersOpen, setUsersOpen] = React.useState(false);
  const { data: orgUsers, isLoading: orgUsersLoading } = useQuery<OrgUserRow[]>({
    queryKey: ['admin-org-users', usersOrgId],
    queryFn: () => api.get<OrgUserRow[]>(`/admin/organizations/${usersOrgId}/users`),
    enabled: !!usersOrgId && usersOpen,
  });

  // Per-user permissions dialog
  const [permOpen, setPermOpen] = React.useState(false);
  const [permUserId, setPermUserId] = React.useState<string | null>(null);
  const [permUserName, setPermUserName] = React.useState('');
  const [permUserRole, setPermUserRole] = React.useState('cashier');
  const [permOverrides, setPermOverrides] = React.useState<PermissionOverride[]>([]);
  const [permSaving, setPermSaving] = React.useState(false);
  const [permErr, setPermErr] = React.useState<string | null>(null);

  const {
    data: orgs,
    isLoading,
    error,
  } = useQuery<OrgStatsRow[]>({
    queryKey: ['admin-organizations'],
    queryFn: () => api.get<OrgStatsRow[]>('/admin/organizations'),
  });

  const filteredOrgs = React.useMemo(() => {
    if (!orgs) return [];
    const q = search.toLowerCase().trim();
    if (!q) return orgs;
    return orgs.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.legal_name && o.legal_name.toLowerCase().includes(q)) ||
        o.id.toLowerCase().includes(q),
    );
  }, [orgs, search]);

  const stats = React.useMemo(() => {
    if (!orgs) return { totalOrgs: 0, totalInvoices: 0, totalReceivables: 0 };
    const totalOrgs = orgs.length;
    const totalInvoices = orgs.reduce((sum, o) => sum + o.invoices_count, 0);
    const totalReceivables = orgs.reduce((sum, o) => sum + Number(o.receivables_total), 0);
    return { totalOrgs, totalInvoices, totalReceivables };
  }, [orgs]);

  // Role guard — after ALL hooks
  if (user?.role !== 'super_admin') {
    return <Navigate to="/" replace />;
  }

  const roleLabels: Record<string, string> = {
    admin: 'Administrator', cashier: 'Cashier', stock: 'Stock Manager',
    accountant: 'Accountant', mechanic: 'Mechanic', viewer: 'Viewer', owner: 'Owner',
  };

  function openOrgUsers(org: { id: string; name: string }) {
    setUsersOrgId(org.id);
    setUsersOrgName(org.name);
    setUsersOpen(true);
  }

  async function openPermissions(member: OrgUserRow) {
    setPermUserId(member.id);
    setPermUserName(member.name);
    setPermUserRole(member.role);
    setPermErr(null);
    setPermOpen(true);
    try {
      const data = await api.get<{ overrides: PermissionOverride[] }>(
        `/admin/organizations/${usersOrgId}/users/${member.id}/permissions`,
      );
      setPermOverrides(data.overrides);
    } catch {
      setPermOverrides([]);
    }
  }

  async function savePermissions() {
    if (!permUserId || !usersOrgId) return;
    setPermSaving(true);
    setPermErr(null);
    try {
      await api.put(`/admin/organizations/${usersOrgId}/users/${permUserId}/permissions`, {
        overrides: permOverrides,
      });
      setPermOpen(false);
    } catch (e) {
      setPermErr(e instanceof Error ? e.message : 'Failed to save permissions');
    } finally {
      setPermSaving(false);
    }
  }

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      await api.patch(`/admin/organizations/${id}`, { is_active: !currentStatus });
      queryClient.invalidateQueries({ queryKey: ['admin-organizations'] });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update organization status');
    }
  };

  const handleChangePlan = async (id: string, newPlan: string) => {
    try {
      await api.patch(`/admin/organizations/${id}`, { plan: newPlan });
      queryClient.invalidateQueries({ queryKey: ['admin-organizations'] });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update billing plan');
    }
  };

  const handleOpenCreate = () => {
    setName('');
    setLegalName('');
    setGstin('');
    setPan('');
    setStateCode('33');
    setAddress('');
    setPhone('');
    setEmail('');
    setUpiId('');
    setPlan('trial');
    setOwnerName('');
    setOwnerPhone('');
    setOwnerPin('');
    setFormError(null);
    setSuccessInfo(null);
    setFormOpen(true);
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !stateCode || !ownerName || !ownerPhone || !ownerPin) {
      setFormError('Please fill in all required fields');
      return;
    }
    if (ownerPin.length !== 4 || !/^\d{4}$/.test(ownerPin)) {
      setFormError('Owner PIN must be exactly 4 digits');
      return;
    }

    setSaving(true);
    setFormError(null);

    const payload = {
      name,
      legal_name: legalName || null,
      gstin: gstin || null,
      pan: pan || null,
      state_code: stateCode,
      address: address || null,
      phone: phone || null,
      email: email || null,
      upi_id: upiId || null,
      plan,
      owner_name: ownerName,
      owner_phone: ownerPhone,
      owner_pin: ownerPin,
    };

    try {
      const response = await api.post<{
        name: string;
        org_code: string;
        owner: { phone: string };
      }>('/admin/organizations', payload);

      setSuccessInfo({
        name: response.name,
        org_code: response.org_code,
        phone: response.owner.phone,
        pin: ownerPin,
      });

      queryClient.invalidateQueries({ queryKey: ['admin-organizations'] });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create organization');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Super Admin Panel</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Global management center for Counter platform stores and billing plans.
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Create Store Organization
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex items-center gap-4 border border-border bg-card p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow">
          <div className="p-3 bg-primary/10 rounded-lg text-primary">
            <Building className="h-6 w-6" />
          </div>
          <div>
            <p className="text-muted-foreground text-sm font-medium">Total Organizations</p>
            <h3 className="text-2xl font-bold mt-1">{stats.totalOrgs}</h3>
          </div>
        </div>
        <div className="flex items-center gap-4 border border-border bg-card p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow">
          <div className="p-3 bg-success/10 rounded-lg text-success">
            <Receipt className="h-6 w-6" />
          </div>
          <div>
            <p className="text-muted-foreground text-sm font-medium">Total Invoices Issued</p>
            <h3 className="text-2xl font-bold mt-1">{stats.totalInvoices}</h3>
          </div>
        </div>
        <div className="flex items-center gap-4 border border-border bg-card p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow">
          <div className="p-3 bg-warning/10 rounded-lg text-warning">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <p className="text-muted-foreground text-sm font-medium">Global Receivables</p>
            <h3 className="text-2xl font-bold mt-1">
              <PriceDisplay value={stats.totalReceivables} />
            </h3>
          </div>
        </div>
      </div>

      {/* Main List Box */}
      <div className="border border-border bg-card rounded-xl shadow-sm">
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between border-b border-border">
          <div className="flex-1 max-w-sm relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by store name, legal name..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-12 gap-2 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">Loading organizations data...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-destructive">
            <p>
              Error loading organizations data:{' '}
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        ) : filteredOrgs.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm">No organizations found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground font-medium">
                  <th className="p-4">Org Code</th>
                  <th className="p-4">Store Name</th>
                  <th className="p-4">Billing Plan</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Invoices</th>
                  <th className="p-4 text-right">Items</th>
                  <th className="p-4 text-right">Receivables</th>
                  <th className="p-4 text-right">Payables</th>
                  <th className="p-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredOrgs.map((org) => (
                  <tr key={org.id} className="hover:bg-muted/10 transition-colors">
                    <td className="p-4 font-mono font-medium text-xs text-primary">
                      {org.org_code}
                    </td>
                    <td className="p-4">
                      <div className="font-semibold text-foreground">{org.name}</div>
                      {org.legal_name && (
                        <div className="text-xs text-muted-foreground">{org.legal_name}</div>
                      )}
                    </td>
                    <td className="p-4">
                      <select
                        value={org.plan}
                        onChange={(e) => handleChangePlan(org.id, e.target.value)}
                        className="bg-background border border-input rounded px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="trial">Trial</option>
                        <option value="basic">Basic</option>
                        <option value="premium">Premium</option>
                        <option value="enterprise">Enterprise</option>
                      </select>
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => handleToggleActive(org.id, org.is_active)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors ${
                          org.is_active
                            ? 'bg-success/15 border-success text-success hover:bg-success/20'
                            : 'bg-destructive/15 border-destructive text-destructive hover:bg-destructive/20'
                        }`}
                      >
                        {org.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="p-4 text-right font-medium">{org.invoices_count}</td>
                    <td className="p-4 text-right font-medium">{org.items_count}</td>
                    <td className="p-4 text-right font-medium text-warning font-semibold">
                      <PriceDisplay value={org.receivables_total} />
                    </td>
                    <td className="p-4 text-right font-medium text-destructive">
                      <PriceDisplay value={org.payables_total} />
                    </td>
                    <td className="p-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        iconLeft={<Users className="h-3.5 w-3.5" />}
                        onClick={() => openOrgUsers(org)}
                      >
                        Users
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Creation Modal */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent
          size="lg"
          title="Create New Organization Store"
          description="Initialize a new business store instance with default taxes, warehouses, and series."
        >
          {successInfo ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="p-3 bg-success/10 rounded-full text-success mb-4">
                <CheckCircle className="h-12 w-12" />
              </div>
              <h3 className="text-xl font-bold text-foreground">Organization Onboarded!</h3>
              <p className="text-muted-foreground text-sm mt-1 max-w-md">
                Store <strong>{successInfo.name}</strong> was successfully created and initialized
                with all defaults.
              </p>

              <div className="mt-6 border border-border bg-muted/40 p-4 rounded-lg w-full max-w-sm text-left divide-y divide-border">
                <div className="py-2.5 flex justify-between text-sm">
                  <span className="text-muted-foreground">Org Code:</span>
                  <span className="font-mono font-bold text-primary">{successInfo.org_code}</span>
                </div>
                <div className="py-2.5 flex justify-between text-sm">
                  <span className="text-muted-foreground">Owner Phone:</span>
                  <span className="font-semibold">{successInfo.phone}</span>
                </div>
                <div className="py-2.5 flex justify-between text-sm">
                  <span className="text-muted-foreground">Default PIN:</span>
                  <span className="font-mono font-bold text-success">{successInfo.pin}</span>
                </div>
              </div>

              <Button onClick={() => setFormOpen(false)} className="mt-6 w-full max-w-sm">
                Close Dialog
              </Button>
            </div>
          ) : (
            <form onSubmit={handleCreateOrg} className="space-y-6">
              {formError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg">
                  {formError}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                {/* Org General Details */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-primary flex items-center gap-1.5 border-b border-border pb-1.5">
                    <Building2 className="h-4 w-4" /> Store Profile
                  </h3>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Store Name <span className="text-destructive">*</span>
                    </label>
                    <Input
                      placeholder="e.g. CocoGlo Boutique"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Legal Entity Name
                    </label>
                    <Input
                      placeholder="e.g. CocoGlo Retail Pvt Ltd"
                      value={legalName}
                      onChange={(e) => setLegalName(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        GSTIN
                      </label>
                      <Input
                        placeholder="15-digit GSTIN"
                        maxLength={15}
                        value={gstin}
                        onChange={(e) => setGstin(e.target.value.toUpperCase())}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        PAN
                      </label>
                      <Input
                        placeholder="10-digit PAN"
                        maxLength={10}
                        value={pan}
                        onChange={(e) => setPan(e.target.value.toUpperCase())}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        State Code <span className="text-destructive">*</span>
                      </label>
                      <Input
                        placeholder="e.g. 33"
                        maxLength={2}
                        value={stateCode}
                        onChange={(e) => setStateCode(e.target.value.replace(/\D/g, ''))}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        Billing Plan
                      </label>
                      <select
                        value={plan}
                        onChange={(e) => setPlan(e.target.value as never)}
                        className="w-full bg-background border border-input rounded-md px-3 h-10 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="trial">Trial</option>
                        <option value="basic">Basic</option>
                        <option value="premium">Premium</option>
                        <option value="enterprise">Enterprise</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Store Address
                    </label>
                    <Input
                      placeholder="e.g. Bhavani, Tamil Nadu, India"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </div>
                </div>

                {/* Owner & Contact Details */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-primary flex items-center gap-1.5 border-b border-border pb-1.5">
                    <User className="h-4 w-4" /> Owner Credentials
                  </h3>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Owner Full Name <span className="text-destructive">*</span>
                    </label>
                    <Input
                      placeholder="e.g. Rajesh Kumar"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Owner Phone (Username) <span className="text-destructive">*</span>
                    </label>
                    <Input
                      placeholder="e.g. 9876543210"
                      maxLength={15}
                      value={ownerPhone}
                      onChange={(e) => setOwnerPhone(e.target.value.replace(/\D/g, ''))}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Owner 4-Digit Login PIN <span className="text-destructive">*</span>
                    </label>
                    <Input
                      type="password"
                      placeholder="4-digit PIN"
                      maxLength={4}
                      value={ownerPin}
                      onChange={(e) => setOwnerPin(e.target.value.replace(/\D/g, ''))}
                      required
                    />
                  </div>

                  <h3 className="text-sm font-semibold text-primary flex items-center gap-1.5 border-b border-border pb-1.5 mt-6">
                    <Sparkles className="h-4 w-4" /> General Settings
                  </h3>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Store Phone
                    </label>
                    <Input
                      placeholder="Store phone number"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Store Email
                    </label>
                    <Input
                      type="email"
                      placeholder="hello@store.in"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      UPI ID for Payments
                    </label>
                    <Input
                      placeholder="e.g. storename@okicici"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-border pt-4">
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Seeding Default Settings...
                    </>
                  ) : (
                    'Provision Store Organization'
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Org Users list dialog ── */}
      <Dialog open={usersOpen} onOpenChange={setUsersOpen}>
        <DialogContent
          size="lg"
          title={`Team Members — ${usersOrgName}`}
          description="View and manage page-level access for each team member in this organization."
        >
          {orgUsersLoading ? (
            <div className="py-8 text-center">
              <Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              {(orgUsers ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No users found.</p>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground text-xs">Name</th>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground text-xs">Phone</th>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground text-xs">Role</th>
                        <th className="px-4 py-2 text-center font-medium text-muted-foreground text-xs">Status</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {(orgUsers ?? []).map((m) => (
                        <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                          <td className="px-4 py-2 font-medium">{m.name}</td>
                          <td className="px-4 py-2 font-mono text-xs">{m.phone}</td>
                          <td className="px-4 py-2 text-xs capitalize">{roleLabels[m.role] ?? m.role}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`text-xs font-semibold ${m.status === 'Active' ? 'text-green-600' : 'text-muted-foreground'}`}>
                              {m.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              iconLeft={<ShieldCheck className="h-3.5 w-3.5" />}
                              onClick={() => openPermissions(m)}
                            >
                              Access
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Per-user permissions matrix dialog ── */}
      <Dialog open={permOpen} onOpenChange={setPermOpen}>
        <DialogContent
          size="lg"
          title={`Page Access — ${permUserName}`}
          description={`Role: ${roleLabels[permUserRole] ?? permUserRole}. Click any permission to override the role default.`}
        >
          <div className="space-y-4">
            {permErr && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg">
                {permErr}
              </div>
            )}
            <PageAccessMatrix
              role={permUserRole}
              overrides={permOverrides}
              onChange={setPermOverrides}
            />
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button type="button" variant="outline" onClick={() => setPermOpen(false)}>
                Cancel
              </Button>
              <Button loading={permSaving} onClick={savePermissions}>
                Save Access Rules
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
