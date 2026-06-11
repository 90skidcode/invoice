CREATE TABLE "production_order_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"production_order_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"line_type" varchar(12) NOT NULL,
	"item_id" uuid NOT NULL,
	"item_name_snapshot" varchar(160),
	"qty" numeric(14, 4) NOT NULL,
	"unit_id" uuid,
	"rate" numeric(14, 4) DEFAULT '0' NOT NULL,
	"value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"location_id" uuid,
	"batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"voucher_no" varchar(40) NOT NULL,
	"production_date" date NOT NULL,
	"bom_header_id" uuid NOT NULL,
	"finished_item_id" uuid NOT NULL,
	"planned_qty" numeric(14, 3) NOT NULL,
	"produced_qty" numeric(14, 3) NOT NULL,
	"location_id" uuid NOT NULL,
	"total_material_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"labor_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"overhead_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cost_per_unit" numeric(14, 4) DEFAULT '0' NOT NULL,
	"status" varchar(20) DEFAULT 'completed' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"row_version" bigint DEFAULT 1 NOT NULL,
	"sync_status" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "production_order_lines" ADD CONSTRAINT "production_order_lines_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_lines" ADD CONSTRAINT "production_order_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_lines" ADD CONSTRAINT "production_order_lines_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_lines" ADD CONSTRAINT "production_order_lines_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_bom_header_id_bom_headers_id_fk" FOREIGN KEY ("bom_header_id") REFERENCES "public"."bom_headers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_finished_item_id_items_id_fk" FOREIGN KEY ("finished_item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_order_lines_order_idx" ON "production_order_lines" USING btree ("production_order_id");--> statement-breakpoint
CREATE INDEX "production_orders_org_idx" ON "production_orders" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "production_orders_org_date_idx" ON "production_orders" USING btree ("org_id","production_date");--> statement-breakpoint
CREATE INDEX "production_orders_org_item_idx" ON "production_orders" USING btree ("org_id","finished_item_id");