-- ============================================================================
-- WDOS Migration 156 — The place shown follows the position's level (Phase 204)
-- Mfon: "considered for Country Representative, Gwarimpa" — the form captured
-- her whole line (country, state, LGA, community cluster) and the screen took
-- the smallest unit. A Country Representative is considered for the COUNTRY;
-- a State Coordinator for the STATE; an LGA Coordinator for the LGA; a
-- cluster or chapter role for the COMMUNITY CLUSTER. Same rule on the
-- candidate's screen, the HQ register and the ranking groups.
-- ============================================================================
create or replace function public.position_place(p_role text, p_country text, p_state text, p_lga text, p_cluster text)
returns text language sql immutable as $$
  select case
    when p_role in ('country_rep','deputy_country_rep') then p_country
    when p_role in ('state_coordinator','assistant_state_coordinator','state_secretary') then concat_ws(', ', p_state, p_country)
    when p_role in ('district_coordinator','assistant_district_coordinator') then concat_ws(', ', p_lga, p_state)
    else concat_ws(', ', p_cluster, p_lga, p_state) end;
$$;

create or replace function public.my_activation()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); a candidate_activations%rowtype; p profiles%rowtype; ra readiness_assessments%rowtype;
begin
  if me is null then return null; end if;
  select * into a from candidate_activations where profile_id = me and status <> 'closed' order by created_at desc limit 1;
  if not found then return null; end if;
  select * into p from profiles where id = me;
  select * into ra from readiness_assessments where activation_id = a.id;
  return jsonb_build_object(
    'id', a.id, 'route', a.route, 'route_label', case when a.route = 'ref3' then 'Referral Activation' else '7-Day Activation' end,
    'network', a.network, 'network_name', case when a.network = 'WNNN' then 'WODDI Nurture NextGen Network' else 'WODDI Good Mother Network' end,
    'role', a.role, 'role_title', coalesce(public.role_title(a.role, a.network), a.role),
    'unit', coalesce(nullif(public.position_place(a.role, a.geo_country, a.geo_state, a.geo_lga, a.geo_cluster), ''), (select name from org_units where id = a.org_unit_id)),
    'place', concat_ws(', ', a.geo_cluster, a.geo_lga, a.geo_state, a.geo_country),
    'status', a.status, 'current_day', a.current_day, 'started_at', a.started_at,
    'deadline', coalesce(a.extension_until, a.deadline), 'extension_status', a.extension_status,
    'completed_at', a.completed_at, 'pack_version', a.pack_version,
    'referrer', (select first_name || ' ' || last_name from profiles where id = a.referrer_id),
    'first_name', p.first_name, 'last_name', p.last_name, 'email', p.email, 'phone', p.phone, 'country', coalesce(a.geo_country, p.country), 'state_region', coalesce(a.geo_state, p.state_region),
    'days', (select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day, 'title', d.title, 'purpose', d.purpose, 'instruction', d.instruction, 'content', d.content,
        'notice', d.notice, 'acks', d.acks, 'questions', d.questions, 'needs_profile', d.needs_profile,
        'has_assessment', d.has_assessment, 'version', d.version,
        'status', coalesce(st.status, 'not_started'), 'answers', coalesce(st.answers, '{}'::jsonb),
        'acked', coalesce(st.acks, '[]'::jsonb), 'completed_at', st.completed_at) order by d.day), '[]'::jsonb)
       from activation_route_days d left join candidate_activation_steps st on st.activation_id = a.id and st.day = d.day
      where d.route = a.route),
    'assessment', case when ra.id is null then null else jsonb_build_object('status', ra.status, 'answers', ra.answers,
        'submitted_at', ra.submitted_at, 'return_note', ra.return_note, 'disclosed', ra.disclosed, 'version', ra.version, 'outcome', ra.outcome) end,
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('seq', seq, 'question', question) order by seq), '[]'::jsonb) from readiness_questions),
    'notice', 'Access to this pack is for assessment. It does not constitute appointment.');
end; $$;
revoke execute on function public.my_activation() from anon;

-- ranking groups by the position's level, so two Country Representative
-- candidates for Nigeria are compared together whatever LGA they live in
create or replace function public.hq_activation_ranking()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(g order by (g->>'n')::int desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'position', coalesce(public.role_title(a.position_code, a.network), a.position_code), 'network', a.network,
      'country', a.geo_country,
      'state', case when a.position_code in ('country_rep','deputy_country_rep') then null else a.geo_state end,
      'lga', case when a.position_code in ('country_rep','deputy_country_rep','state_coordinator','assistant_state_coordinator','state_secretary') then null else a.geo_lga end,
      'cluster', case when a.position_code in ('cluster_coordinator','assistant_cluster_coordinator','chapter_lead','assistant_chapter_lead') then a.geo_cluster else null end,
      'n', count(*),
      'candidates', jsonb_agg(jsonb_build_object(
        'activation_id', a.id, 'assessment_id', r.id, 'name', p.first_name || ' ' || p.last_name, 'email', p.email,
        'place', concat_ws(', ', a.geo_cluster, a.geo_lga, a.geo_state),
        'rank_score', r.rank_score, 'yes_count', (select count(*) from jsonb_each_text(r.statements) e(k,v) where v = 'yes'),
        'clarifications', r.clarifications, 'short_score', r.short_score, 'readiness', r.readiness,
        'days_taken', extract(epoch from (a.completed_at - a.started_at)) / 86400.0,
        'on_time', a.completed_at <= a.deadline, 'age_band_ok', null,
        'understanding_review', r.understanding_review, 'next_stage', r.next_stage, 'outcome', r.outcome, 'reviewed', r.reviewed_at is not null)
        order by r.rank_score desc nulls last, r.clarifications asc nulls last, a.completed_at asc)) as g
    from candidate_activations a join profiles p on p.id = a.profile_id
    join readiness_assessments r on r.activation_id = a.id
    where a.status = 'completed' and public.is_case_hq()
    group by a.position_code, a.network, a.geo_country,
      case when a.position_code in ('country_rep','deputy_country_rep') then null else a.geo_state end,
      case when a.position_code in ('country_rep','deputy_country_rep','state_coordinator','assistant_state_coordinator','state_secretary') then null else a.geo_lga end,
      case when a.position_code in ('cluster_coordinator','assistant_cluster_coordinator','chapter_lead','assistant_chapter_lead') then a.geo_cluster else null end) s;
$$;
revoke execute on function public.hq_activation_ranking() from anon;

create or replace function public.hq_activation_master(p_days int default 365)
returns jsonb language plpgsql security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => coalesce(p_days, 365)); out jsonb;
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  perform public.activation_sweep();
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
          'network_chosen', a.network_chosen, 'age_at_start', a.age_at_start, 'age_band_ok', null,
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

insert into public.schema_migrations (version, name) values (156, 'place_by_position_level') on conflict (version) do nothing;
