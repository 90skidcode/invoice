ALTER TABLE "invoices" DROP CONSTRAINT "invoices_referred_by_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "referred_by_id" uuid;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_referred_by_id_customers_id_fk" FOREIGN KEY ("referred_by_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "referred_by_id";