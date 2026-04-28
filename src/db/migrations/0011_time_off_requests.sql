-- Persist time-off requests in Postgres so submissions from the tech app
-- actually reach the admin's approval queue. Previous JSON-file store doesn't
-- survive across Vercel lambda invocations.

create table if not exists time_off_requests (
  id           text primary key,
  tech_id      text not null,
  tech_name    text,
  type         varchar(50) not null,
  start_date   date not null,
  end_date     date not null,
  reason       text,
  status       varchar(20) not null default 'pending',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists idx_time_off_requests_status on time_off_requests (status);
create index if not exists idx_time_off_requests_tech_id on time_off_requests (tech_id);
create index if not exists idx_time_off_requests_created on time_off_requests (created_at);
