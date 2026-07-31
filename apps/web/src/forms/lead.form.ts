import type { FormSchema } from '@/components/forms/types';

export const leadFormSchema: FormSchema = {
  formId: 'lead.create_edit',
  title: 'Lead',
  entity: 'leads',
  submitLabel: 'Save Lead',
  sections: [
    {
      id: 'general',
      title: 'General',
      columns: 2,
      fields: [
        { name: 'name', label: 'Name', type: 'text', required: true, maxLength: 120, width: 'full' },
        { name: 'phone', label: 'Phone', type: 'phone', required: true, maxLength: 15 },
        { name: 'email', label: 'Email', type: 'email', maxLength: 120 },
        { name: 'company_name', label: 'Company Name', type: 'text', maxLength: 120 },
        {
          name: 'source_id',
          label: 'Source',
          type: 'lookup_endpoint',
          optionsEndpoint: '/lead-sources',
          optionsValueField: 'id',
          optionsLabelField: 'name',
          required: false,
        },
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          default: 'new',
          options: [
            { value: 'new', label: 'New' },
            { value: 'contacted', label: 'Contacted' },
            { value: 'qualified', label: 'Qualified' },
            { value: 'lost', label: 'Lost' },
          ],
        },
        {
          name: 'assigned_to',
          label: 'Assigned To',
          type: 'lookup_endpoint',
          optionsEndpoint: '/users',
          optionsValueField: 'id',
          optionsLabelField: 'name',
          required: false,
        },
        { name: 'expected_value', label: 'Expected Value', type: 'currency' },
        {
          name: 'referred_by_customer_id',
          label: 'Referred By (Customer)',
          type: 'lookup_endpoint',
          optionsEndpoint: '/customers/active-list',
          optionsValueField: 'id',
          optionsLabelField: 'name',
          required: false,
        },
        { name: 'notes', label: 'Notes', type: 'textarea', width: 'full' },
      ],
    },
  ],
};
