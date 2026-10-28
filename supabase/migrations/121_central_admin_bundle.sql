-- ============================================================================
-- WDOS Migration 121 — HQ Command Centre bundle (Phase 155)
-- One HQ-only call feeding the Central Admin homepage the founder specified:
-- global overview tiles, immediate attention, recruitment funnel, Africa
-- coverage by country (represented / needs strengthening / not represented),
-- leadership ladder, country performance table, approvals centre,
-- reporting & accountability, role-based access summary. Every figure comes
-- from the same tables and rules the module pages use, so the homepage and
-- the modules cannot disagree.
-- ============================================================================

-- The 54 African countries with ISO codes: the "55-country view" target list.
create table if not exists public.africa_countries (
  iso  text primary key,
  name text not null
);
insert into public.africa_countries (iso, name) values
  ('DZ','Algeria'),('AO','Angola'),('BJ','Benin'),('BW','Botswana'),('BF','Burkina Faso'),('BI','Burundi'),('CV','Cabo Verde'),
  ('CM','Cameroon'),('CF','Central African Republic'),('TD','Chad'),('KM','Comoros'),('CG','Republic of the Congo'),
  ('CD','Democratic Republic of the Congo'),('DJ','Djibouti'),('EG','Egypt'),('GQ','Equatorial Guinea'),('ER','Eritrea'),
  ('SZ','Eswatini'),('ET','Ethiopia'),('GA','Gabon'),('GM','The Gambia'),('GH','Ghana'),('GN','Guinea'),('GW','Guinea-Bissau'),
  ('CI','Cote d''Ivoire'),('KE','Kenya'),('LS','Lesotho'),('LR','Liberia'),('LY','Libya'),('MG','Madagascar'),('MW','Malawi'),
  ('ML','Mali'),('MR','Mauritania'),('MU','Mauritius'),('MA','Morocco'),('MZ','Mozambique'),('NA','Namibia'),('NE','Niger'),
  ('NG','Nigeria'),('RW','Rwanda'),('ST','Sao Tome and Principe'),('SN','Senegal'),('SC','Seychelles'),('SL','Sierra Leone'),
  ('SO','Somalia'),('ZA','South Africa'),('SS','South Sudan'),('SD','Sudan'),('TZ','Tanzania'),('TG','Togo'),('TN','Tunisia'),
  ('UG','Uganda'),('ZM','Zambia'),('ZW','Zimbabwe')
on conflict (iso) do nothing;
alter table public.africa_countries enable row level security;
drop policy if exists africa_countries_read on public.africa_countries;
create policy africa_countries_read on public.africa_countries for select to authenticated using (true);

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
        case when unit_id is null or leaders = 0 then 'not_represented'
             when cr_filled and dcr_filled and (seats = 0 or filled::numeric / greatest(seats, 1) >= 0.5) then 'represented'
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
values (121, 'central_admin_bundle') on conflict (version) do nothing;
