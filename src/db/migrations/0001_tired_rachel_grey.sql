CREATE TYPE "public"."todo_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."todo_status" AS ENUM('pending', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"priority" "todo_priority" DEFAULT 'medium' NOT NULL,
	"status" "todo_status" DEFAULT 'pending' NOT NULL,
	"due_date" date,
	"related_job_id" varchar(100),
	"related_job_number" varchar(100),
	"related_customer_id" varchar(100),
	"related_customer_name" varchar(255),
	"assigned_to" varchar(255),
	"assigned_to_name" varchar(255),
	"created_by" varchar(255) NOT NULL,
	"created_by_name" varchar(255) NOT NULL,
	"completed_at" timestamp with time zone,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_todos_org_id" ON "todos" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_todos_status" ON "todos" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_todos_priority" ON "todos" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "idx_todos_due_date" ON "todos" USING btree ("due_date");