-- ============================================================================
-- WDOS Migration 154 — THE bug: the profile guard blocked every activation
-- (Phase 202). Plus an error log so nothing fails silently again.
--
-- Root cause (found by reading 001_identity_structure_audit.sql, trigger
-- profiles_guard): when the signed-in person updates her OWN profile and is
-- not HQ, changing network or org_unit_id raises "You may only edit your
-- contact details". activation_begin_for sets her org unit and network from
-- the form, so every call made under her own session was refused, from the
-- very first build of the referral route. The sign-up trigger path should
-- have avoided it, and if it also failed the failure was swallowed.
-- Fix: system code sets a transaction flag the guard honours, and every
-- failure is written to activation_errors and returned to the screen.
-- ============================================================================

-- 1. the guard lets system code through
create or replace function public.profiles_guard_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('wdos.system', true), '') = 'on' then return new; end if;
  if auth.uid() = old.id
     and not public.has_role(array['super_admin','executive_director','hq_team']::public.role_code[])
     and old.org_unit_id not in (select public.administered_units())
  then
    if new.status is distinct from old.status
       or new.network is distinct from old.network
       or new.org_unit_id is distinct from old.org_unit_id
       or new.membership_no is distinct from old.membership_no then
      raise exception 'You may only edit your contact details';
    end if;
  end if;
  return new;
end; $$;

-- 2. an error log HQ can read
create table if not exists public.activation_errors (
  id bigserial primary key, at timestamptz not null default now(),
  profile_id uuid, email text, stage text, code text, message text
);
alter table public.activation_errors enable row level security;
drop policy if exists ae_hq on public.activation_errors;
create policy ae_hq on public.activation_errors for select to authenticated using (public.is_case_hq());

-- 3. activation_begin_for: system flag on, and log on failure
create or replace function public.activation_begin_for(p_profile uuid, p_code text, p_form jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare l referral_links%rowtype; a candidate_activations%rowtype; s activation_settings%rowtype;
        p profiles%rowtype; app_id uuid; net text; pos text; unit uuid; iso char(2);
begin
  perform set_config('wdos.system', 'on', true);
  select * into l from referral_links where code = upper(p_code) and route = 'ref3' and active and (expires_at is null or expires_at > now());
  if not found then raise exception 'This referral link (%) is not valid', p_code; end if;
  select * into s from activation_settings where id = 1;
  select * into p from profiles where id = p_profile;
  if not found then raise exception 'Profile % not found', p_profile; end if;
  net := coalesce(l.network::text, nullif(p_form->>'network',''), 'WGMN');
  pos := coalesce(nullif(p_form->>'position',''), l.role::text);
  begin unit := coalesce(nullif(p_form->>'unit_id','')::uuid, l.org_unit_id); exception when others then unit := l.org_unit_id; end;
  iso := upper(nullif(p_form->>'country_iso',''));
  update profiles set network = net::network_code, org_unit_id = coalesce(unit, org_unit_id),
         country = coalesce(nullif(p_form->>'country',''), country), state_region = coalesce(nullif(p_form->>'state',''), state_region),
         referral_code = coalesce(referral_code, l.code), role_applied = coalesce(public.role_title(pos, net), role_applied), is_leader = false
   where id = p_profile;
  begin update profiles set phone = coalesce(nullif(p_form->>'phone',''), phone) where id = p_profile; exception when others then null; end;
  begin update profiles set preferred_locale = coalesce(nullif(p_form->>'language',''), preferred_locale) where id = p_profile; exception when others then null; end;
  begin if nullif(p_form->>'birth_date','') is not null then update profiles set birth_date = (p_form->>'birth_date')::date where id = p_profile; end if; exception when others then null; end;
  select * into p from profiles where id = p_profile;
  select id into app_id from applications where lower(email) = lower(p.email) and status not in ('rejected','withdrawn') limit 1;
  if app_id is null then
    begin
      insert into applications (first_name, last_name, email, phone, network, org_unit_id, motivation, preferred_locale, referral_code, status, profile_id)
      values (p.first_name, p.last_name, p.email, case when p.phone ~ '^\+?[0-9 ()-]{7,20}$' then p.phone else null end, net::network_code,
              coalesce(unit, (select id from org_units where level = 'headquarters' order by created_at limit 1)),
              'Referred candidate: Referral Activation in progress.', coalesce(p.preferred_locale,'en'), l.code, 'submitted', p_profile)
      returning id into app_id;
    exception when others then app_id := null; end;
  end if;
  insert into candidate_activations (profile_id, route, network, role, org_unit_id, referral_code, referrer_id, application_id, status, started_at, deadline, pack_version,
                                     position_code, geo_country, geo_state, geo_lga, geo_cluster, geo_country_iso, form_data, network_chosen, age_at_start)
  values (p_profile, 'ref3', net, pos, unit, l.code, l.owner_id, app_id, 'in_progress', now(), now() + make_interval(days => coalesce(s.ref3_days, 3)), 'CE-1.0',
          pos, p_form->>'country', p_form->>'state', p_form->>'lga', p_form->>'cluster', iso, coalesce(p_form, '{}'::jsonb), true, null)
  on conflict (profile_id, route) do update set
     status = case when candidate_activations.status = 'not_started' then 'in_progress' else candidate_activations.status end,
     network = excluded.network, position_code = coalesce(excluded.position_code, candidate_activations.position_code),
     geo_country = coalesce(excluded.geo_country, candidate_activations.geo_country), geo_state = coalesce(excluded.geo_state, candidate_activations.geo_state),
     geo_lga = coalesce(excluded.geo_lga, candidate_activations.geo_lga), geo_cluster = coalesce(excluded.geo_cluster, candidate_activations.geo_cluster),
     form_data = candidate_activations.form_data || excluded.form_data
  returning * into a;
  insert into candidate_activation_steps (activation_id, day, status, started_at) values (a.id, 1, 'in_progress', now()) on conflict do nothing;
exception when others then
  insert into activation_errors (profile_id, email, stage, code, message) values (p_profile, p.email, 'activation_begin_for', p_code, sqlerrm);
  raise;
end; $$;
revoke execute on function public.activation_begin_for(uuid, text, jsonb) from anon, authenticated;

-- 4. the sign-up trigger logs instead of swallowing
create or replace function public.profile_referral_activation()
returns trigger language plpgsql security definer set search_path = public as $$
declare meta jsonb; code text;
begin
  select u.raw_user_meta_data into meta from auth.users u where u.id = new.id;
  code := nullif(meta->>'referral_code', '');
  if code is not null then
    begin
      perform public.activation_begin_for(new.id, code, coalesce(meta->'referral_form', '{}'::jsonb));
    exception when others then
      insert into activation_errors (profile_id, email, stage, code, message) values (new.id, new.email, 'signup_trigger', code, sqlerrm);
    end;
  end if;
  return new;
end; $$;

-- 5. HQ can read the log
create or replace function public.hq_activation_errors(p_limit int default 50)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'email', e.email, 'stage', e.stage, 'code', e.code, 'message', e.message) order by e.at desc), '[]'::jsonb)
  from (select * from activation_errors order by at desc limit greatest(1, least(500, p_limit))) e where public.is_case_hq();
$$;
revoke execute on function public.hq_activation_errors(int) from anon;

-- 6. Now that the guard no longer blocks it: create the activation for every
--    referral registration that still has none, and show the result.
do $$
declare r record;
begin
  for r in select p.id, p.email, p.referral_code, u.raw_user_meta_data as meta
             from profiles p left join auth.users u on u.id = p.id
            where (p.referral_code in ('WGMN','WNNN','WODDI') or u.raw_user_meta_data->>'referral_code' is not null)
              and not exists (select 1 from candidate_activations a where a.profile_id = p.id)
  loop
    begin
      perform public.activation_begin_for(r.id, coalesce(nullif(r.meta->>'referral_code',''), case when r.referral_code = 'WODDI' then 'WGMN' else r.referral_code end), coalesce(r.meta->'referral_form', '{}'::jsonb));
    exception when others then null;   -- already logged by activation_begin_for
    end;
  end loop;
end $$;

select at, email, stage, code, message from activation_errors order by at desc limit 20;
select p.first_name || ' ' || p.last_name as name, p.email, p.referral_code, a.status, a.current_day, a.geo_country, a.geo_state, a.position_code
  from profiles p left join candidate_activations a on a.profile_id = p.id
 where p.referral_code in ('WGMN','WNNN','WODDI') or exists (select 1 from auth.users u where u.id = p.id and u.raw_user_meta_data->>'referral_code' is not null)
 order by p.created_at desc;

insert into public.schema_migrations (version, name) values (154, 'guard_bypass_and_error_log') on conflict (version) do nothing;
