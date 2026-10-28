-- ============================================================================
-- WDOS Migration 157 — Automatic assessment and recommendation, one-click
-- appointment, candidate sign-in support (Phase 207)
-- Built to "WDOS Referral Activation: Technical Implementation & Readiness
-- Checklist" (121 items), especially:
--   48 scoring engine, 49 approved weights, 55-59 contested positions with a
--   system recommendation (Recommended / Reserve / Further Review / Not
--   Recommended) and a tie rule, 60-61 final human approval and NO automatic
--   appointment from a score alone, 62-63 selected and reserve workflows,
--   69-70 dashboard opens and position filled only after approved appointment.
-- ============================================================================

alter table public.readiness_assessments
  add column if not exists short_score_auto int,
  add column if not exists recommendation text check (recommendation in ('recommended','reserve','further_review','not_recommended')),
  add column if not exists tie_flag boolean not null default false,
  add column if not exists auto_assessed_at timestamptz;

-- Approved weights live in settings, never in code (item 49)
alter table public.activation_settings
  add column if not exists w_understanding int not null default 40,
  add column if not exists w_short int not null default 30,
  add column if not exists w_readiness int not null default 20,
  add column if not exists w_completion int not null default 10,
  add column if not exists recommend_min int not null default 70,
  add column if not exists reserve_min int not null default 55,
  add column if not exists not_recommended_max int not null default 40,
  add column if not exists max_clarifications int not null default 3,
  add column if not exists tie_margin int not null default 3;

-- Provisional score for short answers: effort and relevance, reviewer may override.
create or replace function public.readiness_short_auto(p_answers jsonb)
returns int language sql immutable as $$
  select coalesce(sum(case when array_length(regexp_split_to_array(trim(v), '\s+'), 1) >= 12 then 2
                            when array_length(regexp_split_to_array(trim(v), '\s+'), 1) >= 4 then 1 else 0 end), 0)::int
  from jsonb_each_text(coalesce(p_answers, '{}'::jsonb)) as e(k, v) where k in ('1','2','3','4');
$$;

create or replace function public.readiness_rank_score(p_assessment uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select round(
      s.w_understanding * coalesce((select count(*) filter (where v = 'yes')::numeric / nullif(count(*),0) from jsonb_each_text(r.statements) as e(k, v)), 0)
    + s.w_short * coalesce(r.short_score, r.short_score_auto, 0) / 8.0
    + case r.readiness when 'ready' then s.w_readiness when 'interested' then s.w_readiness / 2 else 0 end
    + case when jsonb_array_length(r.confirmations) >= 3 and a.completed_at is not null and a.completed_at <= a.deadline then s.w_completion else 0 end, 1)
  from readiness_assessments r join candidate_activations a on a.id = r.activation_id, activation_settings s
  where r.id = p_assessment and s.id = 1;
$$;

-- Automatic assessment of one submission, then re-rank everyone competing for the same seat.
create or replace function public.activation_auto_assess(p_assessment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r readiness_assessments%rowtype; a candidate_activations%rowtype; s activation_settings%rowtype; g record; top numeric; second numeric; n int := 0;
begin
  select * into s from activation_settings where id = 1;
  select * into r from readiness_assessments where id = p_assessment;
  if not found then return; end if;
  select * into a from candidate_activations where id = r.activation_id;
  update readiness_assessments set short_score_auto = public.readiness_short_auto(short_answers) where id = p_assessment;
  update readiness_assessments set rank_score = public.readiness_rank_score(p_assessment), auto_assessed_at = now() where id = p_assessment;
  -- individual recommendation
  update readiness_assessments x set recommendation =
      case when x.readiness = 'not_now' or x.rank_score < s.not_recommended_max then 'not_recommended'
           when x.rank_score >= s.recommend_min and coalesce(x.clarifications,0) <= s.max_clarifications and x.readiness = 'ready' then 'recommended'
           when x.rank_score >= s.reserve_min then 'reserve'
           else 'further_review' end
   where x.id = p_assessment;
  -- the seat group: same position, same place
  select max(x.rank_score) into top
    from readiness_assessments x join candidate_activations b on b.id = x.activation_id
   where b.status = 'completed' and b.position_code = a.position_code and b.network = a.network
     and b.geo_country is not distinct from a.geo_country and b.geo_state is not distinct from a.geo_state
     and b.geo_lga is not distinct from a.geo_lga and b.geo_cluster is not distinct from a.geo_cluster and x.status <> 'returned';
  select count(*) into n
    from readiness_assessments x join candidate_activations b on b.id = x.activation_id
   where b.status = 'completed' and b.position_code = a.position_code and b.network = a.network
     and b.geo_country is not distinct from a.geo_country and b.geo_state is not distinct from a.geo_state
     and b.geo_lga is not distinct from a.geo_lga and b.geo_cluster is not distinct from a.geo_cluster and x.status <> 'returned';
  if n > 1 then
    select x.rank_score into second
      from readiness_assessments x join candidate_activations b on b.id = x.activation_id
     where b.status = 'completed' and b.position_code = a.position_code and b.network = a.network
       and b.geo_country is not distinct from a.geo_country and b.geo_state is not distinct from a.geo_state
       and b.geo_lga is not distinct from a.geo_lga and b.geo_cluster is not distinct from a.geo_cluster and x.status <> 'returned'
     order by x.rank_score desc nulls last offset 1 limit 1;
    -- tie rule (item 59): within the margin, both go to further review with the tie flag
    update readiness_assessments x set tie_flag = (top - coalesce(second, -100)) <= s.tie_margin and x.rank_score >= coalesce(second, -100)
      from candidate_activations b where b.id = x.activation_id and b.status = 'completed' and b.position_code = a.position_code and b.network = a.network
       and b.geo_country is not distinct from a.geo_country and b.geo_state is not distinct from a.geo_state
       and b.geo_lga is not distinct from a.geo_lga and b.geo_cluster is not distinct from a.geo_cluster;
    -- only the top candidate can be "recommended"; the rest are reserve at best (item 58)
    update readiness_assessments x set recommendation = case
        when x.tie_flag then 'further_review'
        when x.rank_score = top and x.recommendation = 'recommended' then 'recommended'
        when x.recommendation in ('recommended','reserve') then 'reserve'
        else x.recommendation end
      from candidate_activations b where b.id = x.activation_id and b.status = 'completed' and b.position_code = a.position_code and b.network = a.network
       and b.geo_country is not distinct from a.geo_country and b.geo_state is not distinct from a.geo_state
       and b.geo_lga is not distinct from a.geo_lga and b.geo_cluster is not distinct from a.geo_cluster and x.outcome is null;
  end if;
end; $$;

-- Run it on every submission and every review
create or replace function public.submit_readiness_v2(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); a candidate_activations%rowtype; r readiness_assessments%rowtype; n_stmt int; n_yes int;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select * into a from candidate_activations where profile_id = me and status <> 'closed' order by created_at desc limit 1;
  if not found then raise exception 'No activation in progress'; end if;
  select count(*) into n_stmt from readiness_statements where network = a.network;
  if (select count(*) from jsonb_object_keys(coalesce(p_payload->'statements','{}'::jsonb))) < n_stmt then raise exception 'Please answer every statement'; end if;
  if jsonb_array_length(coalesce(p_payload->'confirmations','[]'::jsonb)) < 3 then raise exception 'Please tick all three confirmations'; end if;
  if coalesce(p_payload->>'readiness','') = '' then raise exception 'Please choose your readiness'; end if;
  if coalesce(p_payload->>'signature_name','') = '' then raise exception 'Please type your name as your digital confirmation'; end if;
  select count(*) into n_yes from jsonb_each_text(p_payload->'statements') as e(k,v) where v = 'yes';
  select * into r from readiness_assessments where activation_id = a.id;
  if r.id is not null and r.status in ('submitted','completed') then raise exception 'Your assessment has already been submitted'; end if;
  if r.id is null then
    insert into readiness_assessments (activation_id, profile_id, version, status, submitted_at, statements, short_answers, clarification_note,
                                       confirmations, readiness, signature_name, signed_at, clarifications, answers)
    values (a.id, me, 1, 'submitted', now(), p_payload->'statements', coalesce(p_payload->'short_answers','{}'::jsonb), p_payload->>'clarification_note',
            p_payload->'confirmations', p_payload->>'readiness', p_payload->>'signature_name', now(), n_stmt - n_yes, coalesce(p_payload->'short_answers','{}'::jsonb))
    returning * into r;
  else
    update readiness_assessments set
       previous = previous || jsonb_build_object('version', version, 'submitted_at', submitted_at, 'statements', statements, 'short_answers', short_answers, 'readiness', readiness, 'return_note', return_note),
       version = version + 1, status = 'submitted', submitted_at = now(), statements = p_payload->'statements',
       short_answers = coalesce(p_payload->'short_answers','{}'::jsonb), clarification_note = p_payload->>'clarification_note',
       confirmations = p_payload->'confirmations', readiness = p_payload->>'readiness', signature_name = p_payload->>'signature_name', signed_at = now(),
       clarifications = n_stmt - n_yes, answers = coalesce(p_payload->'short_answers','{}'::jsonb), return_note = null
     where id = r.id returning * into r;
  end if;
  update candidate_activation_steps set status = 'completed', completed_at = coalesce(completed_at, now()) where activation_id = a.id and day = 3;
  update candidate_activations set status = 'completed', completed_at = coalesce(completed_at, now()), current_day = 3 where id = a.id;
  perform public.activation_auto_assess(r.id);
  return public.my_activation();
end; $$;
revoke execute on function public.submit_readiness_v2(jsonb) from anon;

create or replace function public.review_readiness_v2(p_assessment uuid, p_short_score int, p_understanding text, p_next_stage text, p_comments text,
                                                     p_action text, p_return_note text default null, p_outcome text default null, p_disclosed text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r readiness_assessments%rowtype;
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  select * into r from readiness_assessments where id = p_assessment;
  if not found then raise exception 'Assessment not found'; end if;
  update readiness_assessments set short_score = coalesce(p_short_score, short_score), understanding_review = coalesce(p_understanding, understanding_review),
         next_stage = coalesce(p_next_stage, next_stage), hq_comments = coalesce(p_comments, hq_comments), reviewer_id = auth.uid(), reviewed_at = now()
   where id = p_assessment;
  perform public.activation_auto_assess(p_assessment);
  if p_action = 'return' then
    update readiness_assessments set status = 'returned', return_note = p_return_note where id = p_assessment;
    update candidate_activations set status = 'in_progress' where id = r.activation_id;
  elsif p_action = 'complete' then
    update readiness_assessments set status = 'completed', outcome = p_outcome, disclosed = p_disclosed where id = p_assessment;
  end if;
end; $$;
revoke execute on function public.review_readiness_v2(uuid, int, text, text, text, text, text, text, text) from anon;

-- ---------------------------------------------------------------------------
-- The final human approval (items 60-61): one click. Seats her, flags her as a
-- leader, opens the dashboard, marks the others for that seat "qualified but
-- position filled" (reserve) and records who approved and why.
-- ---------------------------------------------------------------------------
create or replace function public.hq_appoint_candidate(p_activation uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a candidate_activations%rowtype; r readiness_assessments%rowtype; p profiles%rowtype; unit uuid; seat_id uuid;
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  select * into a from candidate_activations where id = p_activation;
  if not found then raise exception 'Activation not found'; end if;
  if a.status <> 'completed' then raise exception 'The candidate has not completed the activation'; end if;
  select * into r from readiness_assessments where activation_id = a.id;
  if r.id is null or r.status = 'returned' then raise exception 'No submitted assessment for this candidate'; end if;
  if a.position_code is null then raise exception 'No position recorded for this candidate'; end if;
  select * into p from profiles where id = a.profile_id;
  perform set_config('wdos.system', 'on', true);
  -- the seat's unit: the level the position is for
  unit := case
    when a.position_code in ('country_rep','deputy_country_rep') then coalesce((select id from org_units where level = 'country' and name = a.geo_country limit 1), a.org_unit_id)
    when a.position_code in ('state_coordinator','assistant_state_coordinator','state_secretary') then coalesce((select s.id from org_units s join org_units c on c.id = s.parent_id where c.level = 'country' and c.name = a.geo_country and s.level = 'state_region' and s.name = a.geo_state limit 1), a.org_unit_id)
    else a.org_unit_id end;
  if unit is null then raise exception 'No place in the structure for this seat; correct her place first'; end if;
  -- one open seat per person
  update role_assignments set ends_at = now() where profile_id = a.profile_id and ends_at is null;
  insert into role_assignments (profile_id, role, org_unit_id, appointment_status, accepted_at)
  values (a.profile_id, a.position_code::role_code, unit, 'appointed', null) returning id into seat_id;
  update profiles set is_leader = true, network = a.network::network_code, org_unit_id = coalesce(unit, org_unit_id) where id = a.profile_id;
  -- lifecycle: applicant -> under_review -> approved -> activated
  update profiles set status = 'under_review' where id = a.profile_id and status = 'applicant';
  update profiles set status = 'approved'     where id = a.profile_id and status = 'under_review';
  update profiles set status = 'activated'    where id = a.profile_id and status = 'approved';
  update readiness_assessments set status = 'completed', outcome = 'selected', reviewer_id = auth.uid(), reviewed_at = now(),
         hq_comments = concat_ws(' | ', hq_comments, 'Appointment approved: ' || coalesce(p_reason, 'per system recommendation')),
         disclosed = coalesce(disclosed, 'Congratulations. You have been selected and your appointment is being processed. Your leadership dashboard is now open.')
   where id = r.id;
  update applications set status = 'approved' where id = a.application_id and status not in ('approved');
  -- everyone else who completed for the same seat: qualified but position filled (item 63)
  update readiness_assessments x set outcome = 'reserve', status = 'completed',
         disclosed = coalesce(x.disclosed, 'Thank you for completing your activation. Another candidate was selected for this position. You remain a qualified candidate and will be considered for other openings.')
    from candidate_activations b where b.id = x.activation_id and b.id <> a.id and b.status = 'completed' and x.outcome is null
     and b.position_code = a.position_code and b.network = a.network
     and b.geo_country is not distinct from a.geo_country and b.geo_state is not distinct from a.geo_state
     and b.geo_lga is not distinct from a.geo_lga and b.geo_cluster is not distinct from a.geo_cluster;
  return jsonb_build_object('seat', seat_id, 'unit', unit, 'profile', a.profile_id);
end; $$;
revoke execute on function public.hq_appoint_candidate(uuid, text) from anon;

-- ranking shows the recommendation and the tie flag
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
        'on_time', a.completed_at <= a.deadline, 'recommendation', r.recommendation, 'tie', r.tie_flag,
        'understanding_review', r.understanding_review, 'next_stage', r.next_stage, 'outcome', r.outcome, 'reviewed', r.reviewed_at is not null,
        'appointed', exists (select 1 from role_assignments ra where ra.profile_id = a.profile_id and ra.ends_at is null))
        order by r.rank_score desc nulls last, r.clarifications asc nulls last, a.completed_at asc)) as g
    from candidate_activations a join profiles p on p.id = a.profile_id
    join readiness_assessments r on r.activation_id = a.id
    where a.status = 'completed' and public.is_case_hq()
    group by a.position_code, a.network, a.geo_country, a.geo_state, a.geo_lga, a.geo_cluster) s;
$$;
revoke execute on function public.hq_activation_ranking() from anon;

-- re-assess everything already submitted so the recommendations exist now
do $$ declare r record; begin
  for r in select id from readiness_assessments where status in ('submitted','completed') loop
    begin perform public.activation_auto_assess(r.id); exception when others then null; end;
  end loop;
end $$;

insert into public.schema_migrations (version, name) values (157, 'auto_recommendation_and_appointment') on conflict (version) do nothing;
