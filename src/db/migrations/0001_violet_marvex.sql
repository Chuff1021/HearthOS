-- Vendors table: persists QuickBooks vendor data locally so HearthOS can serve vendor info
-- without an active QB connection. Mirrors the customers table pattern.
CREATE TABLE IF NOT EXISTS "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"qb_vendor_id" varchar(50),
	"display_name" varchar(255) NOT NULL,
	"company_name" varchar(255),
	"first_name" varchar(100),
	"last_name" varchar(100),
	"email" varchar(255),
	"phone" varchar(20),
	"phone_alt" varchar(20),
	"website" varchar(255),
	"address_line1" text,
	"address_line2" text,
	"city" varchar(100),
	"state" varchar(2),
	"zip" varchar(10),
	"account_number" varchar(100),
	"tax_id" varchar(50),
	"is_1099" boolean DEFAULT false,
	"payment_terms" varchar(100),
	"category" varchar(100),
	"notes" text,
	"balance" numeric(12, 2) DEFAULT '0',
	"is_active" boolean DEFAULT true,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "vendors_qb_vendor_id_unique" UNIQUE("qb_vendor_id")
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "vendors"
		ADD CONSTRAINT "vendors_org_id_organizations_id_fk"
		FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id")
		ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_vendors_org_id" ON "vendors" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vendors_qb_id" ON "vendors" USING btree ("qb_vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vendors_display_name" ON "vendors" USING btree ("display_name");
