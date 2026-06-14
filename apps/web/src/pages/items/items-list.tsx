import { FormRenderer } from '@/components/forms/form-renderer';
import type { FormValues } from '@/components/forms/types';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ItemTypeBadge,
  ItemTypeFilter,
  type ItemType,
  filterByItemType,
} from '@/components/ui/item-type-filter';
import { PriceDisplay } from '@/components/ui/price-display';
import { ItemImageUpload, ItemThumbnail } from '@/components/ui/item-image-upload';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { itemFormSchema } from '@/forms/item.form';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Package, Plus, Search, Tag } from 'lucide-react';
import * as React from 'react';
import { uuidv7 } from 'uuidv7';

interface ItemRow {
  id: string;
  sku: string;
  name: string;
  sale_price: string;
  status: string;
  category_id: string | null;
  category_name: string | null;
  is_service: boolean;
  is_finished_good: boolean;
  is_batched: boolean;
  current_stock: string | null;
  image_urls: string[];
}

interface ItemDetail {
  id: string;
  sku: string;
  name: string;
  hsn_code: string | null;
  primary_unit_id: string;
  tax_rate_id: string;
  category_id: string | null;
  mrp: string | null;
  sale_price: string;
  purchase_price: string | null;
  track_inventory: boolean;
  is_service: boolean;
  is_finished_good: boolean;
  is_batched: boolean;
  allow_negative_stock: boolean;
  shelf_life_days: number | null;
  image_urls: string[];
  row_version: number;
}

interface Category {
  id: string;
  name: string;
}

export function ItemsListPage() {
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState<ItemType>('all');
  const [categoryFilter, setCategoryFilter] = React.useState<string>('all');
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [editVersion, setEditVersion] = React.useState<number | null>(null);
  const [initialValues, setInitialValues] = React.useState<FormValues | undefined>(undefined);
  const [sheetImageUrls, setSheetImageUrls] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<ItemRow[]>({
    queryKey: ['items', search],
    queryFn: () => api.get<ItemRow[]>(`/items?q=${encodeURIComponent(search)}`),
    enabled: search.length >= 2 || search.length === 0,
  });

  const { data: categoriesData } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
  });

  const items = data ?? [];
  const byType = filterByItemType(items, typeFilter);
  const filtered =
    categoryFilter === 'all'
      ? byType
      : byType.filter((i) => i.category_id === categoryFilter);

  function openCreate() {
    setEditId(null);
    setEditVersion(null);
    setInitialValues(undefined);
    setSheetImageUrls([]);
    setFormError(null);
    setSheetOpen(true);
  }

  async function openEdit(id: string) {
    setFormError(null);
    try {
      const item = await api.get<ItemDetail>(`/items/${id}`);
      setEditId(item.id);
      setEditVersion(item.row_version);
      setInitialValues({
        sku: item.sku,
        name: item.name,
        category_id: item.category_id ?? '',
        hsn_code: item.hsn_code ?? '',
        primary_unit_id: item.primary_unit_id,
        tax_rate_id: item.tax_rate_id,
        mrp: item.mrp ?? '',
        sale_price: item.sale_price ?? '0.00',
        purchase_price: item.purchase_price ?? '',
        track_inventory: item.track_inventory,
        is_service: item.is_service,
        is_finished_good: item.is_finished_good,
        is_batched: item.is_batched,
        allow_negative_stock: item.allow_negative_stock,
        shelf_life_days: item.shelf_life_days ?? '',
      });
      setSheetImageUrls(item.image_urls ?? []);
      setSheetOpen(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to load item');
    }
  }

  async function handleSubmit(values: FormValues) {
    setFormError(null);
    setSaving(true);
    // biome-ignore lint/complexity/useLiteralKeys: Property access from index signature is forbidden under strict compiler rules
    const payload = {
      sku: String(values['sku'] ?? '').toUpperCase(),
      name: values['name'],
      category_id: values['category_id'] || null,
      hsn_code: values['hsn_code'] || null,
      primary_unit_id: values['primary_unit_id'],
      tax_rate_id: values['tax_rate_id'],
      pricing: {
        mrp: values['mrp'] ? String(values['mrp']) : null,
        sale_price: String(values['sale_price'] ?? '0.00'),
        purchase_price: values['purchase_price'] ? String(values['purchase_price']) : null,
        tax_inclusive: false,
        min_sale_price: null,
        max_discount_pct: null,
      },
      flags: {
        track_inventory: !!values['track_inventory'],
        is_service: !!values['is_service'],
        is_finished_good: !!values['is_finished_good'],
        is_batched: !!values['is_batched'],
        allow_negative_stock: !!values['allow_negative_stock'],
        has_variants: false,
      },
      status: 'active',
    };
    try {
      if (editId && editVersion !== null) {
        await api.patch(`/items/${editId}`, payload, editVersion);
      } else {
        await api.post('/items', { client_id: uuidv7(), ...payload });
      }
      setSheetOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['items'] });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save item');
    } finally {
      setSaving(false);
    }
  }

  const downloadCSV = () => {
    if (!items.length) return;
    const headers = 'SKU,Name,Category,Sale Price,Current Stock,Status\n';
    const rows = items
      .map(
        (item) =>
          `"${item.sku}","${item.name.replace(/"/g, '""')}","${item.category_name ?? ''}",${item.sale_price},${item.current_stock ?? '—'},"${item.status}"`,
      )
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'items-stock-list.csv');
    link.click();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Items</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={items.length === 0}
            iconLeft={<Download className="h-4 w-4" />}
            onClick={downloadCSV}
          >
            Export CSV
          </Button>
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Plus className="h-4 w-4" />}
            onClick={openCreate}
          >
            Add Item
          </Button>
        </div>
      </div>

      {/* Sheet sidebar for Add/Edit */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          title={editId ? 'Edit Item' : 'New Item'}
          description={editId ? 'Update item details below.' : 'Fill in details to create a new item.'}
        >
          <FormRenderer
            key={editId ?? 'new'}
            schema={itemFormSchema}
            initialValues={initialValues}
            onSubmit={handleSubmit}
            onCancel={() => setSheetOpen(false)}
            submitting={saving}
            error={formError}
          />
          {/* Image upload — only available once the item has been saved (has an ID) */}
          {editId ? (
            <div className="mt-6 border-t border-border pt-5">
              <p className="mb-3 text-sm font-semibold">Photos</p>
              <ItemImageUpload
                itemId={editId}
                imageUrls={sheetImageUrls}
                onChanged={(urls) => {
                  setSheetImageUrls(urls);
                  queryClient.invalidateQueries({ queryKey: ['items'] });
                }}
                disabled={saving}
              />
            </div>
          ) : (
            <p className="mt-4 text-xs text-muted-foreground">
              Save the item first, then re-open it to add photos.
            </p>
          )}
        </SheetContent>
      </Sheet>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search items…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {/* Category filter */}
          {(categoriesData ?? []).length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              {[{ id: 'all', name: 'All Categories' }, ...(categoriesData ?? [])].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                    categoryFilter === cat.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80',
                  )}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <ItemTypeFilter value={typeFilter} onChange={setTypeFilter} />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            Loading…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12 text-destructive">
            Failed to load items
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <Package className="h-10 w-10 opacity-30" />
            <p className="font-medium">No items yet</p>
            <p className="text-sm">Add your first item to start billing</p>
            <Button variant="primary" size="sm" iconLeft={<Plus className="h-4 w-4" />} onClick={openCreate}>
              Add Item
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Item</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">Category</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">Type</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Price</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground hidden md:table-cell">Stock</th>
                <th className="px-4 py-2.5 text-center font-medium text-muted-foreground hidden md:table-cell">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-xs text-muted-foreground">
                    No items match the current filters.
                  </td>
                </tr>
              )}
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <ItemThumbnail imageUrls={item.image_urls} />
                      <div>
                        <div className="font-medium">{item.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{item.sku}</div>
                        {/* Category + type visible only on mobile */}
                        {item.category_name && (
                          <div className="md:hidden text-xs text-muted-foreground mt-0.5">{item.category_name}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">
                    {item.category_name ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                        <Tag className="h-2.5 w-2.5" />
                        {item.category_name}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell">
                    <ItemTypeBadge isFinishedGood={item.is_finished_good} />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <PriceDisplay value={item.sale_price} />
                    <div className="md:hidden text-xs text-muted-foreground mt-0.5">{item.current_stock ?? '—'} in stock</div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground hidden md:table-cell">
                    {item.current_stock ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center hidden md:table-cell">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-2.5">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(item.id)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
