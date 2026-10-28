-- ============================================================================
-- WDOS Migration 122 — seat every leader on the two founder lists (Phase 156)
--   The Command Centre counts SEATS (a role at a unit). Leaders who received
--   logins from earlier imports had no seat, so the lists were not reflected.
--   seat_from_lists() reads leader_contacts (Africa CR/DCR) and
--   leader_contacts_ng (Nigeria SC/ASC), finds each person's profile (by the
--   match recorded when the list was applied, else by email, else by name in
--   country), creates the country unit under HQ when it is missing, and seats
--   her with appointment_status 'appointed' dated to her appointment where the
--   list gives one. People already seated in that role are left as they are.
--   Red names (leader_directory.on_hold) are skipped. Returns counts and the
--   names it could not seat (no profile / no login yet).
--   Also: central_admin coverage rule = CR and DCR seated → represented; any
--   leader seated → needs strengthening; none → not yet represented; and
--   vacancies reported by level (country, state, LGA and below).
-- ============================================================================

create or replace function public.ensure_country_unit(p_iso text, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid; hq uuid;
begin
  select id into uid from org_units where level = 'country'
    and (upper(coalesce(country_iso, '')) = upper(p_iso) or norm_country(name) = norm_country(p_name)) limit 1;
  if uid is not null then
    update org_units set country_iso = coalesce(country_iso, upper(p_iso)) where id = uid;
    return uid;
  end if;
  select id into hq from org_units where level = 'headquarters' limit 1;
  insert into org_units (name, level, parent_id, country_iso) values (p_name, 'country', hq, upper(p_iso)) returning id into uid;
  return uid;
end; $$;
revoke execute on function public.ensure_country_unit(text, text) from anon;

create or replace function public.seat_from_lists()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; pid uuid; unit uuid; n_seated int := 0; n_already int := 0; missing jsonb := '[]'::jsonb; held int := 0; w text;
begin
  if auth.uid() is not null and not is_case_hq() then raise exception 'HQ only'; end if;
  perform set_config('statement_timeout', '120s', true);
  -- Africa: CR / DCR
  for r in select c.*, 'af' as src from leader_contacts c
           union all
           select n.id, 'Nigeria', 'NG', n.full_name, n.role, n.email, n.phone, null, n.matched_profile, null, 'ng' from leader_contacts_ng n
           order by 1 loop
    if exists (select 1 from leader_directory d where d.on_hold and (lower(coalesce(d.email, '')) = lower(coalesce(r.email, '')) and r.email is not null
                                                                    or name_match(r.full_name, d.first_name || ' ' || d.last_name))) then
      held := held + 1; continue;
    end if;
    w := lower(split_part(r.full_name, ' ', 1));
    pid := r.matched_profile;
    if pid is null and r.email is not null then select p.id into pid from profiles p where lower(p.email) = lower(r.email) and p.merged_into is null limit 1; end if;
    if pid is null then
      select p.id into pid from profiles p where p.merged_into is null
        and position(w in lower(p.first_name || ' ' || p.last_name)) > 0
        and (r.src = 'ng' and lower(coalesce(p.country, 'nigeria')) = 'nigeria' or r.src = 'af' and norm_country(coalesce(p.country, r.country)) = norm_country(r.country))
        and name_match(r.full_name, p.first_name || ' ' || p.last_name) limit 1;
    end if;
    if pid is null then missing := missing || jsonb_build_object('name', r.full_name, 'role', r.role, 'country', r.country, 'email', r.email); continue; end if;
    -- target unit
    if r.role in ('country_rep', 'deputy_country_rep') then
      unit := ensure_country_unit(r.country_iso, r.country);
    else
      select o.id into unit from org_units o where o.level = 'state_region' and norm_state(o.name) = norm_state((select state from leader_contacts_ng where id = r.id and r.src = 'ng'))
        and exists (select 1 from unit_chain(o.id) c where c.level = 'country' and norm_country(c.name) = 'nigeria') limit 1;
      if unit is null then
        select x.id into unit from (select o.id, count(*) over () as n from org_units o where o.level = 'state_region'
                                      and norm_state(o.name) = norm_state((select state from leader_contacts_ng where id = r.id))) x where x.n = 1 limit 1;
      end if;
    end if;
    if unit is null then missing := missing || jsonb_build_object('name', r.full_name, 'role', r.role, 'country', r.country, 'why', 'no unit'); continue; end if;
    if exists (select 1 from role_assignments ra where ra.profile_id = pid and ra.role = r.role and ra.ends_at is null) then
      n_already := n_already + 1;
    else
      insert into role_assignments (profile_id, role, org_unit_id, assigned_by, appointment_status, starts_at, accepted_at)
      values (pid, r.role, unit, auth.uid(), 'appointed',
              coalesce((select appointed_on from leader_contacts_ng where id = r.id and r.src = 'ng')::timestamptz, now()),
              coalesce((select appointed_on from leader_contacts_ng where id = r.id and r.src = 'ng')::timestamptz, now()));
      n_seated := n_seated + 1;
    end if;
    update profiles set is_leader = true, network = coalesce(network, 'WGMN'), org_unit_id = coalesce(org_unit_id, unit),
           country = coalesce(country, r.country), status = case when status in ('applicant', 'under_review') then 'active' else status end
     where id = pid;
  end loop;
  return jsonb_build_object('seated', n_seated, 'already_seated', n_already, 'on_hold_skipped', held,
                            'not_seated', missing, 'not_seated_count', jsonb_array_length(missing));
end; $$;
revoke execute on function public.seat_from_lists() from anon;

-- redefines central_admin (coverage rule and vacancies by level)
create or replace function public.central_admin(p_net text default 'all')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  net_filter public.network_code := case when upper(coalesce(p_net, 'all')) in ('WGMN', 'WNNN') then upper(p_net)::public.network_code else null end;
  pr record;
begin
  if not is_case_hq() then raise exception 'HQ only'; end if;
  select * into pr from report_period('monthly_leadership', (current_date - interval '1 month')::date);
  return (
    with pm as (select role from position_master),
    -- one row per African country: unit (if any), CR/DCR filled, leaders, members
    ctry as (
      select ac.iso, ac.name,
        (select o.id from org_units o where o.level = 'country' and (upper(o.country_iso) = ac.iso or norm_country(o.name) = norm_country(ac.name)) limit 1) as unit_id
      from africa_countries ac),
    ctry2 as (
      select c.*,
        coalesce((select array_agg(s.id) from org_unit_subtree(c.unit_id) as s(id)), '{}') as scope
      from ctry c),
    ctry3 as (
      select c.iso, c.name, c.unit_id,
        exists (select 1 from role_assignments ra join profiles p on p.id = ra.profile_id
                 where ra.org_unit_id = c.unit_id and ra.role = 'country_rep' and ra.ends_at is null
                   and (net_filter is null or p.network = net_filter)) as cr_filled,
        exists (select 1 from role_assignments ra join profiles p on p.id = ra.profile_id
                 where ra.org_unit_id = c.unit_id and ra.role = 'deputy_country_rep' and ra.ends_at is null
                   and (net_filter is null or p.network = net_filter)) as dcr_filled,
        (select count(distinct ra.profile_id) from role_assignments ra join profiles p on p.id = ra.profile_id
          where ra.org_unit_id = any(c.scope) and ra.ends_at is null and ra.role in (select role from pm)
            and (net_filter is null or p.network = net_filter)) as leaders,
        (select count(distinct ra.profile_id) from role_assignments ra join profiles p on p.id = ra.profile_id
          where ra.org_unit_id = any(c.scope) and ra.ends_at is null and ra.role in (select role from pm)
            and (net_filter is null or p.network = net_filter) and p.last_seen_at > now() - interval '30 days') as active_leaders,
        (select count(*) from org_units s join position_master pm2 on pm2.level = s.level
          where s.id = any(c.scope) and s.level <> 'headquarters') as seats,
        (select count(*) from org_units s join position_master pm2 on pm2.level = s.level
          where s.id = any(c.scope) and s.level <> 'headquarters'
            and exists (select 1 from role_assignments ra join profiles p on p.id = ra.profile_id
                         where ra.org_unit_id = s.id and ra.role = pm2.role and ra.ends_at is null
                           and (net_filter is null or p.network = net_filter))) as filled,
        (select count(*) from profiles p where p.org_unit_id = any(c.scope) and p.merged_into is null
           and p.status not in ('applicant', 'under_review') and (net_filter is null or p.network = net_filter)) as members,
        (select count(*) from org_units s where s.id = any(c.scope) and s.parent_id = c.unit_id) as states,
        (select count(*) from org_units s where s.id = any(c.scope) and s.parent_id = c.unit_id
           and exists (select 1 from role_assignments ra join profiles p on p.id = ra.profile_id
                        where ra.org_unit_id = s.id and ra.ends_at is null and ra.role in (select role from pm)
                          and (net_filter is null or p.network = net_filter))) as states_led,
        (select r.status::text from report_instances r where r.org_unit_id = c.unit_id and r.template = 'monthly_leadership'
           and r.period_start = pr.period_start and r.is_current and (net_filter is null or r.network = net_filter) limit 1) as report_status,
        (select count(*) from programme_events e where e.org_unit_id = any(c.scope) and e.event_date >= current_date - 90) as programmes,
        (select count(*) from meetings m where m.org_unit_id = any(c.scope) and m.starts_at > now() - interval '90 days') as meetings,
        (select count(*) from issues i where i.org_unit_id = any(c.scope) and i.status in ('open', 'in_progress', 'awaiting_decision')) as issues_open
      from ctry2 c),
    ctry4 as (
      select *,
        -- represented = Country Representative AND Deputy seated; needs strengthening =
        -- some leader seated (CR without deputy, or deputy/state leaders without a CR);
        -- not yet represented = nobody seated
        case when unit_id is null or leaders = 0 then 'not_represented'
             when cr_filled and dcr_filled then 'represented'
             else 'needs_strengthening' end as coverage,
        case when seats > 0 then round(100.0 * filled / seats) else null end as coverage_pct
      from ctry3)
    select jsonb_build_object(
      'generated_at', now(), 'network', coalesce(p_net, 'all'),
      'period', jsonb_build_object('start', pr.period_start, 'due', pr.due_on),
      'tiles', jsonb_build_object(
        'countries_total', (select count(*) from ctry4),
        'countries_represented', (select count(*) from ctry4 where coverage = 'represented'),
        'countries_strengthen', (select count(*) from ctry4 where coverage = 'needs_strengthening'),
        'countries_not', (select count(*) from ctry4 where coverage = 'not_represented'),
        'active_leaders', (select count(distinct ra.profile_id) from role_assignments ra join profiles p on p.id = ra.profile_id
                            where ra.ends_at is null and ra.role in (select role from pm) and (net_filter is null or p.network = net_filter)),
        'leaders_active30', (select count(distinct ra.profile_id) from role_assignments ra join profiles p on p.id = ra.profile_id
                            where ra.ends_at is null and ra.role in (select role from pm) and p.last_seen_at > now() - interval '30 days'
                              and (net_filter is null or p.network = net_filter)),
        'positions_total', (select sum(seats) from ctry4), 'positions_filled', (select sum(filled) from ctry4),
        'positions_vacant', (select sum(seats) - sum(filled) from ctry4),
        -- vacancies by level: country seats (CR/DCR of represented+strengthening countries), state seats, LGA and below
        'vacant_country', (select count(*) from ctry4 c where c.unit_id is not null and c.leaders > 0 and not c.cr_filled)
                        + (select count(*) from ctry4 c where c.unit_id is not null and c.leaders > 0 and not c.dcr_filled),
        'vacant_state', (select count(*) from org_units s join position_master pm2 on pm2.level = s.level
                          where s.level = 'state_region'
                            and not exists (select 1 from role_assignments ra join profiles p on p.id = ra.profile_id
                                             where ra.org_unit_id = s.id and ra.role = pm2.role and ra.ends_at is null
                                               and (net_filter is null or p.network = net_filter))),
        'vacant_lower', (select count(*) from org_units s join position_master pm2 on pm2.level = s.level
                          where s.level in ('district_lga', 'community_cluster', 'chapter')
                            and not exists (select 1 from role_assignments ra join profiles p on p.id = ra.profile_id
                                             where ra.org_unit_id = s.id and ra.role = pm2.role and ra.ends_at is null
                                               and (net_filter is null or p.network = net_filter))),
        'state_seats', (select count(*) from org_units s join position_master pm2 on pm2.level = s.level where s.level = 'state_region'),
        'leaders_unverified', (select count(*) from role_assignments ra where ra.ends_at is null and ra.role in (select role from pm) and ra.accepted_at is null and ra.declined_at is null),
        'members', (select count(*) from profiles p where p.merged_into is null and p.status not in ('applicant', 'under_review') and (net_filter is null or p.network = net_filter)),
        'members_wgmn', (select count(*) from profiles p where p.merged_into is null and p.status not in ('applicant', 'under_review') and p.network = 'WGMN'),
        'members_wnnn', (select count(*) from profiles p where p.merged_into is null and p.status not in ('applicant', 'under_review') and p.network = 'WNNN'),
        'reports_due', (select count(*) from role_assignments ra join position_master pm2 on pm2.role = ra.role and pm2.rank = 1
                         join org_units o on o.id = ra.org_unit_id where ra.ends_at is null and o.level <> 'headquarters'),
        'reports_submitted', (select count(*) from report_instances r where r.template = 'monthly_leadership' and r.period_start = pr.period_start and r.is_current
                               and r.status in ('submitted', 'under_review', 'approved', 'escalated', 'closed')),
        'approval_requests', (select count(*) from applications where status in ('submitted', 'under_review', 'recommended'))
                           + (select count(*) from report_instances where status in ('submitted', 'under_review') and is_current)
                           + (select count(*) from role_assignments ra where ra.ends_at is null and ra.appointment_status = 'pending'),
        'programmes_running', (select count(*) from programme_events e where e.event_date between current_date - 30 and current_date + 60)),
      'attention', jsonb_build_object(
        'overdue_tasks', (select count(*) from tasks where status in ('not_started', 'in_progress', 'awaiting_review') and due_on < current_date),
        'missing_reports', (select count(*) from ctry4 c where c.unit_id is not null and c.leaders > 0 and c.report_status is null and pr.due_on < current_date),
        'vacant_roles', (select count(*) from ctry4 c where not c.cr_filled and c.unit_id is not null) + (select count(*) from ctry4 c where not c.dcr_filled and c.unit_id is not null),
        'activation_pending', (select count(*) from activation_journeys where status = 'in_progress'),
        'safeguarding', (select count(*) from cases where status in ('submitted', 'under_review', 'action_taken')),
        'system_alerts', (select count(*) from tickets where status in ('open', 'in_progress') and category in ('technical', 'app_problem', 'login')),
        'countries_attention', (select count(*) from ctry4 where coverage = 'needs_strengthening'),
        'escalations', (select count(*) from report_instances where status = 'escalated' and is_current)
                     + (select count(*) from issues where status in ('open', 'in_progress', 'awaiting_decision') and severity in ('red', 'critical'))),
      'funnel', jsonb_build_object(
        'referred', (select count(*) from referrals where category = 'leadership_candidate'),
        'contacted', (select count(*) from referrals where category = 'leadership_candidate' and status in ('received', 'assigned', 'in_progress', 'closed')),
        'screened', (select count(*) from applications where status in ('under_review', 'recommended', 'approved', 'rejected')),
        'activation', (select count(*) from activation_journeys where status = 'in_progress'),
        'selected', (select count(*) from applications where status = 'approved'),
        'appointment_pending', (select count(*) from role_assignments ra where ra.ends_at is null and ra.role in (select role from pm) and ra.accepted_at is null and ra.declined_at is null),
        'appointed', (select count(*) from role_assignments ra where ra.ends_at is null and ra.role in (select role from pm) and ra.accepted_at is not null)),
      'ladder', (select coalesce(jsonb_agg(jsonb_build_object('role', x.role, 'level', x.level, 'seats', x.seats, 'filled', x.filled) order by x.seq), '[]'::jsonb)
        from (select pm2.role, pm2.level, pm2.seq, count(*) as seats,
                     count(*) filter (where exists (select 1 from role_assignments ra join profiles p on p.id = ra.profile_id
                                                     where ra.org_unit_id = s.id and ra.role = pm2.role and ra.ends_at is null
                                                       and (net_filter is null or p.network = net_filter))) as filled
                from org_units s join position_master pm2 on pm2.level = s.level where s.level <> 'headquarters'
               group by pm2.role, pm2.level, pm2.seq) x),
      'countries', (select coalesce(jsonb_agg(jsonb_build_object('iso', c.iso, 'name', c.name, 'unit_id', c.unit_id, 'coverage', c.coverage,
          'coverage_pct', c.coverage_pct, 'cr', c.cr_filled, 'dcr', c.dcr_filled, 'leaders', c.leaders, 'active_leaders', c.active_leaders,
          'seats', c.seats, 'filled', c.filled, 'members', c.members, 'states', c.states, 'states_led', c.states_led,
          'report_status', c.report_status, 'programmes', c.programmes, 'meetings', c.meetings, 'issues_open', c.issues_open)
          order by (c.coverage = 'represented') desc, c.leaders desc, c.name), '[]'::jsonb) from ctry4 c),
      'approvals', jsonb_build_object(
        'appointments', (select count(*) from role_assignments ra where ra.ends_at is null and ra.role in (select role from pm) and ra.accepted_at is null and ra.declined_at is null),
        'applications', (select count(*) from applications where status in ('submitted', 'under_review', 'recommended')),
        'reports', (select count(*) from report_instances where status in ('submitted', 'under_review') and is_current),
        'replacements', (select count(*) from role_assignments ra where ra.declined_at > now() - interval '90 days'),
        'escalations', (select count(*) from report_instances where status = 'escalated' and is_current)
                     + (select count(*) from issues where status in ('open', 'in_progress', 'awaiting_decision') and severity in ('red', 'critical'))),
      'reporting', (select jsonb_build_object(
          'expected', count(*) filter (where has_leader),
          'submitted', count(*) filter (where st in ('submitted', 'under_review', 'approved', 'escalated', 'closed')),
          'on_time', count(*) filter (where first_at is not null and first_at::date <= pr.due_on),
          'late', count(*) filter (where first_at is not null and first_at::date > pr.due_on),
          'overdue', count(*) filter (where has_leader and st is null and pr.due_on < current_date),
          'evidence_files', (select coalesce(sum(jsonb_array_length(evidence)), 0) from report_instances where is_current))
        from (select o.id,
                exists (select 1 from role_assignments ra join position_master pm2 on pm2.role = ra.role where ra.org_unit_id = o.id and ra.ends_at is null) as has_leader,
                (select r.status::text from report_instances r where r.org_unit_id = o.id and r.template = 'monthly_leadership' and r.period_start = pr.period_start and r.is_current limit 1) as st,
                (select r.first_submitted_at from report_instances r where r.org_unit_id = o.id and r.template = 'monthly_leadership' and r.period_start = pr.period_start and r.is_current limit 1) as first_at
              from org_units o where o.level <> 'headquarters') u),
      'access', (select coalesce(jsonb_agg(jsonb_build_object('role', x.role, 'n', x.n) order by x.n desc), '[]'::jsonb)
        from (select ra.role::text as role, count(distinct ra.profile_id) as n from role_assignments ra
               where ra.ends_at is null and ra.role in ('super_admin', 'executive_director', 'hq_team') group by ra.role) x)
    ));
end; $$;
revoke execute on function public.central_admin(text) from anon;

insert into public.schema_migrations (version, name)
values (122, 'seat_from_lists') on conflict (version) do nothing;
