-- ============================================================================
-- WDOS Migration 136 — network_snapshot(): a cheap hero-panel query (Phase 176)
--
-- Traced cause of the reported slowness: opening the HOFCO screen ran the
-- FULL central_admin() computation three times in one page load — once
-- inside hofco_dashboard(all), and once more each for WGMN and WNNN, purely
-- to fill four numbers and a coverage-only mini map on the two hero panels.
-- central_admin() is expensive by design: it loops over all 54 countries
-- computing leaders/members/states/report-status/programmes/meetings/issues
-- for each (data the hero panel never reads), and its reporting section
-- scans EVERY org unit at every level (state/LGA/cluster/chapter — likely
-- low thousands of rows once the Nigeria structure is filled in), each with
-- several correlated subqueries. Three of those per page load, from
-- multiple HQ people, is a plausible cause of both the slow navigation and
-- the intermittent slow/failed sign-ins (a busy database queues everything,
-- including the login's own profile read).
--
-- network_snapshot(p_net) computes only what a hero panel shows: countries
-- represented / needing strengthening, active leaders (one count, not 54),
-- COUNTRY-level reports outstanding (54 units, not every LGA and chapter),
-- and a coverage-only country list for the mini map (iso + status, nothing
-- else). Nothing here replaces central_admin(); the full breakdown is still
-- computed on the Command Centre and the dedicated network pages, where
-- that detail is actually read.
-- ============================================================================

create or replace function public.network_snapshot(p_net text default 'all')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare net_filter public.network_code := case when upper(coalesce(p_net, 'all')) in ('WGMN', 'WNNN') then upper(p_net)::public.network_code else null end;
  pm_roles text[]; pr record;
begin
  if not is_case_hq() then raise exception 'HQ only'; end if;
  select array_agg(role::text) into pm_roles from position_master;
  select * into pr from report_period('monthly_leadership', (current_date - interval '1 month')::date);
  return (
    with ctry as (
      select ac.iso, ac.name,
        (select o.id from org_units o where o.level = 'country' and (upper(coalesce(o.country_iso, '')) = ac.iso or norm_country(o.name) = norm_country(ac.name)) limit 1) as unit_id
      from africa_countries ac),
    ctry2 as (
      select c.iso, c.unit_id,
        exists (select 1 from role_assignments ra join profiles p on p.id = ra.profile_id where ra.org_unit_id = c.unit_id and ra.role = 'country_rep' and ra.ends_at is null and (net_filter is null or p.network = net_filter)) as cr,
        exists (select 1 from role_assignments ra join profiles p on p.id = ra.profile_id where ra.org_unit_id = c.unit_id and ra.role = 'deputy_country_rep' and ra.ends_at is null and (net_filter is null or p.network = net_filter)) as dcr,
        exists (select 1 from role_assignments ra join profiles p on p.id = ra.profile_id where ra.org_unit_id = any(array(select sub.id from org_unit_subtree(c.unit_id) as sub(id))) and ra.role::text = any(pm_roles) and ra.ends_at is null and (net_filter is null or p.network = net_filter)) as any_leader,
        (select r.status::text from report_instances r where r.org_unit_id = c.unit_id and r.template = 'monthly_leadership' and r.period_start = pr.period_start and r.is_current and (net_filter is null or r.network = net_filter) limit 1) as report_status
      from ctry c where c.unit_id is not null),
    ctry3 as (select *, case when not any_leader then 'not_represented' when cr and dcr then 'represented' else 'needs_strengthening' end as coverage from ctry2)
    select jsonb_build_object(
      'generated_at', now(),
      'tiles', jsonb_build_object(
        'countries_represented', (select count(*) from ctry3 where coverage = 'represented'),
        'countries_strengthen', (select count(*) from ctry3 where coverage = 'needs_strengthening'),
        'leaders_active30', (select count(distinct ra.profile_id) from role_assignments ra join profiles p on p.id = ra.profile_id
                              where ra.ends_at is null and ra.role::text = any(pm_roles) and p.last_seen_at > now() - interval '30 days' and (net_filter is null or p.network = net_filter))),
      'reporting', jsonb_build_object(
        'overdue', (select count(*) from ctry3 where any_leader and report_status is null and pr.due_on < current_date)),
      'countries', (select coalesce(jsonb_agg(jsonb_build_object('iso', iso, 'coverage', coverage)), '[]'::jsonb) from ctry3)
    ));
end; $$;
revoke execute on function public.network_snapshot(text) from anon;

insert into public.schema_migrations (version, name)
values (136, 'network_snapshot') on conflict (version) do nothing;
