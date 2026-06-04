import { uuidv7 } from 'uuidv7';

export type OrgId = string & { __brand: 'OrgId' };
export type UserId = string & { __brand: 'UserId' };
export type DeviceId = string & { __brand: 'DeviceId' };
export type BranchId = string & { __brand: 'BranchId' };
export type LocationId = string & { __brand: 'LocationId' };
export type ItemId = string & { __brand: 'ItemId' };
export type CustomerId = string & { __brand: 'CustomerId' };
export type VendorId = string & { __brand: 'VendorId' };
export type InvoiceId = string & { __brand: 'InvoiceId' };
export type InvoiceLineId = string & { __brand: 'InvoiceLineId' };
export type PurchaseInvoiceId = string & { __brand: 'PurchaseInvoiceId' };
export type CreditNoteId = string & { __brand: 'CreditNoteId' };
export type PaymentId = string & { __brand: 'PaymentId' };
export type StockLedgerId = string & { __brand: 'StockLedgerId' };
export type BatchId = string & { __brand: 'BatchId' };
export type TaxRateId = string & { __brand: 'TaxRateId' };
export type PriceTierId = string & { __brand: 'PriceTierId' };
export type UnitId = string & { __brand: 'UnitId' };
export type CategoryId = string & { __brand: 'CategoryId' };
export type BrandId = string & { __brand: 'BrandId' };
export type InvoiceSeriesId = string & { __brand: 'InvoiceSeriesId' };
export type JobCardId = string & { __brand: 'JobCardId' };
export type BomId = string & { __brand: 'BomId' };
export type ProductionOrderId = string & { __brand: 'ProductionOrderId' };
export type VehicleId = string & { __brand: 'VehicleId' };
export type AuditLogId = string & { __brand: 'AuditLogId' };
export type ExpenseId = string & { __brand: 'ExpenseId' };
export type PrintTemplateId = string & { __brand: 'PrintTemplateId' };
export type PurchaseOrderId = string & { __brand: 'PurchaseOrderId' };
export type StockAdjustmentId = string & { __brand: 'StockAdjustmentId' };
export type StockTransferId = string & { __brand: 'StockTransferId' };

export function newId<T extends string>(): T {
  return uuidv7() as T;
}

export function newOrgId(): OrgId { return newId<OrgId>(); }
export function newUserId(): UserId { return newId<UserId>(); }
export function newDeviceId(): DeviceId { return newId<DeviceId>(); }
export function newBranchId(): BranchId { return newId<BranchId>(); }
export function newLocationId(): LocationId { return newId<LocationId>(); }
export function newItemId(): ItemId { return newId<ItemId>(); }
export function newCustomerId(): CustomerId { return newId<CustomerId>(); }
export function newVendorId(): VendorId { return newId<VendorId>(); }
export function newInvoiceId(): InvoiceId { return newId<InvoiceId>(); }
export function newInvoiceLineId(): InvoiceLineId { return newId<InvoiceLineId>(); }
export function newPaymentId(): PaymentId { return newId<PaymentId>(); }
export function newStockLedgerId(): StockLedgerId { return newId<StockLedgerId>(); }
export function newBatchId(): BatchId { return newId<BatchId>(); }
export function newCreditNoteId(): CreditNoteId { return newId<CreditNoteId>(); }
export function newJobCardId(): JobCardId { return newId<JobCardId>(); }
export function newBomId(): BomId { return newId<BomId>(); }
export function newProductionOrderId(): ProductionOrderId { return newId<ProductionOrderId>(); }
export function newExpenseId(): ExpenseId { return newId<ExpenseId>(); }
export function newPurchaseOrderId(): PurchaseOrderId { return newId<PurchaseOrderId>(); }

export function brandId<T extends string>(raw: string): T {
  return raw as T;
}

export function isValidUuid(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
