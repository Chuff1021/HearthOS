-- Additive only. Rehearse this file on an isolated database before production.
BEGIN;
CREATE TABLE IF NOT EXISTS hearth_service_reports (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  job_id text NOT NULL,
  customer_id text NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  template_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized')),
  data jsonb NOT NULL,
  snapshot jsonb,
  pdf_key text,
  pdf_checksum text,
  created_by uuid NOT NULL REFERENCES users(id),
  finalized_by uuid REFERENCES users(id),
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id,id),
  CHECK (status <> 'finalized' OR (snapshot IS NOT NULL AND pdf_key IS NOT NULL AND finalized_by IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS service_reports_job_idx ON hearth_service_reports(org_id,job_id,created_at DESC);
CREATE INDEX IF NOT EXISTS service_reports_customer_idx ON hearth_service_reports(org_id,customer_id,created_at DESC);
CREATE TABLE IF NOT EXISTS hearth_service_report_photos (
  org_id uuid NOT NULL,
  report_id uuid NOT NULL,
  id uuid NOT NULL,
  slot_id text NOT NULL,
  caption text NOT NULL,
  object_key text NOT NULL,
  checksum text NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id,report_id,id),
  FOREIGN KEY (org_id,report_id) REFERENCES hearth_service_reports(org_id,id)
);
CREATE TABLE IF NOT EXISTS hearth_service_report_delivery (
  org_id uuid NOT NULL,
  report_id uuid NOT NULL,
  action_id uuid NOT NULL,
  recipient text NOT NULL,
  status text NOT NULL CHECK (status IN ('sending','accepted','uncertain','failed')),
  requested_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id,action_id),
  FOREIGN KEY (org_id,report_id) REFERENCES hearth_service_reports(org_id,id)
);
COMMIT;
