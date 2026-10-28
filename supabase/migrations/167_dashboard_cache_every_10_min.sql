-- 167 (2 Oct 2026, APPLIED LIVE via the connector)
-- The HQ dashboard cache was rebuilt every 3 minutes around the clock (6
-- dashboards, ~11.5 s a run, 480 runs a day, ~92 minutes of database time
-- daily). Every 10 minutes now; readers accept a copy up to 10 minutes old.
select cron.alter_job((select jobid from cron.job where jobname = 'wdos_dashboard_cache'), schedule := '*/10 * * * *');
-- central_admin_cached and hofco_dashboard_cached: freshness '3 minutes' -> '10 minutes'
-- (full bodies as applied: see the live definitions; only the interval changed).
-- Optional, not applied (the drop kept waiting on a lock): drop index public.ccl_activation_idx;
-- (identical to candidate_comms_log_activation_idx, flagged by the performance advisor)
insert into public.schema_migrations (version, name) values (167, 'dashboard_cache_every_10_min') on conflict do nothing;
