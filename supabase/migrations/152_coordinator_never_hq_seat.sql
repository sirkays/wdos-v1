-- ============================================================================
-- WDOS Migration 152 — "My Coordinator" must never be a seat parked at HQ (Phase 200)
-- Azeez: a new member saw "Patience Opega, Country Representative, WODDI HQ"
-- as her coordinator. Cause: a country_rep seat that sits on the headquarters
-- unit itself instead of on a country. The coordinator lookup walks the
-- member's line up to the root and took that seat. Two fixes:
--   1. the lookup ignores the headquarters level;
--   2. the query at the end lists every seat parked at HQ so they can be
--      moved to the right country (Accounts -> open the person -> seat).
-- ============================================================================
create or replace function public.volunteer_home(pid uuid default null)
returns jsonb language plpgsql stable
security definer set search_path = public as $$
declare
  target uuid;
  p profiles%rowtype;
  v_today date := current_date;
  v_chain jsonb;
  v_coord jsonb;
  v_roles jsonb;
  v_tasks jsonb;
  v_tcounts jsonb;
  v_meet jsonb;
  v_attended int;
  v_learn jsonb;
  v_ann jsonb;
  v_ann_unread int;
  v_impact jsonb;
  v_tickets jsonb;
  v_ach jsonb;
  v_journey jsonb;
  v_lead jsonb;
  v_months int;
  v_start timestamptz;
  v_is_staff boolean;
  v_notices int;
  v_msgs int;
  v_completion int;
  v_referrals jsonb;
  v_docs jsonb;
  v_seat_unit uuid;
  v_reports jsonb;
  v_terms jsonb;
  v_iso text;
begin
  if pid is null then
    target := auth.uid();
  else
    if not is_case_hq() then raise exception 'HQ only'; end if;
    target := pid;
  end if;
  if target is null then raise exception 'Not signed in'; end if;

  select * into p from profiles where id = target;
  if not found then raise exception 'No such member'; end if;

  -- service start: the day the activation journey completed, else the day
  -- the account was created (never fabricated)
  select coalesce(
           (select completed_at from activation_journeys
             where profile_id = target and completed_at is not null),
           p.created_at)
    into v_start;
  v_months := greatest(0, (extract(year from age(now(), v_start)) * 12
                + extract(month from age(now(), v_start)))::int);

  -- network chain: HQ → country → state → LGA → chapter (root first)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'level', c.level, 'name', c.name)
           order by c.depth desc), '[]'::jsonb)
    into v_chain
    from unit_chain(p.org_unit_id) c;

  -- "Reports to": for a member, the nearest leader on her own line; for a
  -- leader, the leader of the unit ABOVE her seat (her peers and assistants
  -- at the same unit are not her superiors). Principal before deputy.
  select ra.org_unit_id into v_seat_unit
    from role_assignments ra
   where ra.profile_id = target and ra.ends_at is null
     and ra.role in (select role from position_master)
   order by (select seq from position_master pm2 where pm2.role = ra.role)
   limit 1;

  select jsonb_build_object(
           'id', ra.profile_id,
           'name', hp.first_name || ' ' || hp.last_name,
           'role', ra.role,
           'appointment_status', ra.appointment_status,
           'role_applied', hp.role_applied,
           'unit', c.name, 'level', c.level)
    into v_coord
    from unit_chain(coalesce(
           (select parent_id from org_units where id = v_seat_unit),
           case when v_seat_unit is null then p.org_unit_id else null end)) c
    join role_assignments ra on ra.org_unit_id = c.id and ra.ends_at is null
     and ra.role in (select role from position_master)
    join profiles hp on hp.id = ra.profile_id
   where ra.profile_id <> target
     and (hp.network = p.network or hp.network is null)
     -- Phase 200: a seat parked at the headquarters unit is a data error, never a coordinator
     and c.level <> 'headquarters'
   order by c.depth asc, (select rank from position_master pm1 where pm1.role = ra.role)
   limit 1;

  -- direct reports (leaders only): deputies/assistants at my own unit and
  -- the leaders seated at the units directly below mine, same network
  if v_seat_unit is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', ra.profile_id, 'name', hp.first_name || ' ' || hp.last_name,
             'role', ra.role, 'appointment_status', ra.appointment_status,
             'unit', ou.name, 'level', ou.level, 'last_seen', hp.last_seen_at)
             order by ou.level, ou.name, ra.role), '[]'::jsonb)
      into v_reports
      from role_assignments ra
      join org_units ou on ou.id = ra.org_unit_id
      join profiles hp on hp.id = ra.profile_id
     where ra.ends_at is null and ra.profile_id <> target
       and (ou.id = v_seat_unit or ou.parent_id = v_seat_unit)
       and hp.network = p.network
       and ra.role in (select role from position_master where role <> 'country_rep')
       and not (ou.id = v_seat_unit and (select rank from position_master pm3 where pm3.role = ra.role) = 1);
  else
    v_reports := '[]'::jsonb;
  end if;

  -- country-sensitive level terminology
  select ou.country_iso into v_iso
    from unit_chain(p.org_unit_id) c join org_units ou on ou.id = c.id
   where c.level = 'country' limit 1;
  v_terms := level_terms_for(v_iso);

  -- current seats
  select coalesce(jsonb_agg(jsonb_build_object(
           'role', ra.role, 'unit_id', ou.id, 'unit', ou.name,
           'level', ou.level, 'since', ra.starts_at,
           'appointment_status', ra.appointment_status,
           'accepted_at', ra.accepted_at, 'declined_at', ra.declined_at)
           order by ra.starts_at), '[]'::jsonb)
    into v_roles
    from role_assignments ra join org_units ou on ou.id = ra.org_unit_id
   where ra.profile_id = target and ra.ends_at is null;

  -- tasks
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'title', t.title, 'status', t.status,
           'due_on', t.due_on, 'priority', t.priority,
           'overdue', (t.due_on is not null and t.due_on < v_today))
           order by t.due_on nulls last, t.created_at), '[]'::jsonb)
    into v_tasks
    from (select * from tasks
           where assigned_to = target
             and status in ('not_started', 'in_progress', 'awaiting_review')
           order by due_on nulls last, created_at limit 8) t;

  select jsonb_build_object(
           'open', count(*) filter (where status in ('not_started', 'in_progress', 'awaiting_review')),
           'overdue', count(*) filter (where status in ('not_started', 'in_progress', 'awaiting_review')
                                        and due_on is not null and due_on < v_today),
           'due_week', count(*) filter (where status in ('not_started', 'in_progress', 'awaiting_review')
                                         and due_on between v_today and v_today + 7),
           'completed', count(*) filter (where status = 'completed'))
    into v_tcounts
    from tasks where assigned_to = target;

  -- meetings (audience-aware, plus anything I organise or administer)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'title', m.title, 'starts_at', m.starts_at,
           'ends_at', m.ends_at, 'mode', m.mode, 'platform', m.platform,
           'location', m.location, 'audience', m.audience,
           'unit', ou.name, 'status', m.status)
           order by m.starts_at), '[]'::jsonb)
    into v_meet
    from (select * from meetings m0
           where m0.status = 'scheduled' and m0.ends_at >= now()
             and (meeting_reaches(m0, target) or m0.organiser = target
                  or m0.org_unit_id in (select administered_units_of(target)))
           order by m0.starts_at limit 6) m
    left join org_units ou on ou.id = m.org_unit_id;

  select count(*) into v_attended from (
    select meeting_id from meeting_attendance
     where profile_id = target and present
    union
    select meeting_id from meeting_checkins where profile_id = target) x;

  -- learning: every active course, my enrolment, my module passes
  select coalesce(jsonb_agg(course order by course->>'code'), '[]'::jsonb)
    into v_learn
    from (
      select jsonb_build_object(
        'id', c.id, 'code', c.code, 'title', c.title,
        'description', c.description,
        'enrollment_id', ce.id, 'started_at', ce.started_at,
        'completed_at', ce.completed_at, 'cert_no', ce.cert_no,
        'modules', (
          select coalesce(jsonb_agg(jsonb_build_object(
                   'id', cm.id, 'seq', cm.seq, 'title', cm.title,
                   'passed', coalesce(cp.passed, false),
                   'score', cp.score, 'total', cp.total,
                   'completed_at', cp.completed_at)
                   order by cm.seq), '[]'::jsonb)
            from course_modules cm
            left join course_module_passes cp
              on cp.module_id = cm.id and cp.enrollment_id = ce.id
           where cm.course_id = c.id),
        'modules_total', (select count(*) from course_modules where course_id = c.id),
        'modules_passed', (select count(*) from course_module_passes cp2
                            join course_modules cm2 on cm2.id = cp2.module_id
                           where cp2.enrollment_id = ce.id and cp2.passed
                             and cm2.course_id = c.id)
      ) as course
      from courses c
      left join course_enrollments ce on ce.course_id = c.id and ce.profile_id = target
     where c.is_active) sub;

  -- announcements that reach me (audience targeting from 077)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'title', a.title, 'priority', a.priority,
           'created_at', a.created_at,
           'read', exists (select 1 from announcement_reads r
                            where r.announcement_id = a.id and r.profile_id = target))
           order by a.created_at desc), '[]'::jsonb),
         count(*) filter (where not exists (
           select 1 from announcement_reads r
            where r.announcement_id = a.id and r.profile_id = target))
    into v_ann, v_ann_unread
    from (select * from announcements a0
           where p.org_unit_id in (select org_unit_subtree(a0.org_unit_id))
             and (a0.network is null or a0.network = p.network)
             and (a0.audience = 'all'
                  or (a0.audience = 'leaders' and is_established(target))
                  or (a0.audience = 'intake' and not is_established(target)))
           order by a0.created_at desc limit 6) a;

  -- impact: only what the system recorded
  select jsonb_build_object(
           'women_reached', (select count(*) from beneficiaries where created_by = target),
           'referrals', (select count(*) from referrals where referrer_id = target),
           'meetings_attended', v_attended,
           'tasks_completed', (select count(*) from tasks
                                where assigned_to = target and status = 'completed'),
           'modules_completed', (select count(*) from course_module_passes cp
                                  join course_enrollments ce on ce.id = cp.enrollment_id
                                 where ce.profile_id = target and cp.passed),
           'months_of_service', v_months,
           'service_since', v_start)
    into v_impact;

  -- my referrals (latest 8, with the ladder position)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'ref_no', r.ref_no, 'category', r.category,
           'reason', r.reason, 'status', r.status, 'created_at', r.created_at,
           'updated_at', r.updated_at)
           order by r.created_at desc), '[]'::jsonb)
    into v_referrals
    from (select * from referrals where referrer_id = target
           order by created_at desc limit 8) r;

  -- support tickets
  select jsonb_build_object(
           'open', count(*) filter (where status in ('open', 'in_progress', 'waiting_on_user')),
           'resolved', count(*) filter (where status in ('resolved', 'closed')),
           'recent', coalesce((select jsonb_agg(jsonb_build_object(
               'id', x.id, 'ticket_no', x.ticket_no, 'subject', x.subject,
               'status', x.status, 'created_at', x.created_at)
               order by x.created_at desc)
             from (select * from tickets where requester_id = target
                    order by created_at desc limit 4) x), '[]'::jsonb))
    into v_tickets
    from tickets where requester_id = target;

  -- achievements: derived from real events, newest first
  select coalesce(jsonb_agg(a order by (a->>'at') desc nulls last), '[]'::jsonb)
    into v_ach
    from (
      select jsonb_build_object('code', 'orientation', 'at', j.completed_at, 'title', null) as a
        from activation_journeys j
       where j.profile_id = target and j.status = 'completed' and j.completed_at is not null
      union all
      select jsonb_build_object('code', 'module', 'at', cp.completed_at, 'title', cm.title)
        from course_module_passes cp
        join course_enrollments ce on ce.id = cp.enrollment_id
        join course_modules cm on cm.id = cp.module_id
       where ce.profile_id = target and cp.passed
      union all
      select jsonb_build_object('code', 'certificate', 'at', ce.completed_at,
                                'title', c.title, 'cert_no', ce.cert_no)
        from course_enrollments ce join courses c on c.id = ce.course_id
       where ce.profile_id = target and ce.completed_at is not null
      union all
      select jsonb_build_object('code', 'appointed', 'at', ra.starts_at,
                                'title', ra.role::text, 'unit', ou.name)
        from role_assignments ra join org_units ou on ou.id = ra.org_unit_id
       where ra.profile_id = target and ra.ends_at is null
         and ra.role in (select role from position_master)
      union all
      select jsonb_build_object('code', 'service_' || m.n, 'at', v_start + (m.n || ' months')::interval,
                                'title', null)
        from (values (3), (6), (12), (24)) m(n)
       where v_months >= m.n
    ) s;

  -- activation journey (candidates)
  select jsonb_build_object(
           'status', j.status, 'started_at', j.started_at, 'due_at', j.due_at,
           'extended_until', j.extended_until, 'completed_at', j.completed_at,
           'day', least(14, greatest(1,
             floor(extract(epoch from (now() - j.started_at)) / 86400)::int + 1)))
    into v_journey
    from activation_journeys j where j.profile_id = target;

  -- leadership subtree (leaders only): every seat below mine, holder or vacant
  if jsonb_array_length(v_roles) > 0 then
    with recursive my_units as (
      select org_unit_id as id from role_assignments
       where profile_id = target and ends_at is null
      union all
      select ou.id from org_units ou join my_units mu on ou.parent_id = mu.id
    ),
    nodes as (
      select ou.id, ou.level, ou.name, ou.parent_id,
             ra.profile_id as holder_id, ra.role, ra.appointment_status,
             hp.first_name || ' ' || hp.last_name as holder_name,
             hp.last_seen_at
        from (select distinct id from my_units) u
        join org_units ou on ou.id = u.id
        left join lateral (
          select r.profile_id, r.role, r.appointment_status from role_assignments r
           join profiles hq0 on hq0.id = r.profile_id and hq0.network = p.network
           where r.org_unit_id = ou.id and r.ends_at is null
             and r.role in (select role from position_master)
           order by (select rank from position_master pm0 where pm0.role = r.role), r.starts_at
           limit 1) ra on true
        left join profiles hp on hp.id = ra.profile_id
       where ou.id not in (select org_unit_id from role_assignments
                            where profile_id = target and ends_at is null)
    )
    select jsonb_build_object(
      'seats', (select count(*) from nodes),
      'filled', (select count(*) from nodes where holder_id is not null),
      'vacant', (select count(*) from nodes where holder_id is null),
      'members', (select count(*) from profiles m
                   where m.org_unit_id in (select administered_units_of(target))
                     and m.id <> target and m.merged_into is null
                     and m.status in ('approved', 'activated', 'in_training', 'active', 'reinstated')),
      'members_active', (select count(*) from profiles m
                          where m.org_unit_id in (select administered_units_of(target))
                            and m.id <> target and m.merged_into is null
                            and m.status = 'active'),
      'by_level', (select coalesce(jsonb_object_agg(lv, cnt), '{}'::jsonb)
                    from (select level::text as lv, count(*) as cnt from nodes group by level) q),
      'nodes', (select coalesce(jsonb_agg(jsonb_build_object(
                  'org_unit_id', n.id, 'level', n.level, 'location', n.name,
                  'parent_id', n.parent_id, 'role', n.role,
                  'holder_id', n.holder_id, 'holder_name', n.holder_name,
                  'appointment_status', n.appointment_status,
                  'last_seen', n.last_seen_at, 'vacant', n.holder_id is null)
                  order by n.level, n.name), '[]'::jsonb)
                 from (select * from nodes limit 400) n),
      'nodes_total', (select count(*) from nodes))
      into v_lead;
  else
    v_lead := null;
  end if;

  select exists (select 1 from staff s where s.profile_id = target and s.is_active)
    into v_is_staff;
  select count(*) into v_notices from member_notices
   where profile_id = target and read_at is null;
  select count(*) into v_msgs from staff_messages
   where recipient_id = target and read_at is null;

  v_completion := (
    (case when nullif(p.first_name, '') is not null then 1 else 0 end)
    + (case when nullif(p.last_name, '') is not null then 1 else 0 end)
    + (case when nullif(p.email, '') is not null then 1 else 0 end)
    + (case when nullif(p.phone, '') is not null then 1 else 0 end)
    + (case when nullif(p.country, '') is not null then 1 else 0 end)
    + (case when nullif(p.state_region, '') is not null then 1 else 0 end)
    + (case when nullif(p.lga, '') is not null then 1 else 0 end)
    + (case when nullif(p.role_applied, '') is not null then 1 else 0 end)
    + (case when p.birth_date is not null then 1 else 0 end)
    + (case when p.org_unit_id is not null then 1 else 0 end)
  ) * 10;

  -- documents the member may read (latest 8 in reachable folders)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'name', d.name, 'path', d.path, 'mime', d.mime,
           'folder', f.name, 'created_at', d.created_at)
           order by d.created_at desc), '[]'::jsonb)
    into v_docs
    from (select d0.* from documents d0
           join doc_folders f0 on f0.id = d0.folder_id
          where not d0.archived
            and (f0.org_unit_id in (select unit_chain.id from unit_chain(p.org_unit_id))
                 or f0.org_unit_id in (select administered_units_of(target)))
          order by d0.created_at desc limit 8) d
    join doc_folders f on f.id = d.folder_id;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name,
      'email', p.email, 'phone', p.phone, 'membership_no', p.membership_no,
      'network', p.network, 'status', p.status, 'country', p.country,
      'state_region', p.state_region, 'lga', p.lga,
      'role_applied', p.role_applied, 'is_leader', p.is_leader,
      'is_staff', v_is_staff, 'org_unit_id', p.org_unit_id,
      'preferred_locale', p.preferred_locale, 'birth_date', p.birth_date,
      'joined_at', p.created_at, 'last_seen_at', p.last_seen_at,
      'completion', v_completion,
      'established', is_established(target)),
    'chain', v_chain,
    'coordinator', v_coord,
    'reports_to', v_coord,
    'direct_reports', v_reports,
    'terms', v_terms,
    'country_iso', v_iso,
    'roles', v_roles,
    'tasks', v_tasks,
    'task_counts', v_tcounts,
    'meetings', v_meet,
    'learning', v_learn,
    'announcements', v_ann,
    'announcements_unread', v_ann_unread,
    'impact', v_impact,
    'referrals', v_referrals,
    'tickets', v_tickets,
    'achievements', v_ach,
    'journey', v_journey,
    'leadership', v_lead,
    'documents', v_docs,
    'notices_unread', v_notices,
    'messages_unread', v_msgs,
    'generated_at', now(),
    'viewing_as', (pid is not null));
end; $$;

-- seats parked on the headquarters unit (these are the ones to correct)
select p.first_name || ' ' || p.last_name as name, p.email, ra.role::text, ou.name as unit, ou.level::text, p.country
  from role_assignments ra join org_units ou on ou.id = ra.org_unit_id join profiles p on p.id = ra.profile_id
 where ra.ends_at is null and ou.level = 'headquarters' and ra.role::text in ('country_rep','deputy_country_rep','state_coordinator','assistant_state_coordinator','state_secretary','district_coordinator','assistant_district_coordinator','cluster_coordinator','assistant_cluster_coordinator','chapter_lead','assistant_chapter_lead')
 order by ra.role, name;

insert into public.schema_migrations (version, name) values (152, 'coordinator_never_hq_seat') on conflict (version) do nothing;
