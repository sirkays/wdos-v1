-- ============================================================================
-- 161 - Activation analytics: accurate figures, scalable HQ page, real mailer
--       status. APPLIED LIVE through the connector on 27 Sep 2026; this file is
--       the record. Do not paste it again.
--
-- What was wrong (audited against raw rows, 27 Sep 2026):
--   * "Started" counted every registration because an activation is created
--     in_progress at sign-up. 5 of 9 candidates had never touched Day 1.
--   * One person with two accounts counted as two candidates.
--   * An expired activation still showed the assessment as "pending".
--   * Reminder tiles counted sends, not people.
--   * "Delivered to the mailer" meant "queued": Brevo's answer was never read.
--   * Test records sat inside the statistics with no way to exclude them.
--   * The whole register (every answer of every candidate) travelled to the
--     browser in one JSON: fine for 9 candidates, not for 900.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A. columns
-- ---------------------------------------------------------------------------
alter table public.candidate_activations
  add column if not exists is_test boolean not null default false,
  add column if not exists test_note text,
  add column if not exists first_activity_at timestamptz;
create index if not exists candidate_activations_route_created_idx on public.candidate_activations (route, created_at desc);
create index if not exists candidate_activations_profile_idx on public.candidate_activations (profile_id);

alter table public.candidate_comms_log
  add column if not exists request_id bigint,
  add column if not exists http_status int,
  add column if not exists mailer_reply text;
create index if not exists candidate_comms_log_activation_idx on public.candidate_comms_log (activation_id, trigger);
create index if not exists candidate_comms_log_pending_idx on public.candidate_comms_log (request_id) where http_status is null and request_id is not null;

-- ---------------------------------------------------------------------------
-- B. "activity" = she did something on a day (time, an answer, a tick, the end
--    of the reading, or a completed day). first_activity_at is set once, by
--    trigger, the first time any step shows activity.
-- ---------------------------------------------------------------------------
create or replace function public.step_has_activity(s public.candidate_activation_steps)
returns boolean language sql immutable as $$
  select coalesce(s.seconds_spent, 0) > 0 or coalesce(s.reached_end, false) or s.status = 'completed'
      or (jsonb_typeof(s.answers) = 'object' and s.answers <> '{}'::jsonb)
      or (jsonb_typeof(s.acks) = 'array' and jsonb_array_length(s.acks) > 0);
$$;

create or replace function public.candidate_steps_activity_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.step_has_activity(new) then
    update candidate_activations set first_activity_at = now() where id = new.activation_id and first_activity_at is null;
  end if;
  return new;
end; $$;
drop trigger if exists candidate_steps_activity on public.candidate_activation_steps;
create trigger candidate_steps_activity after insert or update on public.candidate_activation_steps
  for each row execute function public.candidate_steps_activity_trg();

-- backfill: the earliest evidence we have (for Day 1 that is its completion time,
-- because its start time is the sign-up time)
update public.candidate_activations a set first_activity_at = x.t
from (select s.activation_id, min(case when s.day = 1 then coalesce(s.completed_at, s.started_at) else s.started_at end) t
        from public.candidate_activation_steps s where public.step_has_activity(s) group by s.activation_id) x
where x.activation_id = a.id and a.first_activity_at is null;

-- ---------------------------------------------------------------------------
-- C. data quality helpers: a mistyped email, and "the same person"
-- ---------------------------------------------------------------------------
create or replace function public.email_problem(p_email text) returns text language sql immutable as $$
  select case
    when p_email is null or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[A-Za-z]{2,}$' then 'not a valid email address'
    when lower(p_email) ~ '\.(con|cmo|ocm|coom|cpm|vom|xom|comm)$' then 'the ending looks mistyped (".com"?)'
    when lower(p_email) ~ '@(gmial|gamil|gmal|gmai|gmaill|gnail|gmali|yaho|yahooo|hotmial|hotmal|outlok|outloo|iclod|icloud\.co)\b' then 'the domain looks mistyped'
    when lower(p_email) ~ '@(gmail|yahoo|hotmail|outlook)\.co$' then 'the ending looks incomplete (".com"?)'
    else null end;
$$;

create or replace function public.name_key(p_first text, p_last text) returns text language sql immutable as $$
  select nullif(trim(regexp_replace(lower(coalesce(p_first, '') || ' ' || coalesce(p_last, '')), '[^a-z0-9]+', ' ', 'g')), '');
$$;
create or replace function public.phone_key(p_phone text) returns text language sql immutable as $$
  select case when length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 9
              then right(regexp_replace(p_phone, '\D', '', 'g'), 9) else null end;
$$;

-- ---------------------------------------------------------------------------
-- D. the mailer's real answer. send_email() queues the request with pg_net and
--    returns true; Brevo's response lands in net._http_response later and is
--    kept for a few hours. We keep the request id and read the answer back.
-- ---------------------------------------------------------------------------
create or replace function public.send_email_req(to_email text, to_name text, subj text, html text)
returns bigint language plpgsql security definer set search_path = public as $$
declare api text; frm text; frm_name text; rid bigint;
begin
  if to_email is null or position('@' in to_email) = 0 then return null; end if;
  select value into api from email_secrets where key = 'brevo_api_key';
  select value into frm from email_secrets where key = 'email_from';
  select value into frm_name from email_secrets where key = 'email_from_name';
  if api is null or frm is null then return null; end if;
  select net.http_post(
    url := 'https://api.brevo.com/v3/smtp/email',
    headers := jsonb_build_object('api-key', api, 'Content-Type', 'application/json', 'accept', 'application/json'),
    body := jsonb_build_object('sender', jsonb_build_object('email', frm, 'name', coalesce(frm_name, 'WODDI')),
      'to', jsonb_build_array(jsonb_build_object('email', to_email, 'name', coalesce(to_name, to_email))),
      'subject', subj, 'htmlContent', html)) into rid;
  return rid;
exception when others then return null;
end; $$;
revoke execute on function public.send_email_req(text, text, text, text) from anon, authenticated;

create or replace function public.candidate_notify(p_activation uuid, p_trigger text, p_extra jsonb default '{}'::jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare a candidate_activations%rowtype; p profiles%rowtype; m candidate_messages%rowtype; subj text; body text; rid bigint; err text;
begin
  select * into a from candidate_activations where id = p_activation; if not found then return false; end if;
  if a.is_test then return false; end if;   -- test records never email anyone
  select * into p from profiles where id = a.profile_id; if not found or p.email is null then return false; end if;
  select * into m from candidate_messages where trigger = p_trigger and active; if not found then return false; end if;
  -- once per trigger per activation; day_ready once per day; the two daily reminders are paced by the sweep
  if p_trigger not in ('day_ready','reminder_in_progress','reminder_not_started') and exists (select 1 from candidate_comms_log where activation_id = p_activation and trigger = p_trigger and sent) then return false; end if;
  if p_trigger = 'day_ready' and exists (select 1 from candidate_comms_log where activation_id = p_activation and trigger = p_trigger and sent and subject like '%Day ' || (p_extra->>'day') || ' %') then return false; end if;
  subj := m.subject; body := m.body;
  subj := replace(replace(subj, '[First Name]', coalesce(p.first_name,'')), '[#]', coalesce(p_extra->>'day',''));
  body := replace(body, '[First Name]', coalesce(p.first_name, ''));
  body := replace(body, '[Network]', case when a.network = 'WNNN' then 'WODDI Nurture NextGen Network (WNNN)' else 'WODDI Good Mother Network (WGMN)' end);
  body := replace(body, '[Position]', coalesce(public.role_title(a.position_code, a.network), a.position_code, 'volunteer leadership'));
  body := replace(body, '[Deadline]', to_char(coalesce(a.extension_until, a.deadline) at time zone 'Africa/Lagos', 'FMDay DD Month YYYY, HH24:MI'));
  body := replace(body, '[New Date]', coalesce(p_extra->>'new_date', to_char(coalesce(a.extension_until, a.deadline) at time zone 'Africa/Lagos', 'FMDay DD Month YYYY')));
  body := replace(body, '[#]', coalesce(p_extra->>'day',''));
  body := replace(body, '[Link]', 'https://woddicrm.org/#/candidate');
  begin
    rid := public.send_email_req(p.email, p.first_name || ' ' || coalesce(p.last_name,''), subj, public.email_wrap(subj, replace(body, E'\n', '<br>')));
  exception when others then rid := null; err := sqlerrm; end;
  if rid is null and err is null then err := 'mailer not configured or address unusable'; end if;
  insert into candidate_comms_log (activation_id, profile_id, email, trigger, subject, sent, error, request_id)
  values (p_activation, p.id, p.email, p_trigger, subj, rid is not null, err, rid);
  return rid is not null;
end; $$;

-- read Brevo's answers back into the log
create or replace function public.comms_reconcile() returns integer
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update candidate_comms_log l
     set http_status = coalesce(r.status_code, 0),
         mailer_reply = left(coalesce(r.error_msg, r.content::text), 300),
         sent = coalesce(r.status_code, 0) between 200 and 299,
         error = case when coalesce(r.status_code, 0) between 200 and 299 then null
                      else coalesce(r.error_msg, 'mailer answered HTTP ' || coalesce(r.status_code::text, '0') || ': ' || left(r.content::text, 200)) end
    from net._http_response r
   where r.id = l.request_id and l.http_status is null;
  get diagnostics n = row_count;
  -- anything older than 8 hours with no answer left in pg_net: mark as unknown, not as sent
  update candidate_comms_log set http_status = -1, mailer_reply = 'no answer recorded by the mailer queue'
   where http_status is null and request_id is not null and at < now() - interval '8 hours';
  return n;
end; $$;
revoke execute on function public.comms_reconcile() from anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'wdos_comms_reconcile';
select cron.schedule('wdos_comms_reconcile', '*/5 * * * *', $$select public.comms_reconcile()$$);

-- ---------------------------------------------------------------------------
-- E. test records: HQ marks a record as test; it leaves every statistic and
--    never receives another email. It stays visible in the register, labelled.
-- ---------------------------------------------------------------------------
create or replace function public.hq_activation_set_test(p_activation uuid, p_is_test boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  update candidate_activations set is_test = coalesce(p_is_test, false), test_note = case when coalesce(p_is_test, false) then coalesce(p_note, test_note, 'marked as test by HQ') else null end
   where id = p_activation;
  if not found then raise exception 'Activation not found'; end if;
end; $$;
revoke execute on function public.hq_activation_set_test(uuid, boolean, text) from anon;

-- ---------------------------------------------------------------------------
-- F. appointment seats a Community Cluster coordinator at HER CLUSTER, created
--    under the LGA if it does not exist yet, and finds the LGA by name when the
--    activation only carries the state. Countries are matched by ISO code first.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_org_unit(p_parent uuid, p_level public.org_level, p_name text, p_iso char(2))
returns uuid language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if nullif(trim(p_name), '') is null then return null; end if;
  select id into u from org_units where parent_id is not distinct from p_parent and level = p_level and lower(name) = lower(trim(p_name)) limit 1;
  if u is null then
    insert into org_units (parent_id, level, name, country_iso, is_active) values (p_parent, p_level, trim(p_name), p_iso, true) returning id into u;
  end if;
  return u;
end; $$;
revoke execute on function public.ensure_org_unit(uuid, public.org_level, text, char) from anon, authenticated;

create or replace function public.hq_appoint_candidate(p_activation uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a candidate_activations%rowtype; r readiness_assessments%rowtype; p profiles%rowtype;
        unit uuid; seat_id uuid; c_unit uuid; s_unit uuid; l_unit uuid;
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  select * into a from candidate_activations where id = p_activation;
  if not found then raise exception 'Activation not found'; end if;
  if a.is_test then raise exception 'This record is marked as a test'; end if;
  if a.status <> 'completed' then raise exception 'The candidate has not completed the activation'; end if;
  select * into r from readiness_assessments where activation_id = a.id;
  if r.id is null or r.status = 'returned' then raise exception 'No submitted assessment for this candidate'; end if;
  if a.position_code is null then raise exception 'No position recorded for this candidate'; end if;
  select * into p from profiles where id = a.profile_id;
  perform set_config('wdos.system', 'on', true);

  -- the place chain, matched by ISO code then name; missing units are created only here, on HQ's approval
  select id into c_unit from org_units where level = 'country' and (upper(country_iso) = upper(a.geo_country_iso) or lower(name) = lower(a.geo_country)) order by (upper(country_iso) = upper(a.geo_country_iso)) desc limit 1;
  if c_unit is null and a.geo_country is not null then
    c_unit := public.ensure_org_unit((select id from org_units where level = 'headquarters' order by created_at limit 1), 'country', a.geo_country, a.geo_country_iso);
  end if;
  if a.position_code in ('country_rep','deputy_country_rep') then unit := c_unit;
  else
    select id into s_unit from org_units where parent_id = c_unit and level = 'state_region' and lower(name) = lower(a.geo_state) limit 1;
    if s_unit is null and a.geo_state is not null then s_unit := public.ensure_org_unit(c_unit, 'state_region', a.geo_state, a.geo_country_iso); end if;
    if a.position_code in ('state_coordinator','assistant_state_coordinator','state_secretary') then unit := s_unit;
    else
      select id into l_unit from org_units where parent_id = s_unit and level = 'district_lga' and lower(name) = lower(a.geo_lga) limit 1;
      if l_unit is null and a.geo_lga is not null then l_unit := public.ensure_org_unit(s_unit, 'district_lga', a.geo_lga, a.geo_country_iso); end if;
      if a.position_code in ('district_coordinator','assistant_district_coordinator') then unit := l_unit;
      elsif a.position_code in ('cluster_coordinator','assistant_cluster_coordinator') then unit := public.ensure_org_unit(l_unit, 'community_cluster', a.geo_cluster, a.geo_country_iso);
      else unit := coalesce(public.ensure_org_unit(l_unit, 'chapter', a.geo_cluster, a.geo_country_iso), l_unit); end if;
    end if;
  end if;
  unit := coalesce(unit, a.org_unit_id);
  if unit is null then raise exception 'No place in the structure for this seat; correct her place first'; end if;

  update role_assignments set ends_at = now() where profile_id = a.profile_id and ends_at is null;
  insert into role_assignments (profile_id, role, org_unit_id, appointment_status, accepted_at)
  values (a.profile_id, a.position_code::role_code, unit, 'appointed', null) returning id into seat_id;
  update profiles set is_leader = true, network = a.network::network_code, org_unit_id = unit where id = a.profile_id;
  update profiles set status = 'under_review' where id = a.profile_id and status = 'applicant';
  update profiles set status = 'approved'     where id = a.profile_id and status = 'under_review';
  update profiles set status = 'activated'    where id = a.profile_id and status = 'approved';
  update readiness_assessments set status = 'completed', outcome = 'selected', reviewer_id = auth.uid(), reviewed_at = now(),
         hq_comments = concat_ws(' | ', hq_comments, 'Appointment approved: ' || coalesce(p_reason, 'per system recommendation')),
         disclosed = coalesce(disclosed, 'Congratulations. You have been selected and your appointment is being processed. Your leadership dashboard is now open.')
   where id = r.id;
  update applications set status = 'approved' where id = a.application_id and status not in ('approved');
  update readiness_assessments x set outcome = 'reserve', status = 'completed',
         disclosed = coalesce(x.disclosed, 'Thank you for completing your activation. Another candidate was selected for this position. You remain a qualified candidate and will be considered for other openings.')
    from candidate_activations b where b.id = x.activation_id and b.id <> a.id and b.status = 'completed' and x.outcome is null and not b.is_test
     and b.position_code = a.position_code and b.network = a.network
     and b.geo_country is not distinct from a.geo_country and b.geo_state is not distinct from a.geo_state
     and b.geo_lga is not distinct from a.geo_lga and b.geo_cluster is not distinct from a.geo_cluster;
  return jsonb_build_object('seat', seat_id, 'unit', unit, 'profile', a.profile_id);
end; $$;

-- the daily sweep also closes windows that were never opened
create or replace function public.activation_sweep() returns integer
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update candidate_activations set status = 'incomplete'
   where status in ('in_progress','not_started') and coalesce(extension_until, deadline) < now();
  get diagnostics n = row_count; return n;
end; $$;
