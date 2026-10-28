-- 166 (2 Oct 2026, APPLIED LIVE via the connector)
-- Privileged (SECURITY DEFINER) functions with no caller check were executable
-- by anyone holding the public anon key (it ships in config.json). Found by the
-- Supabase security advisor (209 anon-executable definer functions) and a body
-- scan for caller checks (47 had none). Public-by-design ones (referral form,
-- claim, password reset, ID sign-in, geo lists) and the 6 used inside RLS
-- policies are left as they are.
do $$
declare f text;
begin
  -- A) internal helpers / sweeps: no page, policy or view calls them; only other
  --    definer functions (owned by postgres) and pg_cron (runs as postgres)
  foreach f in array array[
    'activation_auto_assess(uuid)', 'activation_begin_for(uuid, text, jsonb)', 'activation_weighted_score(uuid)',
    'administered_units_of(uuid)', 'advance_status_on_pass(uuid)', 'apply_leader_directory(uuid)',
    'dashboard_cache_refresh_all()', 'engagement_status(uuid)', 'level_terms_for(text)', 'member_stage(uuid)',
    'next_membership_no()', 'org_unit_ancestors(uuid)', 'rcfg(text)', 'readiness_rank_score(uuid)',
    'report_period(text, date)', 'report_snapshot(uuid, date, date, network_code)', 'report_supervisor(uuid, network_code)',
    'report_unit_for(uuid)', 'scheduled_registration_release()', 'try_finalize_activation(uuid)',
    'unit_chain(uuid)', 'weekly_pulse_required(uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  -- B) called by the app only when signed in: no anonymous access
  foreach f in array array[
    'directory_seat_target(text)', 'engagement_roll()', 'onboarding_evidence(uuid)', 'report_validate(uuid)',
    'reporting_reminders_run()', 'resolve_bulk_recipients(text, text, text, uuid)', 'task_batch_summary(uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
insert into public.schema_migrations (version, name) values (166, 'lock_unguarded_definer_functions') on conflict do nothing;
