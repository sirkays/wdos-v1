-- Phase 222 (v85.8) bug sweep, 3 Oct 2026. Applied live through the Supabase connector.
--
-- 1. People directory (#/members) could not open: the app asks the field_members
--    view for country, hq_function, state_region, lga, role_applied and is_leader,
--    which the view never had ("column field_members.hq_function does not exist").
--    The view keeps its 15 columns in the same order and gains these six at the end.
--
-- 2. Command Centre figures that disagreed with each other or counted the wrong thing
--    (central_admin, patched in place so the rest of the function is untouched):
--    a. "Vacant CR / DCR seats" tile said 8 while "Vacant CR / DCR roles" said 16
--       and the Structure page it opens lists 16. The tile now uses the same rule:
--       CR/DCR seats vacant in every country that has a WDOS unit.
--    b. "Reports due (this period)" said 54 (top seats only) while the Reporting
--       card on the same screen expects 59 (units with a seated leader). Both 59 now.
--    c. members_other: members with no network (the strip said 483 = 414 + 68).
--    d. Activation figures still counted the retired 14-day journey
--       (activation_journeys). They now count the live 3-day (ref3) and 7-day
--       (open7) activations in candidate_activations, test candidates excluded:
--       "Activation pending", both funnels' activation stages, review (readiness
--       assessments submitted), referral (registrations through a referral link)
--       and contacted (a candidate email was sent).
--
-- 3. The retired 14-day journey still started automatically for anyone whose
--    profile became 'approved' (journey_autostart). On 2 Oct it opened one for a
--    3-day referral candidate, which would have been marked "lapsed" on 16 Oct.
--    The trigger function is now a no-op. Removing that one stray journey needs
--    the owner's confirmation (see the end of this file).

-- 1 -------------------------------------------------------------------------
create or replace view public.field_members with (security_invoker = true) as
 select p.id, p.membership_no, p.first_name, p.last_name, p.email, p.phone, p.network, p.status,
        p.org_unit_id, p.preferred_locale, p.created_at, p.updated_at, p.birth_date, p.last_seen_at,
        p.merged_into,
        p.country, p.hq_function, p.state_region, p.lga, p.role_applied, p.is_leader
   from profiles p
  where p.merged_into is null
    and not (exists (select 1 from staff s where s.profile_id = p.id and s.is_active));

-- 2 -------------------------------------------------------------------------
do $mig$
declare
  d text := pg_get_functiondef('public.central_admin(text)'::regprocedure);
  n int;
  pairs text[][] := array[
    -- a. vacant CR/DCR tile = same rule as the attention list and the Structure page
    array['(select count(*) from ctry4 c where c.unit_id is not null and c.leaders > 0 and not c.cr_filled)',
          '(select count(*) from ctry4 c where c.unit_id is not null and not c.cr_filled)'],
    array['(select count(*) from ctry4 c where c.unit_id is not null and c.leaders > 0 and not c.dcr_filled)',
          '(select count(*) from ctry4 c where c.unit_id is not null and not c.dcr_filled)'],
    -- b. reports due = units with a seated leader (the Reporting card's "expected")
    array['''reports_due'', (select count(*) from role_assignments ra join position_master pm2 on pm2.role = ra.role and pm2.rank = 1',
          '''reports_due'', (select count(*) from org_units o where o.level <> ''headquarters'' and exists (select 1 from role_assignments ra join position_master pm2 on pm2.role = ra.role'],
    array['join org_units o on o.id = ra.org_unit_id where ra.ends_at is null and o.level <> ''headquarters''),',
          'where ra.org_unit_id = o.id and ra.ends_at is null)),'],
    -- c. members with no network
    array['''members_wnnn'', (select count(*) from profiles p where p.merged_into is null and p.status not in (''applicant'', ''under_review'') and p.network = ''WNNN''),',
          '''members_wnnn'', (select count(*) from profiles p where p.merged_into is null and p.status not in (''applicant'', ''under_review'') and p.network = ''WNNN''), ''members_other'', (select count(*) from profiles p where p.merged_into is null and p.status not in (''applicant'', ''under_review'') and p.network is null),'],
    -- d. live activations instead of the retired 14-day journey
    array['''activation_pending'', (select count(*) from activation_journeys where status = ''in_progress''),',
          '''activation_pending'', (select count(*) from candidate_activations a where a.status = ''in_progress'' and not coalesce(a.is_test, false)),'],
    array['''activation'', (select count(*) from activation_journeys j join profiles p on p.id = j.profile_id where j.status = ''in_progress'' and p.referral_code is not null and (net_filter is null or p.network = net_filter)),',
          '''activation'', (select count(*) from candidate_activations a where a.route = ''ref3'' and a.status = ''in_progress'' and not coalesce(a.is_test, false) and (net_filter is null or a.network = net_filter::text)),'],
    array['''activation'', (select count(*) from activation_journeys j join profiles p on p.id = j.profile_id where j.status = ''in_progress'' and p.referral_code is null and (net_filter is null or p.network = net_filter)),',
          '''activation'', (select count(*) from candidate_activations a where a.route = ''open7'' and a.status = ''in_progress'' and not coalesce(a.is_test, false) and (net_filter is null or a.network = net_filter::text)),'],
    array['''referral'', (select count(*) from referrals r join profiles p on p.id = r.referrer_id where r.category = ''leadership_candidate'' and (net_filter is null or p.network = net_filter))',
          '''referral'', (select count(*) from candidate_activations a where a.route = ''ref3'' and not coalesce(a.is_test, false) and (net_filter is null or a.network = net_filter::text)) + (select count(*) from referrals r join profiles p on p.id = r.referrer_id where r.category = ''leadership_candidate'' and (net_filter is null or p.network = net_filter))'],
    array['''contacted'', (select count(*) from referrals r join profiles p on p.id = r.referrer_id where r.category = ''leadership_candidate'' and r.status in (''received'', ''assigned'', ''in_progress'', ''closed'') and (net_filter is null or p.network = net_filter))',
          '''contacted'', (select count(*) from candidate_activations a where a.route = ''ref3'' and not coalesce(a.is_test, false) and (net_filter is null or a.network = net_filter::text) and exists (select 1 from candidate_comms_log l where l.activation_id = a.id and l.sent)) + (select count(*) from referrals r join profiles p on p.id = r.referrer_id where r.category = ''leadership_candidate'' and r.status in (''received'', ''assigned'', ''in_progress'', ''closed'') and (net_filter is null or p.network = net_filter))'],
    array['''review'', (select count(*) from applications where referral_code is not null and status in (''under_review'', ''recommended'') and (net_filter is null or network = net_filter)),',
          '''review'', (select count(*) from readiness_assessments r join candidate_activations a on a.id = r.activation_id where a.route = ''ref3'' and r.status = ''submitted'' and not coalesce(a.is_test, false) and (net_filter is null or a.network = net_filter::text)) + (select count(*) from applications where referral_code is not null and status in (''under_review'', ''recommended'') and (net_filter is null or network = net_filter)),'],
    array['''review'', (select count(*) from applications where referral_code is null and status in (''under_review'', ''recommended'') and (net_filter is null or network = net_filter)),',
          '''review'', (select count(*) from readiness_assessments r join candidate_activations a on a.id = r.activation_id where a.route = ''open7'' and r.status = ''submitted'' and not coalesce(a.is_test, false) and (net_filter is null or a.network = net_filter::text)) + (select count(*) from applications where referral_code is null and status in (''under_review'', ''recommended'') and (net_filter is null or network = net_filter)),']
  ];
  i int;
begin
  for i in 1 .. array_length(pairs, 1) loop
    n := (length(d) - length(replace(d, pairs[i][1], ''))) / length(pairs[i][1]);
    if n <> 1 then raise exception 'central_admin patch % matched % times', i, n; end if;
    d := replace(d, pairs[i][1], pairs[i][2]);
  end loop;
  execute d;
end $mig$;

-- 3 -------------------------------------------------------------------------
create or replace function public.journey_autostart()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- Phase 222: the 14-day activation journey is retired (candidates now take the
  -- 3-day or 7-day activation in candidate_activations). Approval no longer opens one.
  return new;
end; $function$;

-- NOT YET RUN: the connector refuses deletes without the owner's confirmation.
-- Run once approved (it touches only that one empty journey row):
-- delete from activation_journeys j
--  where j.id = 'd0753481-b48f-4abd-8b37-666b476339c1'
--    and j.status = 'in_progress'
--    and not exists (select 1 from activation_progress x where x.journey_id = j.id)
--    and not exists (select 1 from activation_item_responses x where x.journey_id = j.id)
--    and not exists (select 1 from activation_observations x where x.journey_id = j.id);

insert into schema_migrations (version, name) values (172, 'bug_sweep_command_centre_and_people_directory')
  on conflict do nothing;

select public.dashboard_cache_refresh_all();
