-- ============================================================================
-- WDOS Migration 155 — my_activation() carries her last name (Phase 203)
-- The assessment header showed "Ade undefined" because only first_name was
-- returned. Adds last_name and the network's full name.
-- ============================================================================
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
    'unit', coalesce(a.geo_cluster, a.geo_lga, a.geo_state, (select name from org_units where id = a.org_unit_id)),
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
insert into public.schema_migrations (version, name) values (155, 'activation_last_name') on conflict (version) do nothing;
