-- ============================================================================
-- 163  API surface hardening (applied LIVE on 27 Sep 2026, build v84.4).
--      Record only: already in the database. Idempotent if re-run.
--
--  Finding: 14 internal / scheduled SECURITY DEFINER functions carried the
--  default PUBLIC execute grant, so anyone holding the site's anon key could
--  call them through /rest/v1/rpc: send_email(), send_email_req(),
--  candidate_notify() (send any candidate any message), ensure_org_unit()
--  (create units), the sweeps and queue_push(). Cron runs as postgres and
--  other SECURITY DEFINER functions run as their owner, so revoking the API
--  roles changes nothing for the system itself.
--  Also: every hq_* function now refuses anon at the grant level (each still
--  checks is_case_hq() inside), trigger functions are not API-callable, and
--  the v84.4 helper functions have a fixed search_path.
-- ============================================================================
do $$
declare f text; r record;
begin
  foreach f in array array[
    'public.activation_daily_sweep()', 'public.activation_sweep()', 'public.anniversary_daily_sweep()',
    'public.candidate_notify(uuid, text, jsonb)', 'public.candidate_reminder_sweep()', 'public.comms_reconcile()',
    'public.email_recent_notices()', 'public.ensure_country_unit(text, text)', 'public.ensure_org_unit(uuid, org_level, text, character)',
    'public.queue_push(uuid, text, text, text)', 'public.run_daily_content()',
    'public.send_email(text, text, text, text)', 'public.send_email_req(text, text, text, text)', 'public.task_reminder_sweep()']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  -- HQ's manual "run automations now" (Settings, Ask) stays for signed-in users; never for anon
  revoke execute on function public.run_automations_guarded() from public, anon;
  grant execute on function public.run_automations_guarded() to authenticated;

  for r in select p.oid::regprocedure as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'hq\_%' and has_function_privilege('anon', p.oid, 'execute') loop
    execute format('revoke execute on function %s from public, anon', r.fn);
    execute format('grant execute on function %s to authenticated', r.fn);
  end loop;
  for r in select p.oid::regprocedure as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prorettype = 'trigger'::regtype loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.fn);
  end loop;
end $$;

-- Triggers fire regardless of EXECUTE privilege (verified live: 11 profile triggers
-- ran for role authenticated after the revoke). The auth hook keeps its explicit grant anyway.
grant execute on function public.handle_new_user() to supabase_auth_admin;

alter function public.step_has_activity(public.candidate_activation_steps) set search_path = public;
alter function public.email_problem(text) set search_path = public;
alter function public.name_key(text, text) set search_path = public;
alter function public.phone_key(text) set search_path = public;
alter function public.norm_name(text) set search_path = public, extensions;
alter function public.norm_name_core(text) set search_path = public, extensions;
alter function public.mailbox_side_of(text) set search_path = public;

insert into public.schema_migrations (version, name) values (163, 'internal_functions_not_public') on conflict do nothing;
