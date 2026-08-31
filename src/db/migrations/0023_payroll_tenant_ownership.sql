do $$
begin
  if to_regclass('public.hearth_timesheet_approvals') is not null then
    alter table hearth_timesheet_approvals add column if not exists org_id uuid references organizations(id) on delete cascade;
    update hearth_timesheet_approvals
      set org_id = (select id from organizations where slug = 'default' order by created_at asc limit 1)
      where org_id is null;
    if exists (select 1 from hearth_timesheet_approvals where org_id is null) then
      raise exception 'Cannot assign existing timesheet approvals to the legacy organization';
    end if;
    alter table hearth_timesheet_approvals alter column org_id set not null;
    alter table hearth_timesheet_approvals drop constraint if exists hearth_timesheet_approvals_tech_id_week_start_key;
    create unique index if not exists hearth_timesheet_approvals_org_tech_week_unique
      on hearth_timesheet_approvals (org_id, tech_id, week_start);
  end if;

  if to_regclass('public.hearth_payroll_reports') is not null then
    alter table hearth_payroll_reports add column if not exists org_id uuid references organizations(id) on delete cascade;
    update hearth_payroll_reports
      set org_id = (select id from organizations where slug = 'default' order by created_at asc limit 1)
      where org_id is null;
    if exists (select 1 from hearth_payroll_reports where org_id is null) then
      raise exception 'Cannot assign existing payroll reports to the legacy organization';
    end if;
    alter table hearth_payroll_reports alter column org_id set not null;
    create index if not exists idx_hearth_payroll_reports_org_week
      on hearth_payroll_reports (org_id, week_start, sent_at desc);
  end if;
end $$;
