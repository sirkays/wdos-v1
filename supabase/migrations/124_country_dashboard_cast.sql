-- ============================================================================
-- WDOS Migration 124 — country_dashboard: network resolution cast (Phase 158)
-- "COALESCE types text and network_code cannot be matched": the profile's
-- network is an enum; it is now cast to text before the coalesce.
-- -- redefines country_dashboard
-- ============================================================================
create or replace function public.country_dashboard(p_unit uuid default null, p_net text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare unit uuid := p_unit; net public.network_code; scope uuid[]; pr record;
begin
  if unit is null then select org_unit_id into unit from report_unit_for(auth.uid()); end if;
  if unit is null then raise exception 'No leadership unit'; end if;
  if not (is_case_hq() or unit in (select administered_units())) then raise exception 'Outside your leadership scope'; end if;
  net := coalesce(nullif(upper(p_net), ''), (select network::text from profiles where id = auth.uid()), 'WGMN')::public.network_code;
  select coalesce(array_agg(id), '{}') into scope from org_unit_subtree(unit) as s(id);
  select * into pr from report_period('monthly_leadership', (current_date - interval '1 month')::date);
  return jsonb_build_object(
    'unit', (select jsonb_build_object('id', o.id, 'name', o.name, 'level', o.level, 'country_iso', o.country_iso) from org_units o where o.id = unit),
    'period', jsonb_build_object('start', pr.period_start, 'due', pr.due_on),
    'totals', (select jsonb_build_object(
        'units', count(*), 'leaders', (select count(distinct ra.profile_id) from role_assignments ra join profiles p on p.id = ra.profile_id
                                         where ra.org_unit_id = any(scope) and ra.ends_at is null and p.network = net and ra.role in (select role from position_master)),
        'active7', (select count(distinct ra.profile_id) from role_assignments ra join profiles p on p.id = ra.profile_id
                      where ra.org_unit_id = any(scope) and ra.ends_at is null and p.network = net and ra.role in (select role from position_master) and p.last_seen_at > now() - interval '7 days'),
        'active30', (select count(distinct ra.profile_id) from role_assignments ra join profiles p on p.id = ra.profile_id
                      where ra.org_unit_id = any(scope) and ra.ends_at is null and p.network = net and ra.role in (select role from position_master) and p.last_seen_at > now() - interval '30 days'),
        'members', (select count(*) from profiles p where p.org_unit_id = any(scope) and p.network = net and p.merged_into is null and p.status not in ('applicant', 'under_review')),
        'tasks_open', (select count(*) from tasks t where t.org_unit_id = any(scope) and t.status in ('not_started', 'in_progress', 'awaiting_review')),
        'tasks_overdue', (select count(*) from tasks t where t.org_unit_id = any(scope) and t.status in ('not_started', 'in_progress', 'awaiting_review') and t.due_on < current_date),
        'activities30', (select count(*) from activity_records a where a.org_unit_id = any(scope) and a.occurred_at > now() - interval '30 days'),
        'meetings30', (select count(*) from meetings m where m.org_unit_id = any(scope) and m.starts_at > now() - interval '30 days'),
        'issues_open', (select count(*) from issues i where i.org_unit_id = any(scope) and i.status in ('open', 'in_progress', 'awaiting_decision')))
      from org_units o where o.id = any(scope) and o.id <> unit),
    'by_level', (select coalesce(jsonb_agg(jsonb_build_object('level', x.level, 'role', x.role, 'seats', x.seats, 'filled', x.filled) order by x.seq), '[]'::jsonb)
      from (select pm.level, pm.role, pm.seq, count(*) as seats,
                   count(*) filter (where exists (select 1 from role_assignments ra join profiles p on p.id = ra.profile_id
                                                   where ra.org_unit_id = s.id and ra.role = pm.role and ra.ends_at is null and p.network = net)) as filled
              from org_units s join position_master pm on pm.level = s.level
             where s.id = any(scope) and s.level <> 'headquarters' group by pm.level, pm.role, pm.seq) x),
    'children', (select coalesce(jsonb_agg(row_to_json(c)::jsonb order by c.name), '[]'::jsonb) from (
      select o.id as unit_id, o.name, o.level,
        (select count(*) from org_unit_subtree(o.id)) - 1 as sub_units,
        (select count(*) from org_units s join position_master pm on pm.level = s.level where s.id in (select id from org_unit_subtree(o.id))) as seats,
        (select count(*) from role_assignments ra join profiles p on p.id = ra.profile_id
          where ra.org_unit_id in (select id from org_unit_subtree(o.id)) and ra.ends_at is null and p.network = net and ra.role in (select role from position_master)) as filled,
        (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.first_name || ' ' || p.last_name, 'role', ra.role, 'unit', u2.name,
             'last_seen', p.last_seen_at, 'email', p.email, 'phone', p.phone,
             'resp', case when p.last_seen_at > now() - interval '7 days' then 'active' when p.last_seen_at > now() - interval '30 days' then 'quiet' when p.last_seen_at is null then 'never' else 'inactive' end)
             order by (select seq from position_master where role = ra.role), p.last_name), '[]'::jsonb)
           from role_assignments ra join profiles p on p.id = ra.profile_id join org_units u2 on u2.id = ra.org_unit_id
          where ra.org_unit_id in (select id from org_unit_subtree(o.id)) and ra.ends_at is null and p.network = net and ra.role in (select role from position_master)) as leaders,
        (select r.status::text from report_instances r where r.org_unit_id = o.id and r.template = 'monthly_leadership' and r.network = net and r.period_start = pr.period_start and r.is_current limit 1) as report_status,
        (select r.id from report_instances r where r.org_unit_id = o.id and r.template = 'monthly_leadership' and r.network = net and r.period_start = pr.period_start and r.is_current limit 1) as report_id,
        (select count(*) from tasks t where t.org_unit_id in (select id from org_unit_subtree(o.id)) and t.status in ('not_started', 'in_progress', 'awaiting_review')) as tasks_open,
        (select count(*) from tasks t where t.org_unit_id in (select id from org_unit_subtree(o.id)) and t.status in ('not_started', 'in_progress', 'awaiting_review') and t.due_on < current_date) as tasks_overdue,
        (select count(*) from activity_records a where a.org_unit_id in (select id from org_unit_subtree(o.id)) and a.occurred_at > now() - interval '30 days') as activities30,
        (select count(*) from profiles p where p.org_unit_id in (select id from org_unit_subtree(o.id)) and p.network = net and p.merged_into is null and p.status not in ('applicant', 'under_review')) as members
      from org_units o where o.parent_id = unit) c),
    'generated_at', now());
end; $$;
revoke execute on function public.country_dashboard(uuid, text) from anon;

insert into public.schema_migrations (version, name)
values (124, 'country_dashboard_cast') on conflict (version) do nothing;
