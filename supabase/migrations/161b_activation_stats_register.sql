-- 161 part B - the HQ page's data: aggregates computed in the database, a
-- paged register, one detail call per candidate. APPLIED LIVE 27 Sep 2026.

-- legacy log rows (before 161) were queued but their answers were never read
update public.candidate_comms_log set http_status = -2, mailer_reply = 'sent before mailer answers were recorded'
 where request_id is null and http_status is null and sent;

-- ---------------------------------------------------------------------------
-- 1. statistics for one route
-- ---------------------------------------------------------------------------
create or replace function public.hq_activation_stats(p_route text default 'ref3', p_include_test boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare out jsonb; total_days int; live_at timestamptz;
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  perform public.activation_sweep();
  perform public.comms_reconcile();
  select count(*) into total_days from activation_route_days where route = p_route;
  select min(at) into live_at from candidate_comms_log;

  with b as (
    select a.id, a.profile_id, a.route, a.network, a.position_code, a.status, a.current_day, a.created_at, a.completed_at,
           coalesce(a.extension_until, a.deadline) as due, a.extension_status, a.first_activity_at, a.is_test,
           a.geo_country, a.geo_state, a.geo_lga, a.geo_cluster, a.referrer_category, a.referrer_name,
           p.first_name, p.last_name, p.email, p.phone,
           ra.status as a_status, ra.outcome, ra.rank_score,
           (select count(*) from candidate_activation_steps st where st.activation_id = a.id and st.status = 'completed') as days_done,
           exists (select 1 from role_assignments r where r.profile_id = a.profile_id and r.ends_at is null and r.role::text = a.position_code) as appointed,
           public.name_key(p.first_name, p.last_name) as nk, public.email_problem(p.email) as ep,
           case when a.status in ('incomplete','closed') then 'incomplete'
                when a.status = 'completed' then case when ra.outcome is not null then 'decided' else 'awaiting_review' end
                when a.first_activity_at is null then 'not_started' else 'in_progress' end as stage
    from candidate_activations a join profiles p on p.id = a.profile_id
    left join readiness_assessments ra on ra.activation_id = a.id
    where a.route = p_route and (p_include_test or not a.is_test)),
  dup as (select nk from b where nk is not null group by nk having count(*) > 1)
  select jsonb_build_object(
    'route', p_route, 'days_total', total_days, 'include_test', p_include_test, 'as_of', now(),
    'totals', (select jsonb_build_object(
        'registrations', count(*), 'people', count(distinct coalesce(nk, id::text)),
        'wgmn', count(*) filter (where network = 'WGMN'), 'wnnn', count(*) filter (where network = 'WNNN'),
        'not_started', count(*) filter (where stage = 'not_started'),
        'in_progress', count(*) filter (where stage = 'in_progress'),
        'awaiting_review', count(*) filter (where stage = 'awaiting_review'),
        'decided', count(*) filter (where stage = 'decided'),
        'completed', count(*) filter (where status = 'completed'),
        'incomplete', count(*) filter (where stage = 'incomplete'),
        'incomplete_never_started', count(*) filter (where stage = 'incomplete' and first_activity_at is null),
        'active_now', count(*) filter (where status = 'in_progress'),
        'extension_requested', count(*) filter (where extension_status = 'requested'),
        'assess_submitted', count(*) filter (where a_status = 'submitted'),
        'assess_returned', count(*) filter (where a_status = 'returned'),
        'assess_reviewed', count(*) filter (where a_status = 'completed'),
        'selected', count(*) filter (where outcome = 'selected'), 'reserve', count(*) filter (where outcome in ('reserve','alternative_role')),
        'further_review', count(*) filter (where outcome = 'further_review'), 'not_selected', count(*) filter (where outcome = 'not_selected'),
        'appointed', count(*) filter (where appointed),
        'duplicates', (select count(*) from dup), 'email_problems', count(*) filter (where ep is not null),
        'test_excluded', (select count(*) from candidate_activations t where t.route = p_route and t.is_test),
        'started_rate', round(100.0 * count(*) filter (where first_activity_at is not null) / greatest(count(*), 1), 0),
        'completion_rate', round(100.0 * count(*) filter (where status = 'completed') / greatest(count(*), 1), 0),
        'completion_rate_of_started', round(100.0 * count(*) filter (where status = 'completed') / greatest(count(*) filter (where first_activity_at is not null), 1), 0))
      from b),
    'funnel', (select jsonb_build_array(
        jsonb_build_object('key', 'registered', 'n', (select count(*) from b)),
        jsonb_build_object('key', 'started', 'n', (select count(*) from b where first_activity_at is not null)))
      || coalesce((select jsonb_agg(jsonb_build_object('key', 'day' || d, 'day', d, 'n', (select count(*) from b where days_done >= d)) order by d) from generate_series(1, greatest(total_days - 1, 0)) d), '[]'::jsonb)
      || jsonb_build_array(
        jsonb_build_object('key', 'last_day', 'day', total_days, 'n', (select count(*) from b where current_day >= total_days and first_activity_at is not null)),
        jsonb_build_object('key', 'assessment', 'n', (select count(*) from b where status = 'completed')),
        jsonb_build_object('key', 'reviewed', 'n', (select count(*) from b where outcome is not null)),
        jsonb_build_object('key', 'selected', 'n', (select count(*) from b where outcome = 'selected')),
        jsonb_build_object('key', 'appointed', 'n', (select count(*) from b where appointed)))),
    'timing', (select jsonb_build_object(
        'median_hours_to_start', round((percentile_cont(0.5) within group (order by extract(epoch from (first_activity_at - created_at)) / 3600.0) filter (where first_activity_at is not null))::numeric, 1),
        'median_hours_to_submit', round((percentile_cont(0.5) within group (order by extract(epoch from (completed_at - created_at)) / 3600.0) filter (where completed_at is not null))::numeric, 1),
        'on_time', count(*) filter (where completed_at is not null and completed_at <= due),
        'late', count(*) filter (where completed_at is not null and completed_at > due),
        'per_day', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'median_minutes', m, 'n', n) order by day), '[]'::jsonb)
                    from (select st.day, round((percentile_cont(0.5) within group (order by st.seconds_spent / 60.0))::numeric, 1) m, count(*) n
                          from candidate_activation_steps st join b on b.id = st.activation_id where st.status = 'completed' and st.seconds_spent > 0 group by st.day) z))
      from b),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'title', d.title,
        'opened', (select count(*) from candidate_activation_steps st join b on b.id = st.activation_id where st.day = d.day and (d.day > 1 or public.step_has_activity(st))),
        'completed', case when d.day = total_days then (select count(*) from b where status = 'completed')
                          else (select count(*) from candidate_activation_steps st join b on b.id = st.activation_id where st.day = d.day and st.status = 'completed') end,
        'median_minutes', (select round((percentile_cont(0.5) within group (order by st.seconds_spent / 60.0))::numeric, 1) from candidate_activation_steps st join b on b.id = st.activation_id where st.day = d.day and st.seconds_spent > 0)
        ) order by d.day), '[]'::jsonb) from activation_route_days d where d.route = p_route),
    'by_position', (select coalesce(jsonb_agg(x order by (x->>'n')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('position', coalesce(public.role_title(position_code, network), position_code, '—'), 'network', network, 'n', count(*),
          'started', count(*) filter (where first_activity_at is not null), 'completed', count(*) filter (where status = 'completed'),
          'incomplete', count(*) filter (where stage = 'incomplete'), 'selected', count(*) filter (where outcome = 'selected'), 'appointed', count(*) filter (where appointed)) x
        from b group by position_code, network) s),
    'by_country', (select coalesce(jsonb_agg(x order by (x->>'n')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('country', coalesce(geo_country, '—'), 'n', count(*), 'people', count(distinct coalesce(nk, id::text)),
          'not_started', count(*) filter (where stage = 'not_started'), 'in_progress', count(*) filter (where stage = 'in_progress'),
          'completed', count(*) filter (where status = 'completed'), 'incomplete', count(*) filter (where stage = 'incomplete'),
          'selected', count(*) filter (where outcome = 'selected')) x from b group by geo_country) s),
    'by_state', (select coalesce(jsonb_agg(x order by x->>'country', (x->>'n')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('country', coalesce(geo_country, '—'), 'state', coalesce(geo_state, '—'), 'n', count(*),
          'started', count(*) filter (where first_activity_at is not null), 'completed', count(*) filter (where status = 'completed'), 'selected', count(*) filter (where outcome = 'selected')) x
        from b group by geo_country, geo_state) s),
    'by_network', (select coalesce(jsonb_agg(x order by x->>'network'), '[]'::jsonb) from (
        select jsonb_build_object('network', network, 'n', count(*), 'started', count(*) filter (where first_activity_at is not null),
          'completed', count(*) filter (where status = 'completed'), 'incomplete', count(*) filter (where stage = 'incomplete'), 'selected', count(*) filter (where outcome = 'selected')) x
        from b group by network) s),
    'by_source', (select coalesce(jsonb_agg(x order by (x->>'n')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('category', coalesce(referrer_category, 'unknown'), 'referrer', coalesce(nullif(trim(referrer_name), ''), '—'), 'n', count(*),
          'started', count(*) filter (where first_activity_at is not null), 'completed', count(*) filter (where status = 'completed'),
          'incomplete', count(*) filter (where stage = 'incomplete'), 'selected', count(*) filter (where outcome = 'selected')) x
        from b group by referrer_category, nullif(trim(referrer_name), '')) s),
    'signups', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d), '[]'::jsonb) from (
        select (created_at at time zone 'Africa/Lagos')::date d, count(*) n from b where created_at >= now() - interval '30 days' group by 1) z),
    'attention', (select coalesce(jsonb_agg(x order by (x->>'urgency')::int, x->>'due'), '[]'::jsonb) from (
        select jsonb_build_object('activation_id', u.id, 'profile_id', u.profile_id, 'name', u.first_name || ' ' || coalesce(u.last_name, ''), 'email', u.email, 'phone', u.phone,
          'network', u.network, 'position', coalesce(public.role_title(u.position_code, u.network), u.position_code),
          'place', public.position_place(u.position_code, u.geo_country, u.geo_state, u.geo_lga, u.geo_cluster),
          'kind', u.kind, 'detail', u.detail, 'due', u.due, 'hours_left', round(extract(epoch from (u.due - now())) / 3600.0, 1), 'urgency', u.urg, 'day', u.current_day) x
        from (
          select b.*, 'expiring' kind, 1 urg, 'window closes in ' || greatest(0, round(extract(epoch from (due - now())) / 3600.0))::text || ' h, on day ' || current_day || ' of ' || total_days as detail
            from b where status = 'in_progress' and due - now() <= interval '24 hours'
          union all
          select b.*, 'never_started', 2, 'registered ' || round(extract(epoch from (now() - created_at)) / 3600.0)::text || ' h ago and has not opened Day 1'
            from b where status = 'in_progress' and first_activity_at is null and now() - created_at >= interval '24 hours' and due - now() > interval '24 hours'
          union all
          select b.*, 'stuck', 3, 'on day ' || current_day || ' for more than 24 h'
            from b where status = 'in_progress' and first_activity_at is not null and due - now() > interval '24 hours'
              and exists (select 1 from candidate_activation_steps st where st.activation_id = b.id and st.day = b.current_day and st.status <> 'completed' and now() - coalesce(st.started_at, b.created_at) >= interval '24 hours')
          union all
          select b.*, 'awaiting_review', 4, 'assessment submitted ' || round(extract(epoch from (now() - completed_at)) / 3600.0)::text || ' h ago, no HQ decision yet'
            from b where status = 'completed' and outcome is null and now() - completed_at >= interval '48 hours'
          union all
          select b.*, 'email_problem', 5, 'email ' || email || ': ' || ep from b where ep is not null and status in ('in_progress', 'completed')
          union all
          select b.*, 'duplicate', 6, 'same name as another registration; count as one person' from b where nk in (select nk from dup)
        ) u) s),
    'duplicates', (select coalesce(jsonb_agg(jsonb_build_object('name', nk, 'n', n, 'emails', emails)), '[]'::jsonb) from (
        select nk, count(*) n, jsonb_agg(email order by created_at) emails from b where nk in (select nk from dup) group by nk) d),
    'comms', (select jsonb_build_object(
        'sends', count(l.id), 'accepted', count(*) filter (where l.http_status between 200 and 299),
        'unverified', count(*) filter (where l.http_status = -2), 'queued', count(*) filter (where l.http_status is null and l.request_id is not null),
        'rejected', count(*) filter (where not l.sent), 'unknown', count(*) filter (where l.http_status = -1),
        'people_reached', count(distinct l.activation_id) filter (where l.sent), 'people_with_failures', count(distinct l.activation_id) filter (where not l.sent),
        'live_since', live_at,
        'welcome_missing', (select count(*) from b where live_at is not null and created_at >= live_at and not exists (select 1 from candidate_comms_log w where w.activation_id = b.id and w.trigger = 'welcome' and w.sent)),
        'before_live', (select count(*) from b where live_at is null or created_at < live_at),
        'by_trigger', (select coalesce(jsonb_agg(jsonb_build_object('trigger', trigger, 'sends', sends, 'people', people, 'failed', failed) order by trigger), '[]'::jsonb)
                       from (select l2.trigger, count(*) sends, count(distinct l2.activation_id) people, count(*) filter (where not l2.sent) failed
                             from candidate_comms_log l2 join b on b.id = l2.activation_id group by l2.trigger) t))
      from candidate_comms_log l join b on b.id = l.activation_id),
    'settings', (select to_jsonb(s) from activation_settings s where id = 1)
  ) into out;
  return out;
end; $$;
revoke execute on function public.hq_activation_stats(text, boolean) from anon;

-- ---------------------------------------------------------------------------
-- 2. the register, paged and filtered in the database (light rows, no answers)
-- ---------------------------------------------------------------------------
create or replace function public.hq_activation_register(p_route text default 'ref3', p_q text default null, p_network text default null,
  p_stage text default null, p_country text default null, p_include_test boolean default false, p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare out jsonb; q text := nullif(trim(coalesce(p_q, '')), '');
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  with b as (
    select a.*, coalesce(a.extension_until, a.deadline) as due, p.first_name, p.last_name, p.email, p.phone, p.birth_date, p.preferred_locale,
           ra.id as assessment_id, ra.status as a_status, ra.outcome, ra.rank_score, ra.recommendation, ra.tie_flag, ra.submitted_at, ra.clarifications, ra.readiness,
           public.name_key(p.first_name, p.last_name) as nk, public.email_problem(p.email) as ep,
           exists (select 1 from role_assignments r where r.profile_id = a.profile_id and r.ends_at is null and r.role::text = a.position_code) as appointed,
           (select count(*) from activation_route_days d where d.route = a.route) as days_total,
           case when a.status in ('incomplete','closed') then 'incomplete'
                when a.status = 'completed' then case when ra.outcome is not null then 'decided' else 'awaiting_review' end
                when a.first_activity_at is null then 'not_started' else 'in_progress' end as stage
    from candidate_activations a join profiles p on p.id = a.profile_id
    left join readiness_assessments ra on ra.activation_id = a.id
    where a.route = p_route and (p_include_test or not a.is_test)
      and (p_network is null or a.network = p_network)
      and (p_country is null or a.geo_country = p_country)),
  dup as (select public.name_key(p.first_name, p.last_name) nk from candidate_activations a join profiles p on p.id = a.profile_id where not a.is_test group by 1 having count(*) > 1),
  f as (
    select b.* from b
    where (p_stage is null or p_stage = '' or b.stage = p_stage or (p_stage = 'active' and b.status = 'in_progress') or (p_stage = 'completed' and b.status = 'completed'))
      and (q is null or (b.first_name || ' ' || coalesce(b.last_name, '') || ' ' || coalesce(b.email, '') || ' ' || coalesce(b.phone, '') || ' ' || coalesce(public.role_title(b.position_code, b.network), '')
            || ' ' || coalesce(b.geo_country, '') || ' ' || coalesce(b.geo_state, '') || ' ' || coalesce(b.geo_lga, '') || ' ' || coalesce(b.geo_cluster, '') || ' ' || coalesce(b.referrer_name, '')) ilike '%' || q || '%'))
  select jsonb_build_object(
    'total', (select count(*) from f),
    'countries', (select coalesce(jsonb_agg(distinct geo_country), '[]'::jsonb) from b where geo_country is not null),
    'rows', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select jsonb_build_object(
        'activation_id', f.id, 'profile_id', f.profile_id, 'name', f.first_name || ' ' || coalesce(f.last_name, ''), 'email', f.email, 'phone', f.phone,
        'birth_date', f.birth_date, 'language', f.preferred_locale, 'route', f.route, 'network', f.network,
        'position', coalesce(public.role_title(f.position_code, f.network), f.position_code), 'position_code', f.position_code,
        'position_place', public.position_place(f.position_code, f.geo_country, f.geo_state, f.geo_lga, f.geo_cluster),
        'country', f.geo_country, 'state', f.geo_state, 'lga', f.geo_lga, 'cluster', f.geo_cluster,
        'referrer_name', f.referrer_name, 'referrer_category', f.referrer_category,
        'status', f.status, 'stage', f.stage, 'day', f.current_day, 'days_total', f.days_total,
        'created_at', f.created_at, 'started_at', f.first_activity_at, 'deadline', f.due, 'hours_left', case when f.status = 'in_progress' then round(extract(epoch from (f.due - now())) / 3600.0, 1) end,
        'completed_at', f.completed_at, 'extension_status', f.extension_status,
        'assessment_id', f.assessment_id, 'assessment', case when f.status in ('incomplete','closed') and f.a_status = 'pending' then null else f.a_status end,
        'outcome', f.outcome, 'rank_score', f.rank_score, 'recommendation', f.recommendation, 'tie', f.tie_flag, 'appointed', f.appointed,
        'is_test', f.is_test, 'test_note', f.test_note, 'network_chosen', f.network_chosen, 'age_at_start', f.age_at_start,
        'steps', (select coalesce(jsonb_agg(jsonb_build_object('day', st.day, 'status', case when st.status = 'in_progress' and not public.step_has_activity(st) then 'not_started' else st.status end,
                    'seconds', st.seconds_spent, 'completed_at', st.completed_at) order by st.day), '[]'::jsonb) from candidate_activation_steps st where st.activation_id = f.id),
        'flags', (select coalesce(jsonb_agg(fl), '[]'::jsonb) from (
            select 'duplicate' fl where f.nk in (select nk from dup)
            union all select 'email_problem' where f.ep is not null
            union all select 'expiring' where f.status = 'in_progress' and f.due - now() <= interval '24 hours'
            union all select 'never_started' where f.status = 'in_progress' and f.first_activity_at is null and now() - f.created_at >= interval '24 hours'
            union all select 'awaiting_review' where f.status = 'completed' and f.outcome is null) z),
        'email_problem', f.ep) x
      from (select * from f order by f.created_at desc limit greatest(1, least(p_limit, 200)) offset greatest(p_offset, 0)) f) s)
  ) into out;
  return out;
end; $$;
revoke execute on function public.hq_activation_register(text, text, text, text, text, boolean, int, int) from anon;

-- ---------------------------------------------------------------------------
-- 3. one candidate, everything
-- ---------------------------------------------------------------------------
create or replace function public.hq_activation_candidate(p_activation uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  select jsonb_build_object(
    'activation_id', a.id, 'profile_id', p.id, 'name', p.first_name || ' ' || coalesce(p.last_name, ''), 'email', p.email, 'phone', p.phone,
    'birth_date', p.birth_date, 'language', p.preferred_locale, 'profile_status', p.status::text, 'is_leader', p.is_leader,
    'route', a.route, 'network', a.network, 'position', coalesce(public.role_title(a.position_code, a.network), a.position_code), 'position_code', a.position_code,
    'position_place', public.position_place(a.position_code, a.geo_country, a.geo_state, a.geo_lga, a.geo_cluster),
    'country', a.geo_country, 'state', a.geo_state, 'lga', a.geo_lga, 'cluster', a.geo_cluster, 'referrer_name', a.referrer_name, 'referrer_category', a.referrer_category,
    'status', a.status, 'day', a.current_day, 'created_at', a.created_at, 'first_activity_at', a.first_activity_at, 'deadline', coalesce(a.extension_until, a.deadline),
    'completed_at', a.completed_at, 'extension_status', a.extension_status, 'extension_reason', a.extension_reason, 'extension_until', a.extension_until,
    'is_test', a.is_test, 'test_note', a.test_note, 'network_chosen', a.network_chosen, 'age_at_start', a.age_at_start, 'form_data', a.form_data,
    'email_problem', public.email_problem(p.email),
    'steps', (select coalesce(jsonb_agg(jsonb_build_object('day', s.day, 'title', d.title, 'status', case when s.status = 'in_progress' and not public.step_has_activity(s) then 'not_started' else s.status end,
                'started_at', s.started_at, 'completed_at', s.completed_at, 'seconds', s.seconds_spent, 'reached_end', s.reached_end,
                'acks', coalesce(jsonb_array_length(case when jsonb_typeof(s.acks) = 'array' then s.acks else '[]'::jsonb end), 0), 'answers', s.answers) order by s.day), '[]'::jsonb)
              from candidate_activation_steps s left join activation_route_days d on d.route = a.route and d.day = s.day where s.activation_id = a.id),
    'assessment', case when ra.id is null then null else jsonb_build_object('id', ra.id, 'status', ra.status, 'submitted_at', ra.submitted_at, 'version', ra.version,
                'yes_count', (select count(*) from jsonb_each_text(coalesce(ra.statements, '{}'::jsonb)) e(k, v) where v = 'yes'),
                'clarifications', ra.clarifications, 'short_score', coalesce(ra.short_score, ra.short_score_auto), 'short_auto', ra.short_score is null,
                'readiness', ra.readiness, 'rank_score', ra.rank_score, 'recommendation', ra.recommendation, 'tie', ra.tie_flag,
                'understanding_review', ra.understanding_review, 'next_stage', ra.next_stage, 'outcome', ra.outcome, 'reviewed_at', ra.reviewed_at,
                'reviewer', (select first_name || ' ' || last_name from profiles where id = ra.reviewer_id), 'return_note', ra.return_note, 'hq_comments', ra.hq_comments) end,
    'appointed', exists (select 1 from role_assignments r where r.profile_id = p.id and r.ends_at is null and r.role::text = a.position_code),
    'seat', (select jsonb_build_object('role', r.role::text, 'unit', ou.name, 'since', r.starts_at) from role_assignments r join org_units ou on ou.id = r.org_unit_id where r.profile_id = p.id and r.ends_at is null order by r.starts_at desc limit 1),
    'comms', (select coalesce(jsonb_agg(jsonb_build_object('at', l.at, 'trigger', l.trigger, 'subject', l.subject, 'sent', l.sent, 'http_status', l.http_status, 'error', l.error) order by l.at desc), '[]'::jsonb) from candidate_comms_log l where l.activation_id = a.id),
    'errors', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'stage', e.stage, 'message', e.message) order by e.at desc), '[]'::jsonb) from activation_errors e where e.profile_id = p.id),
    'same_person', (select coalesce(jsonb_agg(jsonb_build_object('activation_id', o.id, 'email', op.email, 'phone', op.phone, 'status', o.status, 'created_at', o.created_at)), '[]'::jsonb)
                    from candidate_activations o join profiles op on op.id = o.profile_id
                    where o.id <> a.id and (public.name_key(op.first_name, op.last_name) = public.name_key(p.first_name, p.last_name)
                       or (public.phone_key(op.phone) is not null and public.phone_key(op.phone) = public.phone_key(p.phone))))
  ) into out
  from candidate_activations a join profiles p on p.id = a.profile_id left join readiness_assessments ra on ra.activation_id = a.id
  where a.id = p_activation;
  return out;
end; $$;
revoke execute on function public.hq_activation_candidate(uuid) from anon;

-- ---------------------------------------------------------------------------
-- 4. communications, with the mailer's real answer
-- ---------------------------------------------------------------------------
create or replace function public.hq_candidate_comms(p_limit integer default 200)
returns jsonb language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  perform public.comms_reconcile();
  select jsonb_build_object(
    'totals', (select jsonb_build_object('sends', count(*), 'accepted', count(*) filter (where http_status between 200 and 299),
                 'unverified', count(*) filter (where http_status = -2), 'queued', count(*) filter (where http_status is null and request_id is not null),
                 'rejected', count(*) filter (where not sent), 'unknown', count(*) filter (where http_status = -1),
                 'people', count(distinct activation_id) filter (where sent))
               from candidate_comms_log l join candidate_activations a on a.id = l.activation_id where not a.is_test),
    'by_trigger', (select coalesce(jsonb_agg(jsonb_build_object('trigger', trigger, 'sends', s, 'people', pp, 'failed', f) order by trigger), '[]'::jsonb)
                   from (select l.trigger, count(*) filter (where l.sent) s, count(distinct l.activation_id) filter (where l.sent) pp, count(*) filter (where not l.sent) f
                         from candidate_comms_log l join candidate_activations a on a.id = l.activation_id where not a.is_test group by l.trigger) x),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object('at', l.at, 'email', l.email, 'trigger', l.trigger, 'subject', l.subject, 'sent', l.sent, 'http_status', l.http_status, 'error', l.error) order by l.at desc), '[]'::jsonb)
               from (select l.* from candidate_comms_log l join candidate_activations a on a.id = l.activation_id where not a.is_test order by l.at desc limit greatest(1, least(1000, p_limit))) l),
    'undelivered', (select coalesce(jsonb_agg(jsonb_build_object('email', l.email, 'trigger', l.trigger, 'error', l.error, 'at', l.at, 'http_status', l.http_status) order by l.at desc), '[]'::jsonb)
                    from candidate_comms_log l join candidate_activations a on a.id = l.activation_id where not l.sent and not a.is_test)) into out;
  return out;
end; $$;
revoke execute on function public.hq_candidate_comms(integer) from anon;

-- the two forms: started means she did something, not that she registered
create or replace function public.hq_referral_forms()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', l.code, 'network', l.network, 'label', l.label, 'active', l.active,
      'visits', (select count(*) from referral_visits v where v.link_id = l.id),
      'visits_7d', (select count(*) from referral_visits v where v.link_id = l.id and v.visited_at >= now() - interval '7 days'),
      'visits_30d', (select count(*) from referral_visits v where v.link_id = l.id and v.visited_at >= now() - interval '30 days'),
      'last_visit', (select max(v.visited_at) from referral_visits v where v.link_id = l.id),
      'registrations', (select count(*) from candidate_activations a where a.referral_code = l.code and not a.is_test),
      'started', (select count(*) from candidate_activations a where a.referral_code = l.code and not a.is_test and a.first_activity_at is not null),
      'in_progress', (select count(*) from candidate_activations a where a.referral_code = l.code and not a.is_test and a.status = 'in_progress'),
      'completed', (select count(*) from candidate_activations a where a.referral_code = l.code and not a.is_test and a.status = 'completed'))
    order by l.code), '[]'::jsonb)
  from referral_links l where l.code in ('WGMN','WNNN') and public.is_case_hq();
$$;

-- ranking and master leave test records out
create or replace function public.hq_activation_ranking()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(g order by (g->>'n')::int desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'position', coalesce(public.role_title(a.position_code, a.network), a.position_code), 'network', a.network,
      'country', a.geo_country, 'state', a.geo_state, 'lga', a.geo_lga, 'cluster', a.geo_cluster,
      'n', count(*),
      'candidates', jsonb_agg(jsonb_build_object(
        'activation_id', a.id, 'assessment_id', r.id, 'profile_id', a.profile_id, 'name', p.first_name || ' ' || p.last_name, 'email', p.email,
        'rank_score', r.rank_score, 'yes_count', (select count(*) from jsonb_each_text(r.statements) e(k,v) where v = 'yes'),
        'clarifications', r.clarifications, 'short_score', coalesce(r.short_score, r.short_score_auto), 'short_auto', r.short_score is null,
        'readiness', r.readiness, 'days_taken', extract(epoch from (a.completed_at - a.started_at)) / 86400.0,
        'hours_taken', extract(epoch from (a.completed_at - a.started_at)) / 3600.0,
        'on_time', a.completed_at <= coalesce(a.extension_until, a.deadline), 'recommendation', r.recommendation, 'tie', r.tie_flag,
        'understanding_review', r.understanding_review, 'next_stage', r.next_stage, 'outcome', r.outcome, 'reviewed', r.reviewed_at is not null,
        'appointed', exists (select 1 from role_assignments ra where ra.profile_id = a.profile_id and ra.ends_at is null and ra.role::text = a.position_code))
        order by r.rank_score desc nulls last, r.clarifications asc nulls last, a.completed_at asc)) as g
    from candidate_activations a join profiles p on p.id = a.profile_id
    join readiness_assessments r on r.activation_id = a.id
    where a.status = 'completed' and not a.is_test and public.is_case_hq()
    group by a.position_code, a.network, a.geo_country, a.geo_state, a.geo_lga, a.geo_cluster) s;
$$;

insert into public.schema_migrations (version, name) values (161, 'activation_analytics_accuracy') on conflict (version) do nothing;
