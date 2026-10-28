-- ============================================================================
-- WDOS Migration 120 — seat lookup: "Adamawa" vs "Adamawa State", and a
-- unique-name fallback when the country chain does not resolve (Phase 153)
-- -- redefines norm_state
-- -- redefines directory_seat_target
-- ============================================================================
create or replace function public.norm_state(s text) returns text
language sql immutable as $$
  select case
    when lower(coalesce(s, '')) ~ 'fct|abuja|federal capital' then 'fct'
    else regexp_replace(replace(replace(regexp_replace(lower(coalesce(s, '')), '\s*state$', ''), 'nassarawa', 'nasarawa'), 'akwa-ibom', 'akwa ibom'), '[^a-z]', '', 'g') end;
$$;

create or replace function public.directory_seat_target(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  with d as (select *, coalesce(state, nullif(regexp_replace(split_part(member_code, '-', 2), '[^A-Za-z]', '', 'g'), '')) as state_or_code
               from leader_directory where member_code = p_code),
  role as (select case
      when lower(d.role_applied) like 'deputy country%' then 'deputy_country_rep'
      when lower(d.role_applied) like 'country rep%' then 'country_rep'
      when lower(d.role_applied) like 'assistant state%' or lower(d.role_applied) like 'assistant regional%' then 'assistant_state_coordinator'
      when lower(d.role_applied) like 'state coord%' or lower(d.role_applied) like 'regional coord%' then 'state_coordinator'
      when lower(d.role_applied) like 'assistant lga%' or lower(d.role_applied) like 'assistant district%' then 'assistant_district_coordinator'
      when lower(d.role_applied) like 'lga coord%' or lower(d.role_applied) like 'district coord%' then 'district_coordinator'
      else null end as role from d),
  unit as (select case
      when (select role from role) in ('country_rep', 'deputy_country_rep') then
        (select o.id from org_units o, d where o.level = 'country'
           and (norm_country(o.name) = norm_country(d.country)
                or upper(coalesce(o.country_iso, '')) = upper(coalesce((select country_iso from leader_contacts where norm_country(country) = norm_country(d.country) limit 1), ''))
                or upper(coalesce(o.country_iso, '')) = upper(regexp_replace(split_part(d.member_code, '-', 2), '[^A-Za-z]', '', 'g')))
         limit 1)
      when (select role from role) in ('state_coordinator', 'assistant_state_coordinator') then
        coalesce(
          (select o.id from org_units o, d where o.level = 'state_region'
             and norm_state(o.name) = norm_state(d.state_or_code)
             and exists (select 1 from unit_chain(o.id) c where c.level = 'country' and norm_country(c.name) = norm_country(coalesce(d.country, 'Nigeria')))
           limit 1),
          -- fallback: the only state unit anywhere with that name (uuid has no min(); use a counted subquery)
          (select x.id from (select o.id, count(*) over () as n from org_units o, d
                               where o.level = 'state_region' and norm_state(o.name) = norm_state(d.state_or_code)) x
             where x.n = 1 limit 1))
      when (select role from role) in ('district_coordinator', 'assistant_district_coordinator') then
        (select o.id from org_units o, d where o.level = 'district_lga' and d.state is not null and lower(o.name) = lower(d.state) limit 1)
      else null end as id)
  select jsonb_build_object('role', (select role from role), 'unit_id', (select id from unit),
           'unit', (select name from org_units where id = (select id from unit)),
           'state', (select state from d), 'appointed_on', (select appointed_on from d), 'on_hold', (select on_hold from d));
$$;
revoke execute on function public.directory_seat_target(text) from anon;

insert into public.schema_migrations (version, name)
values (120, 'seat_lookup_fallback') on conflict (version) do nothing;
