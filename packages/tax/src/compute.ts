import { Decimal, addMoney, toMoney } from '@counter/utils';
import type { InvoiceTaxSummaryLine, LineTaxInput, LineTaxResult } from './types.js';

export function computeLineTax(input: LineTaxInput): LineTaxResult {
  const {
    qty,
    rate,
    discount_amt,
    discount_pct,
    tax_rate,
    is_intra_state,
    price_includes_tax,
    is_free = false,
  } = input;

  // Free items: quantity recorded but zero financial impact
  if (is_free) {
    return {
      taxable_amt: '0.00',
      cgst_amt: '0.00',
      sgst_amt: '0.00',
      igst_amt: '0.00',
      cess_amt: '0.00',
      gst_rate: tax_rate.total_rate,
      total: '0.00',
      discount_amt: '0.00',
    };
  }

  const qtyD = new Decimal(qty);
  const rateD = new Decimal(rate);
  const grossAmt = qtyD.times(rateD);

  // Compute discount
  let discD = new Decimal('0');
  if (discount_amt && new Decimal(discount_amt).greaterThan(0)) {
    discD = new Decimal(discount_amt);
  } else if (discount_pct && new Decimal(discount_pct).greaterThan(0)) {
    discD = grossAmt.times(new Decimal(discount_pct)).dividedBy(100);
  }

  // Amount after discount
  const afterDiscount = grossAmt.minus(discD);

  let taxableAmt: Decimal;
  const gstRateD = new Decimal(tax_rate.total_rate);

  if (price_includes_tax) {
    // Back-calculate taxable amount from tax-inclusive price
    taxableAmt = afterDiscount.dividedBy(new Decimal('1').plus(gstRateD.dividedBy(100)));
  } else {
    taxableAmt = afterDiscount;
  }

  taxableAmt = taxableAmt.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // Compute tax components
  let cgstAmt = new Decimal('0');
  let sgstAmt = new Decimal('0');
  let igstAmt = new Decimal('0');
  let cessAmt = new Decimal('0');

  const cessRateD = new Decimal(tax_rate.cess_rate);

  if (is_intra_state) {
    cgstAmt = taxableAmt
      .times(new Decimal(tax_rate.cgst_rate))
      .dividedBy(100)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    sgstAmt = taxableAmt
      .times(new Decimal(tax_rate.sgst_rate))
      .dividedBy(100)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  } else {
    igstAmt = taxableAmt
      .times(new Decimal(tax_rate.igst_rate))
      .dividedBy(100)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

  if (cessRateD.greaterThan(0)) {
    cessAmt = taxableAmt.times(cessRateD).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

  const total = taxableAmt.plus(cgstAmt).plus(sgstAmt).plus(igstAmt).plus(cessAmt);

  return {
    taxable_amt: taxableAmt.toFixed(2),
    cgst_amt: cgstAmt.toFixed(2),
    sgst_amt: sgstAmt.toFixed(2),
    igst_amt: igstAmt.toFixed(2),
    cess_amt: cessAmt.toFixed(2),
    gst_rate: tax_rate.total_rate,
    total: total.toFixed(2),
    discount_amt: discD.toFixed(2),
  };
}

export interface InvoiceLineSummary {
  hsn_code: string | null;
  taxable_amt: string;
  cgst_amt: string;
  sgst_amt: string;
  igst_amt: string;
  cess_amt: string;
  gst_rate: string;
}

export function buildHsnTaxSummary(lines: InvoiceLineSummary[]): InvoiceTaxSummaryLine[] {
  const byHsnAndRate = new Map<string, InvoiceTaxSummaryLine>();

  for (const line of lines) {
    const key = `${line.hsn_code ?? 'NONE'}||${line.gst_rate}`;
    const existing = byHsnAndRate.get(key);

    if (existing) {
      existing.taxable_total = addMoney(existing.taxable_total, line.taxable_amt);
      existing.cgst_amt = addMoney(existing.cgst_amt, line.cgst_amt);
      existing.sgst_amt = addMoney(existing.sgst_amt, line.sgst_amt);
      existing.igst_amt = addMoney(existing.igst_amt, line.igst_amt);
      existing.cess_amt = addMoney(existing.cess_amt, line.cess_amt);
      existing.tax_total = addMoney(
        addMoney(addMoney(existing.cgst_amt, existing.sgst_amt), existing.igst_amt),
        existing.cess_amt,
      );
    } else {
      const taxTotal = toMoney(
        new Decimal(line.cgst_amt).plus(line.sgst_amt).plus(line.igst_amt).plus(line.cess_amt),
      );
      byHsnAndRate.set(key, {
        hsn_code: line.hsn_code,
        taxable_total: line.taxable_amt,
        gst_rate: line.gst_rate,
        cgst_amt: line.cgst_amt,
        sgst_amt: line.sgst_amt,
        igst_amt: line.igst_amt,
        cess_amt: line.cess_amt,
        tax_total: taxTotal,
      });
    }
  }

  return Array.from(byHsnAndRate.values());
}

export function isIntraState(orgStateCode: string, placeOfSupply: string): boolean {
  return orgStateCode === placeOfSupply;
}

export interface InvoiceTaxAdjustment {
  taxable_amt: ReturnType<typeof toMoney>;
  cgst_amt: ReturnType<typeof toMoney>;
  sgst_amt: ReturnType<typeof toMoney>;
  igst_amt: ReturnType<typeof toMoney>;
  cess_amt: ReturnType<typeof toMoney>;
  total: ReturnType<typeof toMoney>;
}

export function applyInvoiceDiscount(
  originalSubtotal: string,
  invoiceDiscountAmt: string,
  cgstTotal: string,
  sgstTotal: string,
  igstTotal: string,
  cessTotal: string,
): InvoiceTaxAdjustment {
  const subtotalD = new Decimal(originalSubtotal);
  const discountD = new Decimal(invoiceDiscountAmt);

  if (discountD.isZero() || discountD.isNegative()) {
    return {
      taxable_amt: toMoney(originalSubtotal),
      cgst_amt: toMoney(cgstTotal),
      sgst_amt: toMoney(sgstTotal),
      igst_amt: toMoney(igstTotal),
      cess_amt: toMoney(cessTotal),
      total: toMoney(subtotalD.plus(cgstTotal).plus(sgstTotal).plus(igstTotal).plus(cessTotal)),
    };
  }

  const newSubtotal = subtotalD.minus(discountD);
  if (newSubtotal.isNegative()) {
    throw new Error('Invoice discount cannot exceed subtotal');
  }

  const ratio = newSubtotal.dividedBy(subtotalD);

  const cgstD = new Decimal(cgstTotal);
  const sgstD = new Decimal(sgstTotal);
  const igstD = new Decimal(igstTotal);
  const cessD = new Decimal(cessTotal);

  const adjustedCgst = cgstD.times(ratio).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const adjustedSgst = sgstD.times(ratio).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const adjustedIgst = igstD.times(ratio).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const adjustedCess = cessD.times(ratio).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  const total = newSubtotal
    .plus(adjustedCgst)
    .plus(adjustedSgst)
    .plus(adjustedIgst)
    .plus(adjustedCess);

  return {
    taxable_amt: toMoney(newSubtotal),
    cgst_amt: toMoney(adjustedCgst),
    sgst_amt: toMoney(adjustedSgst),
    igst_amt: toMoney(adjustedIgst),
    cess_amt: toMoney(adjustedCess),
    total: toMoney(total),
  };
}
