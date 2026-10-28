-- ============================================================================
-- WDOS Migration 158 — Scalability (Phase 208)
-- APPLIED DIRECTLY ON THE LIVE DATABASE on 19 Sep 2026 through the Supabase
-- connector, in three parts (158, 158b cache-as-super-admin, 158c master).
-- Do NOT paste this file into the SQL Editor again.
-- Measured on the live database (pg_stat_statements, 19 Sep 2026):
--   central_admin (Founder's Command Centre)   mean 2.2 s, max 7.6 s
--   hofco_dashboard                            mean 2.3 s, max 7.2 s
--   announcements read (RLS)                   mean 62 ms x 40,000 calls
--   tasks read (RLS)                           mean 49 ms x 24,000 calls
--   applications read (RLS)                    mean 91 ms x 12,000 calls
-- Cause: every row-level policy and every dashboard walked the organisation
-- tree with a recursive query (org_unit_subtree / administered_units) once
-- PER ROW. With more users that cost grows with rows x users.
-- Fix: (1) each unit stores its ancestor chain, so "is X under Y" is an array
-- test, not a recursion; (2) policies evaluate the viewer's scope ONCE per
-- query; (3) the two heavy dashboards are served from a cache refreshed in
-- the background every 3 minutes, so a click costs milliseconds.
-- ============================================================================

-- 1. Ancestor chain on every unit (self first), maintained by trigger
alter table public.org_units add column if not exists ancestors uuid[] not null default '{}';
create or replace function public.org_unit_ancestors_compute(p_id uuid)
returns uuid[] language sql stable as $$
  with recursive up as (
    select id, parent_id, 1 as d from org_units where id = p_id
    union all
    select o.id, o.parent_id, up.d + 1 from org_units o join up on o.id = up.parent_id
  ) select array_agg(id order by d) from up;
$$;
create or replace function public.org_units_ancestors_trg()
returns trigger language plpgsql as $$
begin
  new.ancestors := coalesce((select array_agg(id order by d) from (
    with recursive up as (
      select new.parent_id as id, 1 as d
      union all
      select o.parent_id, up.d + 1 from org_units o join up on o.id = up.id where o.parent_id is not null
    ) select id, d from up where id is not null) x), '{}'::uuid[]);
  new.ancestors := array_prepend(new.id, new.ancestors);
  return new;
end; $$;
drop trigger if exists org_units_ancestors on public.org_units;
create trigger org_units_ancestors before insert or update of parent_id on public.org_units
  for each row execute function public.org_units_ancestors_trg();
update public.org_units set ancestors = public.org_unit_ancestors_compute(id);
create index if not exists org_units_ancestors_gin on public.org_units using gin (ancestors);

-- 2. Subtree without recursion (same signature, every existing caller benefits)
create or replace function public.org_unit_subtree(root uuid)
returns setof uuid language sql stable as $$
  select id from org_units where root = any(ancestors);
$$;

-- 3. The viewer's scope, once per query
create or replace function public.my_scope_roots()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(ra.org_unit_id), '{}'::uuid[])
  from role_assignments ra
  where ra.profile_id = auth.uid() and ra.ends_at is null
    and (ra.role in ('super_admin','executive_director','hq_team') or ra.role in (select role from position_master));
$$;
create or replace function public.administered_units()
returns setof uuid language sql stable security definer set search_path = public as $$
  select o.id from org_units o where o.ancestors && (select public.my_scope_roots());
$$;
create or replace function public.my_unit_ancestors()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce((select o.ancestors from profiles p join org_units o on o.id = p.org_unit_id where p.id = auth.uid()), '{}'::uuid[]);
$$;

-- announcements: "reaches me" is now an array test against my own ancestor chain
create or replace function public.announcement_reaches_me(a public.announcements)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and a.org_unit_id = any (public.my_unit_ancestors())
      and (a.network is null or p.network = a.network)
      and (a.audience = 'all'
           or (a.audience = 'leaders' and is_established(p.id))
           or (a.audience = 'intake' and not is_established(p.id))));
$$;
-- tasks: the manager test uses the once-per-query scope
create or replace function public.is_task_manager(t public.tasks)
returns boolean language sql stable security definer set search_path = public as $$
  select t.assigned_by = auth.uid()
      or exists (select 1 from org_units o where o.id = t.org_unit_id and o.ancestors && (select public.my_scope_roots()))
      or public.is_case_hq();
$$;
-- applications: the same
drop policy if exists applications_leader_read on public.applications;
create policy applications_leader_read on public.applications for select to authenticated
  using (exists (select 1 from org_units o where o.id = applications.org_unit_id and o.ancestors && (select public.my_scope_roots()))
         or (select public.is_case_hq()));

-- 4. Dashboard cache: the two heaviest screens are computed in the background
create table if not exists public.dashboard_cache (
  key text primary key, payload jsonb not null, computed_at timestamptz not null default now(), compute_ms int
);
alter table public.dashboard_cache enable row level security;
create or replace function public.dashboard_cache_refresh(p_key text)
returns void language plpgsql security definer set search_path = public as $$
declare t0 timestamptz := clock_timestamp(); v jsonb;
begin
  -- computed as HQ
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where hq_function = 'founder' order by created_at limit 1), 'role', 'authenticated')::text, true);
  v := case p_key
    when 'central_admin:all' then public.central_admin('all')
    when 'central_admin:WGMN' then public.central_admin('WGMN')
    when 'central_admin:WNNN' then public.central_admin('WNNN')
    when 'hofco:all:month' then public.hofco_dashboard('all', 'month')
    when 'hofco:WGMN:month' then public.hofco_dashboard('WGMN', 'month')
    when 'hofco:WNNN:month' then public.hofco_dashboard('WNNN', 'month')
    else null end;
  if v is null then return; end if;
  insert into dashboard_cache (key, payload, computed_at, compute_ms)
  values (p_key, v, now(), extract(milliseconds from clock_timestamp() - t0)::int)
  on conflict (key) do update set payload = excluded.payload, computed_at = excluded.computed_at, compute_ms = excluded.compute_ms;
end; $$;
create or replace function public.dashboard_cache_refresh_all()
returns void language plpgsql security definer set search_path = public as $$
declare k text;
begin
  foreach k in array array['central_admin:all','central_admin:WGMN','central_admin:WNNN','hofco:all:month','hofco:WGMN:month','hofco:WNNN:month'] loop
    begin perform public.dashboard_cache_refresh(k); exception when others then raise warning 'cache % failed: %', k, sqlerrm; end;
  end loop;
end; $$;
-- served to HQ: cached copy if fresh (3 min), else recompute and store
create or replace function public.central_admin_cached(p_net text default 'all')
returns jsonb language plpgsql security definer set search_path = public as $$
declare k text := 'central_admin:' || coalesce(nullif(upper(p_net), ''), 'all'); c dashboard_cache%rowtype;
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  select * into c from dashboard_cache where key = k;
  if c.key is not null and c.computed_at > now() - interval '3 minutes' then
    return c.payload || jsonb_build_object('_cached_at', c.computed_at, '_compute_ms', c.compute_ms);
  end if;
  perform public.dashboard_cache_refresh(k);
  select * into c from dashboard_cache where key = k;
  return coalesce(c.payload, public.central_admin(p_net)) || jsonb_build_object('_cached_at', c.computed_at, '_compute_ms', c.compute_ms);
end; $$;
revoke execute on function public.central_admin_cached(text) from anon;
create or replace function public.hofco_dashboard_cached(p_net text default 'all', p_period text default 'month')
returns jsonb language plpgsql security definer set search_path = public as $$
declare k text := 'hofco:' || coalesce(nullif(upper(p_net), ''), 'all') || ':' || coalesce(p_period, 'month'); c dashboard_cache%rowtype;
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  if p_period <> 'month' then return public.hofco_dashboard(p_net, p_period); end if;
  select * into c from dashboard_cache where key = k;
  if c.key is not null and c.computed_at > now() - interval '3 minutes' then
    return c.payload || jsonb_build_object('_cached_at', c.computed_at, '_compute_ms', c.compute_ms);
  end if;
  perform public.dashboard_cache_refresh(k);
  select * into c from dashboard_cache where key = k;
  return coalesce(c.payload, public.hofco_dashboard(p_net, p_period)) || jsonb_build_object('_cached_at', c.computed_at, '_compute_ms', c.compute_ms);
end; $$;
revoke execute on function public.hofco_dashboard_cached(text, text) from anon;
-- background refresh every 3 minutes
select cron.unschedule(jobid) from cron.job where jobname = 'wdos_dashboard_cache';
select cron.schedule('wdos_dashboard_cache', '*/3 * * * *', $$select public.dashboard_cache_refresh_all();$$);
select public.dashboard_cache_refresh_all();

-- 5. hq_activation_master: position_code for the UI, and no repeated sweep cost
--    (the sweep runs on the cron below, not on every page open)
select cron.unschedule(jobid) from cron.job where jobname = 'wdos_activation_sweep';
select cron.schedule('wdos_activation_sweep', '*/10 * * * *', $$select public.activation_sweep();$$);

create or replace function public.hq_activation_master(p_days int default 365)
returns jsonb language plpgsql security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => coalesce(p_days, 365)); out jsonb;
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  select jsonb_build_object(
    'link', (select jsonb_build_object('code', l.code, 'active', l.active,
              'visits', (select count(*) from referral_visits v where v.link_id = l.id),
              'visits_7d', (select count(*) from referral_visits v where v.link_id = l.id and v.visited_at >= now() - interval '7 days'),
              'visits_30d', (select count(*) from referral_visits v where v.link_id = l.id and v.visited_at >= now() - interval '30 days'),
              'last_visit', (select max(v.visited_at) from referral_visits v where v.link_id = l.id),
              'registrations', (select count(*) from candidate_activations a where a.referral_code = l.code))
             from referral_links l where l.code = 'WODDI'),
    'totals', (select jsonb_build_object(
        'candidates', count(*),
        'ref3', count(*) filter (where route = 'ref3'), 'open7', count(*) filter (where route = 'open7'),
        'not_started', count(*) filter (where status = 'not_started'),
        'in_progress', count(*) filter (where status = 'in_progress'),
        'completed', count(*) filter (where status = 'completed'),
        'incomplete', count(*) filter (where status in ('incomplete','closed')),
        'extension_requested', count(*) filter (where extension_status = 'requested'),
        'assess_submitted', (select count(*) from readiness_assessments r where r.status = 'submitted'),
        'assess_returned', (select count(*) from readiness_assessments r where r.status = 'returned'),
        'assess_completed', (select count(*) from readiness_assessments r where r.status = 'completed'),
        'selected', (select count(*) from readiness_assessments r where r.outcome = 'selected'),
        'reserve', (select count(*) from readiness_assessments r where r.outcome = 'reserve'),
        'further_review', (select count(*) from readiness_assessments r where r.outcome = 'further_review'),
        'not_selected', (select count(*) from readiness_assessments r where r.outcome = 'not_selected'),
        'wgmn', count(*) filter (where network = 'WGMN'), 'wnnn', count(*) filter (where network = 'WNNN'))
       from candidate_activations where created_at >= since),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('route', d.route, 'day', d.day, 'title', d.title,
        'reached', (select count(*) from candidate_activation_steps s join candidate_activations a on a.id = s.activation_id where a.route = d.route and s.day = d.day),
        'completed', (select count(*) from candidate_activation_steps s join candidate_activations a on a.id = s.activation_id where a.route = d.route and s.day = d.day and s.status = 'completed'))
        order by d.route, d.day), '[]'::jsonb) from activation_route_days d),
    'by_position', (select coalesce(jsonb_agg(x order by x->>'n' desc), '[]'::jsonb) from (
        select jsonb_build_object('position', coalesce(public.role_title(a.position_code, a.network), a.position_code, '—'), 'network', a.network,
          'n', count(*), 'completed', count(*) filter (where a.status = 'completed'),
          'selected', (select count(*) from readiness_assessments r where r.activation_id = any(array_agg(a.id)) and r.outcome = 'selected')) as x
        from candidate_activations a where a.created_at >= since group by a.position_code, a.network) s),
    'by_country', (select coalesce(jsonb_agg(x order by x->>'n' desc), '[]'::jsonb) from (
        select jsonb_build_object('country', coalesce(a.geo_country, '—'), 'n', count(*),
          'in_progress', count(*) filter (where a.status = 'in_progress'), 'completed', count(*) filter (where a.status = 'completed'),
          'incomplete', count(*) filter (where a.status in ('incomplete','closed')),
          'selected', (select count(*) from readiness_assessments r where r.activation_id = any(array_agg(a.id)) and r.outcome = 'selected')) as x
        from candidate_activations a where a.created_at >= since group by a.geo_country) s),
    'by_state', (select coalesce(jsonb_agg(x order by x->>'country', x->>'n' desc), '[]'::jsonb) from (
        select jsonb_build_object('country', coalesce(a.geo_country, '—'), 'state', coalesce(a.geo_state, '—'), 'n', count(*),
          'completed', count(*) filter (where a.status = 'completed')) as x
        from candidate_activations a where a.created_at >= since group by a.geo_country, a.geo_state) s),
    'candidates', (select coalesce(jsonb_agg(x order by x->>'started_at' desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'activation_id', a.id, 'profile_id', p.id, 'name', p.first_name || ' ' || p.last_name, 'email', p.email, 'phone', p.phone,
          'birth_date', p.birth_date, 'language', p.preferred_locale,
          'route', a.route, 'network', a.network,
          'position', coalesce(public.role_title(a.position_code, a.network), a.position_code), 'position_code', a.position_code,
          'position_place', public.position_place(a.position_code, a.geo_country, a.geo_state, a.geo_lga, a.geo_cluster),
          'country', a.geo_country, 'state', a.geo_state, 'lga', a.geo_lga, 'cluster', a.geo_cluster,
          'status', a.status, 'day', a.current_day,
          'days_total', (select count(*) from activation_route_days d where d.route = a.route),
          'started_at', a.started_at, 'deadline', coalesce(a.extension_until, a.deadline), 'completed_at', a.completed_at,
          'extension_status', a.extension_status,
          'steps', (select coalesce(jsonb_agg(jsonb_build_object('day', s.day, 'status', s.status, 'started_at', s.started_at,
                      'completed_at', s.completed_at, 'seconds', s.seconds_spent, 'reached_end', s.reached_end,
                      'acks', coalesce(jsonb_array_length(s.acks), 0), 'answers', s.answers) order by s.day), '[]'::jsonb)
                    from candidate_activation_steps s where s.activation_id = a.id),
          'network_chosen', a.network_chosen, 'age_at_start', a.age_at_start,
          'age_band_ok', case when a.age_at_start is null then null when a.network = 'WNNN' then a.age_at_start between 18 and 29 else a.age_at_start >= 30 end,
          'assessment', ra.status, 'assessment_id', ra.id, 'total', ra.total, 'critical_ok', ra.critical_ok, 'outcome', ra.outcome,
          'clarifications', ra.clarifications, 'readiness', ra.readiness, 'understanding_review', ra.understanding_review, 'next_stage', ra.next_stage,
          'short_score', ra.short_score, 'rank_score', ra.rank_score,
          'submitted_at', ra.submitted_at, 'reviewer', (select first_name || ' ' || last_name from profiles where id = ra.reviewer_id)) as x
        from candidate_activations a join profiles p on p.id = a.profile_id
        left join readiness_assessments ra on ra.activation_id = a.id
        where a.created_at >= since) s)
  ) into out;
  return out;
end; $$;
revoke execute on function public.hq_activation_master(int) from anon;

insert into public.schema_migrations (version, name) values (158, 'scalability') on conflict (version) do nothing;
