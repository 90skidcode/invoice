import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
  Edit,
  Eye,
  Key,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Receipt,
  Search,
  Shield,
  Sparkles,
  TrendingUp,
  User,
  Users,
} from 'lucide-react';
import * as React from 'react';

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

  if (user?.role !== 'super_admin') {
    return <Navigate to="/" replace />;
  }

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

  // Edit organization modal
  const [editOpen, setEditOpen] = React.useState(false);
  const [selectedOrg, setSelectedOrg] = React.useState<OrgStatsRow | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editLegalName, setEditLegalName] = React.useState('');
  const [editGstin, setEditGstin] = React.useState('');
  const [editPan, setEditPan] = React.useState('');
  const [editStateCode, setEditStateCode] = React.useState('');
  const [editAddress, setEditAddress] = React.useState('');
  const [editPhone, setEditPhone] = React.useState('');
  const [editEmail, setEditEmail] = React.useState('');
  const [editUpiId, setEditUpiId] = React.useState('');
  const [editError, setEditError] = React.useState<string | null>(null);
  const [editSaving, setEditSaving] = React.useState(false);

  // View details modal
  const [viewOpen, setViewOpen] = React.useState(false);
  const [viewOrg, setViewOrg] = React.useState<OrgStatsRow | null>(null);

  // Change password modal
  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const [passwordOrgId, setPasswordOrgId] = React.useState<string | null>(null);
  const [passwordOrgName, setPasswordOrgName] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = React.useState(false);

  const queryClient = useQueryClient();

  // Create form fields state
  const [name, setName] = React.useState('');
  const [legalName, setLegalName] = React.useState('');
  const [gstin, setGstin] = React.useState('');
  const [pan, setPan] = React.useState('');
  const [stateCode, setStateCode] = React.useState('33'); // Default Tamil Nadu
  const [address, setAddress] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [upiId, setUpiId] = React.useState('');
  const [plan, setPlan] = React.useState<'trial' | 'basic' | 'premium' | 'enterprise'>('trial');

  // Owner details
  const [ownerName, setOwnerName] = React.useState('');
  const [ownerPhone, setOwnerPhone] = React.useState('');
  const [ownerPin, setOwnerPin] = React.useState('');

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

  const handleEditOrg = (org: OrgStatsRow) => {
    setSelectedOrg(org);
    setEditName(org.name);
    setEditLegalName(org.legal_name || '');
    setEditGstin(org.gstin || '');
    setEditPan(org.pan || '');
    setEditStateCode(org.state_code || '33');
    setEditAddress(org.address || '');
    setEditPhone(org.phone || '');
    setEditEmail(org.email || '');
    setEditUpiId(org.upi_id || '');
    setEditError(null);
    setEditOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg || !editName) {
      setEditError('Store name is required');
      return;
    }

    setEditSaving(true);
    setEditError(null);

    try {
      await api.patch(`/admin/organizations/${selectedOrg.id}`, {
        name: editName,
        legal_name: editLegalName || null,
        gstin: editGstin || null,
        pan: editPan || null,
        state_code: editStateCode,
        address: editAddress || null,
        phone: editPhone || null,
        email: editEmail || null,
        upi_id: editUpiId || null,
      });
      queryClient.invalidateQueries({ queryKey: ['admin-organizations'] });
      setEditOpen(false);
      alert('Organization updated successfully');
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update organization');
    } finally {
      setEditSaving(false);
    }
  };

  const handleViewDetails = (org: OrgStatsRow) => {
    setViewOrg(org);
    setViewOpen(true);
  };

  const handleOpenPasswordModal = (org: OrgStatsRow) => {
    setPasswordOrgId(org.id);
    setPasswordOrgName(org.name);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
    setPasswordOpen(true);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordOrgId) return;

    if (!newPassword || !confirmPassword) {
      setPasswordError('Both password fields are required');
      return;
    }

    if (newPassword.length !== 4 || !/^\d{4}$/.test(newPassword)) {
      setPasswordError('PIN must be exactly 4 digits');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('PINs do not match');
      return;
    }

    setPasswordSaving(true);
    setPasswordError(null);

    try {
      await api.patch(`/admin/organizations/${passwordOrgId}/owner-password`, {
        new_pin: newPassword,
      });
      setPasswordOpen(false);
      alert(`Password updated successfully for ${passwordOrgName}`);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setPasswordSaving(false);
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
                  <th className="p-4 text-center">Actions</th>
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
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEditOrg(org)}
                          className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          title="Edit organization"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleViewDetails(org)}
                          className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          title="View details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleOpenPasswordModal(org)}
                          className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          title="Change owner password"
                        >
                          <Key className="h-4 w-4" />
                        </button>
                      </div>
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

      {/* Edit Organization Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent size="lg" title="Edit Organization" description="Update organization details">
          <form onSubmit={handleSaveEdit} className="space-y-4 max-h-[80vh] overflow-y-auto">
            {editError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg">
                {editError}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {/* Store Profile Section */}
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
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Legal Entity Name
                  </label>
                  <Input
                    placeholder="e.g. CocoGlo Retail Pvt Ltd"
                    value={editLegalName}
                    onChange={(e) => setEditLegalName(e.target.value)}
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
                      value={editGstin}
                      onChange={(e) => setEditGstin(e.target.value.toUpperCase())}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      PAN
                    </label>
                    <Input
                      placeholder="10-digit PAN"
                      maxLength={10}
                      value={editPan}
                      onChange={(e) => setEditPan(e.target.value.toUpperCase())}
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
                      value={editStateCode}
                      onChange={(e) => setEditStateCode(e.target.value.replace(/\D/g, ''))}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Store Address
                  </label>
                  <Input
                    placeholder="e.g. Bhavani, Tamil Nadu, India"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                  />
                </div>
              </div>

              {/* Contact Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-primary flex items-center gap-1.5 border-b border-border pb-1.5">
                  <Sparkles className="h-4 w-4" /> Contact & Settings
                </h3>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Store Phone
                  </label>
                  <Input
                    placeholder="Store phone number"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Store Email
                  </label>
                  <Input
                    type="email"
                    placeholder="hello@store.in"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    UPI ID for Payments
                  </label>
                  <Input
                    placeholder="e.g. storename@okicici"
                    value={editUpiId}
                    onChange={(e) => setEditUpiId(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editSaving}>
                {editSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Details Modal */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent size="lg" title="Organization Details" description="Complete organization information">
          {viewOrg && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-border rounded-lg p-4">
                  <p className="text-xs text-muted-foreground font-semibold">Org Code</p>
                  <p className="text-lg font-mono font-bold text-primary mt-1">{viewOrg.org_code}</p>
                </div>
                <div className="border border-border rounded-lg p-4">
                  <p className="text-xs text-muted-foreground font-semibold">Billing Plan</p>
                  <p className="text-lg font-semibold mt-1 capitalize">{viewOrg.plan}</p>
                </div>
                <div className="border border-border rounded-lg p-4">
                  <p className="text-xs text-muted-foreground font-semibold">Status</p>
                  <p className="text-lg font-semibold mt-1">
                    {viewOrg.is_active ? (
                      <span className="text-success">● Active</span>
                    ) : (
                      <span className="text-destructive">● Inactive</span>
                    )}
                  </p>
                </div>
                <div className="border border-border rounded-lg p-4">
                  <p className="text-xs text-muted-foreground font-semibold">Created</p>
                  <p className="text-sm mt-1">{new Date(viewOrg.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <h4 className="font-semibold mb-3">Contact Information</h4>
                <div className="space-y-2 text-sm">
                  {viewOrg.phone && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Phone:</span>
                      <span>{viewOrg.phone}</span>
                    </div>
                  )}
                  {viewOrg.email && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Email:</span>
                      <span>{viewOrg.email}</span>
                    </div>
                  )}
                  {viewOrg.address && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Address:</span>
                      <span>{viewOrg.address}</span>
                    </div>
                  )}
                  {viewOrg.gstin && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GSTIN:</span>
                      <span className="font-mono">{viewOrg.gstin}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <h4 className="font-semibold mb-3">Statistics</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-muted/50 p-3 rounded">
                    <p className="text-muted-foreground text-xs">Invoices</p>
                    <p className="text-lg font-bold">{viewOrg.invoices_count}</p>
                  </div>
                  <div className="bg-muted/50 p-3 rounded">
                    <p className="text-muted-foreground text-xs">Items</p>
                    <p className="text-lg font-bold">{viewOrg.items_count}</p>
                  </div>
                  <div className="bg-muted/50 p-3 rounded">
                    <p className="text-muted-foreground text-xs">Receivables</p>
                    <p className="text-lg font-bold text-warning">
                      <PriceDisplay value={viewOrg.receivables_total} />
                    </p>
                  </div>
                  <div className="bg-muted/50 p-3 rounded">
                    <p className="text-muted-foreground text-xs">Payables</p>
                    <p className="text-lg font-bold text-destructive">
                      <PriceDisplay value={viewOrg.payables_total} />
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button variant="outline" onClick={() => setViewOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Change Password Modal */}
      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent size="sm" title="Change Owner Password" description={`Update PIN for ${passwordOrgName}`}>
          <form onSubmit={handleChangePassword} className="space-y-4">
            {passwordError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg">
                {passwordError}
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                New PIN (4 digits) <span className="text-destructive">*</span>
              </label>
              <Input
                type="password"
                inputMode="numeric"
                placeholder="0000"
                maxLength={4}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Confirm PIN <span className="text-destructive">*</span>
              </label>
              <Input
                type="password"
                inputMode="numeric"
                placeholder="0000"
                maxLength={4}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>

            <div className="flex justify-end gap-3 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={() => setPasswordOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={passwordSaving}>
                {passwordSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating...
                  </>
                ) : (
                  'Update PIN'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
