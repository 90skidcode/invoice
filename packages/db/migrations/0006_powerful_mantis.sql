CREATE TABLE "bom_headers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"finished_item_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"name" varchar(160),
	"output_qty" numeric(14, 3) DEFAULT '1' NOT NULL,
	"output_unit_id" uuid NOT NULL,
	"labor_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"overhead_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
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
CREATE TABLE "bom_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"bom_header_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"raw_item_id" uuid NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"unit_id" uuid NOT NULL,
	"wastage_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bom_headers" ADD CONSTRAINT "bom_headers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_headers" ADD CONSTRAINT "bom_headers_finished_item_id_items_id_fk" FOREIGN KEY ("finished_item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_headers" ADD CONSTRAINT "bom_headers_output_unit_id_units_id_fk" FOREIGN KEY ("output_unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_bom_header_id_bom_headers_id_fk" FOREIGN KEY ("bom_header_id") REFERENCES "public"."bom_headers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_raw_item_id_items_id_fk" FOREIGN KEY ("raw_item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bom_headers_org_idx" ON "bom_headers" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "bom_headers_org_item_idx" ON "bom_headers" USING btree ("org_id","finished_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bom_headers_org_item_version_uq" ON "bom_headers" USING btree ("org_id","finished_item_id","version");--> statement-breakpoint
CREATE INDEX "bom_items_header_idx" ON "bom_items" USING btree ("bom_header_id");