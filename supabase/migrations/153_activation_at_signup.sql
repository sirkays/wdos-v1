-- ============================================================================
-- WDOS Migration 153 — The activation is created AT SIGN-UP, server side (Phase 201)
-- Azeez, 18 Sep: a referred candidate ended up on the full member dashboard
-- with no activation. Cause: the activation was created by a second call from
-- the phone AFTER the account was created; on a slow connection that call
-- timed out or never ran, while the account and session already existed.
-- Now the referral form travels inside the sign-up itself and the database
-- creates the activation the instant the profile is created. No second call.
-- ============================================================================

-- 1. Internal: begin the referral route for a given profile (no auth check;
--    callers are the trigger below and begin_referral_activation).
create or replace function public.activation_begin_for(p_profile uuid, p_code text, p_form jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare l referral_links%rowtype; a candidate_activations%rowtype; s activation_settings%rowtype;
        p profiles%rowtype; app_id uuid; net text; pos text; unit uuid; iso char(2);
begin
  select * into l from referral_links where code = upper(p_code) and route = 'ref3' and active and (expires_at is null or expires_at > now());
  if not found then raise exception 'This referral link is not valid'; end if;
  select * into s from activation_settings where id = 1;
  select * into p from profiles where id = p_profile;
  if not found then raise exception 'Profile not found'; end if;
  net := coalesce(l.network::text, nullif(p_form->>'network',''), 'WGMN');
  pos := coalesce(nullif(p_form->>'position',''), l.role::text);
  begin unit := coalesce(nullif(p_form->>'unit_id','')::uuid, l.org_unit_id); exception when others then unit := l.org_unit_id; end;
  iso := upper(nullif(p_form->>'country_iso',''));
  update profiles set network = net::network_code, org_unit_id = coalesce(unit, org_unit_id),
         country = coalesce(nullif(p_form->>'country',''), country), state_region = coalesce(nullif(p_form->>'state',''), state_region),
         phone = coalesce(nullif(p_form->>'phone',''), phone),
         preferred_locale = coalesce(nullif(p_form->>'language',''), preferred_locale),
         referral_code = coalesce(referral_code, l.code), role_applied = coalesce(public.role_title(pos, net), role_applied), is_leader = false
   where id = p_profile;
  begin
    if nullif(p_form->>'birth_date','') is not null then update profiles set birth_date = (p_form->>'birth_date')::date where id = p_profile; end if;
  exception when others then null; end;
  select * into p from profiles where id = p_profile;
  select id into app_id from applications where lower(email) = lower(p.email) and status not in ('rejected','withdrawn') limit 1;
  if app_id is null then
    begin
      insert into applications (first_name, last_name, email, phone, network, org_unit_id, motivation, preferred_locale, referral_code, status, profile_id)
      values (p.first_name, p.last_name, p.email, case when p.phone ~ '^\+?[0-9 ()-]{7,20}$' then p.phone else null end, net::network_code,
              coalesce(unit, (select id from org_units where level = 'headquarters' order by created_at limit 1)),
              'Referred candidate: Referral Activation in progress.', coalesce(p.preferred_locale,'en'), l.code, 'submitted', p_profile)
      returning id into app_id;
    exception when others then app_id := null;   -- the application record is a convenience, never a blocker
    end;
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
end; $$;
revoke execute on function public.activation_begin_for(uuid, text, jsonb) from anon, authenticated;

-- 2. The signed-in call is now a thin wrapper (kept for the client fallback)
create or replace function public.begin_referral_activation(p_code text, p_form jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  perform public.activation_begin_for(auth.uid(), p_code, p_form);
  return public.my_activation();
end; $$;
revoke execute on function public.begin_referral_activation(text, jsonb) from anon;

-- 3. At sign-up: if the account carries a referral code, create the activation
--    the moment the profile exists. Runs AFTER the profile row is inserted.
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
      -- never block the account; the client fallback and the activation page retry it
      raise warning 'referral activation not created for %: %', new.email, sqlerrm;
    end;
  end if;
  return new;
end; $$;
drop trigger if exists profiles_referral_activation on public.profiles;
create trigger profiles_referral_activation after insert on public.profiles
  for each row execute function public.profile_referral_activation();

-- 4. Anyone who registered through a referral form but has no activation yet: create it now
do $$
declare r record;
begin
  for r in select p.id, p.referral_code from profiles p
            where p.referral_code in ('WGMN','WNNN','WODDI') and not exists (select 1 from candidate_activations a where a.profile_id = p.id)
  loop
    begin perform public.activation_begin_for(r.id, case when r.referral_code = 'WODDI' then 'WGMN' else r.referral_code end, '{}'::jsonb);
    exception when others then raise warning 'could not begin for %: %', r.id, sqlerrm; end;
  end loop;
end $$;

-- 5. The activation page can ask what the candidate's own record says
create or replace function public.my_candidate_state()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('is_leader', coalesce(p.is_leader,false), 'status', p.status::text, 'referral_code', p.referral_code, 'hq', p.hq_function is not null,
    'has_seat', exists (select 1 from role_assignments ra where ra.profile_id = p.id and ra.ends_at is null),
    'activation', (select jsonb_build_object('status', a.status, 'route', a.route, 'referral_code', a.referral_code,
                     'outcome', (select outcome from readiness_assessments where activation_id = a.id))
                   from candidate_activations a where a.profile_id = p.id and a.status <> 'closed' order by a.created_at desc limit 1))
  from profiles p where p.id = auth.uid();
$$;
revoke execute on function public.my_candidate_state() from anon;

-- 6. Confirm: who is seated at country level for Nigeria (the coordinator a
--    Nigerian candidate sees once her place is set). Expect the Country
--    Representative and Deputy on the Nigeria unit, not on WODDI HQ.
select ou.name as unit, ou.level::text, ra.role::text, p.first_name || ' ' || p.last_name as name, p.email
  from role_assignments ra join org_units ou on ou.id = ra.org_unit_id join profiles p on p.id = ra.profile_id
 where ra.ends_at is null and ra.role::text in ('country_rep','deputy_country_rep')
   and (ou.name = 'Nigeria' or ou.level = 'headquarters')
 order by ou.level, ra.role;

-- 7. Confirm: every referral registration now has an activation
select p.first_name || ' ' || p.last_name as name, p.email, p.referral_code, a.status, a.current_day, a.geo_country, a.geo_state
  from profiles p left join candidate_activations a on a.profile_id = p.id
 where p.referral_code in ('WGMN','WNNN','WODDI') order by p.created_at desc;

insert into public.schema_migrations (version, name) values (153, 'activation_at_signup') on conflict (version) do nothing;
