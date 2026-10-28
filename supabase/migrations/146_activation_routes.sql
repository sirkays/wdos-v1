-- ============================================================================
-- WDOS Migration 146 — 3-Day Referral Activation and 7-Day Open-Call Activation
-- (Phase 192), built to the "WDOS 3-Day & 7-Day Activation Programme Content
-- Pack FINAL". Route A = open7 (screened applicants). Route B = ref3 (referred
-- candidates). Same essential standards, same 13-question Leadership
-- Understanding & Readiness Assessment. Activation ≠ selection ≠ appointment.
--
--   activation_route_days   the approved day content, per route (seeded)
--   readiness_questions     the 13 assessment questions + reviewer guidance
--   activation_messages     the approved candidate prompts
--   activation_settings     HQ-configurable thresholds (never hard-coded)
--   candidate_activations   one per person per route: status, deadline,
--                           extension, referral, role, seat, pack version
--   candidate_activation_steps  each day: status, answers, acks, timestamps
--   readiness_assessments   answer set, submission, return trail, scores
--   referral_links gains route + expiry so a link opens the signup directly
-- ============================================================================

create table if not exists public.activation_route_days (
  route text not null check (route in ('open7','ref3')),
  day int not null,
  title text not null, purpose text not null default '', instruction text not null default '',
  content jsonb not null default '[]'::jsonb,       -- [{doc, sections[], pack}]
  notice text not null default '',
  acks jsonb not null default '[]'::jsonb,          -- ["I confirm ..."]
  questions jsonb not null default '[]'::jsonb,     -- [{key,label}]
  needs_profile boolean not null default false,
  has_assessment boolean not null default false,
  version int not null default 1,
  primary key (route, day)
);
create table if not exists public.readiness_questions (
  seq int primary key, question text not null, reviewer_looks_for text not null default '',
  critical boolean not null default false, version int not null default 1
);
create table if not exists public.activation_messages (
  trigger text primary key, title text not null, body text not null
);
create table if not exists public.activation_settings (
  id int primary key default 1 check (id = 1),
  pass_threshold int not null default 18,          -- out of 26 (13 x 2)
  critical_min int not null default 1,             -- each critical question must score at least this
  open7_days int not null default 7, ref3_days int not null default 3,
  reminder_hours int not null default 24,
  updated_by uuid, updated_at timestamptz not null default now()
);
insert into public.activation_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.candidate_activations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  route text not null check (route in ('open7','ref3')),
  network text not null,
  role text, org_unit_id uuid references public.org_units(id),
  referral_code text, referrer_id uuid references public.profiles(id),
  application_id uuid,
  status text not null default 'not_started' check (status in ('not_started','in_progress','incomplete','completed','closed')),
  current_day int not null default 1,
  started_at timestamptz, deadline timestamptz, completed_at timestamptz, closed_at timestamptz,
  extension_status text check (extension_status in ('requested','approved','declined')),
  extension_reason text, extension_by uuid, extension_at timestamptz, extension_until timestamptz,
  pack_version text,
  assisted_by uuid, assisted_note text,
  created_at timestamptz not null default now(),
  unique (profile_id, route)
);
create table if not exists public.candidate_activation_steps (
  activation_id uuid not null references public.candidate_activations(id) on delete cascade,
  day int not null,
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed','returned')),
  answers jsonb not null default '{}'::jsonb,
  acks jsonb not null default '[]'::jsonb,
  content_version int, reached_end boolean not null default false, seconds_spent int not null default 0,
  started_at timestamptz, completed_at timestamptz,
  primary key (activation_id, day)
);
create table if not exists public.readiness_assessments (
  id uuid primary key default gen_random_uuid(),
  activation_id uuid not null references public.candidate_activations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,       -- {"1": "...", ...}
  status text not null default 'pending' check (status in ('pending','submitted','returned','completed')),
  submitted_at timestamptz, version int not null default 1,
  previous jsonb not null default '[]'::jsonb,      -- earlier answer sets, never deleted
  scores jsonb not null default '{}'::jsonb,        -- {"1": 2, ...}
  total int, critical_ok boolean,
  reviewer_id uuid, reviewer_comments jsonb not null default '{}'::jsonb, return_note text,
  outcome text check (outcome in ('further_review','selected','reserve','alternative_role','not_selected')),
  disclosed text,                                   -- what the candidate is told
  reviewed_at timestamptz,
  unique (activation_id)
);

alter table public.referral_links add column if not exists route text not null default 'member';
alter table public.referral_links add column if not exists expires_at timestamptz;
alter table public.referral_links add column if not exists note text;

alter table public.activation_route_days enable row level security;
alter table public.readiness_questions enable row level security;
alter table public.activation_messages enable row level security;
alter table public.activation_settings enable row level security;
alter table public.candidate_activations enable row level security;
alter table public.candidate_activation_steps enable row level security;
alter table public.readiness_assessments enable row level security;
do $$ begin
  create policy ard_read on public.activation_route_days for select to authenticated using (true);
  create policy rq_read on public.readiness_questions for select to authenticated using (true);
  create policy am_read on public.activation_messages for select to authenticated using (true);
  create policy as_read on public.activation_settings for select to authenticated using (true);
  create policy ca_own on public.candidate_activations for select to authenticated using (profile_id = auth.uid() or public.is_case_hq());
  create policy cas_own on public.candidate_activation_steps for select to authenticated
    using (exists (select 1 from public.candidate_activations a where a.id = activation_id and (a.profile_id = auth.uid() or public.is_case_hq())));
  create policy ra_own on public.readiness_assessments for select to authenticated using (profile_id = auth.uid() or public.is_case_hq());
exception when duplicate_object then null; end $$;
insert into public.activation_route_days (route, day, title, purpose, instruction, content, notice, acks, questions, needs_profile, has_assessment) values ('open7', 1, 'Welcome, Profile & Activation Readiness', 'Confirm the candidate''s identity/profile, volunteer data and the exact opportunity being considered before substantive learning begins.', 'Welcome. Please confirm that the information below is correct and complete any missing required fields. Your information will be used throughout this activation, so you should not need to enter it again.', '[]'::jsonb, 'This is a volunteer leadership consideration process and not an employment offer or appointment.', '["I confirm that the profile and volunteer information shown is accurate to the best of my knowledge.", "I understand that beginning activation does not mean I have been selected or appointed."]'::jsonb, '[{"key": "motivation", "label": "Service motivation: why do you want to serve?"}, {"key": "experience", "label": "Relevant experience and strengths."}, {"key": "availability", "label": "Your availability (days and hours you can give each week)."}, {"key": "digital", "label": "Digital readiness: which devices and connections you can use."}]'::jsonb, true, false) on conflict (route, day) do update set title = excluded.title, purpose = excluded.purpose, instruction = excluded.instruction, content = excluded.content, notice = excluded.notice, acks = excluded.acks, questions = excluded.questions, needs_profile = excluded.needs_profile, has_assessment = excluded.has_assessment;
insert into public.activation_route_days (route, day, title, purpose, instruction, content, notice, acks, questions, needs_profile, has_assessment) values ('open7', 2, 'Understanding WODDI', 'Give the candidate a clear understanding of WODDI, the ecosystem and the service orientation behind volunteer leadership.', 'Review the approved WODDI overview. Focus on who WODDI is, what it seeks to nurture and strengthen, how WGMN and WNNN sit within the WODDI ecosystem, and what responsible volunteer leadership means.', '[{"doc": "/content/leadership-manual.html", "sections": ["1. Welcome", "2. About WODDI", "3. The WODDI Programme Family"]}]'::jsonb, 'Leadership is responsibility and service, not status or personal entitlement.', '[]'::jsonb, '[{"key": "nurture", "label": "In your own words, what does WODDI seek to nurture or strengthen through its work?"}]'::jsonb, false, false) on conflict (route, day) do update set title = excluded.title, purpose = excluded.purpose, instruction = excluded.instruction, content = excluded.content, notice = excluded.notice, acks = excluded.acks, questions = excluded.questions, needs_profile = excluded.needs_profile, has_assessment = excluded.has_assessment;
insert into public.activation_route_days (route, day, title, purpose, instruction, content, notice, acks, questions, needs_profile, has_assessment) values ('open7', 3, 'Understanding Your Network', 'Ensure the candidate understands the selected network and how it operates within WODDI.', 'Review the approved profile of your selected network. Pay attention to its purpose, vision/mission or approved foundations, leadership structure, participation model and how it delivers its work.', '[{"doc": "/content/leadership-manual.html", "sections": ["4. The Two Networks You May Lead", "5. How Our Leadership Is Organised"]}]'::jsonb, '', '["I understand my network choice and where it sits within WODDI."]'::jsonb, '[{"key": "network_purpose", "label": "What is the main purpose of the network you have chosen, in your own words?"}]'::jsonb, false, false) on conflict (route, day) do update set title = excluded.title, purpose = excluded.purpose, instruction = excluded.instruction, content = excluded.content, notice = excluded.notice, acks = excluded.acks, questions = excluded.questions, needs_profile = excluded.needs_profile, has_assessment = excluded.has_assessment;
insert into public.activation_route_days (route, day, title, purpose, instruction, content, notice, acks, questions, needs_profile, has_assessment) values ('open7', 4, 'Your Proposed Role & Leadership Pack', 'Make the candidate understand the exact role, reporting line, responsibilities, authority limits and expected outputs before proceeding.', 'Review the Candidate Edition of the Volunteer Leadership Pack for the exact position you are being considered for.', '[{"doc": "/content/leadership-manual.html", "sections": ["6. The Leadership Roles Explained", "7. What Is Expected of a WODDI Leader"], "pack": true}]'::jsonb, 'Access to this pack is for assessment. It does not constitute appointment.', '[]'::jsonb, '[{"key": "role_report", "label": "State the leadership position you are being considered for and who you would report to."}, {"key": "three_resp", "label": "What are the three most important responsibilities of this role?"}]'::jsonb, false, false) on conflict (route, day) do update set title = excluded.title, purpose = excluded.purpose, instruction = excluded.instruction, content = excluded.content, notice = excluded.notice, acks = excluded.acks, questions = excluded.questions, needs_profile = excluded.needs_profile, has_assessment = excluded.has_assessment;
insert into public.activation_route_days (route, day, title, purpose, instruction, content, notice, acks, questions, needs_profile, has_assessment) values ('open7', 5, 'Conduct, Boundaries, Safeguarding & Confidentiality', 'Confirm understanding of the standards that protect WODDI, volunteers, members and communities.', 'Review the approved conduct and boundary requirements. These rules apply to every volunteer leader regardless of level.', '[{"doc": "/content/code-of-conduct.html", "sections": []}, {"doc": "/content/volunteer-agreement.html", "sections": []}]'::jsonb, '', '["I accept and understand the Code of Conduct.", "I understand the safeguarding and complaints reporting route.", "I understand the confidentiality requirements.", "I understand the financial conduct rules: no unauthorised expenditure, fees, levies, collections or financial commitments.", "I understand my role boundaries and will seek guidance or escalate when required."]'::jsonb, '[{"key": "scenario_fees", "label": "What would you do if you were asked to collect an unauthorised contribution or make a commitment outside your role?"}]'::jsonb, false, false) on conflict (route, day) do update set title = excluded.title, purpose = excluded.purpose, instruction = excluded.instruction, content = excluded.content, notice = excluded.notice, acks = excluded.acks, questions = excluded.questions, needs_profile = excluded.needs_profile, has_assessment = excluded.has_assessment;
insert into public.activation_route_days (route, day, title, purpose, instruction, content, notice, acks, questions, needs_profile, has_assessment) values ('open7', 6, 'WDOS, Reporting, Evidence & Practical Service Readiness', 'Check whether the candidate understands the practical discipline of a primarily virtual volunteer role and can translate the role into realistic action.', 'Review how WDOS will support your leadership work and then complete the short practical readiness exercise.', '[{"doc": "/content/leadership-manual.html", "sections": ["7. What Is Expected of a WODDI Leader", "8. The Fourteen-Day Activation Ahead"]}]'::jsonb, '', '["I am willing to use WDOS consistently for approved leadership work, reporting, evidence and follow-through."]'::jsonb, '[{"key": "organise", "label": "How would you organise your time and relationships to serve effectively in this primarily virtual role?"}, {"key": "plan_priority", "label": "Practical work sample (a): one priority you would address in your proposed area."}, {"key": "plan_people", "label": "Practical work sample (b): who you would need to work with."}, {"key": "plan_actions", "label": "Practical work sample (c): the first three actions you would take."}, {"key": "plan_evidence", "label": "Practical work sample (d): how you would report progress and evidence through WDOS."}]'::jsonb, false, false) on conflict (route, day) do update set title = excluded.title, purpose = excluded.purpose, instruction = excluded.instruction, content = excluded.content, notice = excluded.notice, acks = excluded.acks, questions = excluded.questions, needs_profile = excluded.needs_profile, has_assessment = excluded.has_assessment;
insert into public.activation_route_days (route, day, title, purpose, instruction, content, notice, acks, questions, needs_profile, has_assessment) values ('open7', 7, 'Final Reflection & Leadership Understanding / Readiness Assessment', 'Close activation, obtain the final pack acknowledgement and move the candidate into the standard readiness assessment without re-entering data.', 'Review your activation summary. Confirm the Volunteer Pack acknowledgement and complete the Leadership Understanding & Readiness Assessment.', '[]'::jsonb, 'Access to this pack is for assessment. It does not constitute appointment.', '["I confirm that I have reviewed the WODDI Volunteer Pack and understand the volunteer nature of the role, my responsibilities and boundaries, WDOS requirements, reporting expectations and the conduct standards."]'::jsonb, '[]'::jsonb, false, true) on conflict (route, day) do update set title = excluded.title, purpose = excluded.purpose, instruction = excluded.instruction, content = excluded.content, notice = excluded.notice, acks = excluded.acks, questions = excluded.questions, needs_profile = excluded.needs_profile, has_assessment = excluded.has_assessment;
insert into public.activation_route_days (route, day, title, purpose, instruction, content, notice, acks, questions, needs_profile, has_assessment) values ('ref3', 1, 'WODDI, Your Network & the Role Being Considered', 'Give the referred candidate the essential WODDI/network/role understanding and confirm the exact seat/role under consideration.', 'Review who WODDI is, your proposed network, the approved leadership structure and the exact role for which you have been referred.', '[{"doc": "/content/leadership-manual.html", "sections": ["1. Welcome", "2. About WODDI", "4. The Two Networks You May Lead", "5. How Our Leadership Is Organised", "6. The Leadership Roles Explained"]}]'::jsonb, 'This is a volunteer leadership consideration process. Referral and activation do not constitute appointment.', '["I confirm that the profile and volunteer information shown is accurate to the best of my knowledge."]'::jsonb, '[{"key": "attract", "label": "What attracts you to serving in this role?"}, {"key": "role_report", "label": "State the proposed role and who you would report to."}]'::jsonb, true, false) on conflict (route, day) do update set title = excluded.title, purpose = excluded.purpose, instruction = excluded.instruction, content = excluded.content, notice = excluded.notice, acks = excluded.acks, questions = excluded.questions, needs_profile = excluded.needs_profile, has_assessment = excluded.has_assessment;
insert into public.activation_route_days (route, day, title, purpose, instruction, content, notice, acks, questions, needs_profile, has_assessment) values ('ref3', 2, 'Leadership Review Pack, Standards & Boundaries', 'Ensure the candidate understands the same critical conduct, authority and operating rules required of open-call candidates.', 'Review the Candidate Edition of the Leadership/Volunteer Pack for the exact position, including the mandatory conduct and operational standards.', '[{"doc": "/content/leadership-manual.html", "sections": ["6. The Leadership Roles Explained", "7. What Is Expected of a WODDI Leader"], "pack": true}, {"doc": "/content/code-of-conduct.html", "sections": []}, {"doc": "/content/volunteer-agreement.html", "sections": []}]'::jsonb, 'Access to this pack is for assessment. It does not constitute appointment.', '["I acknowledge the Volunteer Leadership Pack, Candidate Edition, for the position being considered.", "I accept and understand the Code of Conduct.", "I understand the safeguarding and complaints reporting route.", "I understand the confidentiality requirements.", "I understand the financial conduct rules: no unauthorised fees, levies or commitments.", "I understand my authority boundaries."]'::jsonb, '[{"key": "scenario_authority", "label": "How would you respond to a request that is outside your authority?"}]'::jsonb, false, false) on conflict (route, day) do update set title = excluded.title, purpose = excluded.purpose, instruction = excluded.instruction, content = excluded.content, notice = excluded.notice, acks = excluded.acks, questions = excluded.questions, needs_profile = excluded.needs_profile, has_assessment = excluded.has_assessment;
insert into public.activation_route_days (route, day, title, purpose, instruction, content, notice, acks, questions, needs_profile, has_assessment) values ('ref3', 3, 'Service Readiness & Assessment', 'Confirm practical readiness and complete the same standard Leadership Understanding & Readiness Assessment used after the 7-Day route.', 'Review the practical expectations of a primarily virtual volunteer role, confirm your readiness, and complete the assessment.', '[{"doc": "/content/leadership-manual.html", "sections": ["7. What Is Expected of a WODDI Leader"]}]'::jsonb, 'Access to this pack is for assessment. It does not constitute appointment.', '["I confirm reasonable availability and my willingness to use WDOS for approved work.", "I understand tasks, reporting and evidence, meetings, communication and escalation."]'::jsonb, '[{"key": "organise", "label": "How will you organise your time and relationships to serve responsibly in this primarily virtual role?"}]'::jsonb, false, true) on conflict (route, day) do update set title = excluded.title, purpose = excluded.purpose, instruction = excluded.instruction, content = excluded.content, notice = excluded.notice, acks = excluded.acks, questions = excluded.questions, needs_profile = excluded.needs_profile, has_assessment = excluded.has_assessment;
insert into public.readiness_questions (seq, question, reviewer_looks_for, critical) values (1, 'What is WODDI and what does "The Nurturer" mean to you in the context of service?', 'Basic understanding of mission/service orientation.', false) on conflict (seq) do update set question = excluded.question, reviewer_looks_for = excluded.reviewer_looks_for, critical = excluded.critical;
insert into public.readiness_questions (seq, question, reviewer_looks_for, critical) values (2, 'Which WODDI network have you chosen, and why does it align with you?', 'Clear personal choice and network understanding.', false) on conflict (seq) do update set question = excluded.question, reviewer_looks_for = excluded.reviewer_looks_for, critical = excluded.critical;
insert into public.readiness_questions (seq, question, reviewer_looks_for, critical) values (3, 'State your proposed leadership role and who you report to.', 'Role/structure understanding.', true) on conflict (seq) do update set question = excluded.question, reviewer_looks_for = excluded.reviewer_looks_for, critical = excluded.critical;
insert into public.readiness_questions (seq, question, reviewer_looks_for, critical) values (4, 'Name three responsibilities of your proposed role.', 'Role understanding.', false) on conflict (seq) do update set question = excluded.question, reviewer_looks_for = excluded.reviewer_looks_for, critical = excluded.critical;
insert into public.readiness_questions (seq, question, reviewer_looks_for, critical) values (5, 'Name two things you are not authorised to do without approval.', 'Boundary awareness.', true) on conflict (seq) do update set question = excluded.question, reviewer_looks_for = excluded.reviewer_looks_for, critical = excluded.critical;
insert into public.readiness_questions (seq, question, reviewer_looks_for, critical) values (6, 'What should you do if a task or decision is outside your authority?', 'Escalate/seek guidance; no unauthorised action.', true) on conflict (seq) do update set question = excluded.question, reviewer_looks_for = excluded.reviewer_looks_for, critical = excluded.critical;
insert into public.readiness_questions (seq, question, reviewer_looks_for, critical) values (7, 'Can a volunteer leader impose fees, levies or contributions? Explain.', 'Correct financial-conduct understanding.', true) on conflict (seq) do update set question = excluded.question, reviewer_looks_for = excluded.reviewer_looks_for, critical = excluded.critical;
insert into public.readiness_questions (seq, question, reviewer_looks_for, critical) values (8, 'How will you use WDOS in your role?', 'Tasks, follow-up, reporting/evidence and approved communication.', true) on conflict (seq) do update set question = excluded.question, reviewer_looks_for = excluded.reviewer_looks_for, critical = excluded.critical;
insert into public.readiness_questions (seq, question, reviewer_looks_for, critical) values (9, 'What would you do if you became aware of a safeguarding concern?', 'Use approved reporting/escalation route and protect confidentiality.', true) on conflict (seq) do update set question = excluded.question, reviewer_looks_for = excluded.reviewer_looks_for, critical = excluded.critical;
insert into public.readiness_questions (seq, question, reviewer_looks_for, critical) values (10, 'If a report is returned for correction, what should you do?', 'Review comments, correct and resubmit by the deadline.', false) on conflict (seq) do update set question = excluded.question, reviewer_looks_for = excluded.reviewer_looks_for, critical = excluded.critical;
insert into public.readiness_questions (seq, question, reviewer_looks_for, critical) values (11, 'How will you work with your Deputy/Assistant or Principal while respecting authority boundaries?', 'Collaboration without creating parallel authority.', false) on conflict (seq) do update set question = excluded.question, reviewer_looks_for = excluded.reviewer_looks_for, critical = excluded.critical;
insert into public.readiness_questions (seq, question, reviewer_looks_for, critical) values (12, 'Give one practical example of how you would strengthen participation or follow-through in your geography/community.', 'Practical service readiness.', false) on conflict (seq) do update set question = excluded.question, reviewer_looks_for = excluded.reviewer_looks_for, critical = excluded.critical;
insert into public.readiness_questions (seq, question, reviewer_looks_for, critical) values (13, 'Confirm: I have reviewed the Volunteer Pack and understand this is a volunteer role.', 'Explicit acknowledgement.', true) on conflict (seq) do update set question = excluded.question, reviewer_looks_for = excluded.reviewer_looks_for, critical = excluded.critical;
insert into public.activation_messages (trigger, title, body) values ('day_ready', 'Your Day [#] Activation Step Is Ready', 'Hello [First Name], today''s WODDI activation step is ready. It is designed to help you understand the role and prepare for responsible service.') on conflict (trigger) do update set title = excluded.title, body = excluded.body;
insert into public.activation_messages (trigger, title, body) values ('incomplete', 'Your Activation Is Still In Progress', 'You have not yet completed all required activation steps. Please return to WDOS to continue from where you stopped.') on conflict (trigger) do update set title = excluded.title, body = excluded.body;
insert into public.activation_messages (trigger, title, body) values ('ext_received', 'Extension Request Received', 'We have received your request for additional time to complete activation. You will be notified once it has been reviewed.') on conflict (trigger) do update set title = excluded.title, body = excluded.body;
insert into public.activation_messages (trigger, title, body) values ('ext_approved', 'Extension Approved', 'Your activation deadline has been extended to [New Date]. Please complete all remaining steps by this date.') on conflict (trigger) do update set title = excluded.title, body = excluded.body;
insert into public.activation_messages (trigger, title, body) values ('ext_declined', 'Extension Not Approved', 'We are unable to extend this activation period. Please follow the guidance shown in WDOS for your next available step.') on conflict (trigger) do update set title = excluded.title, body = excluded.body;
insert into public.activation_messages (trigger, title, body) values ('complete', 'Activation Complete', 'Thank you, [First Name]. You have completed the required activation steps. Your next step is the Leadership Understanding & Readiness Assessment.') on conflict (trigger) do update set title = excluded.title, body = excluded.body;
insert into public.activation_messages (trigger, title, body) values ('submitted', 'Assessment Submitted', 'Thank you, [First Name]. Your Leadership Understanding & Readiness Assessment has been received and is now under review. We will update you through WDOS when the review is complete.') on conflict (trigger) do update set title = excluded.title, body = excluded.body;
insert into public.activation_messages (trigger, title, body) values ('returned', 'A Little More Information Is Needed', 'Thank you for completing your assessment. We need you to review one or more responses before your readiness review can be completed. Please read the reviewer comments, make the requested correction and resubmit.') on conflict (trigger) do update set title = excluded.title, body = excluded.body;

-- ---------------------------------------------------------------------------
-- The link. HQ or a leader creates a 3-Day referral link for a named seat.
-- referral_link_ensure already exists for member links; this creates the
-- referral-activation variant with route = 'ref3'.
-- ---------------------------------------------------------------------------
create or replace function public.referral_activation_link(p_network text, p_unit uuid, p_role text,
  p_label text default null, p_note text default null, p_expires timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l referral_links%rowtype; me uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not (public.is_case_hq() or exists (select 1 from role_assignments ra where ra.profile_id = me and ra.ends_at is null)) then
    raise exception 'Only serving leaders and HQ can create referral links';
  end if;
  insert into referral_links (owner_id, created_by, network, org_unit_id, role, label, note, route, expires_at, campaign)
  values (case when public.is_case_hq() then null else me end, me, p_network::network_code, p_unit, p_role::role_code,
          p_label, p_note, 'ref3', p_expires, '3-Day Referral Activation')
  returning * into l;
  return jsonb_build_object('id', l.id, 'code', l.code, 'route', l.route, 'network', l.network, 'role', l.role,
    'unit', (select name from org_units where id = l.org_unit_id), 'expires_at', l.expires_at);
end; $$;
revoke execute on function public.referral_activation_link(text, uuid, text, text, text, timestamptz) from anon;

-- What a link points at (public, for the signup page).
create or replace function public.referral_link_info(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('code', l.code, 'route', l.route, 'network', l.network, 'role', l.role,
    'role_title', public.role_title(l.role::text, l.network::text),
    'unit_id', l.org_unit_id, 'unit', ou.name, 'unit_level', ou.level,
    'country', (select c.name from org_units c where c.id = (case when ou.level = 'country' then ou.id else ou.parent_id end) and c.level = 'country'),
    'owner', coalesce((select p.first_name || ' ' || p.last_name from profiles p where p.id = l.owner_id), 'WODDI Headquarters'),
    'active', l.active and (l.expires_at is null or l.expires_at > now()), 'label', l.label)
  from referral_links l left join org_units ou on ou.id = l.org_unit_id
  where l.code = p_code;
$$;
grant execute on function public.referral_link_info(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Begin: called right after the referred person signs up through the link.
-- One person, one profile: the signed-in profile is the candidate.
-- ---------------------------------------------------------------------------
create or replace function public.begin_referral_activation(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); l referral_links%rowtype; a candidate_activations%rowtype; s activation_settings%rowtype;
        p profiles%rowtype; app_id uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select * into l from referral_links where code = p_code and route = 'ref3' and active and (expires_at is null or expires_at > now());
  if not found then raise exception 'This referral link is not valid'; end if;
  select * into s from activation_settings where id = 1;
  select * into p from profiles where id = me;

  update profiles set network = l.network, org_unit_id = coalesce(org_unit_id, l.org_unit_id),
         referral_code = coalesce(referral_code, l.code),
         role_applied = coalesce(role_applied, public.role_title(l.role::text, l.network::text))
   where id = me;

  -- an application row keeps the HQ pipeline whole (screening, decision, audit)
  select id into app_id from applications where lower(email) = lower(p.email) and status not in ('rejected','withdrawn') limit 1;   -- application_status enum
  if app_id is null then
    insert into applications (first_name, last_name, email, phone, network, org_unit_id, motivation, preferred_locale, referral_code, status, profile_id)
    values (p.first_name, p.last_name, p.email, p.phone, l.network, l.org_unit_id, 'Referred candidate: 3-Day Referral Activation in progress.', coalesce(p.preferred_locale,'en'), l.code, 'under_review'::application_status, me)
    returning id into app_id;
  end if;

  insert into candidate_activations (profile_id, route, network, role, org_unit_id, referral_code, referrer_id, application_id,
                                     status, started_at, deadline, pack_version)
  values (me, 'ref3', l.network::text, l.role::text, l.org_unit_id, l.code, l.owner_id, app_id,
          'in_progress', now(), now() + make_interval(days => s.ref3_days), 'CE-1.0')
  on conflict (profile_id, route) do update set status = case when candidate_activations.status = 'not_started' then 'in_progress' else candidate_activations.status end
  returning * into a;
  insert into candidate_activation_steps (activation_id, day, status, started_at)
  values (a.id, 1, 'in_progress', now()) on conflict do nothing;
  return public.my_activation();
end; $$;
revoke execute on function public.begin_referral_activation(text) from anon;

-- HQ opens the 7-day route for a screened applicant.
create or replace function public.open_activation_for(p_profile uuid, p_role text, p_unit uuid, p_network text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s activation_settings%rowtype; a candidate_activations%rowtype;
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  select * into s from activation_settings where id = 1;
  insert into candidate_activations (profile_id, route, network, role, org_unit_id, status, started_at, deadline, pack_version)
  values (p_profile, 'open7', p_network, p_role, p_unit, 'in_progress', now(), now() + make_interval(days => s.open7_days), 'CE-1.0')
  on conflict (profile_id, route) do nothing returning * into a;
  if a.id is not null then
    insert into candidate_activation_steps (activation_id, day, status, started_at) values (a.id, 1, 'in_progress', now()) on conflict do nothing;
  end if;
  return jsonb_build_object('ok', true);
end; $$;
revoke execute on function public.open_activation_for(uuid, text, uuid, text) from anon;

-- ---------------------------------------------------------------------------
-- The candidate's own view: route, days, progress, what remains, deadline.
-- ---------------------------------------------------------------------------
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
    'id', a.id, 'route', a.route, 'route_label', case when a.route = 'ref3' then '3-Day Referral Activation' else '7-Day Activation' end,
    'network', a.network, 'role', a.role, 'role_title', coalesce(public.role_title(a.role, a.network), a.role),
    'unit', (select name from org_units where id = a.org_unit_id),
    'status', a.status, 'current_day', a.current_day, 'started_at', a.started_at,
    'deadline', coalesce(a.extension_until, a.deadline), 'extension_status', a.extension_status,
    'completed_at', a.completed_at, 'pack_version', a.pack_version,
    'referrer', (select first_name || ' ' || last_name from profiles where id = a.referrer_id),
    'first_name', p.first_name, 'email', p.email, 'phone', p.phone, 'country', p.country, 'state_region', p.state_region,
    'days', (select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day, 'title', d.title, 'purpose', d.purpose, 'instruction', d.instruction, 'content', d.content,
        'notice', d.notice, 'acks', d.acks, 'questions', d.questions, 'needs_profile', d.needs_profile,
        'has_assessment', d.has_assessment, 'version', d.version,
        'status', coalesce(st.status, 'not_started'), 'answers', coalesce(st.answers, '{}'::jsonb),
        'acked', coalesce(st.acks, '[]'::jsonb), 'completed_at', st.completed_at) order by d.day), '[]'::jsonb)
       from activation_route_days d left join candidate_activation_steps st on st.activation_id = a.id and st.day = d.day
      where d.route = a.route),
    'assessment', case when ra.id is null then null else jsonb_build_object('status', ra.status, 'answers', ra.answers,
        'submitted_at', ra.submitted_at, 'return_note', ra.return_note, 'disclosed', ra.disclosed, 'version', ra.version) end,
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('seq', seq, 'question', question) order by seq), '[]'::jsonb) from readiness_questions),
    'notice', 'Access to this pack is for assessment. It does not constitute appointment.');
end; $$;
revoke execute on function public.my_activation() from anon;

-- Save a day (auto-save) or complete it. Completion is refused while anything required is missing.
create or replace function public.save_activation_day(p_day int, p_answers jsonb, p_acks jsonb, p_reached_end boolean,
  p_seconds int, p_complete boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); a candidate_activations%rowtype; d activation_route_days%rowtype; missing text[] := '{}'; k text; total int;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select * into a from candidate_activations where profile_id = me and status in ('not_started','in_progress','incomplete') order by created_at desc limit 1;
  if not found then raise exception 'No activation in progress'; end if;
  if p_day > a.current_day then raise exception 'Complete the earlier days first'; end if;
  select * into d from activation_route_days where route = a.route and day = p_day;
  if not found then raise exception 'Unknown day'; end if;

  insert into candidate_activation_steps (activation_id, day, status, answers, acks, reached_end, seconds_spent, content_version, started_at)
  values (a.id, p_day, 'in_progress', coalesce(p_answers,'{}'::jsonb), coalesce(p_acks,'[]'::jsonb), coalesce(p_reached_end,false), coalesce(p_seconds,0), d.version, now())
  on conflict (activation_id, day) do update
    set answers = candidate_activation_steps.answers || excluded.answers,
        acks = excluded.acks, reached_end = candidate_activation_steps.reached_end or excluded.reached_end,
        seconds_spent = greatest(candidate_activation_steps.seconds_spent, excluded.seconds_spent),
        status = case when candidate_activation_steps.status = 'completed' then 'completed' else 'in_progress' end;
  if a.status = 'not_started' then update candidate_activations set status = 'in_progress', started_at = coalesce(started_at, now()) where id = a.id; end if;

  if p_complete then
    for k in select jsonb_array_elements(d.questions)->>'key' loop
      if coalesce(trim(p_answers->>k), '') = '' then missing := missing || k; end if;
    end loop;
    if jsonb_array_length(d.acks) > 0 and jsonb_array_length(coalesce(p_acks,'[]'::jsonb)) < jsonb_array_length(d.acks) then missing := missing || 'acknowledgements'; end if;
    if jsonb_array_length(d.content) > 0 and not coalesce(p_reached_end, false) then missing := missing || 'reading'; end if;
    if array_length(missing, 1) > 0 then
      return jsonb_build_object('ok', false, 'missing', to_jsonb(missing));
    end if;
    update candidate_activation_steps set status = 'completed', completed_at = now() where activation_id = a.id and day = p_day;
    select count(*) into total from activation_route_days where route = a.route;
    if p_day >= total then
      update candidate_activations set status = 'completed', completed_at = now(), current_day = total where id = a.id;
      insert into readiness_assessments (activation_id, profile_id) values (a.id, me) on conflict (activation_id) do nothing;
    else
      update candidate_activations set current_day = greatest(current_day, p_day + 1) where id = a.id;
      insert into candidate_activation_steps (activation_id, day, status, started_at) values (a.id, p_day + 1, 'in_progress', now()) on conflict do nothing;
    end if;
  end if;
  return jsonb_build_object('ok', true);
end; $$;
revoke execute on function public.save_activation_day(int, jsonb, jsonb, boolean, int, boolean) from anon;

-- Submit (or resubmit) the assessment. The previous answer set is kept.
create or replace function public.submit_readiness(p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); a candidate_activations%rowtype; ra readiness_assessments%rowtype; n int;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select * into a from candidate_activations where profile_id = me and status = 'completed' order by created_at desc limit 1;
  if not found then raise exception 'Complete all activation days first'; end if;
  select * into ra from readiness_assessments where activation_id = a.id;
  if ra.status = 'submitted' then raise exception 'Already submitted and under review'; end if;
  if ra.status = 'completed' then raise exception 'This assessment has already been reviewed'; end if;
  select count(*) into n from readiness_questions q where coalesce(trim(p_answers->>(q.seq::text)), '') = '';
  if n > 0 then return jsonb_build_object('ok', false, 'missing', n); end if;
  update readiness_assessments
     set previous = case when ra.submitted_at is not null then previous || jsonb_build_array(jsonb_build_object('answers', ra.answers, 'submitted_at', ra.submitted_at, 'version', ra.version)) else previous end,
         answers = p_answers, status = 'submitted', submitted_at = now(), version = case when ra.submitted_at is not null then ra.version + 1 else ra.version end,
         return_note = null
   where id = ra.id;
  return jsonb_build_object('ok', true);
end; $$;
revoke execute on function public.submit_readiness(jsonb) from anon;

-- Extension: candidate asks, HQ or the referring leader decides.
create or replace function public.request_activation_extension(p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update candidate_activations set extension_status = 'requested', extension_reason = p_reason, extension_at = now()
   where profile_id = auth.uid() and status in ('in_progress','incomplete');
end; $$;
create or replace function public.decide_activation_extension(p_activation uuid, p_approve boolean, p_until timestamptz, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  update candidate_activations
     set extension_status = case when p_approve then 'approved' else 'declined' end,
         extension_until = case when p_approve then p_until else extension_until end,
         extension_by = auth.uid(), extension_at = now(), extension_reason = coalesce(p_reason, extension_reason),
         status = case when p_approve and status = 'incomplete' then 'in_progress' else status end
   where id = p_activation;
end; $$;
revoke execute on function public.request_activation_extension(text) from anon;
revoke execute on function public.decide_activation_extension(uuid, boolean, timestamptz, text) from anon;

-- Reviewer: score, return for correction, or complete with a disclosed outcome.
create or replace function public.review_readiness(p_assessment uuid, p_scores jsonb, p_comments jsonb, p_action text,
  p_return_note text default null, p_outcome text default null, p_disclosed text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s activation_settings%rowtype; tot int; crit_ok boolean;
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  select * into s from activation_settings where id = 1;
  select coalesce(sum((p_scores->>(q.seq::text))::int), 0),
         bool_and(case when q.critical then coalesce((p_scores->>(q.seq::text))::int, 0) >= s.critical_min else true end)
    into tot, crit_ok from readiness_questions q;
  update readiness_assessments
     set scores = coalesce(p_scores, '{}'::jsonb), reviewer_comments = coalesce(p_comments, '{}'::jsonb),
         total = tot, critical_ok = crit_ok, reviewer_id = auth.uid(), reviewed_at = now(),
         status = case when p_action = 'return' then 'returned' when p_action = 'complete' then 'completed' else status end,
         return_note = case when p_action = 'return' then p_return_note else return_note end,
         outcome = case when p_action = 'complete' then p_outcome else outcome end,
         disclosed = case when p_action = 'complete' then p_disclosed else disclosed end
   where id = p_assessment;
  return jsonb_build_object('total', tot, 'critical_ok', crit_ok, 'threshold', s.pass_threshold);
end; $$;
revoke execute on function public.review_readiness(uuid, jsonb, jsonb, text, text, text, text) from anon;

-- Overdue sweep (call from the daily job): past deadline and not completed -> incomplete.
create or replace function public.activation_sweep()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update candidate_activations set status = 'incomplete'
   where status = 'in_progress' and coalesce(extension_until, deadline) < now();
  get diagnostics n = row_count; return n;
end; $$;

-- ---------------------------------------------------------------------------
-- HQ analytics: the whole funnel, per route, with breakdowns and the list.
-- ---------------------------------------------------------------------------
create or replace function public.hq_activation_analytics(p_days int default 90)
returns jsonb language plpgsql security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => p_days); out jsonb;
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  perform public.activation_sweep();
  select jsonb_build_object(
    'window_days', p_days,
    'links', jsonb_build_object(
       'ref3_links', (select count(*) from referral_links where route = 'ref3'),
       'ref3_active', (select count(*) from referral_links where route = 'ref3' and active and (expires_at is null or expires_at > now())),
       'ref3_visits', (select count(*) from referral_visits v join referral_links l on l.id = v.link_id where l.route = 'ref3' and v.visited_at >= since),
       'ref3_registrations', (select count(*) from candidate_activations where route = 'ref3' and created_at >= since)),
    'by_route', (select coalesce(jsonb_agg(x order by x->>'route'), '[]'::jsonb) from (
       select jsonb_build_object('route', r.route,
         'started', count(a.id) filter (where a.created_at >= since),
         'in_progress', count(a.id) filter (where a.status = 'in_progress'),
         'incomplete', count(a.id) filter (where a.status = 'incomplete'),
         'completed', count(a.id) filter (where a.status = 'completed'),
         'closed', count(a.id) filter (where a.status = 'closed'),
         'extension_requested', count(a.id) filter (where a.extension_status = 'requested'),
         'assess_pending', count(ra.id) filter (where ra.status = 'pending'),
         'assess_submitted', count(ra.id) filter (where ra.status = 'submitted'),
         'assess_returned', count(ra.id) filter (where ra.status = 'returned'),
         'assess_completed', count(ra.id) filter (where ra.status = 'completed'),
         'selected', count(ra.id) filter (where ra.outcome = 'selected'),
         'reserve', count(ra.id) filter (where ra.outcome = 'reserve'),
         'further_review', count(ra.id) filter (where ra.outcome = 'further_review'),
         'not_selected', count(ra.id) filter (where ra.outcome = 'not_selected'),
         'avg_days_to_complete', round(avg(extract(epoch from (a.completed_at - a.started_at)) / 86400.0)::numeric, 1),
         'avg_score', round(avg(ra.total)::numeric, 1)) as x
       from (values ('open7'), ('ref3')) r(route)
       left join candidate_activations a on a.route = r.route
       left join readiness_assessments ra on ra.activation_id = a.id
       group by r.route) s),
    'by_day', (select coalesce(jsonb_agg(x order by x->>'route', (x->>'day')::int), '[]'::jsonb) from (
       select jsonb_build_object('route', d.route, 'day', d.day, 'title', d.title,
         'reached', count(st.activation_id), 'completed', count(st.activation_id) filter (where st.status = 'completed')) as x
       from activation_route_days d left join candidate_activation_steps st on st.day = d.day
         and st.activation_id in (select id from candidate_activations where route = d.route)
       group by d.route, d.day, d.title) s),
    'by_network', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
       select jsonb_build_object('network', a.network, 'route', a.route, 'started', count(*),
         'completed', count(*) filter (where a.status = 'completed'),
         'selected', count(ra.id) filter (where ra.outcome = 'selected')) as x
       from candidate_activations a left join readiness_assessments ra on ra.activation_id = a.id group by a.network, a.route) s),
    'by_country', (select coalesce(jsonb_agg(x order by (x->>'started')::int desc), '[]'::jsonb) from (
       select jsonb_build_object('country', coalesce(p.country, '—'), 'started', count(*),
         'in_progress', count(*) filter (where a.status = 'in_progress'),
         'completed', count(*) filter (where a.status = 'completed'),
         'incomplete', count(*) filter (where a.status = 'incomplete'),
         'selected', count(ra.id) filter (where ra.outcome = 'selected')) as x
       from candidate_activations a join profiles p on p.id = a.profile_id left join readiness_assessments ra on ra.activation_id = a.id
       group by p.country) s),
    'by_referrer', (select coalesce(jsonb_agg(x order by (x->>'referred')::int desc), '[]'::jsonb) from (
       select jsonb_build_object('referrer', p.first_name || ' ' || p.last_name, 'referred', count(*),
         'completed', count(*) filter (where a.status = 'completed'), 'selected', count(ra.id) filter (where ra.outcome = 'selected')) as x
       from candidate_activations a join profiles p on p.id = a.referrer_id left join readiness_assessments ra on ra.activation_id = a.id
       where a.route = 'ref3' group by p.id, p.first_name, p.last_name limit 20) s),
    'candidates', (select coalesce(jsonb_agg(x order by x->>'started_at' desc), '[]'::jsonb) from (
       select jsonb_build_object('activation_id', a.id, 'assessment_id', ra.id, 'name', p.first_name || ' ' || p.last_name, 'email', p.email,
         'network', a.network, 'role_title', coalesce(public.role_title(a.role, a.network), a.role), 'unit', ou.name, 'country', p.country,
         'route', a.route, 'status', a.status, 'day', a.current_day,
         'days_total', (select count(*) from activation_route_days d where d.route = a.route),
         'deadline', coalesce(a.extension_until, a.deadline), 'extension_status', a.extension_status,
         'assessment', ra.status, 'total', ra.total, 'critical_ok', ra.critical_ok, 'outcome', ra.outcome,
         'referrer', (select first_name || ' ' || last_name from profiles where id = a.referrer_id),
         'started_at', a.started_at) as x
       from candidate_activations a join profiles p on p.id = a.profile_id
       left join org_units ou on ou.id = a.org_unit_id left join readiness_assessments ra on ra.activation_id = a.id
       limit 300) s),
    'settings', (select to_jsonb(s) from activation_settings s where id = 1)
  ) into out;
  return out;
end; $$;
revoke execute on function public.hq_activation_analytics(int) from anon;

-- Reviewer detail for one assessment.
create or replace function public.hq_readiness_detail(p_assessment uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.is_case_hq() then jsonb_build_object(
    'id', ra.id, 'status', ra.status, 'answers', ra.answers, 'scores', ra.scores, 'comments', ra.reviewer_comments,
    'total', ra.total, 'critical_ok', ra.critical_ok, 'outcome', ra.outcome, 'disclosed', ra.disclosed,
    'previous', ra.previous, 'submitted_at', ra.submitted_at, 'version', ra.version,
    'candidate', jsonb_build_object('name', p.first_name || ' ' || p.last_name, 'email', p.email, 'network', a.network,
      'role_title', coalesce(public.role_title(a.role, a.network), a.role), 'unit', (select name from org_units where id = a.org_unit_id),
      'route', a.route, 'referrer', (select first_name || ' ' || last_name from profiles where id = a.referrer_id)),
    'day_answers', (select coalesce(jsonb_agg(jsonb_build_object('day', st.day, 'answers', st.answers, 'acks', st.acks, 'completed_at', st.completed_at) order by st.day), '[]'::jsonb)
                    from candidate_activation_steps st where st.activation_id = a.id),
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('seq', seq, 'question', question, 'looks_for', reviewer_looks_for, 'critical', critical) order by seq), '[]'::jsonb) from readiness_questions),
    'settings', (select to_jsonb(s) from activation_settings s where id = 1)) else null end
  from readiness_assessments ra join candidate_activations a on a.id = ra.activation_id join profiles p on p.id = ra.profile_id
  where ra.id = p_assessment;
$$;
revoke execute on function public.hq_readiness_detail(uuid) from anon;

insert into public.schema_migrations (version, name) values (146, 'activation_routes_3day_7day') on conflict (version) do nothing;
