-- ════════════════════════════════════════════════════════════════════════════
-- Counter database guards — enforce sacred rules at the DB level (CLAUDE.md §1).
-- These cannot be expressed in the Drizzle schema, so they live in this custom
-- migration. They are defense-in-depth: the app must also honor them.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── §1.3 Stock ledger is append-only ────────────────────────────────────────
-- Reject UPDATE and DELETE on stock_ledger. Corrections are compensating INSERTs.
CREATE OR REPLACE FUNCTION counter_reject_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only; % is not permitted (CLAUDE.md sec 1.3)',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER stock_ledger_no_update
  BEFORE UPDATE ON "stock_ledger"
  FOR EACH ROW EXECUTE FUNCTION counter_reject_mutation();
--> statement-breakpoint

CREATE TRIGGER stock_ledger_no_delete
  BEFORE DELETE ON "stock_ledger"
  FOR EACH ROW EXECUTE FUNCTION counter_reject_mutation();
--> statement-breakpoint

-- ─── §1.8 Audit log is append-only ────────────────────────────────────────────
CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION counter_reject_mutation();
--> statement-breakpoint

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION counter_reject_mutation();
--> statement-breakpoint

-- ─── §1.7 Period locks must be respected ──────────────────────────────────────
-- Reject INSERT/UPDATE on transactional tables when the row's business date
-- falls on or before an active period lock for that org.
CREATE OR REPLACE FUNCTION counter_check_period_lock()
RETURNS trigger AS $$
DECLARE
  v_txn_date date;
  v_lock_date date;
BEGIN
  IF TG_TABLE_NAME = 'invoices' THEN
    v_txn_date := NEW.invoice_date;
  ELSIF TG_TABLE_NAME = 'purchase_invoices' THEN
    v_txn_date := NEW.voucher_date;
  ELSIF TG_TABLE_NAME = 'payments' THEN
    v_txn_date := NEW.payment_date;
  ELSIF TG_TABLE_NAME = 'stock_adjustments' THEN
    v_txn_date := NEW.adjustment_date;
  ELSIF TG_TABLE_NAME = 'stock_transfers' THEN
    v_txn_date := NEW.transfer_date;
  ELSE
    RETURN NEW;
  END IF;

  SELECT pl.lock_through_date INTO v_lock_date
  FROM period_locks pl
  WHERE pl.org_id = NEW.org_id
    AND pl.unlocked_at IS NULL
    AND v_txn_date <= pl.lock_through_date
  ORDER BY pl.lock_through_date DESC
  LIMIT 1;

  IF v_lock_date IS NOT NULL THEN
    RAISE EXCEPTION 'Period locked through % — % dated % not allowed (CLAUDE.md sec 1.7)',
      v_lock_date, TG_TABLE_NAME, v_txn_date
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER invoices_period_lock
  BEFORE INSERT OR UPDATE ON "invoices"
  FOR EACH ROW EXECUTE FUNCTION counter_check_period_lock();
--> statement-breakpoint

CREATE TRIGGER purchase_invoices_period_lock
  BEFORE INSERT OR UPDATE ON "purchase_invoices"
  FOR EACH ROW EXECUTE FUNCTION counter_check_period_lock();
--> statement-breakpoint

CREATE TRIGGER payments_period_lock
  BEFORE INSERT OR UPDATE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION counter_check_period_lock();
--> statement-breakpoint

CREATE TRIGGER stock_adjustments_period_lock
  BEFORE INSERT OR UPDATE ON "stock_adjustments"
  FOR EACH ROW EXECUTE FUNCTION counter_check_period_lock();
--> statement-breakpoint

CREATE TRIGGER stock_transfers_period_lock
  BEFORE INSERT OR UPDATE ON "stock_transfers"
  FOR EACH ROW EXECUTE FUNCTION counter_check_period_lock();
