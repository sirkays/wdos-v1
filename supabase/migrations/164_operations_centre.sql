-- ============================================================================
-- 164  Operations Centre (Head of Field & Country Operations), build v84.5
--      APPLIED LIVE on 29 Sep 2026 through the Supabase connector. Record only.
--
--  ops_leader_rows()      one row per seated volunteer leader with her activity
--  ops_leaders()          filtered, paged register + totals and breakdowns
--  ops_leader_detail()    one leader: profile, seats, metrics, activity timeline
--  ops_activity_feed()    recent activity across all leaders + daily series
--  ops_send_message()     message one, some or all leaders (in-app + push, and
--                         optionally by email), tracked as a batch
--  ops_message_history()  batches with delivered / read / emailed counts
--  ops_assign_task()      assign a task to one, some or all leaders
--  ops_task_batches()     HQ task batches with progress
--  ops_wdos_report()      data for the general WDOS operations report
--  ops_autopilot_*        self-governing rules (off until HQ switches them on),
--                         daily run by cron, every action logged
--
--  Privacy: HQ sees the content of messages between a leader and HQ only.
--  Messages between leaders are counted, never shown.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Who counts as a volunteer leader, and her activity
-- ---------------------------------------------------------------------------
create or replace function public.ops_is_leader_role(p_role text)
returns boolean language sql immutable set search_path = public as $$
  select p_role in ('country_rep','deputy_country_rep','state_coordinator','assistant_state_coordinator','state_secretary',
                    'district_coordinator','assistant_district_coordinator','cluster_coordinator','assistant_cluster_coordinator',
                    'chapter_lead','assistant_chapter_lead');
$$;

create or replace function public.ops_leader_rows(p_from timestamptz default now() - interval '30 days')
returns table (
  profile_id uuid, name text, email text, phone text, network text, role text, role_title text, level text,
  unit_id uuid, unit text, country text, seat_since timestamptz, accepted boolean, last_seen_at timestamptz,
  engagement text, signins int, last_signin timestamptz, onboarding_done int, onboarding_total int,
  tasks_open int, tasks_overdue int, tasks_done int, reports_due int, reports_submitted int, reports_overdue int,
  msgs_from_hq int, msgs_unread int, msgs_sent int, meetings int, hq_reads int, score int)
language sql stable security definer set search_path = public as $$
  with seat as (
    select distinct on (ra.profile_id) ra.profile_id, ra.role::text as role, ra.org_unit_id, ra.starts_at, ra.accepted_at,
           ou.level::text as level, ou.name as unit, ou.ancestors, ou.id as ou_id
      from role_assignments ra join org_units ou on ou.id = ra.org_unit_id
     where ra.ends_at is null and public.ops_is_leader_role(ra.role::text)
     order by ra.profile_id,
              array_position(array['headquarters','country','state_region','district_lga','community_cluster','chapter'], ou.level::text),
              ra.starts_at),
  req as (select count(*)::int as n from onboarding_steps where required and active),
  base as (
    select s.*, p.first_name || ' ' || coalesce(p.last_name, '') as name, p.email, p.phone, p.network::text as network,
           p.last_seen_at, p.country as p_country,
           coalesce((select c.name from org_units c where c.level = 'country' and (c.id = s.ou_id or c.id = any(s.ancestors)) limit 1), p.country) as country
      from seat s join profiles p on p.id = s.profile_id),
  m as (
    select b.*,
      coalesce(public.role_title(b.role, b.network), b.role) as role_title,
      public.engagement_status(b.profile_id) as engagement,
      (select count(*)::int from auth.sessions x where x.user_id = b.profile_id and x.created_at >= p_from) as signins,
      (select max(x.created_at) from auth.sessions x where x.user_id = b.profile_id) as last_signin,
      (select count(*)::int from onboarding_progress op join onboarding_steps st on st.code = op.step_code and st.required and st.active
        where op.profile_id = b.profile_id and op.done_at is not null) as onboarding_done,
      (select n from req) as onboarding_total,
      (select count(*)::int from tasks t where t.assigned_to = b.profile_id and t.status in ('not_started','in_progress','awaiting_review')) as tasks_open,
      (select count(*)::int from tasks t where t.assigned_to = b.profile_id and t.status in ('not_started','in_progress','awaiting_review') and t.due_on < current_date) as tasks_overdue,
      (select count(*)::int from tasks t where t.assigned_to = b.profile_id and t.status = 'completed' and t.completed_at >= p_from) as tasks_done,
      (select count(*)::int from report_instances r where r.owner_id = b.profile_id and r.is_current and r.due_on between p_from::date and current_date) as reports_due,
      (select count(*)::int from report_instances r where r.owner_id = b.profile_id and r.is_current and r.submitted_at >= p_from) as reports_submitted,
      (select count(*)::int from report_instances r where r.owner_id = b.profile_id and r.is_current and r.status in ('draft','returned') and r.due_on < current_date) as reports_overdue,
      (select count(*)::int from staff_messages sm where sm.recipient_id = b.profile_id and sm.created_at >= p_from and public.is_hq_identity(sm.sender_id)) as msgs_from_hq,
      (select count(*)::int from staff_messages sm where sm.recipient_id = b.profile_id and sm.read_at is null and public.is_hq_identity(sm.sender_id)) as msgs_unread,
      (select count(*)::int from staff_messages sm where sm.sender_id = b.profile_id and sm.created_at >= p_from) as msgs_sent,
      (select count(*)::int from meeting_attendance ma join meetings mt on mt.id = ma.meeting_id where ma.profile_id = b.profile_id and ma.present and mt.starts_at >= p_from) as meetings,
      (select count(*)::int from hq_message_delivery d where d.profile_id = b.profile_id and d.read_at >= p_from) as hq_reads
    from base b)
  select m.profile_id, m.name, m.email, m.phone, m.network, m.role, m.role_title, m.level, m.org_unit_id, m.unit, m.country,
         m.starts_at, m.accepted_at is not null, m.last_seen_at, m.engagement, m.signins, m.last_signin,
         m.onboarding_done, m.onboarding_total, m.tasks_open, m.tasks_overdue, m.tasks_done,
         m.reports_due, m.reports_submitted, m.reports_overdue, m.msgs_from_hq, m.msgs_unread, m.msgs_sent, m.meetings, m.hq_reads,
         -- activity score out of 100 (explained on the page and in the report):
         --  25 seen in the last 7 days (12 if in the last 30)
         --  20 x share of required onboarding steps done
         --  20 x share of her tasks not overdue (20 if she has none)
         --  20 x share of due reports submitted (20 if none were due)
         --  15 if she read HQ's messages (15 if HQ sent none; else 15 x share read)
         least(100, round(
           (case when m.last_seen_at > now() - interval '7 days' then 25 when m.last_seen_at > now() - interval '30 days' then 12 else 0 end)
         + 20.0 * (case when m.onboarding_total > 0 then least(1, m.onboarding_done::numeric / m.onboarding_total) else 1 end)
         + 20.0 * (case when m.tasks_open + m.tasks_done > 0 then 1 - m.tasks_overdue::numeric / (m.tasks_open + m.tasks_done) else 1 end)
         + 20.0 * (case when m.reports_due > 0 then least(1, m.reports_submitted::numeric / m.reports_due) else 1 end)
         + 15.0 * (case when (select count(*) from staff_messages sm where sm.recipient_id = m.profile_id and public.is_hq_identity(sm.sender_id)) = 0 then 1
                        else 1 - m.msgs_unread::numeric / greatest(1, (select count(*) from staff_messages sm where sm.recipient_id = m.profile_id and public.is_hq_identity(sm.sender_id))) end)
         ))::int as score
    from m;
$$;
revoke execute on function public.ops_leader_rows(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The register
-- ---------------------------------------------------------------------------
create or replace function public.ops_leaders(p_net text default null, p_country text default null, p_level text default null,
  p_status text default null, p_q text default null, p_sort text default 'score', p_days int default 30, p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare out jsonb; q text := nullif(trim(coalesce(p_q, '')), ''); d int := greatest(1, least(coalesce(p_days, 30), 366));
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  with all_rows as materialized (select * from public.ops_leader_rows(now() - make_interval(days => d))),
  f as (
    select * from all_rows r
     where (p_net is null or p_net = '' or upper(p_net) = 'ALL' or r.network = upper(p_net))
       and (p_country is null or p_country = '' or r.country = p_country)
       and (p_level is null or p_level = '' or r.level = p_level)
       and (q is null or (r.name || ' ' || coalesce(r.email, '') || ' ' || coalesce(r.unit, '') || ' ' || coalesce(r.country, '') || ' ' || coalesce(r.role_title, '')) ilike '%' || q || '%')
       and (p_status is null or p_status = ''
            or (p_status = 'active7' and r.last_seen_at > now() - interval '7 days')
            or (p_status = 'inactive30' and (r.last_seen_at is null or r.last_seen_at < now() - interval '30 days'))
            or (p_status = 'never' and r.last_seen_at is null and r.last_signin is null)
            or (p_status = 'onboarding_pending' and r.onboarding_done < r.onboarding_total)
            or (p_status = 'overdue_tasks' and r.tasks_overdue > 0)
            or (p_status = 'reports_overdue' and r.reports_overdue > 0)
            or (p_status = 'unread_hq' and r.msgs_unread > 0)
            or (p_status = 'not_accepted' and not r.accepted)
            or (p_status = 'low_score' and r.score < 50)))
  select jsonb_build_object(
    'days', d,
    'totals', (select jsonb_build_object(
        'leaders', count(*), 'active7', count(*) filter (where last_seen_at > now() - interval '7 days'),
        'active30', count(*) filter (where last_seen_at > now() - interval '30 days'),
        'inactive30', count(*) filter (where last_seen_at is null or last_seen_at < now() - interval '30 days'),
        'never', count(*) filter (where last_seen_at is null and last_signin is null),
        'onboarding_complete', count(*) filter (where onboarding_done >= onboarding_total),
        'onboarding_pending', count(*) filter (where onboarding_done < onboarding_total),
        'not_accepted', count(*) filter (where not accepted),
        'tasks_open', coalesce(sum(tasks_open), 0), 'tasks_overdue', coalesce(sum(tasks_overdue), 0), 'tasks_done', coalesce(sum(tasks_done), 0),
        'leaders_overdue', count(*) filter (where tasks_overdue > 0),
        'reports_due', coalesce(sum(reports_due), 0), 'reports_submitted', coalesce(sum(reports_submitted), 0), 'reports_overdue', coalesce(sum(reports_overdue), 0),
        'msgs_from_hq', coalesce(sum(msgs_from_hq), 0), 'unread_hq', coalesce(sum(msgs_unread), 0), 'leaders_unread', count(*) filter (where msgs_unread > 0),
        'signins', coalesce(sum(signins), 0), 'meetings', coalesce(sum(meetings), 0),
        'avg_score', coalesce(round(avg(score)), 0), 'low_score', count(*) filter (where score < 50),
        'wgmn', count(*) filter (where network = 'WGMN'), 'wnnn', count(*) filter (where network = 'WNNN')) from f),
    'by_engagement', (select coalesce(jsonb_agg(jsonb_build_object('k', engagement, 'n', n) order by n desc), '[]'::jsonb) from (select engagement, count(*) n from f group by 1) x),
    'by_level', (select coalesce(jsonb_agg(jsonb_build_object('level', level, 'n', n, 'active30', a, 'avg_score', s) order by array_position(array['headquarters','country','state_region','district_lga','community_cluster','chapter'], level)), '[]'::jsonb)
                 from (select level, count(*) n, count(*) filter (where last_seen_at > now() - interval '30 days') a, round(avg(score)) s from f group by 1) x),
    'by_country', (select coalesce(jsonb_agg(jsonb_build_object('country', country, 'n', n, 'active30', a, 'avg_score', s, 'overdue', o, 'onboarding_pending', ob) order by n desc, country), '[]'::jsonb)
                   from (select coalesce(country, '(no country)') country, count(*) n, count(*) filter (where last_seen_at > now() - interval '30 days') a, round(avg(score)) s,
                                sum(tasks_overdue) o, count(*) filter (where onboarding_done < onboarding_total) ob from f group by 1) x),
    'score_bands', (select jsonb_build_object('b0', count(*) filter (where score < 25), 'b25', count(*) filter (where score between 25 and 49),
                    'b50', count(*) filter (where score between 50 and 74), 'b75', count(*) filter (where score >= 75)) from f),
    'countries', (select coalesce(jsonb_agg(distinct country order by country), '[]'::jsonb) from all_rows where country is not null),
    'total', (select count(*) from f),
    'rows', (select coalesce(jsonb_agg(to_jsonb(x) order by
               case when p_sort = 'name' then 0 end, case when p_sort = 'name' then x.name end,
               case when p_sort = 'last_seen' then x.last_seen_at end desc nulls last,
               case when p_sort = 'overdue' then x.tasks_overdue end desc,
               case when p_sort = 'score_asc' then x.score end asc,
               case when coalesce(p_sort, 'score') = 'score' then x.score end desc, x.name), '[]'::jsonb)
             from (select * from f order by
               case when p_sort = 'name' then f.name end,
               case when p_sort = 'last_seen' then f.last_seen_at end desc nulls last,
               case when p_sort = 'overdue' then f.tasks_overdue end desc,
               case when p_sort = 'score_asc' then f.score end asc,
               case when coalesce(p_sort, 'score') = 'score' then f.score end desc, f.name
               limit greatest(1, least(coalesce(p_limit, 50), 5000)) offset greatest(coalesce(p_offset, 0), 0)) x)
  ) into out;
  return out;
end $$;

-- ids for a filter (messaging / tasks to "everyone matching")
create or replace function public.ops_filter_ids(p_net text, p_country text, p_level text, p_status text, p_q text)
returns uuid[] language plpgsql stable security definer set search_path = public as $$
declare j jsonb;
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  j := public.ops_leaders(p_net, p_country, p_level, p_status, p_q, 'name', 30, 5000, 0);
  return array(select (x->>'profile_id')::uuid from jsonb_array_elements(j->'rows') x);
end $$;
revoke execute on function public.ops_filter_ids(text, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Activity events (one union, used by the leader timeline and the feed)
-- ---------------------------------------------------------------------------
create or replace function public.ops_events(p_from timestamptz, p_profiles uuid[] default null)
returns table (at timestamptz, profile_id uuid, kind text, detail text, ref uuid)
language sql stable security definer set search_path = public as $$
  with lead as (
    select distinct ra.profile_id from role_assignments ra
     where ra.ends_at is null and public.ops_is_leader_role(ra.role::text)
       and (p_profiles is null or ra.profile_id = any(p_profiles)))
  select x.created_at, x.user_id, 'signin', null::text, null::uuid from auth.sessions x join lead l on l.profile_id = x.user_id where x.created_at >= p_from
  union all
  select op.done_at, op.profile_id, 'onboarding_step', coalesce(st.title, op.step_code), null from onboarding_progress op join lead l on l.profile_id = op.profile_id
    left join onboarding_steps st on st.code = op.step_code where op.done_at >= p_from
  union all
  select t.created_at, t.assigned_to, 'task_assigned', t.title, t.id from tasks t join lead l on l.profile_id = t.assigned_to where t.created_at >= p_from
  union all
  select t.completed_at, t.assigned_to, 'task_completed', t.title, t.id from tasks t join lead l on l.profile_id = t.assigned_to where t.completed_at >= p_from and t.status = 'completed'
  union all
  select r.submitted_at, r.owner_id, 'report_submitted', r.template || ' ' || to_char(r.period_start, 'Mon YYYY'), r.id from report_instances r join lead l on l.profile_id = r.owner_id where r.submitted_at >= p_from
  union all
  select sm.created_at, sm.recipient_id, 'msg_from_hq', left(sm.body, 120), sm.id from staff_messages sm join lead l on l.profile_id = sm.recipient_id
   where sm.created_at >= p_from and public.is_hq_identity(sm.sender_id)
  union all
  select sm.read_at, sm.recipient_id, 'msg_read', left(sm.body, 120), sm.id from staff_messages sm join lead l on l.profile_id = sm.recipient_id
   where sm.read_at >= p_from and public.is_hq_identity(sm.sender_id)
  union all
  -- to HQ: content shown; to another leader: counted, never shown
  select sm.created_at, sm.sender_id, case when public.is_hq_identity(sm.recipient_id) then 'msg_to_hq' else 'msg_to_leader' end,
         case when public.is_hq_identity(sm.recipient_id) then left(sm.body, 120) else null end, sm.id
    from staff_messages sm join lead l on l.profile_id = sm.sender_id where sm.created_at >= p_from
  union all
  select mt.starts_at, ma.profile_id, 'meeting_attended', mt.title, mt.id from meeting_attendance ma join meetings mt on mt.id = ma.meeting_id join lead l on l.profile_id = ma.profile_id
   where ma.present and mt.starts_at >= p_from
  union all
  select d.read_at, d.profile_id, 'hq_message_read', d.message_id, null from hq_message_delivery d join lead l on l.profile_id = d.profile_id where d.read_at >= p_from
  union all
  select ce.completed_at, ce.profile_id, 'course_completed', c.title, c.id from course_enrollments ce join lead l on l.profile_id = ce.profile_id left join courses c on c.id = ce.course_id where ce.completed_at >= p_from
  union all
  select ra.starts_at, ra.profile_id, 'seated', coalesce(public.role_title(ra.role::text, p.network::text), ra.role::text) || ' · ' || ou.name, ra.id
    from role_assignments ra join lead l on l.profile_id = ra.profile_id join org_units ou on ou.id = ra.org_unit_id join profiles p on p.id = ra.profile_id
   where ra.starts_at >= p_from and public.ops_is_leader_role(ra.role::text)
  union all
  select ra.accepted_at, ra.profile_id, 'accepted', coalesce(public.role_title(ra.role::text, p.network::text), ra.role::text), ra.id
    from role_assignments ra join lead l on l.profile_id = ra.profile_id join profiles p on p.id = ra.profile_id
   where ra.accepted_at >= p_from and public.ops_is_leader_role(ra.role::text);
$$;
revoke execute on function public.ops_events(timestamptz, uuid[]) from public, anon, authenticated;

create or replace function public.ops_leader_detail(p_profile uuid, p_days int default 90)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d int := greatest(1, least(coalesce(p_days, 90), 366)); j jsonb; row jsonb;
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  select to_jsonb(r) into row from public.ops_leader_rows(now() - interval '30 days') r where r.profile_id = p_profile;
  if row is null then raise exception 'Not a seated volunteer leader'; end if;
  select jsonb_build_object(
    'leader', row,
    'profile', (select jsonb_build_object('id', p.id, 'membership_no', p.membership_no, 'status', p.status, 'locale', p.preferred_locale,
                'state_region', p.state_region, 'lga', p.lga, 'created_at', p.created_at) from profiles p where p.id = p_profile),
    'seats', (select coalesce(jsonb_agg(jsonb_build_object('role', ra.role::text, 'title', coalesce(public.role_title(ra.role::text, p.network::text), ra.role::text),
                'unit', ou.name, 'level', ou.level::text, 'since', ra.starts_at, 'accepted_at', ra.accepted_at, 'ends_at', ra.ends_at) order by ra.starts_at desc), '[]'::jsonb)
              from role_assignments ra join org_units ou on ou.id = ra.org_unit_id join profiles p on p.id = ra.profile_id where ra.profile_id = p_profile),
    'onboarding', (select coalesce(jsonb_agg(jsonb_build_object('title', st.title, 'required', st.required, 'done_at', op.done_at) order by st.seq), '[]'::jsonb)
                   from onboarding_steps st left join onboarding_progress op on op.step_code = st.code and op.profile_id = p_profile where st.active),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status, 'priority', t.priority, 'due_on', t.due_on,
                'completed_at', t.completed_at, 'overdue', t.status in ('not_started','in_progress','awaiting_review') and t.due_on < current_date) order by t.created_at desc), '[]'::jsonb)
              from (select * from tasks where assigned_to = p_profile order by created_at desc limit 30) t),
    'reports', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'template', r.template, 'period_start', r.period_start, 'due_on', r.due_on, 'status', r.status, 'submitted_at', r.submitted_at) order by r.period_start desc), '[]'::jsonb)
                from (select * from report_instances where owner_id = p_profile and is_current order by period_start desc limit 12) r),
    'weekly', (select coalesce(jsonb_agg(jsonb_build_object('week', w, 'n', n) order by w), '[]'::jsonb)
               from (select date_trunc('week', at)::date w, count(*) n from public.ops_events(now() - make_interval(days => d), array[p_profile]) group by 1) x),
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'kind', e.kind, 'detail', e.detail) order by e.at desc), '[]'::jsonb)
                 from (select * from public.ops_events(now() - make_interval(days => d), array[p_profile]) order by at desc limit 80) e),
    'mailbox', (select jsonb_build_object('email', pm.email, 'open', (public.leader_gate_state(p_profile)).ok)
                  from position_mailboxes pm join role_assignments ra on ra.org_unit_id = pm.org_unit_id and ra.ends_at is null and ra.profile_id = p_profile
                  join lateral public.mailbox_side_of(ra.role::text) ms on ms.level = pm.level and ms.side = pm.side limit 1)
  ) into j;
  return j;
end $$;

create or replace function public.ops_activity_feed(p_net text default null, p_country text default null, p_days int default 14, p_kind text default null, p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d int := greatest(1, least(coalesce(p_days, 14), 180)); ids uuid[]; j jsonb;
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  ids := public.ops_filter_ids(p_net, p_country, null, null, null);
  with ev as materialized (select * from public.ops_events(now() - make_interval(days => d), ids)),
  who as (select profile_id, name, role_title, country, network from public.ops_leader_rows(now() - interval '30 days') where profile_id = any(ids))
  select jsonb_build_object(
    'days', d,
    'by_kind', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'n', n, 'people', pp) order by n desc), '[]'::jsonb)
                from (select kind, count(*) n, count(distinct profile_id) pp from ev group by 1) x),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('d', dd, 'n', n, 'people', pp) order by dd), '[]'::jsonb)
              from (select (at at time zone 'Africa/Lagos')::date dd, count(*) n, count(distinct profile_id) pp from ev group by 1) x),
    'active_people', (select count(distinct profile_id) from ev),
    'leaders_in_scope', coalesce(array_length(ids, 1), 0),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'kind', e.kind, 'detail', e.detail, 'profile_id', e.profile_id,
                 'name', w.name, 'role', w.role_title, 'country', w.country, 'network', w.network) order by e.at desc), '[]'::jsonb)
               from (select * from ev where p_kind is null or p_kind = '' or kind = p_kind order by at desc limit greatest(1, least(coalesce(p_limit, 100), 500))) e
               left join who w on w.profile_id = e.profile_id)
  ) into j;
  return j;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Messaging leaders (one, some or all) and task assignment
-- ---------------------------------------------------------------------------
create table if not exists public.ops_message_batches (
  id uuid primary key default gen_random_uuid(), sender_id uuid not null references profiles(id), subject text, body text not null,
  audience jsonb, recipients int not null default 0, emailed int not null default 0, auto_rule text, created_at timestamptz not null default now());
create table if not exists public.ops_message_items (
  batch_id uuid not null references public.ops_message_batches(id) on delete cascade, recipient_id uuid not null references profiles(id),
  message_id uuid references staff_messages(id) on delete set null, email_request_id bigint, email_status int, primary key (batch_id, recipient_id));
create index if not exists ops_message_items_msg_idx on public.ops_message_items (message_id);
alter table public.ops_message_batches enable row level security;
alter table public.ops_message_items enable row level security;
revoke all on public.ops_message_batches, public.ops_message_items from public, anon, authenticated;

create or replace function public.ops_esc(t text) returns text language sql immutable set search_path = public as $$
  select replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
$$;

create or replace function public.ops_send_message(p_ids uuid[] default null, p_body text default null, p_subject text default null, p_email boolean default false,
  p_net text default null, p_country text default null, p_level text default null, p_status text default null, p_q text default null, p_auto_rule text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare bid uuid; ids uuid[]; rid uuid; mid uuid; n int := 0; ne int := 0; req bigint; body text := trim(coalesce(p_body, ''));
        me uuid := auth.uid(); who record; subj text := nullif(trim(coalesce(p_subject, '')), ''); full_body text;
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  if body = '' then raise exception 'Write the message first'; end if;
  if length(body) > 4000 then raise exception 'The message is too long (4,000 characters at most)'; end if;
  ids := coalesce(p_ids, public.ops_filter_ids(p_net, p_country, p_level, p_status, p_q));
  -- only seated volunteer leaders can be reached from here
  ids := array(select distinct ra.profile_id from role_assignments ra where ra.ends_at is null and public.ops_is_leader_role(ra.role::text) and ra.profile_id = any(ids));
  if coalesce(array_length(ids, 1), 0) = 0 then raise exception 'No volunteer leader matches this audience'; end if;
  if array_length(ids, 1) > 5000 then raise exception 'At most 5,000 leaders per message'; end if;
  full_body := case when subj is null then body else subj || E'\n\n' || body end;
  insert into ops_message_batches (sender_id, subject, body, audience, auto_rule)
  values (me, subj, body, jsonb_build_object('ids', p_ids is not null, 'net', p_net, 'country', p_country, 'level', p_level, 'status', p_status, 'q', p_q), p_auto_rule)
  returning id into bid;
  foreach rid in array ids loop
    continue when rid = me;
    insert into staff_messages (sender_id, recipient_id, body) values (me, rid, full_body) returning id into mid;
    req := null;
    if p_email then
      select p.email, p.first_name into who from profiles p where p.id = rid;
      if who.email is not null and public.email_problem(who.email) is null then
        req := public.send_email_req(who.email, who.first_name, coalesce(subj, 'A message from WODDI HQ'),
          '<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1d1d1f;max-width:560px">'
          || '<p>Dear ' || public.ops_esc(who.first_name) || ',</p><p>' || replace(public.ops_esc(body), E'\n', '<br>') || '</p>'
          || '<p style="color:#666;font-size:13px">You can reply from your WDOS dashboard, Messages, at https://woddicrm.org</p>'
          || '<p style="color:#D4006A;font-weight:700">WODDI Headquarters</p></div>');
        if req is not null then ne := ne + 1; end if;
      end if;
    end if;
    insert into ops_message_items (batch_id, recipient_id, message_id, email_request_id) values (bid, rid, mid, req);
    n := n + 1;
  end loop;
  update ops_message_batches set recipients = n, emailed = ne where id = bid;
  return jsonb_build_object('batch_id', bid, 'sent', n, 'emailed', ne);
end $$;
revoke execute on function public.ops_send_message(uuid[], text, text, boolean, text, text, text, text, text, text) from public, anon;
grant execute on function public.ops_send_message(uuid[], text, text, boolean, text, text, text, text, text, text) to authenticated;

create or replace function public.ops_message_history(p_limit int default 30)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare j jsonb;
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  -- pick up the mailer's answers for email copies (kept by pg_net for about 6 hours)
  update ops_message_items i set email_status = r.status_code
    from net._http_response r where r.id = i.email_request_id and i.email_status is null;
  select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb) into j from (
    select jsonb_build_object('id', b.id, 'subject', b.subject, 'body', left(b.body, 300), 'created_at', b.created_at, 'auto_rule', b.auto_rule,
      'sender', (select first_name || ' ' || coalesce(last_name, '') from profiles where id = b.sender_id), 'audience', b.audience,
      'recipients', b.recipients, 'emailed', b.emailed,
      'read', (select count(*) from ops_message_items i join staff_messages sm on sm.id = i.message_id where i.batch_id = b.id and sm.read_at is not null),
      'email_accepted', (select count(*) from ops_message_items i where i.batch_id = b.id and i.email_status between 200 and 299),
      'email_failed', (select count(*) from ops_message_items i where i.batch_id = b.id and i.email_status >= 300),
      'replies', (select count(*) from ops_message_items i join staff_messages r on r.sender_id = i.recipient_id and r.recipient_id = b.sender_id and r.created_at > b.created_at where i.batch_id = b.id)) as x
    from ops_message_batches b order by b.created_at desc limit greatest(1, least(coalesce(p_limit, 30), 200))) s;
  return j;
end $$;

create or replace function public.ops_message_batch(p_batch uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.is_case_hq() then null else
    (select coalesce(jsonb_agg(jsonb_build_object('name', p.first_name || ' ' || coalesce(p.last_name, ''), 'email', p.email, 'country', p.country,
       'read_at', sm.read_at, 'email_status', i.email_status, 'emailed', i.email_request_id is not null) order by sm.read_at nulls last, p.last_name), '[]'::jsonb)
       from ops_message_items i join profiles p on p.id = i.recipient_id left join staff_messages sm on sm.id = i.message_id where i.batch_id = p_batch) end;
$$;

create or replace function public.ops_assign_task(p_ids uuid[] default null, p_title text default null, p_details text default null, p_priority text default 'medium',
  p_due_on date default null, p_requires_approval boolean default false, p_requirements text[] default '{}',
  p_net text default null, p_country text default null, p_level text default null, p_status text default null, p_q text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare ids uuid[];
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  ids := coalesce(p_ids, public.ops_filter_ids(p_net, p_country, p_level, p_status, p_q));
  ids := array(select distinct ra.profile_id from role_assignments ra where ra.ends_at is null and public.ops_is_leader_role(ra.role::text) and ra.profile_id = any(ids));
  if coalesce(array_length(ids, 1), 0) = 0 then raise exception 'No volunteer leader matches this audience'; end if;
  if p_due_on is not null and p_due_on < current_date then raise exception 'The due date is in the past'; end if;
  return public.hq_assign_task_bulk(p_title, p_details, coalesce(p_priority, 'medium')::task_priority, coalesce(p_requires_approval, false), p_due_on,
    coalesce(p_requirements, '{}'), (select jsonb_agg(jsonb_build_object('id', x)) from unnest(ids) x));
end $$;

create or replace function public.ops_task_batches(p_limit int default 30)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.is_case_hq() then null else (
    select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb) from (
      select jsonb_build_object('id', b.id, 'title', b.title, 'created_at', b.created_at,
        'by', (select first_name || ' ' || coalesce(last_name, '') from profiles where id = b.created_by),
        'total', count(t.*), 'not_started', count(*) filter (where t.status = 'not_started'), 'in_progress', count(*) filter (where t.status = 'in_progress'),
        'awaiting_review', count(*) filter (where t.status = 'awaiting_review'), 'completed', count(*) filter (where t.status = 'completed'),
        'overdue', count(*) filter (where t.status in ('not_started','in_progress','awaiting_review') and t.due_on < current_date),
        'due_on', min(t.due_on), 'priority', min(t.priority::text)) as x
      from task_batches b join tasks t on t.batch_id = b.id
      where public.is_hq_identity(b.created_by)
      group by b.id order by b.created_at desc limit greatest(1, least(coalesce(p_limit, 30), 200))) s) end;
$$;

-- ---------------------------------------------------------------------------
-- 5. General WDOS operations report
-- ---------------------------------------------------------------------------
create or replace function public.ops_wdos_report(p_net text default null, p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d int := greatest(7, least(coalesce(p_days, 30), 366)); f timestamptz := now() - make_interval(days => d); j jsonb; ids uuid[];
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  ids := public.ops_filter_ids(p_net, null, null, null, null);
  with L as materialized (select * from public.ops_leader_rows(f) where profile_id = any(ids)),
  ev as materialized (select * from public.ops_events(f, ids))
  select jsonb_build_object(
    'as_of', now(), 'days', d, 'from', f, 'net', coalesce(nullif(upper(p_net), ''), 'ALL'),
    'leaders', (select jsonb_build_object('total', count(*), 'wgmn', count(*) filter (where network = 'WGMN'), 'wnnn', count(*) filter (where network = 'WNNN'),
        'new_in_period', count(*) filter (where seat_since >= f), 'not_accepted', count(*) filter (where not accepted),
        'active7', count(*) filter (where last_seen_at > now() - interval '7 days'), 'active30', count(*) filter (where last_seen_at > now() - interval '30 days'),
        'never', count(*) filter (where last_seen_at is null and last_signin is null), 'avg_score', coalesce(round(avg(score)), 0),
        'onboarding_complete', count(*) filter (where onboarding_done >= onboarding_total)) from L),
    'by_level', (select coalesce(jsonb_agg(jsonb_build_object('level', level, 'n', n, 'active30', a) order by array_position(array['headquarters','country','state_region','district_lga','community_cluster','chapter'], level)), '[]'::jsonb)
                 from (select level, count(*) n, count(*) filter (where last_seen_at > now() - interval '30 days') a from L group by 1) x),
    'engagement', (select coalesce(jsonb_agg(jsonb_build_object('k', engagement, 'n', n) order by n desc), '[]'::jsonb) from (select engagement, count(*) n from L group by 1) x),
    'score_bands', (select jsonb_build_object('b0', count(*) filter (where score < 25), 'b25', count(*) filter (where score between 25 and 49),
                    'b50', count(*) filter (where score between 50 and 74), 'b75', count(*) filter (where score >= 75)) from L),
    'weekly_active', (select coalesce(jsonb_agg(jsonb_build_object('week', w, 'people', pp, 'events', n) order by w), '[]'::jsonb)
                      from (select date_trunc('week', at)::date w, count(distinct profile_id) pp, count(*) n from ev group by 1) x),
    'activity_by_kind', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'n', n, 'people', pp) order by n desc), '[]'::jsonb)
                         from (select kind, count(*) n, count(distinct profile_id) pp from ev group by 1) x),
    'coverage', (select jsonb_build_object(
        'countries_total', (select count(*) from org_units where level = 'country' and is_active),
        'countries_with_leader', (select count(distinct country) from L where level <> 'headquarters'),
        'states_total', (select count(*) from org_units where level = 'state_region' and is_active),
        'states_with_leader', (select count(distinct unit_id) from L where level = 'state_region'))),
    'onboarding_steps', (select coalesce(jsonb_agg(jsonb_build_object('title', st.title, 'done', (select count(*) from onboarding_progress op where op.step_code = st.code and op.done_at is not null and op.profile_id = any(ids))) order by st.seq), '[]'::jsonb)
                         from onboarding_steps st where st.active and st.required),
    'tasks', (select jsonb_build_object(
        'assigned', count(*) filter (where t.created_at >= f), 'completed', count(*) filter (where t.status = 'completed' and t.completed_at >= f),
        'completed_on_time', count(*) filter (where t.status = 'completed' and t.completed_at >= f and (t.due_on is null or t.completed_at::date <= t.due_on)),
        'open', count(*) filter (where t.status in ('not_started','in_progress','awaiting_review')),
        'overdue', count(*) filter (where t.status in ('not_started','in_progress','awaiting_review') and t.due_on < current_date),
        'by_status', (select coalesce(jsonb_object_agg(s, n), '{}'::jsonb) from (select status::text s, count(*) n from tasks t2 where t2.assigned_to = any(ids) group by 1) y))
        from tasks t where t.assigned_to = any(ids)),
    'reports', (select jsonb_build_object(
        'due', count(*) filter (where r.due_on between f::date and current_date),
        'submitted', count(*) filter (where r.submitted_at >= f),
        'on_time', count(*) filter (where r.submitted_at >= f and r.submitted_at::date <= r.due_on),
        'late', count(*) filter (where r.submitted_at >= f and r.submitted_at::date > r.due_on),
        'overdue', count(*) filter (where r.status in ('draft','returned') and r.due_on < current_date),
        'returned', count(*) filter (where r.status = 'returned'), 'approved', count(*) filter (where r.status = 'approved' and r.reviewed_at >= f))
        from report_instances r where r.is_current and r.owner_id = any(ids)),
    'communications', (select jsonb_build_object(
        'hq_messages', count(*), 'read', count(*) filter (where sm.read_at is not null),
        'people', count(distinct sm.recipient_id),
        'replies', (select count(*) from staff_messages r where r.sender_id = any(ids) and r.created_at >= f and public.is_hq_identity(r.recipient_id)),
        'batches', (select count(*) from ops_message_batches b where b.created_at >= f),
        'weekly_hq_reads', (select count(*) from hq_message_delivery dd where dd.profile_id = any(ids) and dd.read_at >= f))
        from staff_messages sm where sm.recipient_id = any(ids) and sm.created_at >= f and public.is_hq_identity(sm.sender_id)),
    'meetings', (select jsonb_build_object('held', (select count(*) from meetings m where m.starts_at between f and now() and m.status::text <> 'cancelled'),
        'attendances', count(*), 'people', count(distinct ma.profile_id))
        from meeting_attendance ma join meetings mt on mt.id = ma.meeting_id where ma.present and mt.starts_at >= f and ma.profile_id = any(ids)),
    'learning', (select jsonb_build_object('enrolled', count(*) filter (where ce.started_at >= f), 'completed', count(*) filter (where ce.completed_at >= f), 'people', count(distinct ce.profile_id) filter (where ce.completed_at >= f))
                 from course_enrollments ce where ce.profile_id = any(ids)),
    'countries', (select coalesce(jsonb_agg(jsonb_build_object('country', country, 'leaders', n, 'active30', a, 'avg_score', s, 'tasks_overdue', o, 'reports_overdue', ro, 'onboarding_pending', ob) order by n desc, country), '[]'::jsonb)
                  from (select coalesce(country, '(no country)') country, count(*) n, count(*) filter (where last_seen_at > now() - interval '30 days') a, round(avg(score)) s,
                               sum(tasks_overdue) o, sum(reports_overdue) ro, count(*) filter (where onboarding_done < onboarding_total) ob from L group by 1) x),
    'top', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'role', role_title, 'country', country, 'score', score) order by score desc, name), '[]'::jsonb)
            from (select * from L order by score desc, name limit 10) x),
    'support', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'role', role_title, 'country', country, 'score', score, 'last_seen_at', last_seen_at,
                  'tasks_overdue', tasks_overdue, 'onboarding', onboarding_done || '/' || onboarding_total) order by score, name), '[]'::jsonb)
                from (select * from L where score < 50 order by score, name limit 25) x),
    'autopilot', (select coalesce(jsonb_agg(jsonb_build_object('rule', rule, 'n', n) order by n desc), '[]'::jsonb)
                  from (select rule, count(*) n from ops_autopilot_log where at >= f group by 1) x)
  ) into j;
  return j;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Self-governance: autopilot rules (all OFF until HQ switches one on)
-- ---------------------------------------------------------------------------
create table if not exists public.ops_autopilot_rules (
  code text primary key, enabled boolean not null default false, params jsonb not null default '{}'::jsonb,
  owner_id uuid references profiles(id), updated_at timestamptz not null default now());
create table if not exists public.ops_autopilot_log (
  id bigint generated always as identity primary key, rule text not null, profile_id uuid references profiles(id), ref_id uuid,
  batch_id uuid, detail text, at timestamptz not null default now());
create index if not exists ops_autopilot_log_rule_idx on public.ops_autopilot_log (rule, profile_id, at desc);
alter table public.ops_autopilot_rules enable row level security;
alter table public.ops_autopilot_log enable row level security;
revoke all on public.ops_autopilot_rules, public.ops_autopilot_log from public, anon, authenticated;
insert into public.ops_autopilot_rules (code, params) values
  ('inactive_checkin', '{"days": 14}'),
  ('onboarding_nudge', '{"days": 7}'),
  ('overdue_task_reminder', '{"every_days": 3}'),
  ('overdue_escalation', '{"days": 7}'),
  ('weekly_digest', '{"weekday": 1}')
on conflict (code) do nothing;

-- who each rule would reach today (used by the preview and by the run)
create or replace function public.ops_autopilot_targets(p_code text)
returns table (profile_id uuid, ref_id uuid, detail text)
language plpgsql stable security definer set search_path = public as $$
declare r ops_autopilot_rules%rowtype; n int;
begin
  select * into r from ops_autopilot_rules where code = p_code;
  if p_code = 'inactive_checkin' then
    n := coalesce((r.params->>'days')::int, 14);
    return query select l.profile_id, null::uuid, 'not seen for ' || coalesce(extract(day from now() - l.last_seen_at)::int::text || ' days', 'ever')
      from public.ops_leader_rows(now() - interval '30 days') l
     where (l.last_seen_at is null or l.last_seen_at < now() - make_interval(days => n))
       and not exists (select 1 from ops_autopilot_log g where g.rule = p_code and g.profile_id = l.profile_id and g.at > now() - make_interval(days => n));
  elsif p_code = 'onboarding_nudge' then
    n := coalesce((r.params->>'days')::int, 7);
    return query select l.profile_id, null::uuid, l.onboarding_done || ' of ' || l.onboarding_total || ' onboarding steps done'
      from public.ops_leader_rows(now() - interval '30 days') l
     where l.onboarding_done < l.onboarding_total and l.seat_since < now() - make_interval(days => n)
       and not exists (select 1 from ops_autopilot_log g where g.rule = p_code and g.profile_id = l.profile_id and g.at > now() - interval '7 days');
  elsif p_code = 'overdue_task_reminder' then
    n := coalesce((r.params->>'every_days')::int, 3);
    return query select t.assigned_to, t.id, t.title || ' (due ' || to_char(t.due_on, 'DD Mon') || ')'
      from tasks t join role_assignments ra on ra.profile_id = t.assigned_to and ra.ends_at is null and public.ops_is_leader_role(ra.role::text)
     where t.status in ('not_started','in_progress','awaiting_review') and t.due_on < current_date
       and not exists (select 1 from ops_autopilot_log g where g.rule = p_code and g.ref_id = t.id and g.at > now() - make_interval(days => n))
     group by t.assigned_to, t.id, t.title, t.due_on;
  elsif p_code = 'overdue_escalation' then
    n := coalesce((r.params->>'days')::int, 7);
    return query select t.assigned_to, t.id, t.title || ' overdue since ' || to_char(t.due_on, 'DD Mon')
      from tasks t join role_assignments ra on ra.profile_id = t.assigned_to and ra.ends_at is null and public.ops_is_leader_role(ra.role::text)
     where t.status in ('not_started','in_progress','awaiting_review') and t.due_on < current_date - n
       and not exists (select 1 from ops_autopilot_log g where g.rule = p_code and g.ref_id = t.id)
     group by t.assigned_to, t.id, t.title, t.due_on;
  elsif p_code = 'weekly_digest' then
    if extract(isodow from (now() at time zone 'Africa/Lagos')) = coalesce((r.params->>'weekday')::int, 1)
       and not exists (select 1 from ops_autopilot_log g where g.rule = p_code and g.at > now() - interval '6 days') then
      return query select r.owner_id, null::uuid, 'weekly digest';
    end if;
  end if;
end $$;
revoke execute on function public.ops_autopilot_targets(text) from public, anon, authenticated;

create or replace function public.ops_autopilot_text(p_code text, p_first text, p_locale text, p_detail text)
returns text language sql immutable set search_path = public as $$
  select case
    when p_code = 'inactive_checkin' and p_locale = 'fr' then 'Bonjour ' || p_first || E',\n\nNous ne vous avons pas vue sur WDOS depuis un moment et nous voulions prendre de vos nouvelles. Si quelque chose vous bloque (connexion, mot de passe, une tâche), répondez simplement à ce message et le siège vous aidera.\n\nMerci pour votre service.'
    when p_code = 'inactive_checkin' then 'Hello ' || p_first || E',\n\nWe have not seen you on WDOS for a while and wanted to check in. If anything is holding you back (signing in, your password, a task), simply reply to this message and HQ will help.\n\nThank you for your service.'
    when p_code = 'onboarding_nudge' and p_locale = 'fr' then 'Bonjour ' || p_first || E',\n\nVotre intégration du Pack Leadership n''est pas encore terminée (' || p_detail || E'). Elle ouvre votre tableau de bord complet et votre boîte mail WODDI. Continuez ici : https://woddicrm.org/#/my/onboarding'
    when p_code = 'onboarding_nudge' then 'Hello ' || p_first || E',\n\nYour Leadership Pack onboarding is not finished yet (' || p_detail || E'). Completing it opens your full dashboard and your WODDI mailbox. Continue here: https://woddicrm.org/#/my/onboarding'
    when p_code = 'overdue_task_reminder' and p_locale = 'fr' then 'Bonjour ' || p_first || E',\n\nRappel amical : cette tâche a dépassé sa date d''échéance : ' || p_detail || E'. Mettez à jour son statut dans Tâches, ou répondez ici si vous avez besoin d''aide ou de plus de temps.'
    when p_code = 'overdue_task_reminder' then 'Hello ' || p_first || E',\n\nA friendly reminder that this task is past its due date: ' || p_detail || E'. Please update its status in Tasks, or reply here if you need help or more time.'
    else p_detail end;
$$;

create or replace function public.ops_autopilot_run()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r ops_autopilot_rules%rowtype; t record; p record; res jsonb := '{}'::jsonb; n int; mid uuid; digest text; lines text;
begin
  for r in select * from ops_autopilot_rules where enabled and owner_id is not null order by code loop
    n := 0;
    if r.code in ('inactive_checkin', 'onboarding_nudge', 'overdue_task_reminder') then
      for t in select * from public.ops_autopilot_targets(r.code) limit 500 loop
        select first_name, coalesce(preferred_locale, 'en') loc into p from profiles where id = t.profile_id;
        insert into staff_messages (sender_id, recipient_id, body)
        values (r.owner_id, t.profile_id, public.ops_autopilot_text(r.code, coalesce(p.first_name, ''), p.loc, t.detail)) returning id into mid;
        insert into ops_autopilot_log (rule, profile_id, ref_id, detail) values (r.code, t.profile_id, t.ref_id, t.detail);
        n := n + 1;
      end loop;
    elsif r.code = 'overdue_escalation' then
      select string_agg('- ' || pr.first_name || ' ' || coalesce(pr.last_name, '') || ': ' || x.detail, E'\n'), count(*) into lines, n
        from public.ops_autopilot_targets(r.code) x join profiles pr on pr.id = x.profile_id;
      if n > 0 then
        insert into staff_messages (sender_id, recipient_id, body)
        values (coalesce(nullif(public.hq_inbox_target(), r.owner_id), r.owner_id), r.owner_id,
                'Autopilot: ' || n || ' leader task(s) overdue by more than ' || coalesce(r.params->>'days', '7') || E' days\n\n' || lines
                || E'\n\nOpen: https://woddicrm.org/#/ops/tasks');
        insert into ops_autopilot_log (rule, profile_id, ref_id, detail)
        select r.code, x.profile_id, x.ref_id, x.detail from public.ops_autopilot_targets(r.code) x;
      end if;
    elsif r.code = 'weekly_digest' then
      if exists (select 1 from public.ops_autopilot_targets(r.code)) then
        select 'Weekly operations digest' || E'\n\n'
          || 'Leaders: ' || (j->'leaders'->>'total') || ' (active in 7 days: ' || (j->'leaders'->>'active7') || ', never signed in: ' || (j->'leaders'->>'never') || E')\n'
          || 'Average activity score: ' || (j->'leaders'->>'avg_score') || E'/100\n'
          || 'Tasks completed this week: ' || (j->'tasks'->>'completed') || ', overdue now: ' || (j->'tasks'->>'overdue') || E'\n'
          || 'Reports submitted: ' || (j->'reports'->>'submitted') || ', overdue: ' || (j->'reports'->>'overdue') || E'\n'
          || 'HQ messages read: ' || (j->'communications'->>'read') || ' of ' || (j->'communications'->>'hq_messages') || E'\n\n'
          || 'Full report: https://woddicrm.org/#/ops/reports'
          into digest from (select public.ops_wdos_report_internal(null, 7) j) s;
        -- from the HQ master inbox to the person who switched the rule on
        insert into staff_messages (sender_id, recipient_id, body)
        values (coalesce(nullif(public.hq_inbox_target(), r.owner_id), r.owner_id), r.owner_id, digest);
        insert into ops_autopilot_log (rule, profile_id, detail) values (r.code, r.owner_id, 'weekly digest sent');
        n := 1;
      end if;
    end if;
    res := res || jsonb_build_object(r.code, n);
  end loop;
  return res;
end $$;
revoke execute on function public.ops_autopilot_run() from public, anon, authenticated;

-- the digest runs from cron, where auth.uid() is null: an internal copy of the report without the HQ check
create or replace function public.ops_wdos_report_internal(p_net text, p_days int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare j jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select owner_id from ops_autopilot_rules where code = 'weekly_digest'), 'role', 'authenticated')::text, true);
  j := public.ops_wdos_report(p_net, p_days);
  return j;
end $$;
revoke execute on function public.ops_wdos_report_internal(text, int) from public, anon, authenticated;

create or replace function public.ops_autopilot_state()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare j jsonb;
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  select jsonb_build_object(
    'rules', (select coalesce(jsonb_agg(jsonb_build_object('code', r.code, 'enabled', r.enabled, 'params', r.params, 'updated_at', r.updated_at,
               'owner', (select first_name || ' ' || coalesce(last_name, '') from profiles where id = r.owner_id),
               'would_act', (select count(*) from public.ops_autopilot_targets(r.code)),
               'sample', (select coalesce(jsonb_agg(jsonb_build_object('name', p.first_name || ' ' || coalesce(p.last_name, ''), 'detail', x.detail)), '[]'::jsonb)
                          from (select * from public.ops_autopilot_targets(r.code) limit 5) x left join profiles p on p.id = x.profile_id),
               'last_30d', (select count(*) from ops_autopilot_log g where g.rule = r.code and g.at > now() - interval '30 days')) order by r.code), '[]'::jsonb)
              from ops_autopilot_rules r),
    'log', (select coalesce(jsonb_agg(jsonb_build_object('at', g.at, 'rule', g.rule, 'detail', g.detail,
              'name', (select first_name || ' ' || coalesce(last_name, '') from profiles where id = g.profile_id)) order by g.at desc), '[]'::jsonb)
            from (select * from ops_autopilot_log order by at desc limit 60) g),
    'next_run', 'daily 07:05 Lagos time'
  ) into j;
  return j;
end $$;

create or replace function public.ops_autopilot_set(p_code text, p_enabled boolean, p_params jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  if not exists (select 1 from ops_autopilot_rules where code = p_code) then raise exception 'Unknown rule'; end if;
  if p_params is not null then
    if exists (select 1 from jsonb_each(p_params) e where jsonb_typeof(e.value) <> 'number' or (e.value)::text::numeric < 1 or (e.value)::text::numeric > 90) then
      raise exception 'Rule settings must be whole numbers between 1 and 90';
    end if;
  end if;
  update ops_autopilot_rules set enabled = coalesce(p_enabled, enabled), params = coalesce(p_params, params), owner_id = auth.uid(), updated_at = now() where code = p_code;
  insert into audit_log (actor_id, action, table_name, record_id, new_values)
  values (auth.uid(), 'UPDATE', 'ops_autopilot_rules', p_code, jsonb_build_object('enabled', p_enabled, 'params', p_params));
  return public.ops_autopilot_state();
end $$;

select cron.unschedule('wdos_ops_autopilot') where exists (select 1 from cron.job where jobname = 'wdos_ops_autopilot');
select cron.schedule('wdos_ops_autopilot', '5 6 * * *', 'select public.ops_autopilot_run()');

-- ---------------------------------------------------------------------------
-- 7. Grants: every ops_* RPC the page calls is signed-in only (guarded inside)
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.ops_leaders(text,text,text,text,text,text,integer,integer,integer)', 'public.ops_leader_detail(uuid,integer)',
    'public.ops_activity_feed(text,text,integer,text,integer)', 'public.ops_message_history(integer)', 'public.ops_message_batch(uuid)',
    'public.ops_assign_task(uuid[],text,text,text,date,boolean,text[],text,text,text,text,text)', 'public.ops_task_batches(integer)',
    'public.ops_wdos_report(text,integer)', 'public.ops_autopilot_state()', 'public.ops_autopilot_set(text,boolean,jsonb)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

insert into public.schema_migrations (version, name) values (164, 'operations_centre') on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 164 patches applied live the same day (after testing against real data)
-- ---------------------------------------------------------------------------
-- a) a blank-string profile country counted as its own "country" -> nullif(trim(p.country), '')
-- b) two demo accounts (@woddi-demo.invalid) seated on "Demo (retired)" were counted as leaders
-- c) autopilot preview said "not seen for ever" -> "never signed in"
create or replace function public.ops_is_real(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.email not ilike '%.invalid' and p.merged_into is null from profiles p where p.id = pid), false);
$$;
revoke execute on function public.ops_is_real(uuid) from public, anon, authenticated;
do $$
declare d text;
begin
  d := pg_get_functiondef('public.ops_leader_rows(timestamptz)'::regprocedure);
  d := replace(d, 'limit 1), p.country) as country', 'limit 1), nullif(trim(p.country), '''')) as country');
  d := replace(d, 'where ra.ends_at is null and public.ops_is_leader_role(ra.role::text)
     order by ra.profile_id', 'where ra.ends_at is null and public.ops_is_leader_role(ra.role::text) and public.ops_is_real(ra.profile_id)
     order by ra.profile_id');
  execute d;
  d := pg_get_functiondef('public.ops_events(timestamptz,uuid[])'::regprocedure);
  d := replace(d, 'and (p_profiles is null or ra.profile_id = any(p_profiles)))', 'and public.ops_is_real(ra.profile_id) and (p_profiles is null or ra.profile_id = any(p_profiles)))');
  execute d;
  d := pg_get_functiondef('public.ops_send_message(uuid[],text,text,boolean,text,text,text,text,text,text)'::regprocedure);
  d := replace(d, 'public.ops_is_leader_role(ra.role::text) and ra.profile_id = any(ids));', 'public.ops_is_leader_role(ra.role::text) and public.ops_is_real(ra.profile_id) and ra.profile_id = any(ids));');
  execute d;
  d := pg_get_functiondef('public.ops_assign_task(uuid[],text,text,text,date,boolean,text[],text,text,text,text,text)'::regprocedure);
  d := replace(d, 'public.ops_is_leader_role(ra.role::text) and ra.profile_id = any(ids));', 'public.ops_is_leader_role(ra.role::text) and public.ops_is_real(ra.profile_id) and ra.profile_id = any(ids));');
  execute d;
  d := pg_get_functiondef('public.ops_autopilot_targets(text)'::regprocedure);
  d := replace(d, $x$'not seen for ' || coalesce(extract(day from now() - l.last_seen_at)::int::text || ' days', 'ever')$x$,
                  $x$coalesce('not seen for ' || extract(day from now() - l.last_seen_at)::int::text || ' days', 'never signed in')$x$);
  execute d;
end $$;
revoke execute on function public.ops_esc(text), public.ops_autopilot_text(text, text, text, text), public.ops_is_leader_role(text) from public, anon;

-- d) the activity score gave "nothing overdue" points (tasks, reports, messages: up to 55) to leaders
--    who had never signed in, so a never-used account scored 35/100. Those three parts now count only
--    once the leader has signed in at least once (average fell from 54 to 36 on 29 Sep 2026).
do $$
declare d text;
begin
  d := pg_get_functiondef('public.ops_leader_rows(timestamptz)'::regprocedure);
  if position('m.last_seen_at is null and m.last_signin is null then 0 else 1 end) * 20.0' in d) = 0 then
    d := replace(d, '+ 20.0 * (case when m.tasks_open + m.tasks_done > 0', '+ (case when m.last_seen_at is null and m.last_signin is null then 0 else 1 end) * 20.0 * (case when m.tasks_open + m.tasks_done > 0');
    d := replace(d, '+ 20.0 * (case when m.reports_due > 0', '+ (case when m.last_seen_at is null and m.last_signin is null then 0 else 1 end) * 20.0 * (case when m.reports_due > 0');
    d := replace(d, '+ 15.0 * (case when (select count(*)', '+ (case when m.last_seen_at is null and m.last_signin is null then 0 else 1 end) * 15.0 * (case when (select count(*)');
    execute d;
  end if;
end $$;

-- e) "Newly seated" counted seats that had since ended (145 events for 117 leaders); only current seats count now
do $$
declare d text;
begin
  d := pg_get_functiondef('public.ops_events(timestamptz,uuid[])'::regprocedure);
  if position('ra.starts_at >= p_from and ra.ends_at is null' in d) = 0 then
    d := replace(d, $x$where ra.starts_at >= p_from and public.ops_is_leader_role(ra.role::text)$x$, $x$where ra.starts_at >= p_from and ra.ends_at is null and public.ops_is_leader_role(ra.role::text)$x$);
    execute d;
  end if;
end $$;
