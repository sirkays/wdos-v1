-- ============================================================================
-- WDOS Migration 150 — Revised Readiness Assessment, chosen network, ranking,
-- and the read-only bug (Phase 198)
-- Built to "WGMN Leadership Activation: Understanding & Readiness Assessment
-- (REVISED)". The same structure serves WNNN with the network name switched.
-- ============================================================================

-- 0. BUG: hq_activation_master was declared STABLE but runs the deadline
--    sweep (an UPDATE) first, so Postgres refused it inside a read-only
--    transaction. It is now VOLATILE like hq_activation_analytics.

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
          'position', coalesce(public.role_title(a.position_code, a.network), a.position_code),
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


-- 1. The network she CHOSE on the form (two buttons), and her age then, so HQ
--    can see a choice that does not match the age band.
alter table public.candidate_activations
  add column if not exists network_chosen boolean not null default false,
  add column if not exists age_at_start int;

-- 2. The revised assessment: 30 statements in 8 sections, 4 short questions,
--    the clarification question, 3 confirmations and the readiness choice.
create table if not exists public.readiness_statements (
  seq int not null, network text not null check (network in ('WGMN','WNNN')),
  section text not null, section_title text not null, statement text not null,
  primary key (network, seq)
);
create table if not exists public.readiness_short_questions (
  seq int not null, network text not null check (network in ('WGMN','WNNN')), question text not null,
  primary key (network, seq)
);
create table if not exists public.readiness_confirmations (
  seq int primary key, text text not null
);
alter table public.readiness_statements enable row level security;
alter table public.readiness_short_questions enable row level security;
alter table public.readiness_confirmations enable row level security;
drop policy if exists rs_read on public.readiness_statements; create policy rs_read on public.readiness_statements for select to authenticated using (true);
drop policy if exists rsq_read on public.readiness_short_questions; create policy rsq_read on public.readiness_short_questions for select to authenticated using (true);
drop policy if exists rc_read on public.readiness_confirmations; create policy rc_read on public.readiness_confirmations for select to authenticated using (true);

insert into public.readiness_statements (seq, network, section, section_title, statement) values (1, 'WGMN', 'A', 'Understanding WODDI and WGMN', 'I understand the broad purpose of WODDI and the role of the WODDI Good Mother Network (WGMN).') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (1, 'WNNN', 'A', 'Understanding WODDI and WNNN', 'I understand the broad purpose of WODDI and the role of the WODDI Nurture NextGen Network (WNNN).') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (2, 'WGMN', 'A', 'Understanding WODDI and WGMN', 'I understand that WGMN is a volunteer-led network that helps women grow, lead, mentor, serve and strengthen families and communities.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (2, 'WNNN', 'A', 'Understanding WODDI and WNNN', 'I understand that WNNN is a volunteer-led network that helps young women grow, lead, mentor, serve and strengthen families and communities.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (3, 'WGMN', 'A', 'Understanding WODDI and WGMN', 'I understand the WGMN principle “No Woman Is Left Out” and the importance of inclusion in how leaders serve.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (3, 'WNNN', 'A', 'Understanding WODDI and WNNN', 'I understand the WNNN principle “No Young Woman Is Left Out” and the importance of inclusion in how leaders serve.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (4, 'WGMN', 'A', 'Understanding WODDI and WGMN', 'I understand that WGMN operates primarily through approved virtual and digital systems.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (4, 'WNNN', 'A', 'Understanding WODDI and WNNN', 'I understand that WNNN operates primarily through approved virtual and digital systems.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (5, 'WGMN', 'B', 'Leadership Structure and Proposed Role', 'I understand where the leadership position I am being considered for sits within the WGMN leadership structure and who I would report to.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (5, 'WNNN', 'B', 'Leadership Structure and Proposed Role', 'I understand where the leadership position I am being considered for sits within the WNNN leadership structure and who I would report to.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (6, 'WGMN', 'B', 'Leadership Structure and Proposed Role', 'I understand the people, areas or leadership levels I may be expected to coordinate or support if appointed.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (6, 'WNNN', 'B', 'Leadership Structure and Proposed Role', 'I understand the people, areas or leadership levels I may be expected to coordinate or support if appointed.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (7, 'WGMN', 'B', 'Leadership Structure and Proposed Role', 'I understand the main responsibilities attached to the leadership position I am being considered for.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (7, 'WNNN', 'B', 'Leadership Structure and Proposed Role', 'I understand the main responsibilities attached to the leadership position I am being considered for.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (8, 'WGMN', 'B', 'Leadership Structure and Proposed Role', 'I understand that WGMN leaders must work within the approved leadership and reporting structure and must not create parallel structures or informal titles.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (8, 'WNNN', 'B', 'Leadership Structure and Proposed Role', 'I understand that WNNN leaders must work within the approved leadership and reporting structure and must not create parallel structures or informal titles.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (9, 'WGMN', 'C', 'Authority, Recruitment and Appointment', 'I understand the limits of the authority attached to the role and that matters outside my authority must be referred or escalated appropriately.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (9, 'WNNN', 'C', 'Authority, Recruitment and Appointment', 'I understand the limits of the authority attached to the role and that matters outside my authority must be referred or escalated appropriately.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (10, 'WGMN', 'C', 'Authority, Recruitment and Appointment', 'I understand that I cannot make unauthorised financial, partnership, programme, media or other commitments on behalf of WODDI/WGMN.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (10, 'WNNN', 'C', 'Authority, Recruitment and Appointment', 'I understand that I cannot make unauthorised financial, partnership, programme, media or other commitments on behalf of WODDI/WNNN.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (11, 'WGMN', 'C', 'Authority, Recruitment and Appointment', 'I understand that I may identify or recommend suitable leadership prospects where required, but recommendation does not equal appointment.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (11, 'WNNN', 'C', 'Authority, Recruitment and Appointment', 'I understand that I may identify or recommend suitable leadership prospects where required, but recommendation does not equal appointment.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (12, 'WGMN', 'C', 'Authority, Recruitment and Appointment', 'I understand that selection and appointment are confirmed only through the approved WODDI process.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (12, 'WNNN', 'C', 'Authority, Recruitment and Appointment', 'I understand that selection and appointment are confirmed only through the approved WODDI process.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (13, 'WGMN', 'D', 'Reporting, Accountability and WDOS', 'I understand that WDOS is the official operational platform for leadership records, tasks, reporting and approved operational information.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (13, 'WNNN', 'D', 'Reporting, Accountability and WDOS', 'I understand that WDOS is the official operational platform for leadership records, tasks, reporting and approved operational information.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (14, 'WGMN', 'D', 'Reporting, Accountability and WDOS', 'I understand that I will be expected to provide required reports, updates and follow-through within the approved reporting structure.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (14, 'WNNN', 'D', 'Reporting, Accountability and WDOS', 'I understand that I will be expected to provide required reports, updates and follow-through within the approved reporting structure.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (15, 'WGMN', 'D', 'Reporting, Accountability and WDOS', 'I understand that agreed actions should have clear ownership, deadlines and follow-through.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (15, 'WNNN', 'D', 'Reporting, Accountability and WDOS', 'I understand that agreed actions should have clear ownership, deadlines and follow-through.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (16, 'WGMN', 'D', 'Reporting, Accountability and WDOS', 'I understand that WhatsApp messages, personal lists or private records should not replace official WODDI/WDOS records.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (16, 'WNNN', 'D', 'Reporting, Accountability and WDOS', 'I understand that WhatsApp messages, personal lists or private records should not replace official WODDI/WDOS records.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (17, 'WGMN', 'E', 'Programmes and Activities', 'I understand that local needs and opportunities may be identified and proposed through the approved leadership structure.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (17, 'WNNN', 'E', 'Programmes and Activities', 'I understand that local needs and opportunities may be identified and proposed through the approved leadership structure.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (18, 'WGMN', 'E', 'Programmes and Activities', 'I understand that official WODDI/WGMN activities must align with an approved WODDI programme or programme area and receive the required approval before implementation.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (18, 'WNNN', 'E', 'Programmes and Activities', 'I understand that official WODDI/WNNN activities must align with an approved WODDI programme or programme area and receive the required approval before implementation.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (19, 'WGMN', 'E', 'Programmes and Activities', 'I understand that I should not launch an independent programme, campaign, fundraising activity or partnership in WODDI/WGMN’s name without approval.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (19, 'WNNN', 'E', 'Programmes and Activities', 'I understand that I should not launch an independent programme, campaign, fundraising activity or partnership in WODDI/WNNN’s name without approval.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (20, 'WGMN', 'F', 'Communication, Conduct and Confidentiality', 'I understand that official communication must use approved WODDI/WGMN channels, materials, branding and messages.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (20, 'WNNN', 'F', 'Communication, Conduct and Confidentiality', 'I understand that official communication must use approved WODDI/WNNN channels, materials, branding and messages.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (21, 'WGMN', 'F', 'Communication, Conduct and Confidentiality', 'I understand that I am expected to act with integrity, dignity, respect, accountability and responsible use of leadership authority.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (21, 'WNNN', 'F', 'Communication, Conduct and Confidentiality', 'I understand that I am expected to act with integrity, dignity, respect, accountability and responsible use of leadership authority.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (22, 'WGMN', 'F', 'Communication, Conduct and Confidentiality', 'I understand that member, volunteer and organisational information must be kept confidential and used only for approved purposes.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (22, 'WNNN', 'F', 'Communication, Conduct and Confidentiality', 'I understand that member, volunteer and organisational information must be kept confidential and used only for approved purposes.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (23, 'WGMN', 'F', 'Communication, Conduct and Confidentiality', 'I understand that confidential information, screenshots, personal data or internal records must not be shared outside their approved purpose.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (23, 'WNNN', 'F', 'Communication, Conduct and Confidentiality', 'I understand that confidential information, screenshots, personal data or internal records must not be shared outside their approved purpose.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (24, 'WGMN', 'G', 'Safeguarding and Escalation', 'I understand that safeguarding concerns and serious conduct matters must be treated seriously and escalated through the approved route.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (24, 'WNNN', 'G', 'Safeguarding and Escalation', 'I understand that safeguarding concerns and serious conduct matters must be treated seriously and escalated through the approved route.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (25, 'WGMN', 'G', 'Safeguarding and Escalation', 'I understand that I should not privately investigate serious safeguarding or conduct matters unless formally authorised.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (25, 'WNNN', 'G', 'Safeguarding and Escalation', 'I understand that I should not privately investigate serious safeguarding or conduct matters unless formally authorised.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (26, 'WGMN', 'G', 'Safeguarding and Escalation', 'I understand that serious legal, data, financial, safeguarding or reputational concerns should be escalated promptly.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (26, 'WNNN', 'G', 'Safeguarding and Escalation', 'I understand that serious legal, data, financial, safeguarding or reputational concerns should be escalated promptly.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (27, 'WGMN', 'H', 'Volunteer Service and Readiness', 'I understand that WGMN leadership is volunteer-led and unpaid.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (27, 'WNNN', 'H', 'Volunteer Service and Readiness', 'I understand that WNNN leadership is volunteer-led and unpaid.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (28, 'WGMN', 'H', 'Volunteer Service and Readiness', 'I am willing to use WDOS and other approved systems, participate in required meetings and reporting, and follow through on responsibilities applicable to my role.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (28, 'WNNN', 'H', 'Volunteer Service and Readiness', 'I am willing to use WDOS and other approved systems, participate in required meetings and reporting, and follow through on responsibilities applicable to my role.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (29, 'WGMN', 'H', 'Volunteer Service and Readiness', 'I am willing to uphold WODDI/WGMN standards on conduct, safeguarding, confidentiality, accountability and respectful leadership.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (29, 'WNNN', 'H', 'Volunteer Service and Readiness', 'I am willing to uphold WODDI/WNNN standards on conduct, safeguarding, confidentiality, accountability and respectful leadership.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (30, 'WGMN', 'H', 'Volunteer Service and Readiness', 'If selected and formally appointed, I am willing to accept the responsibilities of the leadership position for which I am being considered.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_statements (seq, network, section, section_title, statement) values (30, 'WNNN', 'H', 'Volunteer Service and Readiness', 'If selected and formally appointed, I am willing to accept the responsibilities of the leadership position for which I am being considered.') on conflict (network, seq) do update set section = excluded.section, section_title = excluded.section_title, statement = excluded.statement;
insert into public.readiness_short_questions (seq, network, question) values (1, 'WGMN', 'In your own words, what is the purpose of WGMN?') on conflict (network, seq) do update set question = excluded.question;
insert into public.readiness_short_questions (seq, network, question) values (1, 'WNNN', 'In your own words, what is the purpose of WNNN?') on conflict (network, seq) do update set question = excluded.question;
insert into public.readiness_short_questions (seq, network, question) values (2, 'WGMN', 'What do you understand to be the main responsibility of the leadership position you are being considered for?') on conflict (network, seq) do update set question = excluded.question;
insert into public.readiness_short_questions (seq, network, question) values (2, 'WNNN', 'What do you understand to be the main responsibility of the leadership position you are being considered for?') on conflict (network, seq) do update set question = excluded.question;
insert into public.readiness_short_questions (seq, network, question) values (3, 'WGMN', 'If you are faced with a matter that is outside the authority of your role, what would you do?') on conflict (network, seq) do update set question = excluded.question;
insert into public.readiness_short_questions (seq, network, question) values (3, 'WNNN', 'If you are faced with a matter that is outside the authority of your role, what would you do?') on conflict (network, seq) do update set question = excluded.question;
insert into public.readiness_short_questions (seq, network, question) values (4, 'WGMN', 'Mention one important principle from the Leadership Pack that would guide you if you are appointed.') on conflict (network, seq) do update set question = excluded.question;
insert into public.readiness_short_questions (seq, network, question) values (4, 'WNNN', 'Mention one important principle from the Leadership Pack that would guide you if you are appointed.') on conflict (network, seq) do update set question = excluded.question;
insert into public.readiness_confirmations (seq, text) values (1, 'I confirm that I have reviewed the Leadership Pack provided to me.') on conflict (seq) do update set text = excluded.text;
insert into public.readiness_confirmations (seq, text) values (2, 'I confirm that my answers reflect my current understanding and that I have identified any areas where I need clarification.') on conflict (seq) do update set text = excluded.text;
insert into public.readiness_confirmations (seq, text) values (3, 'I understand that completing this assessment does not constitute appointment and that any appointment is confirmed only through the approved WODDI process.') on conflict (seq) do update set text = excluded.text;

alter table public.readiness_assessments
  add column if not exists statements jsonb not null default '{}'::jsonb,       -- {"1":"yes"|"clarify"}
  add column if not exists short_answers jsonb not null default '{}'::jsonb,    -- {"1":"..."}
  add column if not exists clarification_note text,
  add column if not exists confirmations jsonb not null default '[]'::jsonb,    -- [1,2,3]
  add column if not exists readiness text check (readiness in ('ready','interested','not_now')),
  add column if not exists signature_name text,
  add column if not exists signed_at timestamptz,
  add column if not exists clarifications int,
  add column if not exists short_score int,                                      -- reviewer, 0-8
  add column if not exists rank_score numeric,                                   -- computed, 0-100
  add column if not exists understanding_review text check (understanding_review in ('satisfactory','further_discussion')),
  add column if not exists next_stage text check (next_stage in ('proceed','further_review','do_not_proceed')),
  add column if not exists hq_comments text;

-- the form for the signed-in candidate
create or replace function public.readiness_form()
returns jsonb language sql stable security definer set search_path = public as $$
  with a as (select * from candidate_activations where profile_id = auth.uid() and status <> 'closed' order by created_at desc limit 1)
  select jsonb_build_object(
    'network', (select network from a),
    'statements', (select coalesce(jsonb_agg(jsonb_build_object('seq', s.seq, 'section', s.section, 'section_title', s.section_title, 'statement', s.statement) order by s.seq), '[]'::jsonb)
                   from readiness_statements s where s.network = coalesce((select network from a), 'WGMN')),
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('seq', q.seq, 'question', q.question) order by q.seq), '[]'::jsonb)
                   from readiness_short_questions q where q.network = coalesce((select network from a), 'WGMN')),
    'confirmations', (select coalesce(jsonb_agg(jsonb_build_object('seq', c.seq, 'text', c.text) order by c.seq), '[]'::jsonb) from readiness_confirmations c),
    'existing', (select jsonb_build_object('status', r.status, 'statements', r.statements, 'short_answers', r.short_answers,
                   'clarification_note', r.clarification_note, 'confirmations', r.confirmations, 'readiness', r.readiness,
                   'signature_name', r.signature_name, 'return_note', r.return_note, 'disclosed', r.disclosed, 'outcome', r.outcome, 'submitted_at', r.submitted_at)
                 from readiness_assessments r where r.activation_id = (select id from a) order by r.version desc limit 1));
$$;
revoke execute on function public.readiness_form() from anon;

-- rank score: 0-100, transparent
--   understanding  40  = share of statements answered "yes"
--   short answers  30  = reviewer score /8 (0 until reviewed)
--   readiness      20  = ready 20, interested 10, not now 0
--   completion     10  = 10 if all confirmations ticked and days completed within the window
create or replace function public.readiness_rank_score(p_assessment uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select round(
      40.0 * coalesce((select count(*) filter (where v = 'yes')::numeric / nullif(count(*),0) from jsonb_each_text(r.statements) as e(k, v)), 0)
    + 30.0 * coalesce(r.short_score, 0) / 8.0
    + case r.readiness when 'ready' then 20 when 'interested' then 10 else 0 end
    + case when jsonb_array_length(r.confirmations) >= 3 and a.completed_at is not null and a.completed_at <= a.deadline then 10 else 0 end, 1)
  from readiness_assessments r join candidate_activations a on a.id = r.activation_id where r.id = p_assessment;
$$;

-- submit (Day 3). Locks; a return creates a new version.
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
    -- a resubmission after a return: keep the earlier answer set, never delete it
    update readiness_assessments set
       previous = previous || jsonb_build_object('version', version, 'submitted_at', submitted_at, 'statements', statements, 'short_answers', short_answers,
                                                 'readiness', readiness, 'return_note', return_note),
       version = version + 1, status = 'submitted', submitted_at = now(), statements = p_payload->'statements',
       short_answers = coalesce(p_payload->'short_answers','{}'::jsonb), clarification_note = p_payload->>'clarification_note',
       confirmations = p_payload->'confirmations', readiness = p_payload->>'readiness', signature_name = p_payload->>'signature_name', signed_at = now(),
       clarifications = n_stmt - n_yes, answers = coalesce(p_payload->'short_answers','{}'::jsonb), return_note = null
     where id = r.id returning * into r;
  end if;
  update readiness_assessments set rank_score = public.readiness_rank_score(r.id) where id = r.id;
  update candidate_activation_steps set status = 'completed', completed_at = coalesce(completed_at, now()) where activation_id = a.id and day = 3;
  update candidate_activations set status = 'completed', completed_at = coalesce(completed_at, now()), current_day = 3 where id = a.id;
  return public.my_activation();
end; $$;
revoke execute on function public.submit_readiness_v2(jsonb) from anon;

-- HQ review of the revised assessment
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
  update readiness_assessments set rank_score = public.readiness_rank_score(p_assessment) where id = p_assessment;
  if p_action = 'return' then
    update readiness_assessments set status = 'returned', return_note = p_return_note where id = p_assessment;
    update candidate_activations set status = 'in_progress' where id = r.activation_id;
  elsif p_action = 'complete' then
    update readiness_assessments set status = 'completed', outcome = p_outcome, disclosed = p_disclosed where id = p_assessment;
  end if;
end; $$;
revoke execute on function public.review_readiness_v2(uuid, int, text, text, text, text, text, text, text) from anon;

-- 3. Ranking: everyone who completed for the same position in the same place
create or replace function public.hq_activation_ranking()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(g order by (g->>'n')::int desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'position', coalesce(public.role_title(a.position_code, a.network), a.position_code), 'network', a.network,
      'country', a.geo_country, 'state', a.geo_state, 'lga', a.geo_lga, 'cluster', a.geo_cluster,
      'n', count(*),
      'candidates', jsonb_agg(jsonb_build_object(
        'activation_id', a.id, 'assessment_id', r.id, 'name', p.first_name || ' ' || p.last_name, 'email', p.email,
        'rank_score', r.rank_score, 'yes_count', (select count(*) from jsonb_each_text(r.statements) e(k,v) where v = 'yes'),
        'clarifications', r.clarifications, 'short_score', r.short_score, 'readiness', r.readiness,
        'days_taken', extract(epoch from (a.completed_at - a.started_at)) / 86400.0,
        'on_time', a.completed_at <= a.deadline, 'age_band_ok', case when a.age_at_start is null then null when a.network = 'WNNN' then a.age_at_start between 18 and 29 else a.age_at_start >= 30 end,
        'understanding_review', r.understanding_review, 'next_stage', r.next_stage, 'outcome', r.outcome, 'reviewed', r.reviewed_at is not null)
        order by r.rank_score desc nulls last, r.clarifications asc nulls last, a.completed_at asc)) as g
    from candidate_activations a join profiles p on p.id = a.profile_id
    join readiness_assessments r on r.activation_id = a.id
    where a.status = 'completed' and public.is_case_hq()
    group by a.position_code, a.network, a.geo_country, a.geo_state, a.geo_lga, a.geo_cluster
    having count(*) >= 1) s;
$$;
revoke execute on function public.hq_activation_ranking() from anon;

-- 4. begin: record the chosen network and her age
create or replace function public.begin_referral_activation(p_code text, p_form jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); l referral_links%rowtype; a candidate_activations%rowtype; s activation_settings%rowtype;
        p profiles%rowtype; app_id uuid; net text; pos text; unit uuid; iso char(2); age int;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select * into l from referral_links where code = p_code and route = 'ref3' and active and (expires_at is null or expires_at > now());
  if not found then raise exception 'This referral link is not valid'; end if;
  select * into s from activation_settings where id = 1;
  select * into p from profiles where id = me;
  net := coalesce(nullif(p_form->>'network',''), l.network::text, 'WGMN');
  pos := coalesce(nullif(p_form->>'position',''), l.role::text);
  unit := coalesce(nullif(p_form->>'unit_id','')::uuid, l.org_unit_id);
  iso := upper(nullif(p_form->>'country_iso',''));
  age := case when nullif(p_form->>'birth_date','') is null then null else extract(year from age((p_form->>'birth_date')::date))::int end;
  update profiles set network = net::network_code, org_unit_id = coalesce(unit, org_unit_id),
         country = coalesce(nullif(p_form->>'country',''), country), state_region = coalesce(nullif(p_form->>'state',''), state_region),
         referral_code = coalesce(referral_code, l.code), role_applied = coalesce(public.role_title(pos, net), role_applied), is_leader = false
   where id = me;
  select id into app_id from applications where lower(email) = lower(p.email) and status not in ('rejected','withdrawn') limit 1;
  if app_id is null then
    insert into applications (first_name, last_name, email, phone, network, org_unit_id, motivation, preferred_locale, referral_code, status, profile_id)
    values (p.first_name, p.last_name, p.email, p.phone, net::network_code, unit, 'Referred candidate: Referral Activation in progress.', coalesce(p.preferred_locale,'en'), l.code, 'submitted', me)
    returning id into app_id;
  end if;
  insert into candidate_activations (profile_id, route, network, role, org_unit_id, referral_code, referrer_id, application_id, status, started_at, deadline, pack_version,
                                     position_code, geo_country, geo_state, geo_lga, geo_cluster, geo_country_iso, form_data, network_chosen, age_at_start)
  values (me, 'ref3', net, pos, unit, l.code, l.owner_id, app_id, 'in_progress', now(), now() + make_interval(days => s.ref3_days), 'CE-1.0',
          pos, p_form->>'country', p_form->>'state', p_form->>'lga', p_form->>'cluster', iso, p_form, coalesce((p_form->>'network_chosen')::boolean, true), age)
  on conflict (profile_id, route) do update set
     status = case when candidate_activations.status = 'not_started' then 'in_progress' else candidate_activations.status end,
     position_code = coalesce(excluded.position_code, candidate_activations.position_code),
     geo_country = coalesce(excluded.geo_country, candidate_activations.geo_country), geo_state = coalesce(excluded.geo_state, candidate_activations.geo_state),
     geo_lga = coalesce(excluded.geo_lga, candidate_activations.geo_lga), geo_cluster = coalesce(excluded.geo_cluster, candidate_activations.geo_cluster),
     form_data = candidate_activations.form_data || excluded.form_data, network_chosen = excluded.network_chosen, age_at_start = coalesce(excluded.age_at_start, candidate_activations.age_at_start)
  returning * into a;
  insert into candidate_activation_steps (activation_id, day, status, started_at) values (a.id, 1, 'in_progress', now()) on conflict do nothing;
  return public.my_activation();
end; $$;
revoke execute on function public.begin_referral_activation(text, jsonb) from anon;

-- detail for the reviewer: the revised fields alongside the old ones
create or replace function public.hq_readiness_detail(p_assessment uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.is_case_hq() then jsonb_build_object(
    'id', ra.id, 'status', ra.status, 'answers', ra.answers, 'scores', ra.scores, 'comments', ra.reviewer_comments,
    'statements', ra.statements, 'short_answers', ra.short_answers, 'clarification_note', ra.clarification_note,
    'confirmations', ra.confirmations, 'readiness', ra.readiness, 'signature_name', ra.signature_name, 'signed_at', ra.signed_at,
    'clarifications', ra.clarifications, 'short_score', ra.short_score, 'rank_score', ra.rank_score,
    'understanding_review', ra.understanding_review, 'next_stage', ra.next_stage, 'hq_comments', ra.hq_comments,
    'previous', ra.previous, 'version', ra.version, 'submitted_at', ra.submitted_at, 'return_note', ra.return_note, 'outcome', ra.outcome, 'disclosed', ra.disclosed,
    'candidate', jsonb_build_object('name', p.first_name || ' ' || p.last_name, 'email', p.email, 'network', a.network,
      'position', coalesce(public.role_title(a.position_code, a.network), a.position_code), 'country', a.geo_country, 'state', a.geo_state, 'lga', a.geo_lga, 'cluster', a.geo_cluster),
    'day_answers', (select coalesce(jsonb_agg(jsonb_build_object('day', s.day, 'title', d.title, 'answers', s.answers, 'acks', s.acks) order by s.day), '[]'::jsonb)
                    from candidate_activation_steps s join activation_route_days d on d.route = a.route and d.day = s.day where s.activation_id = a.id),
    'statement_texts', (select coalesce(jsonb_agg(jsonb_build_object('seq', st.seq, 'section', st.section, 'statement', st.statement) order by st.seq), '[]'::jsonb) from readiness_statements st where st.network = a.network),
    'question_texts', (select coalesce(jsonb_agg(jsonb_build_object('seq', q.seq, 'question', q.question) order by q.seq), '[]'::jsonb) from readiness_short_questions q where q.network = a.network))
  else null end
  from readiness_assessments ra join candidate_activations a on a.id = ra.activation_id join profiles p on p.id = a.profile_id
  where ra.id = p_assessment;
$$;
revoke execute on function public.hq_readiness_detail(uuid) from anon;

insert into public.schema_migrations (version, name) values (150, 'revised_readiness_assessment_ranking') on conflict (version) do nothing;
