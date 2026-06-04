export interface TaxRate {
  id: string;
  total_rate: string;
  cgst_rate: string;
  sgst_rate: string;
  igst_rate: string;
  cess_rate: string;
  effective_from: string;
  effective_to: string | null;
}

export interface LineTaxInput {
  qty: string;
  rate: string;
  discount_amt?: string | undefined;
  discount_pct?: string | undefined;
  tax_rate: TaxRate;
  invoice_date: string;
  is_intra_state: boolean;
  price_includes_tax: boolean;
  is_free?: boolean | undefined;
}

export interface LineTaxResult {
  taxable_amt: string;
  cgst_amt: string;
  sgst_amt: string;
  igst_amt: string;
  cess_amt: string;
  gst_rate: string;
  total: string;
  discount_amt: string;
}

export interface InvoiceTaxSummaryLine {
  hsn_code: string | null;
  taxable_total: string;
  gst_rate: string;
  cgst_amt: string;
  sgst_amt: string;
  igst_amt: string;
  cess_amt: string;
  tax_total: string;
}
