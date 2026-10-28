-- ============================================================================
-- WDOS Migration 130 — Volunteer Strategic Engagement & Retention engine
-- (Phase 168). From the founder's appendix: engagement must be SCHEDULED,
-- TRACKED, MEASURED and USED to support retention. HOFCO owns it; the
-- Secretary maintains the schedule and follow-up.
--   • engagement_items: the master engagement calendar (weekly inspiration,
--     monthly personal development, bi-monthly peer engagement, quarterly,
--     bi-annual, founder appreciation, recognition, pulse checks), with
--     network scope, due date, status Scheduled → Upcoming → Due → Completed
--     or Due → Missed → Follow-up required, evidence, action points.
--   • engagement_participation: who took part in which item (attendance /
--     participation / feedback), the record that feeds the analytics.
--   • engagement_followups: at-risk / inactive leaders under re-engagement
--     (opened by rule or by HOFCO), outcome recorded.
--   • engagement_status(): per seated leader: Active · Consistently engaged ·
--     Engagement declining · At risk · Inactive · Under re-engagement ·
--     Re-engaged, from sign-ins AND participation.
--   • engagement_overview(): the HQ view (totals, calendar, follow-ups,
--     by country / network / level, retention rate) and per-leader status.
--   • The recurring cadence is seeded for the next 26 weeks so the calendar
--     is not empty; HQ edits or adds items from the Engagement page.
-- ============================================================================

create table if not exists public.engagement_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('weekly_inspiration', 'monthly_development', 'bimonthly_peer', 'quarterly', 'biannual', 'founder_appreciation', 'recognition', 'pulse_check', 'birthday', 'milestone', 'meeting', 'other')),
  title text not null check (char_length(title) between 3 and 160),
  network public.network_code,                       -- null = both
  due_on date not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'upcoming', 'due', 'completed', 'missed', 'follow_up')),
  notes text, evidence_ref text, action_points text,
  created_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists engagement_items_due_idx on public.engagement_items (due_on, status);
alter table public.engagement_items enable row level security;
drop policy if exists engagement_items_read on public.engagement_items;
create policy engagement_items_read on public.engagement_items for select to authenticated using (true);
drop policy if exists engagement_items_hq on public.engagement_items;
create policy engagement_items_hq on public.engagement_items for all to authenticated using (public.is_case_hq()) with check (public.is_case_hq());

create table if not exists public.engagement_participation (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.engagement_items(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'participated' check (kind in ('invited', 'attended', 'participated', 'feedback')),
  note text, recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (item_id, profile_id, kind)
);
alter table public.engagement_participation enable row level security;
drop policy if exists engagement_participation_own on public.engagement_participation;
create policy engagement_participation_own on public.engagement_participation for all to authenticated
  using (profile_id = auth.uid() or public.is_case_hq()) with check (profile_id = auth.uid() or public.is_case_hq());

create table if not exists public.engagement_followups (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  opened_by uuid references public.profiles(id) on delete set null,
  reason text not null check (reason in ('declining', 'at_risk', 'inactive', 'support', 'other')),
  status text not null default 'open' check (status in ('open', 'in_progress', 're_engaged', 'exit', 'closed')),
  note text, outcome text, opened_at timestamptz not null default now(), closed_at timestamptz
);
alter table public.engagement_followups enable row level security;
drop policy if exists engagement_followups_hq on public.engagement_followups;
create policy engagement_followups_hq on public.engagement_followups for all to authenticated using (public.is_case_hq() or profile_id = auth.uid()) with check (public.is_case_hq());

-- seed the cadence for 26 weeks (idempotent on title+due date)
insert into public.engagement_items (kind, title, network, due_on)
select 'weekly_inspiration', 'Weekly inspiration & leadership message', null, d::date
  from generate_series(date_trunc('week', current_date)::date + 4, current_date + 182, interval '7 days') d
on conflict do nothing;
insert into public.engagement_items (kind, title, network, due_on)
select 'monthly_development', 'Monthly personal development (confidence, communication, leadership mindset, resilience …)', null, (date_trunc('month', d) + interval '14 days')::date
  from generate_series(date_trunc('month', current_date), current_date + 182, interval '1 month') d
on conflict do nothing;
insert into public.engagement_items (kind, title, network, due_on)
select 'bimonthly_peer', 'Bi-monthly peer engagement & connection', null, (date_trunc('month', d) + interval '24 days')::date
  from generate_series(date_trunc('month', current_date), current_date + 182, interval '2 months') d
on conflict do nothing;
insert into public.engagement_items (kind, title, network, due_on)
select 'founder_appreciation', 'Founder appreciation message', null, (date_trunc('month', d) + interval '1 day')::date
  from generate_series(date_trunc('month', current_date), current_date + 182, interval '1 month') d
on conflict do nothing;
insert into public.engagement_items (kind, title, network, due_on)
select 'pulse_check', 'Volunteer pulse check', null, (date_trunc('quarter', d) + interval '45 days')::date
  from generate_series(date_trunc('quarter', current_date), current_date + 182, interval '3 months') d
on conflict do nothing;
insert into public.engagement_items (kind, title, network, due_on)
select 'biannual', 'Bi-annual volunteer leadership engagement', null, d::date
  from (values (date_trunc('year', current_date) + interval '5 months'), (date_trunc('year', current_date) + interval '11 months')) v(d)
 where d::date >= current_date on conflict do nothing;

-- status rollover: scheduled → upcoming (14 days) → due (today) → missed (past, not completed)
create or replace function public.engagement_roll()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update engagement_items set status = 'upcoming' where status = 'scheduled' and due_on <= current_date + 14 and due_on > current_date;
  update engagement_items set status = 'due' where status in ('scheduled', 'upcoming') and due_on = current_date;
  update engagement_items set status = 'missed' where status in ('scheduled', 'upcoming', 'due') and due_on < current_date;
  get diagnostics n = row_count;
  return n;
end; $$;

create or replace function public.engagement_status(pid uuid)
returns text language sql stable security definer set search_path = public as $$
  with p as (select last_seen_at, created_at from profiles where id = pid),
  part as (select count(*) as n90, count(*) filter (where ep.created_at > now() - interval '30 days') as n30
             from engagement_participation ep where ep.profile_id = pid and ep.created_at > now() - interval '90 days'),
  fu as (select status from engagement_followups where profile_id = pid and status in ('open', 'in_progress') order by opened_at desc limit 1),
  re as (select status from engagement_followups where profile_id = pid and status = 're_engaged' and closed_at > now() - interval '90 days' limit 1)
  select case
    when (select status from fu) is not null then 'under_reengagement'
    when (select status from re) is not null then 're_engaged'
    when (select last_seen_at from p) > now() - interval '7 days' and (select n90 from part) >= 3 then 'consistent'
    when (select last_seen_at from p) > now() - interval '7 days' or (select n30 from part) > 0 then 'active'
    when (select last_seen_at from p) > now() - interval '30 days' then 'declining'
    when (select last_seen_at from p) > now() - interval '90 days' then 'at_risk'
    else 'inactive' end;
$$;

create or replace function public.engagement_overview(p_net text default 'all')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare net_filter public.network_code := case when upper(coalesce(p_net, 'all')) in ('WGMN', 'WNNN') then upper(p_net)::public.network_code else null end;
begin
  if not is_case_hq() then raise exception 'HQ only'; end if;
  return (
    with leaders as (
      select distinct p.id, p.first_name || ' ' || p.last_name as name, p.network, p.country, ra.role, ra.starts_at, p.last_seen_at, p.birth_date as birthday,
             engagement_status(p.id) as st
        from role_assignments ra join profiles p on p.id = ra.profile_id
       where ra.ends_at is null and ra.role in (select role from position_master) and (net_filter is null or p.network = net_filter))
    select jsonb_build_object(
      'generated_at', now(),
      'totals', (select jsonb_build_object('total', count(*),
          'new', count(*) filter (where starts_at > now() - interval '90 days'),
          'active', count(*) filter (where st in ('active', 'consistent')), 'consistent', count(*) filter (where st = 'consistent'),
          'declining', count(*) filter (where st = 'declining'), 'at_risk', count(*) filter (where st = 'at_risk'), 'inactive', count(*) filter (where st = 'inactive'),
          'under_reengagement', count(*) filter (where st = 'under_reengagement'), 're_engaged', count(*) filter (where st = 're_engaged'),
          'retention_rate', case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where st not in ('inactive')) / count(*)) end,
          'exited_90d', (select count(*) from role_assignments where ends_at > now() - interval '90 days' and role in (select role from position_master)),
          'support_open', (select count(*) from tickets where status in ('open', 'in_progress')),
          'birthdays_30d', count(*) filter (where birthday is not null and (to_char(birthday, 'MMDD') between to_char(current_date, 'MMDD') and to_char(current_date + 30, 'MMDD'))),
          'milestones_30d', count(*) filter (where starts_at is not null and (
               (starts_at + interval '3 months')::date between current_date and current_date + 30 or (starts_at + interval '6 months')::date between current_date and current_date + 30
            or (starts_at + interval '12 months')::date between current_date and current_date + 30 or (starts_at + interval '24 months')::date between current_date and current_date + 30)))
        from leaders),
      'calendar', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'title', e.title, 'network', e.network, 'due_on', e.due_on, 'status', e.status,
                        'participants', (select count(*) from engagement_participation x where x.item_id = e.id)) order by e.due_on), '[]'::jsonb)
                   from engagement_items e where e.due_on between current_date - 14 and current_date + 60 and (net_filter is null or e.network is null or e.network = net_filter)),
      'followups', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'profile_id', f.profile_id, 'name', l.name, 'country', l.country, 'reason', f.reason, 'status', f.status, 'opened_at', f.opened_at, 'note', f.note) order by f.opened_at desc), '[]'::jsonb)
                    from engagement_followups f join leaders l on l.id = f.profile_id where f.status in ('open', 'in_progress')),
      'by_country', (select coalesce(jsonb_agg(jsonb_build_object('country', c.country, 'total', c.total, 'engaged', c.engaged) order by c.total desc), '[]'::jsonb)
                     from (select country, count(*) as total, count(*) filter (where st in ('active', 'consistent', 're_engaged')) as engaged from leaders group by country) c),
      'by_level', (select coalesce(jsonb_agg(jsonb_build_object('role', r.role, 'total', r.total, 'engaged', r.engaged)), '[]'::jsonb)
                   from (select role, count(*) as total, count(*) filter (where st in ('active', 'consistent', 're_engaged')) as engaged from leaders group by role) r),
      'needs_followup', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'country', country, 'role', role, 'status', st, 'last_seen', last_seen_at) order by st, name), '[]'::jsonb)
                         from leaders where st in ('declining', 'at_risk', 'inactive') and id not in (select profile_id from engagement_followups where status in ('open', 'in_progress')))
    ));
end; $$;
revoke execute on function public.engagement_overview(text) from anon;

create or replace function public.engagement_followup_open(pid uuid, p_reason text, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if not is_case_hq() then raise exception 'HQ only'; end if;
  insert into engagement_followups (profile_id, opened_by, reason, note) values (pid, auth.uid(), p_reason, p_note) returning id into fid;
  return fid;
end; $$;
create or replace function public.engagement_followup_close(fid uuid, p_status text, p_outcome text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_case_hq() then raise exception 'HQ only'; end if;
  update engagement_followups set status = p_status, outcome = p_outcome, closed_at = case when p_status in ('re_engaged', 'exit', 'closed') then now() else null end where id = fid;
end; $$;
create or replace function public.engagement_item_set(p_id uuid, p_status text, p_notes text default null, p_evidence text default null, p_action text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_case_hq() then raise exception 'HQ only'; end if;
  update engagement_items set status = p_status, notes = coalesce(p_notes, notes), evidence_ref = coalesce(p_evidence, evidence_ref), action_points = coalesce(p_action, action_points),
         completed_at = case when p_status = 'completed' then now() else completed_at end where id = p_id;
end; $$;
create or replace function public.engagement_participate(p_item uuid, p_kind text default 'participated', p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into engagement_participation (item_id, profile_id, kind, note, recorded_by) values (p_item, auth.uid(), p_kind, p_note, auth.uid())
  on conflict (item_id, profile_id, kind) do update set note = excluded.note;
end; $$;
revoke execute on function public.engagement_followup_open(uuid, text, text) from anon;
revoke execute on function public.engagement_followup_close(uuid, text, text) from anon;
revoke execute on function public.engagement_item_set(uuid, text, text, text, text) from anon;
revoke execute on function public.engagement_participate(uuid, text, text) from anon;

-- daily rollover with the other sweeps
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('wdos-engagement-roll', '15 6 * * *', $c$ select public.engagement_roll(); $c$);
  end if;
exception when others then null; end $$;

insert into public.schema_migrations (version, name)
values (130, 'engagement_engine') on conflict (version) do nothing;
