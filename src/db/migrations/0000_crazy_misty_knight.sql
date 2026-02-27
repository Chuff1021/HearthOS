CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('scheduled', 'in_progress', 'completed', 'cancelled', 'on_hold');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('installation', 'service', 'inspection', 'cleaning', 'repair', 'estimate');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'partial', 'paid', 'overdue');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'dispatcher', 'technician', 'customer');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid,
	"old_value" jsonb,
	"new_value" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "checklist_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"job_type" "job_type",
	"items" jsonb NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"qb_customer_id" varchar(50),
	"user_id" uuid,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"company_name" varchar(255),
	"email" varchar(255),
	"phone" varchar(20),
	"phone_alt" varchar(20),
	"source" varchar(50),
	"tags" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"is_active" boolean DEFAULT true,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "customers_qb_customer_id_unique" UNIQUE("qb_customer_id")
);
--> statement-breakpoint
CREATE TABLE "fireplace_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"nickname" varchar(100),
	"brand" varchar(100) NOT NULL,
	"model" varchar(100),
	"serial_number" varchar(100),
	"fuel_type" varchar(50),
	"install_date" date,
	"last_service_date" date,
	"next_service_date" date,
	"warranty_expires" date,
	"location" varchar(100),
	"notes" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"qb_item_id" varchar(50),
	"name" varchar(255) NOT NULL,
	"sku" varchar(100),
	"description" text,
	"category" varchar(100),
	"unit_price" numeric(10, 2),
	"cost" numeric(10, 2),
	"quantity_on_hand" integer DEFAULT 0,
	"reorder_level" integer,
	"location" varchar(100),
	"is_active" boolean DEFAULT true,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoice_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"qb_item_id" varchar(50),
	"description" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"job_id" uuid,
	"customer_id" uuid NOT NULL,
	"invoice_number" varchar(20) NOT NULL,
	"qb_invoice_id" varchar(50),
	"status" "invoice_status" DEFAULT 'draft',
	"issue_date" date NOT NULL,
	"due_date" date,
	"subtotal" numeric(10, 2) NOT NULL,
	"tax_amount" numeric(10, 2) DEFAULT '0',
	"total_amount" numeric(10, 2) NOT NULL,
	"balance" numeric(10, 2) NOT NULL,
	"notes" text,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "invoices_qb_invoice_id_unique" UNIQUE("qb_invoice_id")
);
--> statement-breakpoint
CREATE TABLE "job_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"technician_id" uuid NOT NULL,
	"is_lead" boolean DEFAULT false,
	"assigned_at" timestamp with time zone DEFAULT now(),
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "job_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checklist_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"is_completed" boolean DEFAULT false,
	"completed_at" timestamp with time zone,
	"notes" text,
	"photo_url" text
);
--> statement-breakpoint
CREATE TABLE "job_checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"template_id" uuid,
	"completed_at" timestamp with time zone,
	"completed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "job_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"content" text NOT NULL,
	"is_internal" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "job_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"url" text NOT NULL,
	"caption" varchar(255),
	"photo_type" varchar(50),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "job_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"signer_name" varchar(100) NOT NULL,
	"signer_role" varchar(50),
	"signature_url" text NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"property_id" uuid,
	"fireplace_unit_id" uuid,
	"job_number" varchar(20) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"job_type" "job_type" NOT NULL,
	"status" "job_status" DEFAULT 'scheduled',
	"priority" "priority" DEFAULT 'normal',
	"scheduled_date" date,
	"scheduled_time_start" time,
	"scheduled_time_end" time,
	"estimated_duration" integer,
	"actual_duration" integer,
	"completed_at" timestamp with time zone,
	"total_amount" numeric(10, 2) DEFAULT '0',
	"invoice_id" uuid,
	"qb_invoice_id" varchar(50),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "manual_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manual_id" uuid NOT NULL,
	"page_start" integer NOT NULL,
	"page_end" integer,
	"title" varchar(255),
	"snippet" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "manuals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"brand" varchar(100) NOT NULL,
	"model" varchar(100) NOT NULL,
	"type" varchar(100),
	"category" varchar(100),
	"url" text NOT NULL,
	"pages" integer,
	"source" varchar(50) DEFAULT 'url',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"phone" varchar(20),
	"email" varchar(255),
	"address" text,
	"logo_url" text,
	"timezone" varchar(50) DEFAULT 'America/New_York',
	"settings" jsonb DEFAULT '{}'::jsonb,
	"subscription_tier" varchar(50) DEFAULT 'starter',
	"qb_realm_id" varchar(50),
	"qb_access_token" text,
	"qb_refresh_token" text,
	"qb_token_expires_at" timestamp,
	"qb_connected" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"qb_payment_id" varchar(50),
	"amount" numeric(10, 2) NOT NULL,
	"payment_method" varchar(50),
	"check_number" varchar(50),
	"transaction_id" varchar(100),
	"paid_at" timestamp with time zone DEFAULT now(),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"nickname" varchar(100),
	"address" text NOT NULL,
	"city" varchar(100) NOT NULL,
	"state" varchar(2) NOT NULL,
	"zip" varchar(10) NOT NULL,
	"lat" numeric(10, 7),
	"lng" numeric(10, 7),
	"access_notes" text,
	"is_primary" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "qb_sync_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sync_type" varchar(50) NOT NULL,
	"last_sync_at" timestamp with time zone,
	"status" varchar(20) NOT NULL,
	"records_processed" integer DEFAULT 0,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "service_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"fireplace_unit_id" uuid,
	"name" varchar(100) NOT NULL,
	"frequency" varchar(20) NOT NULL,
	"next_service_date" date,
	"price" numeric(10, 2),
	"is_active" boolean DEFAULT true,
	"start_date" date,
	"end_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(20),
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"role" "user_role" NOT NULL,
	"avatar_url" text,
	"password_hash" text,
	"is_active" boolean DEFAULT true,
	"last_login_at" timestamp with time zone,
	"push_token" text,
	"preferences" jsonb DEFAULT '{}'::jsonb,
	"tech_color" varchar(7),
	"tech_skills" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fireplace_units" ADD CONSTRAINT "fireplace_units_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fireplace_units" ADD CONSTRAINT "fireplace_units_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_technician_id_users_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_checklist_items" ADD CONSTRAINT "job_checklist_items_checklist_id_job_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."job_checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_checklists" ADD CONSTRAINT "job_checklists_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_checklists" ADD CONSTRAINT "job_checklists_template_id_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_checklists" ADD CONSTRAINT "job_checklists_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_notes" ADD CONSTRAINT "job_notes_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_notes" ADD CONSTRAINT "job_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_signatures" ADD CONSTRAINT "job_signatures_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_fireplace_unit_id_fireplace_units_id_fk" FOREIGN KEY ("fireplace_unit_id") REFERENCES "public"."fireplace_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_sections" ADD CONSTRAINT "manual_sections_manual_id_manuals_id_fk" FOREIGN KEY ("manual_id") REFERENCES "public"."manuals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manuals" ADD CONSTRAINT "manuals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qb_sync_status" ADD CONSTRAINT "qb_sync_status_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_fireplace_unit_id_fireplace_units_id_fk" FOREIGN KEY ("fireplace_unit_id") REFERENCES "public"."fireplace_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_logs_org_id" ON "audit_logs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_entity" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_customers_org_id" ON "customers" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_customers_qb_id" ON "customers" USING btree ("qb_customer_id");--> statement-breakpoint
CREATE INDEX "idx_fireplace_units_property_id" ON "fireplace_units" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "idx_fireplace_units_org_id" ON "fireplace_units" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_items_org_id" ON "inventory_items" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_items_qb_id" ON "inventory_items" USING btree ("qb_item_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_line_items_invoice_id" ON "invoice_line_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_org_id" ON "invoices" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_customer_id" ON "invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_job_id" ON "invoices" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_status" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_job_assignments_job_id" ON "job_assignments" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_job_assignments_technician_id" ON "job_assignments" USING btree ("technician_id");--> statement-breakpoint
CREATE INDEX "idx_job_checklist_items_checklist_id" ON "job_checklist_items" USING btree ("checklist_id");--> statement-breakpoint
CREATE INDEX "idx_job_checklists_job_id" ON "job_checklists" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_job_notes_job_id" ON "job_notes" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_job_photos_job_id" ON "job_photos" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_org_id" ON "jobs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_customer_id" ON "jobs" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_status" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_jobs_scheduled_date" ON "jobs" USING btree ("scheduled_date");--> statement-breakpoint
CREATE INDEX "idx_manual_sections_manual_id" ON "manual_sections" USING btree ("manual_id");--> statement-breakpoint
CREATE INDEX "idx_manual_sections_page" ON "manual_sections" USING btree ("page_start");--> statement-breakpoint
CREATE INDEX "idx_manuals_org_id" ON "manuals" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_manuals_brand" ON "manuals" USING btree ("brand");--> statement-breakpoint
CREATE INDEX "idx_manuals_model" ON "manuals" USING btree ("model");--> statement-breakpoint
CREATE INDEX "idx_manuals_category" ON "manuals" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_payments_org_id" ON "payments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_payments_invoice_id" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_properties_customer_id" ON "properties" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_properties_org_id" ON "properties" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_qb_sync_status_org_id" ON "qb_sync_status" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_qb_sync_status_org_type" ON "qb_sync_status" USING btree ("org_id","sync_type");--> statement-breakpoint
CREATE INDEX "idx_service_plans_customer_id" ON "service_plans" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_users_org_id" ON "users" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "users" USING btree ("role");