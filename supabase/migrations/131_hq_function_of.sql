-- ============================================================================
-- WDOS Migration 131 — hq_function_of(pid): the HQ role of any person, for
-- View as (Phase 171). Same defaults as my_hq_function().
-- ============================================================================
create or replace function public.hq_function_of(pid uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when not is_case_hq() then null else coalesce(p.hq_function,
    case when exists (select 1 from role_assignments ra where ra.profile_id = pid and ra.ends_at is null and ra.role in ('super_admin', 'executive_director')) then 'founder'
         when exists (select 1 from role_assignments ra where ra.profile_id = pid and ra.ends_at is null and ra.role = 'hq_team') then 'hofco'
         else null end) end
  from profiles p where p.id = pid;
$$;
revoke execute on function public.hq_function_of(uuid) from anon;

insert into public.schema_migrations (version, name)
values (131, 'hq_function_of') on conflict (version) do nothing;
