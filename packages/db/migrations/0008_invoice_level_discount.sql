-- Add invoice-level discount support (pre-tax model)
-- Allows discounts to be applied at invoice level, reducing the taxable base

-- Add columns to invoices table for invoice-level discount
ALTER TABLE "invoices" ADD COLUMN "invoice_discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "invoices" ADD COLUMN "invoice_discount_amt" numeric(14, 2) DEFAULT '0' NOT NULL;
--> statement-breakpoint

-- Add discount_type support to invoice_lines table for future enhancement
-- (allows per-line selection of percentage vs. flat amount discounts)
ALTER TABLE "invoice_lines" ADD COLUMN "discount_type" varchar(10) DEFAULT 'pct' NOT NULL CHECK ("discount_type" IN ('pct', 'amt'));
--> statement-breakpoint

-- Create indexes for discount queries
CREATE INDEX "invoices_org_discount_idx" ON "invoices" USING btree ("org_id") WHERE "invoice_discount_amt" > '0';
