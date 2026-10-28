-- ============================================================================
-- WDOS Migration 170 — Profile form wipes: restore the lost values, and make
-- sure a person's own save can never blank them again (Phase 218)
--
-- What happened: until v78.0 (1-2 Sep 2026) the signed-in profile the app
-- loaded did not include country, state, position or LGA. The "Complete your
-- profile" form therefore opened with those boxes empty, and pressing Save
-- (even just to change a phone number) wrote the empty boxes over the real
-- values. v78.0 added country/state/position to the load, but never LGA, so
-- LGAs could still be wiped. The volunteer Profile tab had a second path: a
-- stored country that is not exactly one of the dropdown options showed as
-- "—" and was saved as empty.
--
-- Evidence (audit_log, self-saves): 70 position wipes, 50+ LGA, 60+ state and
-- 65 country wipes between 31 Jul and 2 Sep. Still blank on 3 Oct, with the
-- person's own earlier value in the history: 19 countries, 13 states,
-- 14 LGAs, 21 positions, across 32 people.
--
-- Part 1 restores the last value each person entered, from the audit row of
-- the save that wiped it, only where:
--   * the field is still empty today, and
--   * nothing has changed that field since the wipe, and
--   * (state) the country it was entered with is the person's country now,
--   * (LGA) the state it was entered with is the person's state now.
-- Part 2 adds a guard: when a person saves their OWN profile, an empty value
-- can no longer replace a filled position, phone, name, country, state or
-- LGA (state/LGA may still change together with their country/state).
-- HQ edits to other people's profiles are not affected.
-- ============================================================================

-- ---------------------------------------------------------------- Part 1
do $$
begin
  perform set_config('wdos.reason',
    'Phase 218: restored a value wiped by the profile form bug (from audit_log)', true);

  create temp table _restore on commit drop as
  with w as (
    select a.record_id, f, a.occurred_at, a.old_values,
           row_number() over (partition by a.record_id, f order by a.occurred_at desc) rn
      from public.audit_log a
     cross join unnest(array['country','state_region','lga','role_applied']) f
     where a.table_name = 'profiles' and a.action = 'UPDATE'
       and a.actor_id::text = a.record_id::text
       and coalesce(a.old_values->>f, '') <> ''
       and coalesce(a.new_values->>f, '') = '')
  select p.id as pid, w.f, w.old_values
    from w join public.profiles p on p.id::text = w.record_id
   where w.rn = 1 and p.merged_into is null
     and coalesce(to_jsonb(p)->>w.f, '') = ''
     and not exists (
       select 1 from public.audit_log b
        where b.table_name = 'profiles' and b.record_id = w.record_id
          and b.occurred_at > w.occurred_at
          and coalesce(b.old_values->>w.f, '') is distinct from coalesce(b.new_values->>w.f, ''));

  update public.profiles p set country = r.old_values->>'country'
    from _restore r
   where r.pid = p.id and r.f = 'country' and coalesce(p.country, '') = '';

  update public.profiles p set state_region = r.old_values->>'state_region'
    from _restore r
   where r.pid = p.id and r.f = 'state_region' and coalesce(p.state_region, '') = ''
     and coalesce(r.old_values->>'country', '') = coalesce(p.country, '');

  update public.profiles p set lga = r.old_values->>'lga'
    from _restore r
   where r.pid = p.id and r.f = 'lga' and coalesce(p.lga, '') = ''
     and coalesce(r.old_values->>'state_region', '') = coalesce(p.state_region, '');

  update public.profiles p set role_applied = r.old_values->>'role_applied'
    from _restore r
   where r.pid = p.id and r.f = 'role_applied' and coalesce(p.role_applied, '') = '';
end $$;

-- ---------------------------------------------------------------- Part 2
create or replace function public.profiles_keep_filled()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('wdos.system', true), '') in ('on', '1') then return new; end if;
  -- Only a person's own saves. HQ editing someone else is a deliberate act.
  if auth.uid() is null or auth.uid() <> old.id then return new; end if;

  if coalesce(new.first_name, '') = '' and coalesce(old.first_name, '') <> '' then new.first_name := old.first_name; end if;
  if coalesce(new.last_name, '')  = '' and coalesce(old.last_name, '')  <> '' then new.last_name  := old.last_name;  end if;
  if coalesce(new.phone, '')      = '' and coalesce(old.phone, '')      <> '' then new.phone      := old.phone;      end if;
  if coalesce(new.role_applied, '') = '' and coalesce(old.role_applied, '') <> '' then new.role_applied := old.role_applied; end if;
  if coalesce(new.country, '')    = '' and coalesce(old.country, '')    <> '' then new.country    := old.country;    end if;
  if coalesce(new.state_region, '') = '' and coalesce(old.state_region, '') <> ''
     and new.country is not distinct from old.country then
    new.state_region := old.state_region;
  end if;
  if coalesce(new.lga, '') = '' and coalesce(old.lga, '') <> ''
     and new.state_region is not distinct from old.state_region then
    new.lga := old.lga;
  end if;
  return new;
end; $$;

revoke all on function public.profiles_keep_filled() from public, anon, authenticated;

-- create or replace (no DROP): statements containing DROP are cancelled by the
-- connector, and this form is idempotent anyway.
set lock_timeout = '5s';
create or replace trigger profiles_keep_filled
  before update on public.profiles
  for each row execute function public.profiles_keep_filled();

insert into public.schema_migrations (version, name)
values (170, 'profile_form_wipes_restore_and_guard') on conflict (version) do nothing;
