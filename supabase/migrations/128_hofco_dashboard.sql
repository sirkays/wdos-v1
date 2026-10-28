-- ============================================================================
-- WDOS Migration 128 — HQ functions and the HOFCO dashboard bundle (Phase 165)
--   • profiles.hq_function: which of the founder's nine HQ roles a Headquarters
--     member holds (founder, hofco, secretary, admin, programmes, comms,
--     finance, it, qa). Drives the sidebar and the opening screen. Set from
--     Accounts. Defaults: super_admin / executive_director → founder,
--     hq_team → hofco (until HQ sets it).
--   • hofco_dashboard(p_net, p_period): Reference Screen 1 as specified —
--     row 1 overview tiles, row 2 Attention Required (issue · network ·
--     country · level · owner · priority · deadline · action), row 3 My Work
--     Queue, row 4 WGMN/WNNN performance, row 5 country performance table,
--     row 6 engagement summary, row 7 reporting & evidence, row 8 activities,
--     row 9 recent network activity. Built on central_admin() so every figure
--     shares the same rules as the Command Centre and the module screens.
-- ============================================================================

alter table public.profiles add column if not exists hq_function text
  check (hq_function is null or hq_function in ('founder', 'hofco', 'secretary', 'admin', 'programmes', 'comms', 'finance', 'it', 'qa'));

create or replace function public.hq_set_function(pid uuid, fn text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_case_hq() then raise exception 'HQ only'; end if;
  update profiles set hq_function = nullif(fn, '') where id = pid;
end; $$;
revoke execute on function public.hq_set_function(uuid, text) from anon;

create or replace function public.my_hq_function()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(p.hq_function,
    case when exists (select 1 from role_assignments ra where ra.profile_id = auth.uid() and ra.ends_at is null and ra.role in ('super_admin', 'executive_director')) then 'founder'
         when exists (select 1 from role_assignments ra where ra.profile_id = auth.uid() and ra.ends_at is null and ra.role = 'hq_team') then 'hofco'
         else null end)
  from profiles p where p.id = auth.uid();
$$;

create or replace function public.hofco_dashboard(p_net text default 'all', p_period text default 'month')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare base jsonb; since timestamptz; pm_roles text[]; pr record;
  net_filter public.network_code := case when upper(coalesce(p_net, 'all')) in ('WGMN', 'WNNN') then upper(p_net)::public.network_code else null end;
begin
  if not is_case_hq() then raise exception 'HQ only'; end if;
  base := central_admin(p_net);
  since := case p_period when 'today' then date_trunc('day', now()) when 'week' then date_trunc('week', now())
                         when 'quarter' then date_trunc('quarter', now()) when 'ytd' then date_trunc('year', now())
                         else date_trunc('month', now()) end;
  select array_agg(role::text) into pm_roles from position_master;
  select * into pr from report_period('monthly_leadership', (current_date - interval '1 month')::date);
  return base || jsonb_build_object(
    'period', jsonb_build_object('key', p_period, 'since', since, 'report_due', pr.due_on),
    'tiles2', jsonb_build_object(
      'countries_operational', (base->'tiles'->>'countries_represented')::int + (base->'tiles'->>'countries_strengthen')::int,
      'coverage_pct', (select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where filled) / count(*)) end
                       from (select exists (select 1 from role_assignments ra join profiles p on p.id = ra.profile_id
                                            where ra.org_unit_id = s.id and ra.role = pm.role and ra.ends_at is null and (net_filter is null or p.network = net_filter)) as filled
                             from org_units s join position_master pm on pm.level = s.level where s.level in ('country', 'state_region')) x),
      'active_leaders', (base->'tiles'->>'leaders_active30')::int,
      'priority_vacancies', (base->'tiles'->>'vacant_country')::int + (base->'tiles'->>'vacant_state')::int,
      'reports_outstanding', (base->'reporting'->>'overdue')::int,
      'activities_period', (select count(*) from activity_records a where a.occurred_at >= since)
                         + (select count(*) from programme_events e where e.event_date >= since::date and e.event_date <= current_date)),
    -- ROW 2 · Attention Required, ordered critical → normal
    'attention_items', (select coalesce(jsonb_agg(x order by x->>'rank', x->>'deadline'), '[]'::jsonb) from (
      select jsonb_build_object('rank', '1', 'issue', 'vacant_cr', 'network', coalesce(p_net, 'all'), 'country', c.name, 'level', 'country', 'owner', 'HOFCO', 'priority', 'critical',
                                'deadline', null, 'href', '#/country/' || c.unit_id) as x
        from (select ac.name, o.id as unit_id from africa_countries ac join org_units o on o.level = 'country' and (upper(o.country_iso) = ac.iso or norm_country(o.name) = norm_country(ac.name))) c
       where exists (select 1 from role_assignments ra where ra.org_unit_id in (select sub.id from org_unit_subtree(c.unit_id) as sub(id)) and ra.ends_at is null and ra.role::text = any(pm_roles))
         and not exists (select 1 from role_assignments ra where ra.org_unit_id = c.unit_id and ra.role = 'country_rep' and ra.ends_at is null)
      union all
      select jsonb_build_object('rank', '2', 'issue', 'cr_inactive', 'network', p.network, 'country', p.country, 'level', 'country', 'owner', p.first_name || ' ' || p.last_name, 'priority', 'high',
                                'deadline', null, 'href', '#/view-as/' || p.id)
        from role_assignments ra join profiles p on p.id = ra.profile_id
       where ra.ends_at is null and ra.role = 'country_rep' and (net_filter is null or p.network = net_filter)
         and (p.last_seen_at is null or p.last_seen_at < now() - interval '30 days')
      union all
      select jsonb_build_object('rank', '2', 'issue', 'report_overdue', 'network', r.network, 'country', (select c.name from unit_chain(r.org_unit_id) c where c.level = 'country' limit 1),
                                'level', (select o.level from org_units o where o.id = r.org_unit_id), 'owner', (select o.name from org_units o where o.id = r.org_unit_id), 'priority', 'high',
                                'deadline', r.due_on, 'href', '#/reporting/report/' || r.id)
        from report_instances r where r.is_current and r.status in ('draft', 'returned') and r.due_on < current_date and (net_filter is null or r.network = net_filter)
      union all
      select jsonb_build_object('rank', '3', 'issue', 'task_overdue', 'network', p.network, 'country', p.country, 'level', 'task', 'owner', p.first_name || ' ' || p.last_name, 'priority', 'medium',
                                'deadline', t.due_on, 'href', '#/tasks')
        from tasks t join profiles p on p.id = t.assigned_to
       where t.status in ('not_started', 'in_progress', 'awaiting_review') and t.due_on < current_date and (net_filter is null or p.network = net_filter)
      union all
      select jsonb_build_object('rank', '3', 'issue', 'activation_stalled', 'network', p.network, 'country', p.country, 'level', 'candidate', 'owner', p.first_name || ' ' || p.last_name, 'priority', 'medium',
                                'deadline', j.due_at::date, 'href', '#/recruitment')
        from activation_journeys j join profiles p on p.id = j.profile_id
       where j.status = 'in_progress' and j.due_at < now() and (net_filter is null or p.network = net_filter)
      union all
      select jsonb_build_object('rank', '3', 'issue', 'appointment_pending', 'network', p.network, 'country', p.country, 'level', ra.role::text, 'owner', p.first_name || ' ' || p.last_name, 'priority', 'medium',
                                'deadline', (ra.starts_at + interval '14 days')::date, 'href', '#/accounts?f=pending')
        from role_assignments ra join profiles p on p.id = ra.profile_id
       where ra.ends_at is null and ra.role::text = any(pm_roles) and ra.accepted_at is null and ra.declined_at is null and ra.starts_at < now() - interval '14 days'
         and (net_filter is null or p.network = net_filter)
      union all
      select jsonb_build_object('rank', '4', 'issue', 'engagement_declining', 'network', p.network, 'country', p.country, 'level', ra.role::text, 'owner', p.first_name || ' ' || p.last_name, 'priority', 'normal',
                                'deadline', null, 'href', '#/view-as/' || p.id)
        from role_assignments ra join profiles p on p.id = ra.profile_id
       where ra.ends_at is null and ra.role::text = any(pm_roles) and p.last_seen_at between now() - interval '30 days' and now() - interval '8 days'
         and (net_filter is null or p.network = net_filter)
      union all
      select jsonb_build_object('rank', '2', 'issue', 'support_unresolved', 'network', p.network, 'country', p.country, 'level', 'support', 'owner', p.first_name || ' ' || p.last_name, 'priority', 'high',
                                'deadline', (tk.created_at + interval '3 days')::date, 'href', '#/helpdesk')
        from tickets tk join profiles p on p.id = tk.profile_id
       where tk.status in ('open', 'in_progress') and tk.created_at < now() - interval '3 days' and (net_filter is null or p.network = net_filter)
      union all
      select jsonb_build_object('rank', '1', 'issue', 'issue_red', 'network', coalesce(p_net, 'all'), 'country', (select c.name from unit_chain(i.org_unit_id) c where c.level = 'country' limit 1),
                                'level', 'issue', 'owner', i.title, 'priority', 'critical', 'deadline', null, 'href', '#/reporting/issues')
        from issues i where i.status in ('open', 'in_progress', 'awaiting_decision') and i.severity in ('red', 'critical')
    ) q(x)),
    -- ROW 3 · My Work Queue
    'queue', jsonb_build_object(
      'approvals', (select count(*) from applications where status in ('submitted', 'under_review', 'recommended') and (net_filter is null or network = net_filter)),
      'requests', (select count(*) from tickets where status = 'open'),
      'reports_review', (select count(*) from report_instances where is_current and status in ('submitted', 'under_review') and (net_filter is null or network = net_filter)),
      'followups', (select count(*) from tasks where assigned_by = auth.uid() and status in ('not_started', 'in_progress', 'awaiting_review')),
      'decisions', (select count(*) from issues where status = 'awaiting_decision'),
      'escalated', (select count(*) from report_instances where is_current and status = 'escalated'),
      'due_today', (select count(*) from tasks where assigned_to = auth.uid() and status in ('not_started', 'in_progress') and due_on = current_date),
      'due_week', (select count(*) from tasks where assigned_to = auth.uid() and status in ('not_started', 'in_progress') and due_on between current_date and current_date + 7),
      'overdue', (select count(*) from tasks where assigned_to = auth.uid() and status in ('not_started', 'in_progress') and due_on < current_date),
      'returned', (select count(*) from report_instances r where r.is_current and r.status = 'returned' and r.owner_id = auth.uid()),
      'verification', (select count(*) from tasks where status = 'awaiting_review' and assigned_by = auth.uid())),
    -- ROW 4 · WGMN vs WNNN
    'networks', (select jsonb_object_agg(n.net, n.v) from (
      select net::text, jsonb_build_object(
        'countries', (select count(distinct c.id) from org_units c join org_unit_subtree(c.id) s(id) on true join role_assignments ra on ra.org_unit_id = s.id and ra.ends_at is null and ra.role::text = any(pm_roles)
                       join profiles p on p.id = ra.profile_id and p.network = net where c.level = 'country'),
        'leaders', (select count(distinct ra.profile_id) from role_assignments ra join profiles p on p.id = ra.profile_id where ra.ends_at is null and ra.role::text = any(pm_roles) and p.network = net),
        'active', (select count(distinct ra.profile_id) from role_assignments ra join profiles p on p.id = ra.profile_id where ra.ends_at is null and ra.role::text = any(pm_roles) and p.network = net and p.last_seen_at > now() - interval '30 days'),
        'members', (select count(*) from profiles p where p.network = net and p.merged_into is null and p.status not in ('applicant', 'under_review')),
        'applications', (select count(*) from applications a where a.network = net and a.status in ('submitted', 'under_review', 'recommended')),
        'reports_compliance', (select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where r.status in ('submitted', 'under_review', 'approved', 'closed')) / count(*)) end
                                from report_instances r where r.is_current and r.network = net and r.template = 'monthly_leadership' and r.period_start = pr.period_start),
        'activities', (select count(*) from activity_records a join profiles p on p.id = a.profile_id where p.network = net and a.occurred_at >= since),
        'at_risk', (select count(distinct ra.profile_id) from role_assignments ra join profiles p on p.id = ra.profile_id where ra.ends_at is null and ra.role::text = any(pm_roles) and p.network = net and (p.last_seen_at is null or p.last_seen_at < now() - interval '30 days'))) as v
      from unnest(array['WGMN', 'WNNN']::public.network_code[]) as net) n),
    -- ROW 6 · engagement summary (responsiveness of seated leaders)
    'engagement', (select jsonb_build_object(
        'active', count(*) filter (where p.last_seen_at > now() - interval '7 days'),
        'consistent', count(*) filter (where p.last_seen_at > now() - interval '7 days' and p.created_at < now() - interval '60 days'),
        'declining', count(*) filter (where p.last_seen_at between now() - interval '30 days' and now() - interval '8 days'),
        'at_risk', count(*) filter (where p.last_seen_at between now() - interval '90 days' and now() - interval '31 days'),
        'inactive', count(*) filter (where p.last_seen_at < now() - interval '90 days' or p.last_seen_at is null),
        'support_open', (select count(*) from tickets where status in ('open', 'in_progress')),
        'milestones_30d', (select count(*) from role_assignments ra2 where ra2.ends_at is null and ra2.role::text = any(pm_roles)
                            and (extract(month from ra2.starts_at + interval '3 months') = extract(month from now()) or extract(month from ra2.starts_at + interval '6 months') = extract(month from now()) or extract(month from ra2.starts_at + interval '12 months') = extract(month from now()))))
      from (select distinct ra.profile_id from role_assignments ra where ra.ends_at is null and ra.role::text = any(pm_roles)) s join profiles p on p.id = s.profile_id
      where (net_filter is null or p.network = net_filter)),
    -- ROW 8 · activities & programme implementation
    'activities', jsonb_build_object(
      'upcoming', (select count(*) from programme_events e where e.event_date > current_date),
      'ongoing', (select count(*) from programme_events e where e.event_date = current_date),
      'completed', (select count(*) from activity_records a where a.occurred_at >= since),
      'delayed', (select count(*) from programme_events e where e.event_date between since::date and current_date - 1
                    and not exists (select 1 from activity_records a where a.org_unit_id = e.org_unit_id and a.occurred_at::date = e.event_date)),
      'evidence_pending', (select count(*) from report_instances r where r.is_current and r.status in ('submitted', 'under_review') and jsonb_array_length(r.evidence) = 0),
      'women_reached', (select coalesce(sum(a.people_reached), 0) from activity_records a where a.occurred_at >= since and coalesce(a.people_category, '') ilike '%women%'),
      'participants', (select coalesce(sum(a.people_reached), 0) from activity_records a where a.occurred_at >= since)),
    -- ROW 9 · recent network activity (meaningful events only)
    'recent', (select coalesce(jsonb_agg(e order by (e->>'at') desc), '[]'::jsonb) from (
      (select jsonb_build_object('at', ra.accepted_at, 'kind', 'appointment_accepted', 'who', p.first_name || ' ' || p.last_name, 'what', ra.role::text, 'where', p.country, 'network', p.network) as e
         from role_assignments ra join profiles p on p.id = ra.profile_id where ra.accepted_at is not null and ra.role::text = any(pm_roles) order by ra.accepted_at desc limit 5)
      union all
      (select jsonb_build_object('at', r.first_submitted_at, 'kind', 'report_submitted', 'who', (select o.name from org_units o where o.id = r.org_unit_id), 'what', r.template::text, 'where', (select c.name from unit_chain(r.org_unit_id) c where c.level = 'country' limit 1), 'network', r.network)
         from report_instances r where r.first_submitted_at is not null order by r.first_submitted_at desc limit 5)
      union all
      (select jsonb_build_object('at', a.occurred_at, 'kind', 'activity_recorded', 'who', left(a.what, 80), 'what', a.category::text, 'where', (select c.name from unit_chain(a.org_unit_id) c where c.level = 'country' limit 1), 'network', (select p.network from profiles p where p.id = a.profile_id))
         from activity_records a order by a.occurred_at desc limit 5)
      union all
      (select jsonb_build_object('at', ra.starts_at, 'kind', 'seat_filled', 'who', p.first_name || ' ' || p.last_name, 'what', ra.role::text, 'where', p.country, 'network', p.network)
         from role_assignments ra join profiles p on p.id = ra.profile_id where ra.ends_at is null and ra.role::text = any(pm_roles) order by ra.starts_at desc limit 5)
    ) r2(e)));
end; $$;
revoke execute on function public.hofco_dashboard(text, text) from anon;

-- redefines hq_account_list (adds hq_function)
create or replace function public.hq_account_list(q text default '', lim int default 300)
returns jsonb language plpgsql stable
security definer set search_path = public as $$
declare needle text := lower(coalesce(q, ''));
begin
  if not is_case_hq() then raise exception 'HQ only'; end if;
  return (
    select coalesce(jsonb_agg(rw order by
             (rw->>'has_login') desc, (rw->>'is_leader') desc, rw->>'name'), '[]'::jsonb)
    from (
      (select jsonb_build_object(
        'id', p.id, 'name', p.first_name || ' ' || p.last_name,
        'first_name', p.first_name, 'last_name', p.last_name,
        'email', p.email, 'phone', p.phone, 'membership_no', p.membership_no,
        'hq_function', p.hq_function,
        'network', p.network, 'status', p.status, 'role_applied', p.role_applied,
        'country', p.country, 'state_region', p.state_region, 'lga', p.lga,
        'is_leader', p.is_leader,
        'is_staff', exists (select 1 from staff s where s.profile_id = p.id and s.is_active),
        'last_seen_at', p.last_seen_at,
        'last_sign_in_at', u.last_sign_in_at,
        'email_confirmed', u.email_confirmed_at is not null,
        'banned', (u.banned_until is not null and u.banned_until > now()),
        'created_at', p.created_at,
        'has_login', true,
        'roles', (select coalesce(jsonb_agg(jsonb_build_object(
                    'role', ra.role, 'unit_id', ou.id, 'unit', ou.name, 'level', ou.level,
                    'appointment_status', ra.appointment_status,
                    'accepted_at', ra.accepted_at, 'declined_at', ra.declined_at)
                    order by ra.starts_at), '[]'::jsonb)
                   from role_assignments ra join org_units ou on ou.id = ra.org_unit_id
                  where ra.profile_id = p.id and ra.ends_at is null)
      ) as rw
      from profiles p
      left join auth.users u on u.id = p.id
      where p.merged_into is null
        and (needle = '' or lower(p.first_name || ' ' || p.last_name) like '%' || needle || '%'
             or lower(p.email) like '%' || needle || '%'
             or lower(coalesce(p.membership_no, '')) like '%' || needle || '%'
             or lower(coalesce(p.country, '')) like '%' || needle || '%'
             or lower(coalesce(p.role_applied, '')) like '%' || needle || '%')
      order by p.is_leader desc, p.last_name, p.first_name
      limit lim)
      union all
      (select jsonb_build_object(
        'id', null, 'name', d.first_name || ' ' || d.last_name,
        'first_name', d.first_name, 'last_name', d.last_name,
        'email', d.email, 'phone', d.phone, 'membership_no', d.member_code,
        'state_region', d.state, 'on_hold', coalesce(d.on_hold, false), 'appointed_on', d.appointed_on,
        'network', case when d.member_code ~ '^(CL|DCL|CA|PM)' then 'WNNN' else 'WGMN' end,
        'status', null, 'role_applied', d.role_applied,
        'country', d.country, 'state_region', d.state, 'lga', null,
        'is_leader', true, 'is_staff', false,
        'last_seen_at', null, 'last_sign_in_at', null,
        'email_confirmed', false, 'banned', false,
        'created_at', d.sent_at, 'has_login', false, 'roles', '[]'::jsonb
      ) as rw
      from leader_directory d
      where d.claimed_profile is null
        and not exists (select 1 from profiles p2
                         where p2.merged_into is null
                           and (upper(p2.membership_no) = upper(d.member_code)
                                or (d.email is not null and lower(p2.email) = lower(d.email))))
        and (needle = '' or lower(d.first_name || ' ' || d.last_name) like '%' || needle || '%'
             or lower(coalesce(d.email, '')) like '%' || needle || '%'
             or lower(d.member_code) like '%' || needle || '%'
             or lower(d.country) like '%' || needle || '%'
             or lower(d.role_applied) like '%' || needle || '%'))
    ) sub);
end; $$;
revoke execute on function public.hq_account_list(text, int) from anon;

insert into public.schema_migrations (version, name)
values (128, 'hofco_dashboard') on conflict (version) do nothing;
