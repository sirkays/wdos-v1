-- ============================================================================
-- WDOS Migration 142 — Monthly Leadership Inspiration + Founder's Welcome
-- (Phase 188), built to:
--   • "WODDI Five-Year Monthly Leadership Inspiration Content Master"
--   • "Founder's Welcome & Appreciation Message Implementation Brief"
-- Both run on the Phase 186 messaging engine, as the Founder asked ("build
-- once, use for years"): same tables, same delivery log, same language rules.
-- ============================================================================

-- Monthly library: 60 months, each with the core message, both network lenses
-- and the reflection prompt. Role lens is appended at delivery from the
-- leader's ACTIVE verified appointment (Master §7).
create table if not exists public.monthly_inspiration (
  content_id   text primary key,                 -- MLI-Y1-M01
  year_number  int not null check (year_number between 1 and 5),
  month_number int not null check (month_number between 1 and 12),
  abs_month    int not null unique check (abs_month between 1 and 60),
  theme_title  text not null,
  core_message text not null,
  wgmn_lens    text not null,
  wnnn_lens    text not null,
  reflection   text not null,
  language     text not null default 'en',
  image_slug   text,
  image_alt    text,
  publish_status text not null default 'approved'
    check (publish_status in ('draft','reviewed','approved','published','archived')),
  version      int not null default 1,
  effective_from date,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- The role lens per network and role (Master §6).
create table if not exists public.monthly_role_lens (
  network text not null check (network in ('WGMN','WNNN')),
  role    text not null,
  lens    text not null,
  language text not null default 'en',
  primary key (network, role, language)
);

-- Founder's Welcome: one controlled record per network + role level + language
-- (Brief §11). Body copy carries {{FirstName}} {{NetworkName}} {{RoleTitle}}
-- {{Country}} {{JurisdictionName}}.
create table if not exists public.founder_welcome (
  content_id text primary key,                   -- FW-WGMN-COUNTRY-EN
  network    text not null check (network in ('WGMN','WNNN')),
  role_level text not null,                      -- country | deputy_country | state | district | cluster | chapter | assistant
  role_title text not null,
  language   text not null default 'en',
  title      text not null default 'A Personal Welcome from Our Founder',
  body       text not null,
  founder_image text not null default '/assets/founder.jpg',
  founder_name  text not null default 'Her Excellency Zinaria Nneoma Nkechi Rochas Okorocha, PhD',
  founder_role  text not null default 'Founder, Women of Divine Destiny Initiative',
  is_active  boolean not null default true,
  version    int not null default 1,
  created_at timestamptz not null default now(),
  unique (network, role_level, language, version)
);

-- First-view state, per person per appointment (Brief §10: tied to the CURRENT
-- appointment, not to the person for ever).
create table if not exists public.founder_welcome_view (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  content_id  text not null,
  role        text not null,
  org_unit_id uuid,
  first_viewed_at timestamptz not null default now(),
  primary key (profile_id, content_id, role, org_unit_id)
);

alter table public.monthly_inspiration  enable row level security;
alter table public.monthly_role_lens    enable row level security;
alter table public.founder_welcome      enable row level security;
alter table public.founder_welcome_view enable row level security;
drop policy if exists mi_read on public.monthly_inspiration;
create policy mi_read on public.monthly_inspiration for select to authenticated using (true);
drop policy if exists mrl_read on public.monthly_role_lens;
create policy mrl_read on public.monthly_role_lens for select to authenticated using (true);
drop policy if exists fw_read on public.founder_welcome;
create policy fw_read on public.founder_welcome for select to authenticated using (true);
drop policy if exists fwv_own on public.founder_welcome_view;
create policy fwv_own on public.founder_welcome_view for select to authenticated
  using (profile_id = auth.uid() or public.is_case_hq());
drop policy if exists mi_manage on public.monthly_inspiration;
create policy mi_manage on public.monthly_inspiration for all to authenticated
  using (public.is_case_hq()) with check (public.is_case_hq());
drop policy if exists fw_manage on public.founder_welcome;
create policy fw_manage on public.founder_welcome for all to authenticated
  using (public.is_case_hq()) with check (public.is_case_hq());

-- The old monthly content is superseded by this library.
delete from public.engagement_content where kind = 'monthly';

insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y1-M01', 1, 1, 1, 'Begin With Purpose', 'A new month gives you a fresh opportunity to examine not only what you are doing, but how you are leading. Leadership becomes stronger when service begins with a clear understanding of why the work matters. Give this principle room to shape the way you carry the responsibilities already entrusted to you. Carry this thought into your decisions and conversations, and allow consistency to turn it into a leadership habit.', 'Within WGMN, purpose becomes visible when women are strengthened, families are supported and leadership helps others live the meaning of the Good Mother in everyday life.', 'Within WNNN, purpose becomes visible when young adults are nurtured into grounded, responsible and capable next-generation leaders.', 'What is one decision you can make this month that reconnects your leadership to purpose?',
  'mli-y1-m01', 'Begin With Purpose — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y1-M02', 1, 2, 2, 'Lead From Identity', 'As you enter this month, bring your attention back to the leadership habit that will matter long after the calendar changes. Titles can change, but sound leadership begins with character, values and a secure sense of responsibility. Rather than treating it as an additional task, use it as a lens for the responsibilities already in your hands. The goal is not perfection; it is visible growth in the way you serve, support and lead.', 'Within WGMN, rooted leadership begins with women who know what they stand for and can model dignity, responsibility and purposeful influence.', 'Within WNNN, rooted leadership helps young people build confidence without losing humility, values or responsibility.', 'What leadership quality do you want people to consistently experience from you, regardless of title?',
  'mli-y1-m02', 'Lead From Identity — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y1-M03', 1, 3, 3, 'The Discipline of Showing Up', 'Some of the strongest leadership work happens quietly, through choices that build confidence, clarity and trust. Trust is built when leaders are present, dependable and consistent even when the work is not visible. Its value will be seen less in what you say about it and more in how it changes your everyday leadership choices. Small improvements, repeated faithfully, can change the quality of an entire leadership environment.', 'Within WGMN, consistency creates confidence across countries, communities and chapters; women should know that their leaders can be relied upon.', 'Within WNNN, consistency gives young leaders a stable example in a world that often rewards speed more than depth.', 'Where does your consistency need to become more visible?',
  'mli-y1-m03', 'The Discipline of Showing Up — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y1-M04', 1, 4, 4, 'Service Before Status', 'This month, allow purpose to shape your pace, your conversations and the way you carry responsibility. Volunteer leadership is most powerful when responsibility is treated as service rather than position or recognition. The aim is not to add pressure, but to bring greater intention to the work and relationships already before you. By the end of the month, aim to see evidence of this principle in both your own leadership and the experience of the people around you.', 'Within WGMN, leadership should make women feel supported rather than managed, and strengthened rather than merely counted.', 'WNNN leadership should help young people experience leadership as contribution, responsibility and service rather than status.', 'Who should experience better support because of your leadership this month?',
  'mli-y1-m04', 'Service Before Status — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y1-M05', 1, 5, 5, 'Values in Action', 'Leadership is not sustained by enthusiasm alone; it grows through deliberate habits practised over time. Values become credible when they shape decisions, conversations, relationships and the way responsibility is handled. Let it guide the quality of your leadership rather than increase the quantity of your activity. Choose one area where this principle can move from intention to practice, and stay with it throughout the month.', 'WGMN becomes credible when values-based leadership is reflected in how women are treated, guided and supported.', 'WNNN becomes credible when its values are visible in how young people lead, collaborate, communicate and treat others.', 'Which value needs to become more visible in your daily leadership choices?',
  'mli-y1-m05', 'Values in Action — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y1-M06', 1, 6, 6, 'The Strength of Integrity', 'Before the month becomes busy, choose the leadership principle you want people to experience from you. Integrity is the quiet alignment between what a leader says, what she does and what others can depend on. Give this principle room to shape the way you carry the responsibilities already entrusted to you. Use the month to become clearer, stronger and more useful to the people and purpose entrusted to you.', 'For WGMN, integrity protects trust among women, families, communities and the wider WODDI ecosystem.', 'For WNNN, integrity teaches emerging leaders that credibility is built long before public recognition arrives.', 'Is there any gap between what you expect from others and what you currently model?',
  'mli-y1-m06', 'The Strength of Integrity — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y1-M07', 1, 7, 7, 'Own Your Leadership Space', 'Every new month is an invitation to strengthen one part of your leadership rather than simply add more activity. Healthy ownership means taking responsibility for what is entrusted to you without overstepping boundaries. Rather than treating it as an additional task, use it as a lens for the responsibilities already in your hands. Let this principle become visible in one concrete leadership choice you repeat throughout the month.', 'In WGMN, own your assigned sphere fully while respecting the authority, boundaries and responsibilities of other leadership levels.', 'In WNNN, own your responsibility with energy and initiative while respecting structure, boundaries and shared leadership.', 'What responsibility needs fuller ownership from you without crossing role boundaries?',
  'mli-y1-m07', 'Own Your Leadership Space — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y1-M08', 1, 8, 8, 'Grow Before You Go', 'The quality of leadership is often revealed in ordinary moments: how we respond, follow through, listen and decide. Strong leaders remain teachable; development is not a sign of weakness but evidence of readiness for greater influence. Its value will be seen less in what you say about it and more in how it changes your everyday leadership choices. May your leadership this month be steady, purposeful and worthy of the trust placed in you.', 'WGMN leaders should keep learning so that the guidance, mentoring and support they offer women becomes increasingly mature and useful.', 'WNNN leaders should remain curious and teachable so that personal development becomes part of the culture young people inherit.', 'What do you need to learn, practise or ask for help with this month?',
  'mli-y1-m08', 'Grow Before You Go — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y1-M09', 1, 9, 9, 'Respect the Structure', 'Your role matters, but the influence you create through that role matters even more. Leadership structures protect clarity, accountability and collaboration when every person understands where responsibility begins and ends. The aim is not to add pressure, but to bring greater intention to the work and relationships already before you. Let your actions make the message credible: leadership is strongest when people can experience what we say we value.', 'WGMN structure should make service clearer and closer to women, not create distance; use it to strengthen coordination and accountability.', 'WNNN’s structure should give emerging leaders clear pathways for contribution, accountability and growth.', 'Where can clearer respect for structure reduce confusion or duplication?',
  'mli-y1-m09', 'Respect the Structure — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y1-M10', 1, 10, 10, 'Lead With Empathy', 'As responsibilities continue, make room this month for reflection, growth and more intentional service. People respond differently when they feel seen, heard and respected; empathy strengthens both relationships and results. Let it guide the quality of your leadership rather than increase the quantity of your activity. Allow this principle to shape what you start, what you stop and what you strengthen before the month closes.', 'In WGMN, empathy helps leaders understand the realities women carry and respond with dignity, wisdom and appropriate support.', 'In WNNN, empathy helps leaders understand the pressures, transitions and aspirations young adults are navigating.', 'Who do you need to listen to more carefully before deciding what support is needed?',
  'mli-y1-m10', 'Lead With Empathy — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y1-M11', 1, 11, 11, 'Steady in Small Things', 'Leadership becomes more meaningful when the people around us are stronger because we were present. Excellence is often revealed in ordinary actions: timely follow-through, thoughtful communication and care for details. Give this principle room to shape the way you carry the responsibilities already entrusted to you. Carry this thought into your decisions and conversations, and allow consistency to turn it into a leadership habit.', 'Excellence in WGMN is visible in the care given to women, the quality of follow-through and the respect shown in every interaction.', 'Excellence in WNNN means showing young people that preparation, reliability and quality matter in every level of responsibility.', 'What ordinary leadership habit can you improve by one level this month?',
  'mli-y1-m11', 'Steady in Small Things — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y1-M12', 1, 12, 12, 'Finish the Cycle Strong', 'Use this month as a checkpoint: reconnect with purpose, refine your habits and lead with greater awareness. Mature leadership makes time to review progress, acknowledge lessons and enter the next cycle with greater intention. Rather than treating it as an additional task, use it as a lens for the responsibilities already in your hands. The goal is not perfection; it is visible growth in the way you serve, support and lead.', 'Reflect on how your WGMN leadership has strengthened women, families, fellow leaders and the network itself.', 'Reflect on how your WNNN leadership has helped young adults become more confident, responsible, connected and purposeful.', 'What should you continue, stop and improve as you enter the next cycle?',
  'mli-y1-m12', 'Finish the Cycle Strong — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y2-M01', 2, 1, 13, 'Communicate With Clarity', 'A new month gives you a fresh opportunity to examine not only what you are doing, but how you are leading. Clear communication reduces confusion, strengthens trust and helps people act with confidence. Its value will be seen less in what you say about it and more in how it changes your everyday leadership choices. Small improvements, repeated faithfully, can change the quality of an entire leadership environment.', 'In WGMN, clear communication helps women and leaders across different levels remain aligned, informed and confident about what is expected.', 'In WNNN, communication should be clear, timely and engaging enough to help young leaders understand both purpose and next steps.', 'What important message needs to become clearer, simpler or more timely?',
  'mli-y2-m01', 'Communicate With Clarity — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y2-M02', 2, 2, 14, 'From Intention to Execution', 'As you enter this month, bring your attention back to the leadership habit that will matter long after the calendar changes. Good intentions create little impact until they are translated into disciplined action and responsible follow-through. The aim is not to add pressure, but to bring greater intention to the work and relationships already before you. By the end of the month, aim to see evidence of this principle in both your own leadership and the experience of the people around you.', 'For WGMN, execution means turning good intentions into organised actions that women and communities can actually experience.', 'For WNNN, execution means converting ideas and enthusiasm into disciplined, visible and responsible action.', 'Which good intention must become a completed action this month?',
  'mli-y2-m02', 'From Intention to Execution — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y2-M03', 2, 3, 15, 'Build Trust Deliberately', 'Some of the strongest leadership work happens quietly, through choices that build confidence, clarity and trust. Trust grows through consistency, honesty, respect, confidentiality and keeping commitments. Let it guide the quality of your leadership rather than increase the quantity of your activity. Choose one area where this principle can move from intention to practice, and stay with it throughout the month.', 'Trust is essential to WGMN because women must feel confident that leaders will handle people, information and responsibilities with care.', 'Trust gives young leaders the confidence to contribute, learn, ask questions and accept responsibility.', 'What behaviour from you would most strengthen trust in your leadership?',
  'mli-y2-m03', 'Build Trust Deliberately — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y2-M04', 2, 4, 16, 'Make Accountability Normal', 'This month, allow purpose to shape your pace, your conversations and the way you carry responsibility. Accountability is not punishment; it is a leadership habit that protects standards and strengthens performance. Give this principle room to shape the way you carry the responsibilities already entrusted to you. Use the month to become clearer, stronger and more useful to the people and purpose entrusted to you.', 'WGMN accountability should strengthen standards while preserving dignity, fairness and the opportunity for improvement.', 'WNNN accountability should teach that freedom and responsibility belong together in healthy leadership.', 'Where can accountability become clearer, fairer and more consistent?',
  'mli-y2-m04', 'Make Accountability Normal — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y2-M05', 2, 5, 17, 'Lead Meetings That Matter', 'Leadership is not sustained by enthusiasm alone; it grows through deliberate habits practised over time. Meetings should create clarity, decisions, ownership and movement rather than simply consume time. Rather than treating it as an additional task, use it as a lens for the responsibilities already in your hands. Let this principle become visible in one concrete leadership choice you repeat throughout the month.', 'WGMN meetings should leave leaders clearer about decisions, responsibilities, support needs and the next meaningful action.', 'WNNN meetings should be focused, participatory and action-oriented, leaving emerging leaders clear about what happens next.', 'What can you change so your next meeting ends with clearer ownership and action?',
  'mli-y2-m05', 'Lead Meetings That Matter — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y2-M06', 2, 6, 18, 'Strengthen the Team Around You', 'Before the month becomes busy, choose the leadership principle you want people to experience from you. A capable leader does not try to carry everything alone; she strengthens people, clarifies roles and encourages shared ownership. Its value will be seen less in what you say about it and more in how it changes your everyday leadership choices. May your leadership this month be steady, purposeful and worthy of the trust placed in you.', 'WGMN grows stronger when leadership is shared responsibly and each level helps the next level succeed.', 'WNNN grows stronger when young leaders learn to collaborate across strengths rather than compete for visibility.', 'Who around you needs greater clarity, support or room to contribute?',
  'mli-y2-m06', 'Strengthen the Team Around You — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y2-M07', 2, 7, 19, 'Handle Difficult Conversations Well', 'Every new month is an invitation to strengthen one part of your leadership rather than simply add more activity. Avoiding necessary conversations can weaken a team; respectful courage helps leaders address issues early and constructively. The aim is not to add pressure, but to bring greater intention to the work and relationships already before you. Let your actions make the message credible: leadership is strongest when people can experience what we say we value.', 'Within WGMN, respectful courage protects relationships by addressing concerns early rather than allowing silent frustration to grow.', 'Within WNNN, respectful courage helps emerging leaders address mistakes, disagreements and difficult issues without hostility.', 'What respectful conversation should no longer be postponed?',
  'mli-y2-m07', 'Handle Difficult Conversations Well — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y2-M08', 2, 8, 20, 'Protect Your Focus', 'The quality of leadership is often revealed in ordinary moments: how we respond, follow through, listen and decide. Leadership effectiveness improves when attention is directed toward what matters most rather than everything that demands attention. Let it guide the quality of your leadership rather than increase the quantity of your activity. Allow this principle to shape what you start, what you stop and what you strengthen before the month closes.', 'Keep WGMN priorities connected to the women, families and communities the network exists to strengthen.', 'Help WNNN leaders distinguish meaningful priorities from noise, trends and constant digital distraction.', 'What should receive less of your attention so the right priority receives more?',
  'mli-y2-m08', 'Protect Your Focus — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y2-M09', 2, 9, 21, 'Use Evidence, Not Assumptions', 'Your role matters, but the influence you create through that role matters even more. Responsible leaders seek facts, listen carefully and use evidence before reaching conclusions or escalating concerns. Give this principle room to shape the way you carry the responsibilities already entrusted to you. Carry this thought into your decisions and conversations, and allow consistency to turn it into a leadership habit.', 'Use evidence in WGMN to understand participation, progress, gaps and the real experiences behind the numbers.', 'Use evidence in WNNN to understand what young people are actually experiencing, not what leaders assume they need.', 'What fact or evidence do you need before making your next important judgment?',
  'mli-y2-m09', 'Use Evidence, Not Assumptions — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y2-M10', 2, 10, 22, 'Follow Through Completely', 'As responsibilities continue, make room this month for reflection, growth and more intentional service. Incomplete follow-through creates hidden gaps; dependable leadership closes loops and confirms that agreed actions are actually finished. Rather than treating it as an additional task, use it as a lens for the responsibilities already in your hands. The goal is not perfection; it is visible growth in the way you serve, support and lead.', 'In WGMN, follow-through is a form of care; women and leaders should not be left wondering whether important matters were forgotten.', 'In WNNN, follow-through teaches emerging leaders that credibility depends on completing what they accept responsibility for.', 'Which open loop must you close before the month ends?',
  'mli-y2-m10', 'Follow Through Completely — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y2-M11', 2, 11, 23, 'Learn to Prioritise', 'Leadership becomes more meaningful when the people around us are stronger because we were present. Not every urgent request has equal importance; leadership requires judgment about what deserves attention first. Its value will be seen less in what you say about it and more in how it changes your everyday leadership choices. Small improvements, repeated faithfully, can change the quality of an entire leadership environment.', 'Prioritise the WGMN actions that most strengthen leadership coverage, women’s development, meaningful participation and safe support.', 'Prioritise WNNN actions that most strengthen leadership development, belonging, participation and meaningful opportunity for young adults.', 'What are the three most important outcomes your leadership should protect this month?',
  'mli-y2-m11', 'Learn to Prioritise — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y2-M12', 2, 12, 24, 'Review, Reset, Improve', 'Use this month as a checkpoint: reconnect with purpose, refine your habits and lead with greater awareness. Effective leaders regularly examine what is working, what is not and what must change before the next cycle begins. The aim is not to add pressure, but to bring greater intention to the work and relationships already before you. By the end of the month, aim to see evidence of this principle in both your own leadership and the experience of the people around you.', 'Let WGMN become stronger because lessons are honestly reviewed and translated into better practice.', 'Let WNNN model a growth culture where feedback is used to improve rather than merely defend past decisions.', 'What lesson from recent work should change how you lead the next cycle?',
  'mli-y2-m12', 'Review, Reset, Improve — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y3-M01', 3, 1, 25, 'Influence Beyond Position', 'A new month gives you a fresh opportunity to examine not only what you are doing, but how you are leading. The deepest influence comes from credibility, example and the ability to help others become stronger. Let it guide the quality of your leadership rather than increase the quantity of your activity. Choose one area where this principle can move from intention to practice, and stay with it throughout the month.', 'In WGMN, influence should help women become more rooted, purposeful, capable and willing to strengthen others.', 'In WNNN, influence should help young people make responsible choices and use their energy, creativity and networks constructively.', 'Who is becoming stronger because of your example?',
  'mli-y3-m01', 'Influence Beyond Position — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y3-M02', 3, 2, 26, 'Create a Culture of Belonging', 'As you enter this month, bring your attention back to the leadership habit that will matter long after the calendar changes. People contribute more fully when they know they are respected, included and connected to something meaningful. Give this principle room to shape the way you carry the responsibilities already entrusted to you. Use the month to become clearer, stronger and more useful to the people and purpose entrusted to you.', 'WGMN should feel like a network in which women are recognised, respected and connected across geography and leadership levels.', 'WNNN should be a place where young adults feel seen, challenged, supported and connected to a meaningful community.', 'Who may be present but not yet feel fully included?',
  'mli-y3-m02', 'Create a Culture of Belonging — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y3-M03', 3, 3, 27, 'Mentor Intentionally', 'Some of the strongest leadership work happens quietly, through choices that build confidence, clarity and trust. Mentoring turns experience into multiplication by helping another person gain confidence, judgment and capacity. Rather than treating it as an additional task, use it as a lens for the responsibilities already in your hands. Let this principle become visible in one concrete leadership choice you repeat throughout the month.', 'Mentoring is central to WGMN’s generational influence; help another woman become more confident, capable and purposeful.', 'Mentoring helps WNNN convert experience into guidance so that emerging leaders do not have to learn every lesson alone.', 'Who can you intentionally develop this month?',
  'mli-y3-m03', 'Mentor Intentionally — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y3-M04', 3, 4, 28, 'Mobilise With Meaning', 'This month, allow purpose to shape your pace, your conversations and the way you carry responsibility. People are more willing to act when they understand the purpose, the expected contribution and the difference their effort can make. Its value will be seen less in what you say about it and more in how it changes your everyday leadership choices. May your leadership this month be steady, purposeful and worthy of the trust placed in you.', 'Mobilise WGMN women around meaningful purpose, not pressure; explain why participation matters and what good contribution looks like.', 'Mobilise WNNN through meaning, ownership and clear opportunities for contribution rather than pressure or empty excitement.', 'Can the people you lead explain why the next action matters?',
  'mli-y3-m04', 'Mobilise With Meaning — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y3-M05', 3, 5, 29, 'Listen to the Community', 'Leadership is not sustained by enthusiasm alone; it grows through deliberate habits practised over time. Leadership that remains close to people can identify needs, strengths and emerging concerns before they become larger gaps. The aim is not to add pressure, but to bring greater intention to the work and relationships already before you. Let your actions make the message credible: leadership is strongest when people can experience what we say we value.', 'Stay close enough to WGMN women and local leaders to hear emerging needs, opportunities and concerns.', 'Listen closely to young adults; their realities, ideas and concerns can reveal both new opportunities and emerging risks.', 'What are people closest to the work trying to tell you?',
  'mli-y3-m05', 'Listen to the Community — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y3-M06', 3, 6, 30, 'Celebrate Contribution', 'Before the month becomes busy, choose the leadership principle you want people to experience from you. Recognition strengthens belonging when it is sincere, specific and connected to meaningful contribution. Let it guide the quality of your leadership rather than increase the quantity of your activity. Allow this principle to shape what you start, what you stop and what you strengthen before the month closes.', 'Recognition in WGMN should make volunteer leaders and members feel that their contribution is seen and valued.', 'Recognition in WNNN should celebrate effort, growth, responsibility and contribution—not only visibility or popularity.', 'Whose specific contribution should be recognised this month?',
  'mli-y3-m06', 'Celebrate Contribution — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y3-M07', 3, 7, 31, 'Build Bridges, Not Silos', 'Every new month is an invitation to strengthen one part of your leadership rather than simply add more activity. Collaboration expands capacity when leaders share information, respect boundaries and work toward common outcomes. Give this principle room to shape the way you carry the responsibilities already entrusted to you. Carry this thought into your decisions and conversations, and allow consistency to turn it into a leadership habit.', 'WGMN becomes more effective when countries, states/regions, local structures and chapters share learning and support appropriately.', 'WNNN becomes stronger when young leaders collaborate across locations, skills, interests and leadership levels.', 'Where could partnership achieve more than working separately?',
  'mli-y3-m07', 'Build Bridges, Not Silos — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y3-M08', 3, 8, 32, 'Make Space for New Voices', 'The quality of leadership is often revealed in ordinary moments: how we respond, follow through, listen and decide. Healthy leadership creates room for emerging voices, fresh ideas and people who may not naturally step forward. Rather than treating it as an additional task, use it as a lens for the responsibilities already in your hands. The goal is not perfection; it is visible growth in the way you serve, support and lead.', 'Create room in WGMN for women with different experiences, strengths and perspectives to contribute meaningfully.', 'Create pathways for quieter, newer and less-connected young people to contribute alongside the most visible voices.', 'Whose voice or ability have you not yet made room for?',
  'mli-y3-m08', 'Make Space for New Voices — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y3-M09', 3, 9, 33, 'Strengthen Relationships Before Crisis', 'Your role matters, but the influence you create through that role matters even more. Relationships built before pressure arrives make coordination, trust and problem-solving stronger when challenges come. Its value will be seen less in what you say about it and more in how it changes your everyday leadership choices. Small improvements, repeated faithfully, can change the quality of an entire leadership environment.', 'Invest in WGMN relationships before you need them for urgent coordination; trust built early becomes strength later.', 'Build WNNN relationships before you need urgent support; strong networks are created through consistent connection.', 'Which leadership relationship deserves investment before it becomes urgent?',
  'mli-y3-m09', 'Strengthen Relationships Before Crisis — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y3-M10', 3, 10, 34, 'Represent With Excellence', 'As responsibilities continue, make room this month for reflection, growth and more intentional service. Every leader represents more than herself; conduct, communication and public presence shape how the wider organisation is perceived. The aim is not to add pressure, but to bring greater intention to the work and relationships already before you. By the end of the month, aim to see evidence of this principle in both your own leadership and the experience of the people around you.', 'Represent WGMN in a way that reflects dignity, professionalism, the WODDI mission and respect for the women we serve.', 'Represent WNNN in a way that shows young leadership can be energetic, creative, disciplined and professional at the same time.', 'Does your conduct consistently reflect the standard of the network you represent?',
  'mli-y3-m10', 'Represent With Excellence — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y3-M11', 3, 11, 35, 'Turn Participation Into Impact', 'Leadership becomes more meaningful when the people around us are stronger because we were present. Activity is not the same as impact; leaders should connect participation to meaningful outcomes for people and communities. Let it guide the quality of your leadership rather than increase the quantity of your activity. Choose one area where this principle can move from intention to practice, and stay with it throughout the month.', 'Ask not only how many WGMN activities occurred, but what changed for women, families, leaders and communities because they occurred.', 'Ask what changed in confidence, capacity, connection and responsible action because WNNN created the opportunity.', 'What changed for people because of the activity you led?',
  'mli-y3-m11', 'Turn Participation Into Impact — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y3-M12', 3, 12, 36, 'Tell the Story of Progress', 'Use this month as a checkpoint: reconnect with purpose, refine your habits and lead with greater awareness. Progress becomes more visible and learnable when leaders document outcomes, lessons and human stories responsibly. Give this principle room to shape the way you carry the responsibilities already entrusted to you. Use the month to become clearer, stronger and more useful to the people and purpose entrusted to you.', 'Document WGMN progress responsibly so that lessons, impact and women’s stories can strengthen learning and visibility.', 'Document WNNN progress in ways that celebrate growth, learning and real contribution without turning people into publicity objects.', 'What lesson or story of progress should be documented responsibly?',
  'mli-y3-m12', 'Tell the Story of Progress — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y4-M01', 4, 1, 37, 'Develop the Next Leader', 'A new month gives you a fresh opportunity to examine not only what you are doing, but how you are leading. Leadership becomes sustainable when capable people are intentionally prepared to carry responsibility well. Rather than treating it as an additional task, use it as a lens for the responsibilities already in your hands. Let this principle become visible in one concrete leadership choice you repeat throughout the month.', 'Prepare capable WGMN women to lead so that progress does not depend on one personality or one tenure.', 'Prepare emerging WNNN leaders continuously so that leadership renewal becomes normal rather than disruptive.', 'Who could carry more responsibility if intentionally prepared?',
  'mli-y4-m01', 'Develop the Next Leader — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y4-M02', 4, 2, 38, 'Resilience Without Burnout', 'As you enter this month, bring your attention back to the leadership habit that will matter long after the calendar changes. Resilience is not endless pressure; it includes healthy boundaries, support, perspective and the wisdom to recover. Its value will be seen less in what you say about it and more in how it changes your everyday leadership choices. May your leadership this month be steady, purposeful and worthy of the trust placed in you.', 'WGMN leadership should be sustainable; seek support, share responsibility appropriately and protect the ability to serve well over time.', 'Teach and model sustainable leadership in WNNN: ambition should be balanced by support, boundaries, perspective and recovery.', 'What support, boundary or adjustment would help you sustain healthy service?',
  'mli-y4-m02', 'Resilience Without Burnout — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y4-M03', 4, 3, 39, 'Adapt Without Losing the Mission', 'Some of the strongest leadership work happens quietly, through choices that build confidence, clarity and trust. Methods may change as circumstances change, but strong leaders preserve purpose, values and standards. The aim is not to add pressure, but to bring greater intention to the work and relationships already before you. Let your actions make the message credible: leadership is strongest when people can experience what we say we value.', 'As WGMN grows across cultures and contexts, adapt methods wisely while preserving its values, purpose and standards.', 'WNNN should remain responsive to changing youth realities and technology without losing its values or mission.', 'What method may need to change while the mission remains protected?',
  'mli-y4-m03', 'Adapt Without Losing the Mission — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y4-M04', 4, 4, 40, 'Lead Through Uncertainty', 'This month, allow purpose to shape your pace, your conversations and the way you carry responsibility. When answers are incomplete, calm communication, sound judgment and transparent next steps help people remain grounded. Let it guide the quality of your leadership rather than increase the quantity of your activity. Allow this principle to shape what you start, what you stop and what you strengthen before the month closes.', 'When WGMN leaders face uncertainty, communicate what is known, what is not yet known and what the next responsible step will be.', 'When WNNN faces uncertainty, transparent communication helps young leaders remain engaged without speculation or confusion.', 'What do your people need to know now, even if every answer is not yet available?',
  'mli-y4-m04', 'Lead Through Uncertainty — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y4-M05', 4, 5, 41, 'Delegate With Confidence', 'Leadership is not sustained by enthusiasm alone; it grows through deliberate habits practised over time. Delegation is not abandonment; it is clear responsibility, appropriate authority, support and follow-through. Give this principle room to shape the way you carry the responsibilities already entrusted to you. Carry this thought into your decisions and conversations, and allow consistency to turn it into a leadership habit.', 'Delegate WGMN responsibilities with clarity so that others can grow while standards and accountability remain protected.', 'Delegation in WNNN is a development tool; give emerging leaders meaningful responsibility with clarity, support and accountability.', 'What responsibility can you delegate with clearer authority, support and accountability?',
  'mli-y4-m05', 'Delegate With Confidence — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y4-M06', 4, 6, 42, 'Correct Without Crushing', 'Before the month becomes busy, choose the leadership principle you want people to experience from you. Performance concerns should be addressed with clarity, fairness and respect so that correction can produce improvement. Rather than treating it as an additional task, use it as a lens for the responsibilities already in your hands. The goal is not perfection; it is visible growth in the way you serve, support and lead.', 'Address WGMN performance concerns in ways that are clear, documented, respectful and oriented toward improvement.', 'Correct WNNN performance concerns clearly and respectfully so that mistakes become opportunities for maturity and better judgment.', 'What issue needs fair, respectful correction before it grows?',
  'mli-y4-m06', 'Correct Without Crushing — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y4-M07', 4, 7, 43, 'Build Systems That Outlast You', 'Every new month is an invitation to strengthen one part of your leadership rather than simply add more activity. Strong leadership does not depend only on memory or personality; it creates simple systems that allow good work to continue. Its value will be seen less in what you say about it and more in how it changes your everyday leadership choices. Small improvements, repeated faithfully, can change the quality of an entire leadership environment.', 'Build WGMN systems that allow a new leader to understand responsibilities, records and next actions without starting again from zero.', 'Build WNNN systems that make opportunities, responsibilities and records clear enough for new leaders to enter confidently.', 'What recurring task still depends too heavily on one person’s memory?',
  'mli-y4-m07', 'Build Systems That Outlast You — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y4-M08', 4, 8, 44, 'Make Learning Continuous', 'The quality of leadership is often revealed in ordinary moments: how we respond, follow through, listen and decide. Teams become stronger when lessons are captured, shared and applied rather than repeatedly rediscovered. The aim is not to add pressure, but to bring greater intention to the work and relationships already before you. By the end of the month, aim to see evidence of this principle in both your own leadership and the experience of the people around you.', 'Capture and share WGMN lessons so that one chapter, locality or country can help another become stronger.', 'Share lessons across WNNN so that innovation in one location can strengthen others without unnecessary duplication.', 'What lesson should be captured so others do not have to rediscover it?',
  'mli-y4-m08', 'Make Learning Continuous — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y4-M09', 4, 9, 45, 'Stay Grounded Under Pressure', 'Your role matters, but the influence you create through that role matters even more. Pressure reveals leadership habits; composure helps a leader respond thoughtfully instead of reacting impulsively. Let it guide the quality of your leadership rather than increase the quantity of your activity. Choose one area where this principle can move from intention to practice, and stay with it throughout the month.', 'Calm, respectful leadership helps WGMN remain steady when pressure, disagreement or unexpected challenges arise.', 'Model composure in WNNN so that emerging leaders learn to respond to pressure with judgment rather than impulse.', 'What helps you respond thoughtfully when pressure rises?',
  'mli-y4-m09', 'Stay Grounded Under Pressure — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y4-M10', 4, 10, 46, 'Strengthen Cross-Level Partnership', 'As responsibilities continue, make room this month for reflection, growth and more intentional service. Networks work better when leadership levels communicate upward, downward and across with respect and shared responsibility. Give this principle room to shape the way you carry the responsibilities already entrusted to you. Use the month to become clearer, stronger and more useful to the people and purpose entrusted to you.', 'Strengthen WGMN partnership across leadership levels so that information and support can move both upward and downward.', 'Strengthen WNNN connections across leadership levels so that ideas can travel upward and guidance can travel downward.', 'Where does communication need to move more effectively across leadership levels?',
  'mli-y4-m10', 'Strengthen Cross-Level Partnership — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y4-M11', 4, 11, 47, 'Prepare for Transition', 'Leadership becomes more meaningful when the people around us are stronger because we were present. Leadership transition is healthier when records, relationships, responsibilities and pending actions can be handed over clearly. Rather than treating it as an additional task, use it as a lens for the responsibilities already in your hands. Let this principle become visible in one concrete leadership choice you repeat throughout the month.', 'Prepare WGMN handovers so that women, records, relationships and responsibilities remain supported when a leader changes.', 'Prepare WNNN handovers so that new leaders inherit clarity, context and useful records rather than confusion.', 'Could another leader understand your current responsibilities and pending actions from the records you keep?',
  'mli-y4-m11', 'Prepare for Transition — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y4-M12', 4, 12, 48, 'Renew the Commitment', 'Use this month as a checkpoint: reconnect with purpose, refine your habits and lead with greater awareness. Sustainable service requires moments of renewal in which leaders reconnect with purpose, recognise growth and choose how to continue well. Its value will be seen less in what you say about it and more in how it changes your everyday leadership choices. May your leadership this month be steady, purposeful and worthy of the trust placed in you.', 'Reconnect with why WGMN exists and let that purpose renew the quality of your service.', 'Reconnect with the responsibility of nurturing the next generation and allow that purpose to renew your service.', 'What part of the mission still gives you energy and meaning?',
  'mli-y4-m12', 'Renew the Commitment — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y5-M01', 5, 1, 49, 'Steward What Has Been Entrusted', 'A new month gives you a fresh opportunity to examine not only what you are doing, but how you are leading. Leadership is stewardship: using time, relationships, opportunities, information and influence responsibly. The aim is not to add pressure, but to bring greater intention to the work and relationships already before you. Let your actions make the message credible: leadership is strongest when people can experience what we say we value.', 'Steward WGMN’s people, information, opportunities and influence as resources held in trust for a wider mission.', 'Steward WNNN’s young people, opportunities, information and influence with care because each can shape future leadership.', 'What entrusted resource—time, information, people or opportunity—needs more intentional stewardship?',
  'mli-y5-m01', 'Steward What Has Been Entrusted — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y5-M02', 5, 2, 50, 'Think Institution, Not Individual', 'As you enter this month, bring your attention back to the leadership habit that will matter long after the calendar changes. Strong institutions grow when decisions protect the mission beyond the preferences or tenure of any one person. Let it guide the quality of your leadership rather than increase the quantity of your activity. Allow this principle to shape what you start, what you stop and what you strengthen before the month closes.', 'Make WGMN decisions that remain sound even after current leaders have moved on.', 'Build WNNN so that its strength is carried by culture, systems and people—not by one personality.', 'Would this decision still make sense for the organisation after your tenure ends?',
  'mli-y5-m02', 'Think Institution, Not Individual — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y5-M03', 5, 3, 51, 'Lead With Wisdom', 'Some of the strongest leadership work happens quietly, through choices that build confidence, clarity and trust. Wisdom combines experience, listening, values and sound judgment to choose what serves the greater good. Give this principle room to shape the way you carry the responsibilities already entrusted to you. Carry this thought into your decisions and conversations, and allow consistency to turn it into a leadership habit.', 'Use wisdom in WGMN to balance compassion, standards, evidence, context and the long-term good of the network.', 'Use wisdom in WNNN to balance innovation with judgment, speed with reflection and opportunity with responsibility.', 'What decision requires more listening and judgment before action?',
  'mli-y5-m03', 'Lead With Wisdom — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y5-M04', 5, 4, 52, 'Multiply Good Practice', 'This month, allow purpose to shape your pace, your conversations and the way you carry responsibility. What works well should be documented, taught and adapted so that excellence can spread across the network. Rather than treating it as an additional task, use it as a lens for the responsibilities already in your hands. The goal is not perfection; it is visible growth in the way you serve, support and lead.', 'When a WGMN practice works well, document it clearly enough for other leadership areas to learn from and adapt it.', 'When WNNN develops an effective practice, make it simple enough for other locations to learn, adapt and improve it.', 'What good practice should be documented and shared?',
  'mli-y5-m04', 'Multiply Good Practice — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y5-M05', 5, 5, 53, 'Protect the Culture', 'Leadership is not sustained by enthusiasm alone; it grows through deliberate habits practised over time. Organisational culture is shaped by what leaders model, permit, correct and consistently reinforce. Its value will be seen less in what you say about it and more in how it changes your everyday leadership choices. Small improvements, repeated faithfully, can change the quality of an entire leadership environment.', 'Protect a WGMN culture in which women experience dignity, accountability, learning, service and purposeful leadership.', 'Protect a WNNN culture where young adults can grow, contribute, be accountable and lead with values.', 'What behaviour are you currently modelling, permitting or reinforcing?',
  'mli-y5-m05', 'Protect the Culture — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y5-M06', 5, 6, 54, 'Measure What Matters', 'Before the month becomes busy, choose the leadership principle you want people to experience from you. Measurement is valuable when it helps leaders understand progress, identify gaps and make better decisions. The aim is not to add pressure, but to bring greater intention to the work and relationships already before you. By the end of the month, aim to see evidence of this principle in both your own leadership and the experience of the people around you.', 'Use WGMN data to understand whether leadership coverage, participation, learning and community influence are actually improving.', 'Use WNNN data to understand whether young people are becoming more engaged, capable, connected and responsible through the network.', 'What evidence would tell you whether the work is genuinely improving?',
  'mli-y5-m06', 'Measure What Matters — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y5-M07', 5, 7, 55, 'Leave People Stronger', 'Every new month is an invitation to strengthen one part of your leadership rather than simply add more activity. A meaningful leadership legacy is seen in people who are more capable, confident and responsible because of your influence. Let it guide the quality of your leadership rather than increase the quantity of your activity. Choose one area where this principle can move from intention to practice, and stay with it throughout the month.', 'Let women and fellow leaders become stronger because your WGMN leadership gave them room, guidance and confidence to grow.', 'Let emerging leaders leave interactions with you more confident, capable and ready to take responsible initiative.', 'Who should be more capable because you led them this month?',
  'mli-y5-m07', 'Leave People Stronger — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y5-M08', 5, 8, 56, 'Guard the Mission', 'The quality of leadership is often revealed in ordinary moments: how we respond, follow through, listen and decide. Growth should never cause a network to lose the purpose, values and people it was created to serve. Give this principle room to shape the way you carry the responsibilities already entrusted to you. Use the month to become clearer, stronger and more useful to the people and purpose entrusted to you.', 'As WGMN expands, keep nurturing women and strengthening families at the heart of leadership decisions.', 'As WNNN grows, keep nurturing the next generation—not numbers, visibility or activity alone—at the centre.', 'What could distract the network from the people and purpose it exists to serve?',
  'mli-y5-m08', 'Guard the Mission — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y5-M09', 5, 9, 57, 'Prepare Others to Lead', 'Your role matters, but the influence you create through that role matters even more. Succession is an act of confidence in the future; it requires sharing knowledge, developing people and reducing unnecessary dependence. Rather than treating it as an additional task, use it as a lens for the responsibilities already in your hands. Let this principle become visible in one concrete leadership choice you repeat throughout the month.', 'Share WGMN knowledge and develop capable successors so that continuity becomes a strength, not a crisis response.', 'Share knowledge early and prepare other young leaders to carry responsibility so continuity becomes part of WNNN’s culture.', 'What knowledge or responsibility should you begin transferring now?',
  'mli-y5-m09', 'Prepare Others to Lead — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y5-M10', 5, 10, 58, 'Lead Across Generations', 'As responsibilities continue, make room this month for reflection, growth and more intentional service. Lasting movements learn to connect experience with emerging energy so that wisdom and innovation strengthen one another. Its value will be seen less in what you say about it and more in how it changes your everyday leadership choices. May your leadership this month be steady, purposeful and worthy of the trust placed in you.', 'WGMN can connect mature experience with emerging voices so that women across generations strengthen one another.', 'WNNN can combine the energy of youth with the wisdom of mentors to develop leaders who are both innovative and grounded.', 'How can experience and emerging energy work together more intentionally?',
  'mli-y5-m10', 'Lead Across Generations — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y5-M11', 5, 11, 59, 'Legacy Is Built Daily', 'Leadership becomes more meaningful when the people around us are stronger because we were present. Legacy is not created at the end of leadership; it is formed through daily choices, relationships, standards and service. The aim is not to add pressure, but to bring greater intention to the work and relationships already before you. Let your actions make the message credible: leadership is strongest when people can experience what we say we value.', 'Your WGMN legacy is being formed in every woman you encourage, every standard you protect and every leader you help develop.', 'Your WNNN legacy is formed in the young people who become more responsible, purposeful and capable because you led well.', 'What daily choice is shaping the legacy of your leadership?',
  'mli-y5-m11', 'Legacy Is Built Daily — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_inspiration
 (content_id, year_number, month_number, abs_month, theme_title, core_message, wgmn_lens, wnnn_lens, reflection, image_slug, image_alt)
 values ('MLI-Y5-M12', 5, 12, 60, 'Carry the Work Forward', 'Use this month as a checkpoint: reconnect with purpose, refine your habits and lead with greater awareness. The strongest conclusion to a leadership cycle is not personal applause but a stronger network, stronger people and a clearer path forward. Let it guide the quality of your leadership rather than increase the quantity of your activity. Allow this principle to shape what you start, what you stop and what you strengthen before the month closes.', 'Carry WGMN forward by leaving clear records, stronger people, healthier structures and confidence in the mission.', 'Carry WNNN forward by leaving stronger young leaders, clearer systems, useful records and confidence in the mission.', 'What can you leave clearer, stronger and easier for the next leader to carry forward?',
  'mli-y5-m12', 'Carry the Work Forward — WODDI monthly leadership inspiration')
 on conflict (content_id) do update set theme_title = excluded.theme_title, core_message = excluded.core_message,
   wgmn_lens = excluded.wgmn_lens, wnnn_lens = excluded.wnnn_lens, reflection = excluded.reflection;
insert into public.monthly_role_lens (network, role, lens) values ('WGMN', 'country_rep', 'Set the national tone: connect this month’s principle to country-wide alignment, leadership standards and the health of the full WGMN structure.') on conflict (network, role, language) do update set lens = excluded.lens;
insert into public.monthly_role_lens (network, role, lens) values ('WGMN', 'deputy_country_rep', 'Strengthen national follow-through: help translate direction into coordinated action, support the Country Representative and surface gaps early.') on conflict (network, role, language) do update set lens = excluded.lens;
insert into public.monthly_role_lens (network, role, lens) values ('WGMN', 'state_coordinator', 'Turn the principle into consistent practice across your state or region and strengthen the leaders below you through guidance and follow-through.') on conflict (network, role, language) do update set lens = excluded.lens;
insert into public.monthly_role_lens (network, role, lens) values ('WGMN', 'assistant_state_coordinator', 'Support the State/Regional Coordinator within written delegation, keep agreed actions moving and strengthen continuity without creating a parallel line of authority.') on conflict (network, role, language) do update set lens = excluded.lens;
insert into public.monthly_role_lens (network, role, lens) values ('WGMN', 'district_coordinator', 'Bring the principle close to communities by coordinating local leaders, tracking what needs attention and ensuring communication moves both ways.') on conflict (network, role, language) do update set lens = excluded.lens;
insert into public.monthly_role_lens (network, role, lens) values ('WGMN', 'assistant_district_coordinator', 'Support local coordination within written delegation, follow through on assigned actions and help maintain clear communication without assuming the Coordinator’s authority.') on conflict (network, role, language) do update set lens = excluded.lens;
insert into public.monthly_role_lens (network, role, lens) values ('WGMN', 'cluster_coordinator', 'Make the principle visible at community level through relationships, local awareness, dependable coordination and support to chapters.') on conflict (network, role, language) do update set lens = excluded.lens;
insert into public.monthly_role_lens (network, role, lens) values ('WGMN', 'assistant_cluster_coordinator', 'Strengthen community-level follow-through, support the Coordinator’s assigned priorities and help chapters remain connected within approved role boundaries.') on conflict (network, role, language) do update set lens = excluded.lens;
insert into public.monthly_role_lens (network, role, lens) values ('WGMN', 'chapter_lead', 'Model the principle where members experience WGMN most directly: in the quality of local leadership, care, participation and follow-through.') on conflict (network, role, language) do update set lens = excluded.lens;
insert into public.monthly_role_lens (network, role, lens) values ('WGMN', 'assistant_chapter_lead', 'Support the Chapter Coordinator in making the chapter dependable, welcoming and well organised; act only within written delegation and never as a parallel Chapter authority.') on conflict (network, role, language) do update set lens = excluded.lens;
insert into public.monthly_role_lens (network, role, lens) values ('WNNN', 'country_rep', 'Set the national tone: connect this month’s principle to WNNN leadership development, country-wide alignment and meaningful opportunities for young adults.') on conflict (network, role, language) do update set lens = excluded.lens;
insert into public.monthly_role_lens (network, role, lens) values ('WNNN', 'deputy_country_rep', 'Strengthen national execution: support the Country Lead, coordinate follow-through and help emerging leaders understand direction clearly.') on conflict (network, role, language) do update set lens = excluded.lens;
insert into public.monthly_role_lens (network, role, lens) values ('WNNN', 'state_coordinator', 'Turn the principle into visible practice across your state or region and create pathways for young leaders below you to participate and grow.') on conflict (network, role, language) do update set lens = excluded.lens;
insert into public.monthly_role_lens (network, role, lens) values ('WNNN', 'assistant_state_coordinator', 'Support the State/Regional Lead within written delegation, keep agreed actions moving and strengthen continuity without creating a parallel line of authority.') on conflict (network, role, language) do update set lens = excluded.lens;
insert into public.monthly_role_lens (network, role, lens) values ('WNNN', 'district_coordinator', 'Bring the principle into local action by coordinating leaders, connecting young adults to opportunities and keeping communication moving in both directions.') on conflict (network, role, language) do update set lens = excluded.lens;
insert into public.monthly_role_lens (network, role, lens) values ('WNNN', 'assistant_district_coordinator', 'Support local execution within written delegation, follow through on assigned actions and help keep young leaders connected without assuming the Lead’s authority.') on conflict (network, role, language) do update set lens = excluded.lens;
insert into public.monthly_role_lens (network, role, lens) values ('WNNN', 'cluster_coordinator', 'Make the principle tangible at community level through accessible leadership, local mobilisation, relationship-building and responsible follow-through.') on conflict (network, role, language) do update set lens = excluded.lens;
insert into public.monthly_role_lens (network, role, lens) values ('WNNN', 'assistant_cluster_coordinator', 'Support community-level mobilisation and follow-through within approved delegation, helping local young leaders stay informed, included and connected.') on conflict (network, role, language) do update set lens = excluded.lens;
insert into public.monthly_role_lens (network, role, lens) values ('WNNN', 'chapter_lead', 'Model the principle at the point of closest contact with young adults: make the chapter a place of belonging, growth, responsibility and meaningful action.') on conflict (network, role, language) do update set lens = excluded.lens;
insert into public.monthly_role_lens (network, role, lens) values ('WNNN', 'assistant_chapter_lead', 'Support the Chapter Lead in creating a dependable and engaging chapter experience; operate within written delegation and never as a parallel Chapter authority.') on conflict (network, role, language) do update set lens = excluded.lens;

-- Founder's Welcome library. DRAFTED FROM THE BRIEF, NOT YET FOUNDER-APPROVED:
-- every record is is_active = false, so nothing is published under the
-- Founder's name until HQ approves it. To publish after approval:
--   update public.founder_welcome set is_active = true;

insert into public.founder_welcome (content_id, network, role_level, role_title, body, is_active)
 values ('FW-WGMN-COUNTRY-EN', 'WGMN', 'country', 'Country Representative', 'Dear {{FirstName}}, Welcome, and thank you. Your appointment as {{RoleTitle}} within the {{NetworkName}} in {{Country}} is a decision I do not take lightly, and neither should you. You chose to give your time and your gifts to women and girls you may never meet, and that choice already tells me something about the leader you are. As {{RoleTitle}} you carry the national tone of the Good Mother Network in {{Country}}. The standards you keep, the leaders you raise and the culture you protect will be felt in homes long after this season. Nurture the women who lead with you; they will nurture families, and those families will shape a generation. You are not serving alone. You have joined a family of leaders across Africa who are carrying this work with you, and headquarters stands behind you. Lead with integrity, serve with humility, and let the women who meet you leave stronger than they came. With appreciation and confidence in you,', false)
 on conflict (content_id) do update set body = excluded.body, role_title = excluded.role_title;
insert into public.founder_welcome (content_id, network, role_level, role_title, body, is_active)
 values ('FW-WGMN-DEPUTY_COUNTRY-EN', 'WGMN', 'deputy_country', 'Deputy Country Representative', 'Dear {{FirstName}}, Welcome, and thank you. Your appointment as {{RoleTitle}} within the {{NetworkName}} in {{Country}} is a decision I do not take lightly, and neither should you. You chose to give your time and your gifts to women and girls you may never meet, and that choice already tells me something about the leader you are. As {{RoleTitle}} you are a genuine partner in national leadership, not a title in waiting. Your strength is follow-through: turning direction into coordinated action, surfacing gaps early and making it possible for the whole country structure to keep its promises to women and families. You are not serving alone. You have joined a family of leaders across Africa who are carrying this work with you, and headquarters stands behind you. Lead with integrity, serve with humility, and let the women who meet you leave stronger than they came. With appreciation and confidence in you,', false)
 on conflict (content_id) do update set body = excluded.body, role_title = excluded.role_title;
insert into public.founder_welcome (content_id, network, role_level, role_title, body, is_active)
 values ('FW-WGMN-STATE-EN', 'WGMN', 'state', 'State/Regional Coordinator', 'Dear {{FirstName}}, Welcome, and thank you. Your appointment as {{RoleTitle}} within the {{NetworkName}} in {{Country}} is a decision I do not take lightly, and neither should you. You chose to give your time and your gifts to women and girls you may never meet, and that choice already tells me something about the leader you are. As {{RoleTitle}} in {{JurisdictionName}} you turn national direction into steady practice across your region. The coordinators you guide will lead the way you lead them. Be present, be consistent, and let your support be the reason chapters in your area stay strong. You are not serving alone. You have joined a family of leaders across Africa who are carrying this work with you, and headquarters stands behind you. Lead with integrity, serve with humility, and let the women who meet you leave stronger than they came. With appreciation and confidence in you,', false)
 on conflict (content_id) do update set body = excluded.body, role_title = excluded.role_title;
insert into public.founder_welcome (content_id, network, role_level, role_title, body, is_active)
 values ('FW-WGMN-DISTRICT-EN', 'WGMN', 'district', 'LGA/District/Municipality Coordinator', 'Dear {{FirstName}}, Welcome, and thank you. Your appointment as {{RoleTitle}} within the {{NetworkName}} in {{Country}} is a decision I do not take lightly, and neither should you. You chose to give your time and your gifts to women and girls you may never meet, and that choice already tells me something about the leader you are. As {{RoleTitle}} in {{JurisdictionName}} you bring leadership close to where women actually live. Yours is the level where intentions become visible: chapters supported, needs noticed, and communication moving in both directions between the community and the wider network. You are not serving alone. You have joined a family of leaders across Africa who are carrying this work with you, and headquarters stands behind you. Lead with integrity, serve with humility, and let the women who meet you leave stronger than they came. With appreciation and confidence in you,', false)
 on conflict (content_id) do update set body = excluded.body, role_title = excluded.role_title;
insert into public.founder_welcome (content_id, network, role_level, role_title, body, is_active)
 values ('FW-WGMN-CLUSTER-EN', 'WGMN', 'cluster', 'Community Cluster/Ward Coordinator', 'Dear {{FirstName}}, Welcome, and thank you. Your appointment as {{RoleTitle}} within the {{NetworkName}} in {{Country}} is a decision I do not take lightly, and neither should you. You chose to give your time and your gifts to women and girls you may never meet, and that choice already tells me something about the leader you are. As {{RoleTitle}} in {{JurisdictionName}} you make this work personal. Relationships, local awareness and dependable follow-through are what turn a network into a neighbourhood. The women near you should know your name and know they can come to you. You are not serving alone. You have joined a family of leaders across Africa who are carrying this work with you, and headquarters stands behind you. Lead with integrity, serve with humility, and let the women who meet you leave stronger than they came. With appreciation and confidence in you,', false)
 on conflict (content_id) do update set body = excluded.body, role_title = excluded.role_title;
insert into public.founder_welcome (content_id, network, role_level, role_title, body, is_active)
 values ('FW-WGMN-CHAPTER-EN', 'WGMN', 'chapter', 'Chapter Coordinator', 'Dear {{FirstName}}, Welcome, and thank you. Your appointment as {{RoleTitle}} within the {{NetworkName}} in {{Country}} is a decision I do not take lightly, and neither should you. You chose to give your time and your gifts to women and girls you may never meet, and that choice already tells me something about the leader you are. As {{RoleTitle}} in {{JurisdictionName}} you are where members experience WGMN most directly. Belonging, care, participation and growth begin in the chapter. When you welcome a woman well, you are welcoming her family and the generation coming behind her. You are not serving alone. You have joined a family of leaders across Africa who are carrying this work with you, and headquarters stands behind you. Lead with integrity, serve with humility, and let the women who meet you leave stronger than they came. With appreciation and confidence in you,', false)
 on conflict (content_id) do update set body = excluded.body, role_title = excluded.role_title;
insert into public.founder_welcome (content_id, network, role_level, role_title, body, is_active)
 values ('FW-WGMN-ASSISTANT-EN', 'WGMN', 'assistant', 'Assistant Coordinator', 'Dear {{FirstName}}, Welcome, and thank you. Your appointment as {{RoleTitle}} within the {{NetworkName}} in {{Country}} is a decision I do not take lightly, and neither should you. You chose to give your time and your gifts to women and girls you may never meet, and that choice already tells me something about the leader you are. As {{RoleTitle}} in {{JurisdictionName}} you carry dependable support within the responsibility delegated to you. Helping your principal leader succeed is real leadership, not lesser leadership, and the steadiness you bring keeps the work moving when it matters most. You are not serving alone. You have joined a family of leaders across Africa who are carrying this work with you, and headquarters stands behind you. Lead with integrity, serve with humility, and let the women who meet you leave stronger than they came. With appreciation and confidence in you,', false)
 on conflict (content_id) do update set body = excluded.body, role_title = excluded.role_title;
insert into public.founder_welcome (content_id, network, role_level, role_title, body, is_active)
 values ('FW-WNNN-COUNTRY-EN', 'WNNN', 'country', 'Country Lead', 'Dear {{FirstName}}, Welcome, and thank you. Your appointment as {{RoleTitle}} within the {{NetworkName}} in {{Country}} is a decision I do not take lightly, and neither should you. You chose to give your time and your gifts to women and girls you may never meet, and that choice already tells me something about the leader you are. As {{RoleTitle}} you set the national tone for Nurture NextGen in {{Country}}. Young women are watching how leadership is done here. Build pathways, not gatekeeping: create real responsibility, real opportunity and real support for the emerging leaders coming behind you. You are not serving alone. You have joined a family of leaders across Africa who are carrying this work with you, and headquarters stands behind you. Lead with integrity, serve with humility, and let the women who meet you leave stronger than they came. With appreciation and confidence in you,', false)
 on conflict (content_id) do update set body = excluded.body, role_title = excluded.role_title;
insert into public.founder_welcome (content_id, network, role_level, role_title, body, is_active)
 values ('FW-WNNN-DEPUTY_COUNTRY-EN', 'WNNN', 'deputy_country', 'Deputy Country Lead', 'Dear {{FirstName}}, Welcome, and thank you. Your appointment as {{RoleTitle}} within the {{NetworkName}} in {{Country}} is a decision I do not take lightly, and neither should you. You chose to give your time and your gifts to women and girls you may never meet, and that choice already tells me something about the leader you are. As {{RoleTitle}} you strengthen national execution. Your work is to make direction clear to emerging leaders, coordinate follow-through and keep momentum steady, so that young women experience a network that does what it says it will do. You are not serving alone. You have joined a family of leaders across Africa who are carrying this work with you, and headquarters stands behind you. Lead with integrity, serve with humility, and let the women who meet you leave stronger than they came. With appreciation and confidence in you,', false)
 on conflict (content_id) do update set body = excluded.body, role_title = excluded.role_title;
insert into public.founder_welcome (content_id, network, role_level, role_title, body, is_active)
 values ('FW-WNNN-STATE-EN', 'WNNN', 'state', 'State/Regional Lead', 'Dear {{FirstName}}, Welcome, and thank you. Your appointment as {{RoleTitle}} within the {{NetworkName}} in {{Country}} is a decision I do not take lightly, and neither should you. You chose to give your time and your gifts to women and girls you may never meet, and that choice already tells me something about the leader you are. As {{RoleTitle}} in {{JurisdictionName}} you turn direction into visible practice across your region, and you create room for young leaders below you to participate and grow. Give them responsibility they can carry and the support to carry it well. You are not serving alone. You have joined a family of leaders across Africa who are carrying this work with you, and headquarters stands behind you. Lead with integrity, serve with humility, and let the women who meet you leave stronger than they came. With appreciation and confidence in you,', false)
 on conflict (content_id) do update set body = excluded.body, role_title = excluded.role_title;
insert into public.founder_welcome (content_id, network, role_level, role_title, body, is_active)
 values ('FW-WNNN-DISTRICT-EN', 'WNNN', 'district', 'LGA/District/Municipality Lead', 'Dear {{FirstName}}, Welcome, and thank you. Your appointment as {{RoleTitle}} within the {{NetworkName}} in {{Country}} is a decision I do not take lightly, and neither should you. You chose to give your time and your gifts to women and girls you may never meet, and that choice already tells me something about the leader you are. As {{RoleTitle}} in {{JurisdictionName}} you connect young adults to opportunity where they are. Coordinate the leaders around you, keep communication moving both ways and make sure that no young woman in your area is invisible to this network. You are not serving alone. You have joined a family of leaders across Africa who are carrying this work with you, and headquarters stands behind you. Lead with integrity, serve with humility, and let the women who meet you leave stronger than they came. With appreciation and confidence in you,', false)
 on conflict (content_id) do update set body = excluded.body, role_title = excluded.role_title;
insert into public.founder_welcome (content_id, network, role_level, role_title, body, is_active)
 values ('FW-WNNN-CLUSTER-EN', 'WNNN', 'cluster', 'Community Cluster/Ward Lead', 'Dear {{FirstName}}, Welcome, and thank you. Your appointment as {{RoleTitle}} within the {{NetworkName}} in {{Country}} is a decision I do not take lightly, and neither should you. You chose to give your time and your gifts to women and girls you may never meet, and that choice already tells me something about the leader you are. As {{RoleTitle}} in {{JurisdictionName}} you make leadership accessible. Mobilisation, relationships and responsible follow-through at community level are what turn interest into belonging for a young woman deciding whether she has a place here. You are not serving alone. You have joined a family of leaders across Africa who are carrying this work with you, and headquarters stands behind you. Lead with integrity, serve with humility, and let the women who meet you leave stronger than they came. With appreciation and confidence in you,', false)
 on conflict (content_id) do update set body = excluded.body, role_title = excluded.role_title;
insert into public.founder_welcome (content_id, network, role_level, role_title, body, is_active)
 values ('FW-WNNN-CHAPTER-EN', 'WNNN', 'chapter', 'Chapter Lead', 'Dear {{FirstName}}, Welcome, and thank you. Your appointment as {{RoleTitle}} within the {{NetworkName}} in {{Country}} is a decision I do not take lightly, and neither should you. You chose to give your time and your gifts to women and girls you may never meet, and that choice already tells me something about the leader you are. As {{RoleTitle}} in {{JurisdictionName}} you stand at the point of closest contact with young adults. Make your chapter a place of belonging, growth, responsibility and meaningful action, and you will shape leaders long before they carry any title. You are not serving alone. You have joined a family of leaders across Africa who are carrying this work with you, and headquarters stands behind you. Lead with integrity, serve with humility, and let the women who meet you leave stronger than they came. With appreciation and confidence in you,', false)
 on conflict (content_id) do update set body = excluded.body, role_title = excluded.role_title;
insert into public.founder_welcome (content_id, network, role_level, role_title, body, is_active)
 values ('FW-WNNN-ASSISTANT-EN', 'WNNN', 'assistant', 'Assistant Lead', 'Dear {{FirstName}}, Welcome, and thank you. Your appointment as {{RoleTitle}} within the {{NetworkName}} in {{Country}} is a decision I do not take lightly, and neither should you. You chose to give your time and your gifts to women and girls you may never meet, and that choice already tells me something about the leader you are. As {{RoleTitle}} in {{JurisdictionName}} you provide dependable support within your written delegation. Helping your Lead succeed, and keeping young members included and informed, is leadership in its most practical form. You are not serving alone. You have joined a family of leaders across Africa who are carrying this work with you, and headquarters stands behind you. Lead with integrity, serve with humility, and let the women who meet you leave stronger than they came. With appreciation and confidence in you,', false)
 on conflict (content_id) do update set body = excluded.body, role_title = excluded.role_title;

-- ---------------------------------------------------------------------------
-- The monthly card for the signed-in leader.
-- Released on the FIRST WEDNESDAY of the month and visible for the whole
-- month (Master §2). Role lens comes from her ACTIVE verified appointment at
-- delivery time (§7). One record per person per month (§11).
-- ---------------------------------------------------------------------------
create or replace function public.my_monthly_inspiration(p_any_day boolean default false)
returns jsonb language plpgsql
security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p profiles%rowtype; seat record;
  net text; role_code text; role_title text; lang text;
  first_wed date; abs_m int; mi monthly_inspiration%rowtype; lens_txt text;
begin
  if me is null then return null; end if;
  select * into p from profiles where id = me;
  if not found then return null; end if;

  -- first Wednesday of the current month
  first_wed := date_trunc('month', current_date)::date
             + ((3 - extract(isodow from date_trunc('month', current_date))::int + 7) % 7);
  if current_date < first_wed and not coalesce(p_any_day, false) then return null; end if;

  select ra.role::text as role, ou.name as unit_name into seat
    from role_assignments ra join org_units ou on ou.id = ra.org_unit_id
   where ra.profile_id = me and ra.ends_at is null
   order by case ra.role::text when 'country_rep' then 1 when 'deputy_country_rep' then 2 else 3 end
   limit 1;                                   -- §11: one push, primary appointment only
  if seat.role is null then return null; end if;

  net := coalesce(p.network::text, 'WGMN');
  role_code := seat.role;
  lang := coalesce(nullif(p.preferred_locale, ''), 'en');
  role_title := coalesce(public.role_title(role_code, net), 'volunteer leader');

  -- month 1 of the 60-month journey starts October 2026; it simply cycles on
  abs_m := 1 + (((extract(year from current_date)::int - 2026) * 12
              + extract(month from current_date)::int - 10) % 60);
  if abs_m < 1 then abs_m := abs_m + 60; end if;

  select * into mi from monthly_inspiration
   where abs_month = abs_m and publish_status in ('approved','published')
     and language = lang order by version desc limit 1;
  if not found then
    select * into mi from monthly_inspiration
     where abs_month = abs_m and publish_status in ('approved','published') and language = 'en'
     order by version desc limit 1;
  end if;
  if not found then return null; end if;

  select lens into lens_txt from monthly_role_lens
   where network = net and role = role_code and language = lang;
  if lens_txt is null then
    select lens into lens_txt from monthly_role_lens
     where network = net and role = role_code and language = 'en';
  end if;

  insert into hq_message_delivery (profile_id, message_id, network, version, channel)
  values (me, mi.content_id, net, mi.version, 'monthly')
  on conflict (profile_id, message_id, version, channel) do nothing;

  return jsonb_build_object(
    'content_id', mi.content_id, 'category', 'monthly_inspiration',
    'network', net, 'language', mi.language, 'role_title', role_title,
    'year_number', mi.year_number, 'month_number', mi.month_number,
    'month_label', to_char(current_date, 'FMMonth YYYY'),
    'greeting', case when lang = 'fr' then 'Chère ' || p.first_name || ',' else 'Dear ' || p.first_name || ',' end,
    'theme_title', mi.theme_title, 'core_message', mi.core_message,
    'network_lens', case when net = 'WNNN' then mi.wnnn_lens else mi.wgmn_lens end,
    'role_lens', lens_txt, 'reflection', mi.reflection,
    'closing', case when lang = 'fr' then 'Avec reconnaissance, le siège WODDI.' else 'With appreciation, WODDI HQ.' end,
    'image', '/assets/monthly/' || mi.image_slug || '.svg', 'image_alt', mi.image_alt,
    'released_on', first_wed);
end; $$;
revoke execute on function public.my_monthly_inspiration(boolean) from anon;

-- ---------------------------------------------------------------------------
-- The Founder's Welcome, shown once per appointment on first login (Brief §7).
-- ---------------------------------------------------------------------------
create or replace function public.my_founder_welcome()
returns jsonb language plpgsql
security definer set search_path = public as $$
declare
  me uuid := auth.uid(); p profiles%rowtype; seat record;
  net text; role_code text; lvl text; lang text; fw founder_welcome%rowtype; out_body text;
begin
  if me is null then return null; end if;
  select * into p from profiles where id = me;
  if not found or not coalesce(p.is_leader, false) then return null; end if;

  select ra.role::text as role, ra.org_unit_id, ou.name as unit_name into seat
    from role_assignments ra join org_units ou on ou.id = ra.org_unit_id
   where ra.profile_id = me and ra.ends_at is null
   order by case ra.role::text when 'country_rep' then 1 when 'deputy_country_rep' then 2 else 3 end
   limit 1;
  if seat.role is null then return null; end if;

  -- already seen for THIS appointment? then it is no longer the onboarding card
  if exists (select 1 from founder_welcome_view v
              where v.profile_id = me and v.role = seat.role
                and v.org_unit_id is not distinct from seat.org_unit_id) then
    return null;
  end if;

  net := coalesce(p.network::text, 'WGMN');
  role_code := seat.role;
  lang := coalesce(nullif(p.preferred_locale, ''), 'en');
  lvl := case role_code
           when 'country_rep' then 'country'
           when 'deputy_country_rep' then 'deputy_country'
           when 'state_coordinator' then 'state'
           when 'district_coordinator' then 'district'
           when 'cluster_coordinator' then 'cluster'
           when 'chapter_lead' then 'chapter'
           else 'assistant' end;

  select * into fw from founder_welcome
   where network = net and role_level = lvl and is_active and language = lang
   order by version desc limit 1;
  if not found then
    select * into fw from founder_welcome
     where network = net and role_level = lvl and is_active and language = 'en'
     order by version desc limit 1;
  end if;
  if not found then return null; end if;    -- nothing approved yet: show nothing

  out_body := replace(replace(replace(replace(replace(fw.body,
      '{{FirstName}}', p.first_name),
      '{{NetworkName}}', case when net = 'WNNN' then 'WODDI Nurture NextGen Network' else 'WODDI Good Mother Network' end),
      '{{RoleTitle}}', coalesce(public.role_title(role_code, net), fw.role_title)),
      '{{Country}}', coalesce(p.country, '')),
      '{{JurisdictionName}}', coalesce(seat.unit_name, p.state_region, p.country, ''));

  return jsonb_build_object('content_id', fw.content_id, 'title', fw.title, 'body', out_body,
    'founder_image', fw.founder_image, 'founder_name', fw.founder_name, 'founder_role', fw.founder_role,
    'network', net, 'role_title', coalesce(public.role_title(role_code, net), fw.role_title));
end; $$;
revoke execute on function public.my_founder_welcome() from anon;

create or replace function public.founder_welcome_seen(p_content_id text)
returns void language plpgsql security definer set search_path = public as $$
declare seat record;
begin
  if auth.uid() is null then return; end if;
  select ra.role::text as role, ra.org_unit_id into seat from role_assignments ra
   where ra.profile_id = auth.uid() and ra.ends_at is null
   order by case ra.role::text when 'country_rep' then 1 when 'deputy_country_rep' then 2 else 3 end limit 1;
  if seat.role is null then return; end if;
  insert into founder_welcome_view (profile_id, content_id, role, org_unit_id)
  values (auth.uid(), p_content_id, seat.role, seat.org_unit_id)
  on conflict do nothing;
end; $$;
revoke execute on function public.founder_welcome_seen(text) from anon;

insert into public.schema_migrations (version, name)
values (142, 'monthly_inspiration_and_founder_welcome') on conflict (version) do nothing;
