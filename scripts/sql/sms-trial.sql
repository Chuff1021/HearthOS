BEGIN;
CREATE TABLE IF NOT EXISTS hearth_sms_trial (
  org_id uuid PRIMARY KEY REFERENCES organizations(id),
  enabled boolean NOT NULL DEFAULT false,
  customer_id uuid REFERENCES customers(id),
  job_id text UNIQUE REFERENCES hearth_jobs_store(id),
  employee_id uuid REFERENCES users(id),
  recipient text NOT NULL,
  consent_note text NOT NULL,
  departed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS hearth_sms_messages (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES hearth_sms_trial(org_id),
  job_id text NOT NULL REFERENCES hearth_jobs_store(id),
  event text NOT NULL CHECK (event IN ('scheduled','on_my_way')),
  template text NOT NULL,
  recipient text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','accepted','sent','delivered','failed','undelivered','unknown')),
  provider_id text UNIQUE,
  error_code text,
  employee_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  attempted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,job_id,event)
);
CREATE INDEX IF NOT EXISTS hearth_sms_messages_org_created ON hearth_sms_messages(org_id,created_at);
REVOKE ALL ON hearth_sms_trial, hearth_sms_messages FROM PUBLIC;
COMMIT;
