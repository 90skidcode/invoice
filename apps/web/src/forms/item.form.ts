import type { FormSchema } from '@/components/forms/types';

export const itemFormSchema: FormSchema = {
  formId: 'item.create_edit',
  title: 'Item',
  entity: 'items',
  submitLabel: 'Save Item',
  sections: [
    {
      id: 'general',
      title: 'General',
      columns: 2,
      fields: [
        {
          name: 'sku',
          label: 'SKU / Code',
          type: 'text',
          required: true,
          maxLength: 40,
          hint: 'Uppercase letters, digits, dash/underscore',
        },
        { name: 'name', label: 'Item Name', type: 'text', required: true, maxLength: 160 },
        { name: 'hsn_code', label: 'HSN / SAC', type: 'text', maxLength: 8 },
        {
          name: 'primary_unit_id',
          label: 'Unit',
          type: 'lookup_endpoint',
          required: true,
          optionsEndpoint: '/units',
          optionsValueField: 'id',
          optionsLabelField: 'abbreviation',
        },
        {
          name: 'tax_rate_id',
          label: 'GST Rate',
          type: 'lookup_endpoint',
          required: true,
          optionsEndpoint: '/tax-rates',
          optionsValueField: 'id',
          optionsLabelField: 'name',
        },
      ],
    },
    {
      id: 'pricing',
      title: 'Pricing',
      columns: 3,
      fields: [
        { name: 'mrp', label: 'MRP', type: 'currency' },
        {
          name: 'sale_price',
          label: 'Sale Price',
          type: 'currency',
          required: true,
          default: '0.00',
        },
        { name: 'purchase_price', label: 'Purchase Price', type: 'currency' },
        // computed (display-only, not submitted)
        {
          name: 'margin',
          label: 'Margin',
          type: 'number',
          computed: '${sale_price} - ${purchase_price}',
          computedFormat: 'currency',
        },
        {
          name: 'margin_pct',
          label: 'Margin %',
          type: 'number',
          computed: '(${sale_price} - ${purchase_price}) / ${purchase_price} * 100',
          computedFormat: 'percent',
        },
      ],
    },
    {
      id: 'flags',
      title: 'Properties',
      columns: 3,
      fields: [
        { name: 'track_inventory', label: 'Track Inventory', type: 'switch', default: true },
        { name: 'is_service', label: 'Is Service', type: 'switch', default: false },
        { name: 'is_finished_good', label: 'Sales Item (Finished Good)', type: 'switch', default: false },
        { name: 'is_batched', label: 'Is Batched', type: 'switch', default: false },
        {
          name: 'allow_negative_stock',
          label: 'Allow Negative Stock',
          type: 'switch',
          default: false,
        },
        // depends_on: shown only when batched
        {
          name: 'shelf_life_days',
          label: 'Shelf Life (days)',
          type: 'number',
          visibleWhen: '${is_batched} == true',
        },
      ],
    },
  ],
};
