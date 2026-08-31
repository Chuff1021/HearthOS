-- Prepare row-level security policies without enabling them yet. Application
-- scoping and clone verification must pass before the restricted production
-- role is switched to RLS-enforced tables.

do $$
declare
  tenant_table record;
begin
  for tenant_table in
    select table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'org_id'
      and table_name <> 'organizations'
  loop
    execute format('drop policy if exists hearthos_tenant_isolation on %I', tenant_table.table_name);
    execute format(
      'create policy hearthos_tenant_isolation on %I using (org_id = nullif(current_setting(''app.current_org_id'', true), '''')::uuid) with check (org_id = nullif(current_setting(''app.current_org_id'', true), '''')::uuid)',
      tenant_table.table_name
    );
  end loop;
end $$;
