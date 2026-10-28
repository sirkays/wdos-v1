-- ============================================================================
-- WDOS Migration 138 — Guided onboarding: read it, then move on (Phase 184)
-- Ticking a box proved nothing. Onboarding is now a progression: one step at
-- a time, the document opens inside the step, Next only becomes available
-- once the leader has actually reached the end of it and spent a sensible
-- minimum on the page, and the workspace gate lifts only when every required
-- step is finished.
--   • onboarding_steps gains doc_url (what to read), mode (read | visit |
--     declare) and min_seconds.
--   • onboarding_progress gains evidence: seconds_spent, reached_end, mode.
--   • complete_onboarding_step() refuses to record a 'read' step without the
--     evidence, so the record means something to HQ.
--   • onboarding_gate_open() — every required step done.
-- ============================================================================

alter table public.onboarding_steps add column if not exists doc_url text;
alter table public.onboarding_steps add column if not exists mode text not null default 'visit';
alter table public.onboarding_steps add column if not exists min_seconds int not null default 20;

alter table public.onboarding_progress add column if not exists seconds_spent int;
alter table public.onboarding_progress add column if not exists reached_end boolean;
alter table public.onboarding_progress add column if not exists mode text;

-- What each step is, and what counts as doing it.
update public.onboarding_steps set mode = 'read', doc_url = '/content/leadership-manual.html', min_seconds = 90 where code = 'role';
update public.onboarding_steps set mode = 'visit', min_seconds = 15 where code = 'reporting_line';
update public.onboarding_steps set mode = 'read', doc_url = '/content/leadership-manual.html', min_seconds = 60 where code = 'pack';
update public.onboarding_steps set mode = 'read', doc_url = '/content/code-of-conduct.html', min_seconds = 90 where code = 'conduct';
update public.onboarding_steps set mode = 'read', doc_url = '/content/volunteer-agreement.html', min_seconds = 60 where code = 'safeguarding';
update public.onboarding_steps set mode = 'read', doc_url = '/content/volunteer-agreement.html', min_seconds = 60 where code = 'confidentiality';
update public.onboarding_steps set mode = 'declare', min_seconds = 20 where code = 'coi';
update public.onboarding_steps set mode = 'read', doc_url = '/content/leadership-manual.html', min_seconds = 45 where code = 'protocol';
update public.onboarding_steps set mode = 'visit', min_seconds = 20 where code = 'templates';
update public.onboarding_steps set mode = 'visit', min_seconds = 30 where code = 'plan';

-- ---------------------------------------------------------------------------
-- Record a finished step, with its evidence.
-- ---------------------------------------------------------------------------
create or replace function public.complete_onboarding_step(
  p_code text, p_seconds int default 0, p_reached_end boolean default false, p_note text default null)
returns jsonb language plpgsql
security definer set search_path = public as $$
declare me uuid := auth.uid(); s onboarding_steps%rowtype;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select * into s from onboarding_steps where code = p_code and active;
  if not found then raise exception 'Unknown onboarding step'; end if;
  if s.mode = 'read' and (not coalesce(p_reached_end, false)
        or coalesce(p_seconds, 0) < greatest(10, s.min_seconds / 3)) then
    raise exception 'Please read to the end of the document before continuing';
  end if;
  insert into onboarding_progress (profile_id, step_code, seconds_spent, reached_end, mode, note)
  values (me, p_code, greatest(0, coalesce(p_seconds, 0)), coalesce(p_reached_end, false), s.mode, p_note)
  on conflict (profile_id, step_code) do update
     set seconds_spent = greatest(coalesce(onboarding_progress.seconds_spent, 0), excluded.seconds_spent),
         reached_end = onboarding_progress.reached_end or excluded.reached_end,
         mode = excluded.mode, note = coalesce(excluded.note, onboarding_progress.note);
  return public.onboarding_status(me);
end; $$;
revoke execute on function public.complete_onboarding_step(text, int, boolean, text) from anon;

-- ---------------------------------------------------------------------------
-- The gate: open only when every required step is finished.
-- ---------------------------------------------------------------------------
create or replace function public.onboarding_gate_open(pid uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from onboarding_steps s
     where s.active and s.required
       and not exists (select 1 from onboarding_progress op
                        where op.profile_id = coalesce(pid, auth.uid()) and op.step_code = s.code));
$$;
revoke execute on function public.onboarding_gate_open(uuid) from anon;

-- HQ: who is where, with the evidence (so "done" is auditable)
create or replace function public.onboarding_evidence(pid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', s.code, 'title', s.title, 'mode', s.mode, 'required', s.required,
           'done_at', op.done_at, 'seconds_spent', op.seconds_spent,
           'reached_end', op.reached_end) order by s.seq), '[]'::jsonb)
    from onboarding_steps s
    left join onboarding_progress op on op.step_code = s.code and op.profile_id = pid
   where s.active;
$$;
revoke execute on function public.onboarding_evidence(uuid) from anon;

-- ---------------------------------------------------------------------------
-- onboarding_status must now carry mode / doc_url / min_seconds so the reader
-- knows what each step is and what counts as finishing it.
-- -- redefines onboarding_status
-- ---------------------------------------------------------------------------
create or replace function public.onboarding_status(pid uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with target as (select coalesce(pid, auth.uid()) as id),
  steps as (select * from onboarding_steps where active order by seq)
  select jsonb_build_object(
    'total', (select count(*) from steps where required),
    'done', (select count(*) from onboarding_progress op join steps s on s.code = op.step_code
              where op.profile_id = (select id from target) and s.required),
    'gate_open', (select not exists (select 1 from steps s where s.required
                    and not exists (select 1 from onboarding_progress op
                                     where op.profile_id = (select id from target) and op.step_code = s.code))),
    'steps', (select coalesce(jsonb_agg(jsonb_build_object('code', s.code, 'seq', s.seq, 'title', s.title,
                'detail', s.detail, 'href', s.href, 'required', s.required,
                'mode', s.mode, 'doc_url', s.doc_url, 'min_seconds', s.min_seconds,
                'done_at', (select op.done_at from onboarding_progress op
                             where op.profile_id = (select id from target) and op.step_code = s.code),
                'seconds_spent', (select op.seconds_spent from onboarding_progress op
                             where op.profile_id = (select id from target) and op.step_code = s.code))
                order by s.seq), '[]'::jsonb) from steps s));
$$;
revoke execute on function public.onboarding_status(uuid) from anon;

insert into public.schema_migrations (version, name)
values (138, 'onboarding_reader') on conflict (version) do nothing;
