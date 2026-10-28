-- ============================================================================
-- WDOS Migration 134 — Tasks & Follow-Up: bulk assignment, completion
-- requirements, evidence gate, Follow-Up Tracker, reminder sweep (Phase 174)
--
-- WHAT ALREADY EXISTED (006, 021, 025, 044) and is reused, not rebuilt:
--   tasks (single-assignee, status, priority, due_on, requires_approval),
--   the assignment-hierarchy authority (is_task_manager, administered_units),
--   the transition guard (tasks_guard/valid_task_transition), task_comments
--   with mentions and an automatic "status changed" activity trail, tags,
--   task_checklist_items, task_files (evidence/document attachments,
--   private storage bucket), task templates.
--
-- WHAT THIS MIGRATION ADDS, and only this:
--   1. tasks.batch_id + task_batches — one shared definition for a bulk
--      assignment ("September Country Leadership Coverage Report" to 25
--      Country Representatives), with N individual task rows underneath so
--      each recipient's status is tracked separately (spec §17, §33).
--   2. tasks.completion_requirements (mark_done / submit_response /
--      upload_evidence / upload_document, any combination) + response_text,
--      and a gate in tasks_guard(): a task cannot move to awaiting_review or
--      completed until what it asked for actually exists (spec §3, §6, §21).
--   3. resolve_bulk_recipients() — turns "WGMN Country Representatives" into
--      a list of people, for the assign-to-many screen (spec §17).
--   4. task_batch_summary() / my_task_batches() — per-recipient accountability
--      under one batch, every count clickable (spec §11, §33).
--   5. task_followup_tracker() — Needs Attention / Due Soon / Overdue /
--      Returned / Awaiting My Approval / No Activity, generated from task
--      data, nothing typed by hand (spec §12).
--   6. task_reminders_sent + task_reminder_sweep() — 72h / 24h / due-today /
--      overdue, each sent once (spec §14, §35), on the daily cron already
--      used by the other sweeps in this system.
--
-- NOT IN THIS MIGRATION, stated plainly: recurring task generation (§18),
-- task templates already existed and are unchanged; hierarchy-following
-- escalation beyond the existing "leaders over the unit see it" visibility
-- (§15); document co-editing/versioning beyond upload-review-reupload (§6);
-- HQ/HOFCO analytics screens beyond the Follow-Up Tracker and the batch
-- summary (§22, §23) — the queue counts already on the HOFCO screen (due
-- today/this week/overdue) come from the same tasks table and are accurate,
-- but the country/network/level breakdown screens are a further pass.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Bulk assignment
-- ---------------------------------------------------------------------------
create table if not exists public.task_batches (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(title) between 3 and 160),
  details       text check (details is null or char_length(details) <= 4000),
  created_by    uuid not null references public.profiles(id) default auth.uid(),
  created_at    timestamptz not null default now()
);
alter table public.tasks add column if not exists batch_id uuid references public.task_batches(id) on delete set null;
create index if not exists tasks_batch_idx on public.tasks (batch_id);
alter table public.task_batches enable row level security;
drop policy if exists task_batches_read on public.task_batches;
create policy task_batches_read on public.task_batches for select to authenticated
  using (created_by = auth.uid() or public.is_case_hq() or exists (select 1 from tasks t where t.batch_id = task_batches.id and t.org_unit_id in (select administered_units())));
drop policy if exists task_batches_write on public.task_batches;
create policy task_batches_write on public.task_batches for insert to authenticated with check (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Completion requirements + the gate
-- ---------------------------------------------------------------------------
alter table public.tasks add column if not exists completion_requirements text[] not null default '{}';
alter table public.tasks add column if not exists response_text text check (response_text is null or char_length(response_text) <= 4000);
alter table public.tasks drop constraint if exists tasks_completion_requirements_check;
alter table public.tasks add constraint tasks_completion_requirements_check
  check (completion_requirements <@ array['mark_done', 'submit_response', 'upload_evidence', 'upload_document']::text[]);

-- redefines tasks_guard: same authority and transition rules as migration
-- 006, plus the completion-requirement gate before awaiting_review/completed
create or replace function public.tasks_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare manager boolean; has_file boolean;
begin
  manager := is_task_manager(old);

  if not manager then
    if new.title is distinct from old.title
       or new.details is distinct from old.details
       or new.org_unit_id is distinct from old.org_unit_id
       or new.assigned_to is distinct from old.assigned_to
       or new.assigned_by is distinct from old.assigned_by
       or new.priority is distinct from old.priority
       or new.requires_approval is distinct from old.requires_approval
       or new.due_on is distinct from old.due_on then
      raise exception 'Only the assigner or a leader over this unit can edit task details';
    end if;
  end if;

  if new.status is distinct from old.status then
    if not valid_task_transition(old.status, new.status) then
      raise exception 'Invalid task transition: % -> %', old.status, new.status;
    end if;
    if new.status = 'completed' and old.requires_approval and not manager then
      raise exception 'This task requires approval: only the assigner or a leader can complete it';
    end if;
    if new.status = 'cancelled' and not manager then
      raise exception 'Only the assigner or a leader can cancel a task';
    end if;
    if old.status in ('completed','cancelled') and not manager then
      raise exception 'Only the assigner or a leader can reopen a task';
    end if;
    -- Phase 174: what the task asked for must exist before it can be marked
    -- done or sent for review.
    if new.status in ('awaiting_review', 'completed') then
      if 'submit_response' = any(old.completion_requirements) and coalesce(trim(new.response_text), '') = '' and coalesce(trim(old.response_text), '') = '' then
        raise exception 'This task asks for a written response before it can be submitted.';
      end if;
      if ('upload_evidence' = any(old.completion_requirements) or 'upload_document' = any(old.completion_requirements)) then
        select exists (select 1 from task_files f where f.task_id = old.id) into has_file;
        if not has_file then raise exception 'This task asks for a file to be attached before it can be submitted.'; end if;
      end if;
    end if;
    new.completed_at :=
      case when new.status = 'completed' then now() else null end;
  end if;

  return new;
end; $$;

-- ---------------------------------------------------------------------------
-- 3. Resolve a bulk recipient list from a simple selector
-- ---------------------------------------------------------------------------
create or replace function public.resolve_bulk_recipients(p_role text default null, p_net text default null, p_country text default null, p_unit uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.first_name || ' ' || p.last_name, 'role', ra.role, 'unit', o.name, 'country', p.country) order by p.country, p.last_name), '[]'::jsonb)
  from role_assignments ra join profiles p on p.id = ra.profile_id join org_units o on o.id = ra.org_unit_id
  where ra.ends_at is null
    and (p_role is null or ra.role::text = p_role)
    and (p_net is null or upper(p_net) = 'ALL' or p.network::text = upper(p_net))
    and (p_country is null or lower(coalesce(p.country, '')) = lower(p_country))
    and (p_unit is null or o.id = p_unit or o.id in (select sub.id from org_unit_subtree(p_unit) as sub(id)));
$$;
revoke execute on function public.resolve_bulk_recipients(text, text, text, uuid) from anon;

create or replace function public.hq_assign_task_bulk(
  p_title text, p_details text, p_priority public.task_priority, p_requires_approval boolean,
  p_due_on date, p_completion_requirements text[], p_recipients jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare bid uuid; rec jsonb; n int := 0; unit uuid;
begin
  if coalesce(trim(p_title), '') = '' then raise exception 'A task title is required'; end if;
  if jsonb_array_length(coalesce(p_recipients, '[]'::jsonb)) = 0 then raise exception 'Choose at least one recipient'; end if;
  insert into task_batches (title, details, created_by) values (p_title, p_details, auth.uid()) returning id into bid;
  for rec in select * from jsonb_array_elements(p_recipients) loop
    select org_unit_id into unit from profiles where id = (rec->>'id')::uuid;
    if unit is null then select id into unit from org_units where level = 'headquarters' limit 1; end if;
    if not (unit in (select administered_units()) or is_case_hq()) then continue; end if;
    insert into tasks (title, details, org_unit_id, assigned_to, assigned_by, priority, status, requires_approval, due_on, completion_requirements, batch_id)
    values (p_title, p_details, unit, (rec->>'id')::uuid, auth.uid(), p_priority, 'not_started', p_requires_approval, p_due_on, coalesce(p_completion_requirements, '{}'), bid);
    n := n + 1;
  end loop;
  if n = 0 then delete from task_batches where id = bid; raise exception 'None of the chosen recipients are within your authority to assign to'; end if;
  return jsonb_build_object('batch_id', bid, 'assigned', n);
end; $$;
revoke execute on function public.hq_assign_task_bulk(text, text, public.task_priority, boolean, date, text[], jsonb) from anon;

-- ---------------------------------------------------------------------------
-- 4. Batch accountability
-- ---------------------------------------------------------------------------
create or replace function public.task_batch_summary(p_batch uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'title', (select title from task_batches where id = p_batch),
    'created_at', (select created_at from task_batches where id = p_batch),
    'counts', jsonb_build_object(
      'total', count(*), 'not_started', count(*) filter (where t.status = 'not_started' and (t.due_on is null or t.due_on >= current_date)),
      'in_progress', count(*) filter (where t.status = 'in_progress'), 'awaiting_review', count(*) filter (where t.status = 'awaiting_review'),
      'completed', count(*) filter (where t.status = 'completed'), 'overdue', count(*) filter (where t.status not in ('completed', 'cancelled') and t.due_on < current_date)),
    'assignments', coalesce(jsonb_agg(jsonb_build_object('task_id', t.id, 'profile_id', p.id, 'name', p.first_name || ' ' || p.last_name, 'country', p.country,
        'status', t.status, 'due_on', t.due_on, 'overdue', t.status not in ('completed', 'cancelled') and t.due_on < current_date) order by p.country, p.last_name), '[]'::jsonb))
  from tasks t join profiles p on p.id = t.assigned_to where t.batch_id = p_batch;
$$;
revoke execute on function public.task_batch_summary(uuid) from anon;

create or replace function public.my_task_batches()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title, 'created_at', b.created_at,
      'total', x.n, 'completed', x.done, 'overdue', x.overdue) order by b.created_at desc), '[]'::jsonb)
  from task_batches b
  join lateral (select count(*) as n, count(*) filter (where status = 'completed') as done,
                       count(*) filter (where status not in ('completed', 'cancelled') and due_on < current_date) as overdue
                  from tasks where batch_id = b.id) x on true
  where b.created_by = auth.uid();
$$;
revoke execute on function public.my_task_batches() from anon;

-- ---------------------------------------------------------------------------
-- 5. Follow-Up Tracker
-- ---------------------------------------------------------------------------
create or replace function public.task_followup_tracker()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare mine uuid[];
begin
  select coalesce(array_agg(id), '{}') into mine from tasks t where t.assigned_by = auth.uid() or t.org_unit_id in (select administered_units()) or is_case_hq();
  return jsonb_build_object(
    'needs_attention', (select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
      select t.id, t.title, p.first_name || ' ' || p.last_name as who, t.due_on, t.status::text
        from tasks t join profiles p on p.id = t.assigned_to
       where t.id = any(mine) and t.status not in ('completed', 'cancelled')
         and (t.due_on < current_date + 3 or t.status = 'awaiting_review')
       order by t.due_on nulls last limit 30) x),
    'due_soon', (select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
      select t.id, t.title, p.first_name || ' ' || p.last_name as who, t.due_on
        from tasks t join profiles p on p.id = t.assigned_to
       where t.id = any(mine) and t.status not in ('completed', 'cancelled') and t.due_on between current_date and current_date + 3
       order by t.due_on limit 30) x),
    'overdue', (select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
      select t.id, t.title, p.first_name || ' ' || p.last_name as who, t.due_on, current_date - t.due_on as days_overdue
        from tasks t join profiles p on p.id = t.assigned_to
       where t.id = any(mine) and t.status not in ('completed', 'cancelled') and t.due_on < current_date
       order by t.due_on limit 30) x),
    'returned', (select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
      select t.id, t.title, p.first_name || ' ' || p.last_name as who, t.updated_at
        from tasks t join profiles p on p.id = t.assigned_to
       where t.id = any(mine) and t.status = 'in_progress' and exists (select 1 from task_comments c where c.task_id = t.id and c.body ilike 'returned%')
       order by t.updated_at desc limit 30) x),
    'awaiting_my_approval', (select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
      select t.id, t.title, p.first_name || ' ' || p.last_name as who, t.updated_at
        from tasks t join profiles p on p.id = t.assigned_to
       where t.id = any(mine) and t.status = 'awaiting_review' and (t.assigned_by = auth.uid() or t.org_unit_id in (select administered_units()))
       order by t.updated_at limit 30) x),
    'no_activity', (select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
      select t.id, t.title, p.first_name || ' ' || p.last_name as who, t.created_at
        from tasks t join profiles p on p.id = t.assigned_to
       where t.id = any(mine) and t.status = 'not_started' and t.created_at < now() - interval '3 days'
         and not exists (select 1 from task_comments c where c.task_id = t.id)
       order by t.created_at limit 30) x));
end; $$;
revoke execute on function public.task_followup_tracker() from anon;

-- ---------------------------------------------------------------------------
-- 6. Reminder sweep (72h / 24h / due-today / overdue, each sent once)
-- ---------------------------------------------------------------------------
create table if not exists public.task_reminders_sent (
  task_id uuid not null references public.tasks(id) on delete cascade,
  kind    text not null check (kind in ('72h', '24h', 'due_today', 'overdue')),
  sent_at timestamptz not null default now(),
  primary key (task_id, kind)
);
alter table public.task_reminders_sent enable row level security;
drop policy if exists task_reminders_sent_hq on public.task_reminders_sent;
create policy task_reminders_sent_hq on public.task_reminders_sent for select to authenticated using (is_case_hq());

create or replace function public.task_reminder_sweep()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; msg text; subj text;
begin
  for r in
    select t.*, p.first_name, p.email from tasks t join profiles p on p.id = t.assigned_to
     where t.status not in ('completed', 'cancelled') and t.due_on is not null
  loop
    if r.due_on = current_date + 3 and not exists (select 1 from task_reminders_sent where task_id = r.id and kind = '72h') then
      subj := format('Reminder: %s is due in 3 days', r.title); msg := format('Your task is due in 3 days: %s', r.title);
      insert into staff_messages (sender_id, recipient_id, body) select (select id from profiles where email = 'woddi.org@gmail.com' limit 1), r.assigned_to, msg where r.assigned_to is not null;
      begin perform send_email(r.email, r.first_name, subj, email_wrap(subj, msg)); exception when others then null; end;
      insert into task_reminders_sent (task_id, kind) values (r.id, '72h'); n := n + 1;
    elsif r.due_on = current_date + 1 and not exists (select 1 from task_reminders_sent where task_id = r.id and kind = '24h') then
      subj := format('Urgent: %s is due tomorrow', r.title); msg := format('Urgent: your task is due tomorrow: %s', r.title);
      insert into staff_messages (sender_id, recipient_id, body) select (select id from profiles where email = 'woddi.org@gmail.com' limit 1), r.assigned_to, msg where r.assigned_to is not null;
      begin perform send_email(r.email, r.first_name, subj, email_wrap(subj, msg)); exception when others then null; end;
      insert into task_reminders_sent (task_id, kind) values (r.id, '24h'); n := n + 1;
    elsif r.due_on = current_date and not exists (select 1 from task_reminders_sent where task_id = r.id and kind = 'due_today') then
      subj := format('Due today: %s', r.title); msg := format('Due today: %s', r.title);
      insert into staff_messages (sender_id, recipient_id, body) select (select id from profiles where email = 'woddi.org@gmail.com' limit 1), r.assigned_to, msg where r.assigned_to is not null;
      begin perform send_email(r.email, r.first_name, subj, email_wrap(subj, msg)); exception when others then null; end;
      insert into task_reminders_sent (task_id, kind) values (r.id, 'due_today'); n := n + 1;
    elsif r.due_on < current_date and not exists (select 1 from task_reminders_sent where task_id = r.id and kind = 'overdue') then
      subj := format('Overdue: %s', r.title); msg := format('This task is overdue: %s', r.title);
      insert into staff_messages (sender_id, recipient_id, body) select (select id from profiles where email = 'woddi.org@gmail.com' limit 1), r.assigned_to, msg where r.assigned_to is not null;
      begin perform send_email(r.email, r.first_name, subj, email_wrap(subj, msg)); exception when others then null; end;
      insert into task_reminders_sent (task_id, kind) values (r.id, 'overdue'); n := n + 1;
    end if;
  end loop;
  return n;
end; $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('wdos-task-reminders', '45 6 * * *', $c$ select public.task_reminder_sweep(); $c$);
  end if;
exception when others then null; end $$;

insert into public.schema_migrations (version, name)
values (134, 'task_bulk_followup_reminders') on conflict (version) do nothing;
