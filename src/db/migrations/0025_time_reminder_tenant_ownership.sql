do $$
begin
  if to_regclass('public.hearth_time_reminders') is not null then
    alter table hearth_time_reminders add column if not exists org_id uuid references organizations(id) on delete cascade;
    update hearth_time_reminders
      set org_id = (select id from organizations where slug = 'default' order by created_at asc limit 1)
      where org_id is null;
    if exists (select 1 from hearth_time_reminders where org_id is null) then
      raise exception 'Cannot assign existing time reminders to the legacy organization';
    end if;
    alter table hearth_time_reminders alter column org_id set not null;
    create index if not exists idx_hearth_time_reminders_org_created
      on hearth_time_reminders (org_id, created_at desc);
  end if;
end $$;
