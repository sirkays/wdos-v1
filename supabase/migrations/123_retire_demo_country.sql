-- ============================================================================
-- WDOS Migration 123 — retire the demo country (Phase 157)
-- "Banana Republic" (migration 080) was a demonstration unit. Its seats end
-- today, its demo profiles lose leader status, and the unit is removed when
-- nothing else references it; otherwise it is renamed so it can never be read
-- as a real country. The 54 real countries are unaffected.
-- ============================================================================
do $$
declare demo uuid;
begin
  select id into demo from org_units where level = 'country' and (name = 'Banana Republic' or country_iso = 'XB') limit 1;
  if demo is null then return; end if;
  update role_assignments set ends_at = now() where org_unit_id in (select id from org_unit_subtree(demo)) and ends_at is null;
  update profiles set is_leader = false where membership_no like 'DEMO-%';
  begin
    delete from org_units where id in (select id from org_unit_subtree(demo)) and id <> demo;
    delete from org_units where id = demo;
  exception when others then
    update org_units set name = 'Demo (retired)', country_iso = null where id = demo;
  end;
end $$;

insert into public.schema_migrations (version, name)
values (123, 'retire_demo_country') on conflict (version) do nothing;
