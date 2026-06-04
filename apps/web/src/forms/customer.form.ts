import type { FormSchema } from '@/components/forms/types';

export const customerFormSchema: FormSchema = {
  formId: 'customer.create_edit',
  title: 'Customer',
  entity: 'customers',
  submitLabel: 'Save Customer',
  sections: [
    {
      id: 'general',
      title: 'General',
      columns: 2,
      fields: [
        {
          name: 'name',
          label: 'Name',
          type: 'text',
          required: true,
          maxLength: 120,
          width: 'full',
        },
        {
          name: 'type',
          label: 'Type',
          type: 'select',
          default: 'Individual',
          options: [
            { value: 'Individual', label: 'Individual' },
            { value: 'Business', label: 'Business' },
            { value: 'Government', label: 'Government' },
          ],
        },
        { name: 'phone', label: 'Phone', type: 'phone', required: true, maxLength: 15 },
        { name: 'email', label: 'Email', type: 'email', maxLength: 120 },
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          default: 'Active',
          options: [
            { value: 'Active', label: 'Active' },
            { value: 'Inactive', label: 'Inactive' },
            { value: 'Blocked', label: 'Blocked' },
          ],
        },
      ],
    },
    {
      id: 'tax',
      title: 'Tax',
      columns: 2,
      fields: [
        { name: 'gstin', label: 'GSTIN', type: 'gstin', maxLength: 15 },
        {
          name: 'gst_reg_type',
          label: 'GST Reg. Type',
          type: 'select',
          default: 'Consumer',
          options: [
            { value: 'Regular', label: 'Regular' },
            { value: 'Composition', label: 'Composition' },
            { value: 'Unregistered', label: 'Unregistered' },
            { value: 'Consumer', label: 'Consumer' },
            { value: 'SEZ', label: 'SEZ' },
            { value: 'Overseas', label: 'Overseas' },
          ],
        },
      ],
    },
    {
      id: 'credit',
      title: 'Credit',
      columns: 2,
      fields: [
        { name: 'credit_limit', label: 'Credit Limit', type: 'currency', default: '0.00' },
        { name: 'credit_days', label: 'Credit Days', type: 'number', default: 0 },
        {
          name: 'block_on_limit_breach',
          label: 'Block sale on limit breach',
          type: 'switch',
          default: false,
        },
        { name: 'opening_balance', label: 'Opening Balance', type: 'currency', default: '0.00' },
      ],
    },
  ],
};
