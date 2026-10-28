-- ============================================================================
-- WDOS Migration 126 — seat the listed leaders now, and hold the red names
-- (Phase 159). Runs seat_from_lists() (migration 122) as part of the file, so
-- the two founder lists become seats the moment this runs. Red names
-- (leader_directory.on_hold, set in 119) are not on the seating lists; any seat
-- one of them already holds from an earlier run is ended, and her profile is
-- marked so she gets no leader dashboard. Their logins remain until HQ decides
-- (Accounts → Suspend). The last statement shows the seating summary.
-- ============================================================================

-- 1. the red names hold no seat and no leader dashboard
update public.role_assignments ra set ends_at = now()
 where ra.ends_at is null
   and ra.profile_id in (select d.claimed_profile from public.leader_directory d where d.on_hold and d.claimed_profile is not null
                         union
                         select p.id from public.profiles p join public.leader_directory d on d.on_hold and lower(d.email) = lower(p.email));
update public.profiles p set is_leader = false
 where p.id in (select d.claimed_profile from public.leader_directory d where d.on_hold and d.claimed_profile is not null
                union
                select p2.id from public.profiles p2 join public.leader_directory d on d.on_hold and lower(d.email) = lower(p2.email));

insert into public.schema_migrations (version, name)
values (126, 'seat_lists_now') on conflict (version) do nothing;

-- 2. seat everyone on the two lists (idempotent) and show the summary
select public.seat_from_lists() as seating_summary;
