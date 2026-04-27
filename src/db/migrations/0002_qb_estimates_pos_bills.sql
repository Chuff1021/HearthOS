-- Adds local persistence for QuickBooks estimates, purchase orders, and bills
-- so HearthOS can serve all QB data without a live connection.

-- Enums
DO $$ BEGIN
	CREATE TYPE "estimate_status" AS ENUM ('draft', 'pending', 'accepted', 'declined', 'expired', 'converted');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	CREATE TYPE "purchase_order_status" AS ENUM ('open', 'partial', 'closed', 'cancelled');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	CREATE TYPE "bill_status" AS ENUM ('open', 'partial', 'paid', 'overdue', 'void');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- Estimates
CREATE TABLE IF NOT EXISTS "estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid,
	"job_id" uuid,
	"qb_estimate_id" varchar(50),
	"estimate_number" varchar(30),
	"status" "estimate_status" DEFAULT 'pending',
	"issue_date" date,
	"expiration_date" date,
	"accepted_date" date,
	"subtotal" numeric(12, 2) DEFAULT '0',
	"tax_amount" numeric(12, 2) DEFAULT '0',
	"total_amount" numeric(12, 2) DEFAULT '0',
	"customer_memo" text,
	"private_note" text,
	"converted_invoice_id" uuid,
	"email_status" varchar(50),
	"bill_email" varchar(255),
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "estimates_qb_estimate_id_unique" UNIQUE("qb_estimate_id")
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "estimates" ADD CONSTRAINT "estimates_org_id_fk"
		FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "estimates" ADD CONSTRAINT "estimates_customer_id_fk"
		FOREIGN KEY ("customer_id") REFERENCES "customers"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "estimates" ADD CONSTRAINT "estimates_job_id_fk"
		FOREIGN KEY ("job_id") REFERENCES "jobs"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_estimates_org_id" ON "estimates" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_estimates_customer_id" ON "estimates" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_estimates_qb_id" ON "estimates" USING btree ("qb_estimate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_estimates_status" ON "estimates" USING btree ("status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "estimate_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" uuid NOT NULL,
	"qb_item_id" varchar(50),
	"description" text,
	"quantity" numeric(12, 4) DEFAULT '1',
	"unit_price" numeric(12, 4) DEFAULT '0',
	"total" numeric(12, 2) DEFAULT '0',
	"order" integer DEFAULT 0
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "estimate_line_items" ADD CONSTRAINT "eli_estimate_id_fk"
		FOREIGN KEY ("estimate_id") REFERENCES "estimates"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_estimate_line_items_estimate_id" ON "estimate_line_items" USING btree ("estimate_id");--> statement-breakpoint

-- Purchase Orders
CREATE TABLE IF NOT EXISTS "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vendor_id" uuid,
	"qb_purchase_order_id" varchar(50),
	"po_number" varchar(30),
	"status" "purchase_order_status" DEFAULT 'open',
	"issue_date" date,
	"expected_date" date,
	"received_date" date,
	"subtotal" numeric(12, 2) DEFAULT '0',
	"tax_amount" numeric(12, 2) DEFAULT '0',
	"total_amount" numeric(12, 2) DEFAULT '0',
	"ship_address" text,
	"vendor_message" text,
	"private_note" text,
	"email_status" varchar(50),
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "purchase_orders_qb_purchase_order_id_unique" UNIQUE("qb_purchase_order_id")
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "purchase_orders" ADD CONSTRAINT "po_org_id_fk"
		FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "purchase_orders" ADD CONSTRAINT "po_vendor_id_fk"
		FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_purchase_orders_org_id" ON "purchase_orders" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_purchase_orders_vendor_id" ON "purchase_orders" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_purchase_orders_qb_id" ON "purchase_orders" USING btree ("qb_purchase_order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_purchase_orders_status" ON "purchase_orders" USING btree ("status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "purchase_order_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"qb_item_id" varchar(50),
	"qb_account_id" varchar(50),
	"description" text,
	"quantity" numeric(12, 4) DEFAULT '1',
	"unit_cost" numeric(12, 4) DEFAULT '0',
	"total" numeric(12, 2) DEFAULT '0',
	"received_qty" numeric(12, 4) DEFAULT '0',
	"order" integer DEFAULT 0
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "purchase_order_line_items" ADD CONSTRAINT "po_li_po_id_fk"
		FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_po_line_items_po_id" ON "purchase_order_line_items" USING btree ("purchase_order_id");--> statement-breakpoint

-- Bills
CREATE TABLE IF NOT EXISTS "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vendor_id" uuid,
	"qb_bill_id" varchar(50),
	"bill_number" varchar(30),
	"status" "bill_status" DEFAULT 'open',
	"issue_date" date,
	"due_date" date,
	"subtotal" numeric(12, 2) DEFAULT '0',
	"tax_amount" numeric(12, 2) DEFAULT '0',
	"total_amount" numeric(12, 2) DEFAULT '0',
	"balance" numeric(12, 2) DEFAULT '0',
	"private_note" text,
	"payment_terms" varchar(100),
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "bills_qb_bill_id_unique" UNIQUE("qb_bill_id")
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "bills" ADD CONSTRAINT "bills_org_id_fk"
		FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "bills" ADD CONSTRAINT "bills_vendor_id_fk"
		FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_bills_org_id" ON "bills" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bills_vendor_id" ON "bills" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bills_qb_id" ON "bills" USING btree ("qb_bill_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bills_status" ON "bills" USING btree ("status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "bill_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"qb_item_id" varchar(50),
	"qb_account_id" varchar(50),
	"description" text,
	"quantity" numeric(12, 4) DEFAULT '1',
	"unit_cost" numeric(12, 4) DEFAULT '0',
	"amount" numeric(12, 2) DEFAULT '0',
	"billable" boolean DEFAULT false,
	"customer_id" uuid,
	"order" integer DEFAULT 0
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "bill_line_items" ADD CONSTRAINT "bli_bill_id_fk"
		FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "bill_line_items" ADD CONSTRAINT "bli_customer_id_fk"
		FOREIGN KEY ("customer_id") REFERENCES "customers"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_bill_line_items_bill_id" ON "bill_line_items" USING btree ("bill_id");
