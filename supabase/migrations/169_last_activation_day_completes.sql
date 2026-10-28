-- 169 (2 Oct 2026, APPLIED LIVE via the connector)
-- "Remove the gate from Day 3" (Regina). The last day of an activation (ref3
-- Day 3, open7 Day 7: Service Readiness & Assessment) could never be
-- completed: save_activation_day validated it and opened the readiness
-- assessment but left the day 'in_progress'. The activation page shows the
-- first day that is not completed, so the candidate got Day 3 again on every
-- Next and never reached the assessment that finishes the programme.
-- Change in save_activation_day (full body as applied lives in the database):
--   after the checks pass, for EVERY day (the last one included):
--   update candidate_activation_steps set status = 'completed',
--          completed_at = coalesce(completed_at, now())
--    where activation_id = a.id and day = p_day;
-- Repair of candidates already stuck (they passed the checks: the readiness
-- row is only created after them):
update candidate_activation_steps s set status = 'completed', completed_at = coalesce(s.completed_at, now())
  from candidate_activations a
 where s.activation_id = a.id and s.status <> 'completed'
   and s.day = (select max(d.day) from activation_route_days d where d.route = a.route)
   and exists (select 1 from readiness_assessments r where r.activation_id = a.id);
insert into public.schema_migrations (version, name) values (169, 'last_activation_day_completes') on conflict do nothing;
