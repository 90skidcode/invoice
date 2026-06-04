import type { FormSchema } from '@/components/forms/types';

export const vendorFormSchema: FormSchema = {
  formId: 'vendor.create_edit',
  title: 'Vendor',
  entity: 'vendors',
  submitLabel: 'Save Vendor',
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
          default: 'Business',
          options: [
            { value: 'Business', label: 'Business' },
            { value: 'Individual', label: 'Individual' },
            { value: 'Government', label: 'Government' },
          ],
        },
        { name: 'phone', label: 'Phone', type: 'phone', maxLength: 15 },
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
      title: 'Tax & Terms',
      columns: 2,
      fields: [
        { name: 'gstin', label: 'GSTIN', type: 'gstin', maxLength: 15 },
        { name: 'pan', label: 'PAN', type: 'text', maxLength: 10 },
        { name: 'credit_days', label: 'Credit Days', type: 'number', default: 0 },
        { name: 'opening_balance', label: 'Opening Balance', type: 'currency', default: '0.00' },
      ],
    },
    {
      id: 'bank',
      title: 'Bank',
      columns: 2,
      fields: [
        { name: 'bank_name', label: 'Bank Name', type: 'text', maxLength: 80 },
        { name: 'bank_account_no', label: 'Account No.', type: 'text', maxLength: 30 },
        { name: 'bank_ifsc', label: 'IFSC', type: 'text', maxLength: 15 },
        { name: 'upi_id', label: 'UPI ID', type: 'text', maxLength: 80 },
      ],
    },
  ],
};
