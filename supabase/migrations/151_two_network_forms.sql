-- ============================================================================
-- WDOS Migration 151 — Two Referral Forms, one per network (Phase 199)
-- The Founder, 17 Sep 2026: "the Referral Activation has two separate
-- referral forms: WGMN Referral Form and WNNN Referral Form ... not merged".
--   woddicrm.org/#/join/WGMN   -> WGMN Referral Form, WGMN journey
--   woddicrm.org/#/join/WNNN   -> WNNN Referral Form, WNNN journey
-- The earlier single link (WODDI) is paused, not deleted: anyone who already
-- registered through it keeps her activation.
-- Age is no longer a criterion for either network.
-- ============================================================================
insert into public.referral_links (code, route, network, role, org_unit_id, owner_id, created_by, label, active, generic)
select 'WGMN', 'ref3', 'WGMN', null, null, null, null, 'WGMN Referral Form (Referral Activation)', true, true
where not exists (select 1 from public.referral_links where code = 'WGMN');
insert into public.referral_links (code, route, network, role, org_unit_id, owner_id, created_by, label, active, generic)
select 'WNNN', 'ref3', 'WNNN', null, null, null, null, 'WNNN Referral Form (Referral Activation)', true, true
where not exists (select 1 from public.referral_links where code = 'WNNN');
update public.referral_links set generic = true, active = true, role = null, org_unit_id = null where code in ('WGMN','WNNN');
update public.referral_links set active = false where code = 'WODDI';

-- the network comes from the link, never from age
create or replace function public.begin_referral_activation(p_code text, p_form jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); l referral_links%rowtype; a candidate_activations%rowtype; s activation_settings%rowtype;
        p profiles%rowtype; app_id uuid; net text; pos text; unit uuid; iso char(2);
begin
  if me is null then raise exception 'Not signed in'; end if;
  select * into l from referral_links where code = p_code and route = 'ref3' and active and (expires_at is null or expires_at > now());
  if not found then raise exception 'This referral link is not valid'; end if;
  select * into s from activation_settings where id = 1;
  select * into p from profiles where id = me;
  net := coalesce(l.network::text, nullif(p_form->>'network',''), 'WGMN');
  pos := coalesce(nullif(p_form->>'position',''), l.role::text);
  unit := coalesce(nullif(p_form->>'unit_id','')::uuid, l.org_unit_id);
  iso := upper(nullif(p_form->>'country_iso',''));
  update profiles set network = net::network_code, org_unit_id = coalesce(unit, org_unit_id),
         country = coalesce(nullif(p_form->>'country',''), country), state_region = coalesce(nullif(p_form->>'state',''), state_region),
         referral_code = coalesce(referral_code, l.code), role_applied = coalesce(public.role_title(pos, net), role_applied), is_leader = false
   where id = me;
  select id into app_id from applications where lower(email) = lower(p.email) and status not in ('rejected','withdrawn') limit 1;
  if app_id is null then
    insert into applications (first_name, last_name, email, phone, network, org_unit_id, motivation, preferred_locale, referral_code, status, profile_id)
    values (p.first_name, p.last_name, p.email, p.phone, net::network_code, unit, 'Referred candidate: Referral Activation in progress.', coalesce(p.preferred_locale,'en'), l.code, 'submitted', me)
    returning id into app_id;
  end if;
  insert into candidate_activations (profile_id, route, network, role, org_unit_id, referral_code, referrer_id, application_id, status, started_at, deadline, pack_version,
                                     position_code, geo_country, geo_state, geo_lga, geo_cluster, geo_country_iso, form_data, network_chosen, age_at_start)
  values (me, 'ref3', net, pos, unit, l.code, l.owner_id, app_id, 'in_progress', now(), now() + make_interval(days => s.ref3_days), 'CE-1.0',
          pos, p_form->>'country', p_form->>'state', p_form->>'lga', p_form->>'cluster', iso, p_form, true, null)
  on conflict (profile_id, route) do update set
     status = case when candidate_activations.status = 'not_started' then 'in_progress' else candidate_activations.status end,
     network = excluded.network, position_code = coalesce(excluded.position_code, candidate_activations.position_code),
     geo_country = coalesce(excluded.geo_country, candidate_activations.geo_country), geo_state = coalesce(excluded.geo_state, candidate_activations.geo_state),
     geo_lga = coalesce(excluded.geo_lga, candidate_activations.geo_lga), geo_cluster = coalesce(excluded.geo_cluster, candidate_activations.geo_cluster),
     form_data = candidate_activations.form_data || excluded.form_data
  returning * into a;
  insert into candidate_activation_steps (activation_id, day, status, started_at) values (a.id, 1, 'in_progress', now()) on conflict do nothing;
  return public.my_activation();
end; $$;
revoke execute on function public.begin_referral_activation(text, jsonb) from anon;

-- the master dashboard reports both forms
create or replace function public.hq_referral_forms()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', l.code, 'network', l.network, 'label', l.label, 'active', l.active,
      'visits', (select count(*) from referral_visits v where v.link_id = l.id),
      'visits_7d', (select count(*) from referral_visits v where v.link_id = l.id and v.visited_at >= now() - interval '7 days'),
      'visits_30d', (select count(*) from referral_visits v where v.link_id = l.id and v.visited_at >= now() - interval '30 days'),
      'last_visit', (select max(v.visited_at) from referral_visits v where v.link_id = l.id),
      'registrations', (select count(*) from candidate_activations a where a.referral_code = l.code),
      'in_progress', (select count(*) from candidate_activations a where a.referral_code = l.code and a.status = 'in_progress'),
      'completed', (select count(*) from candidate_activations a where a.referral_code = l.code and a.status = 'completed'))
    order by l.code), '[]'::jsonb)
  from referral_links l where l.code in ('WGMN','WNNN') and public.is_case_hq();
$$;
revoke execute on function public.hq_referral_forms() from anon;

-- Readiness check for existing users (Founder item 3): who cannot sign in, who has no seat
create or replace function public.hq_user_readiness()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'leaders_total', (select count(*) from profiles where is_leader),
    'leaders_without_login', (select count(*) from profiles p where p.is_leader and not exists (select 1 from auth.users u where u.id = p.id)),
    'leaders_without_seat', (select count(*) from profiles p where p.is_leader and not exists (select 1 from role_assignments ra where ra.profile_id = p.id and ra.ends_at is null)),
    'seated_without_leader_flag', (select count(*) from profiles p where not coalesce(p.is_leader,false) and exists (select 1 from role_assignments ra where ra.profile_id = p.id and ra.ends_at is null)),
    'never_signed_in', (select count(*) from profiles p join auth.users u on u.id = p.id where p.is_leader and u.last_sign_in_at is null),
    'problems', (select coalesce(jsonb_agg(jsonb_build_object('name', p.first_name || ' ' || p.last_name, 'email', p.email, 'country', p.country,
        'issue', case when u.id is null then 'no login' when not exists (select 1 from role_assignments ra where ra.profile_id = p.id and ra.ends_at is null) then 'no seat' else 'never signed in' end)
        order by p.country, p.last_name), '[]'::jsonb)
      from profiles p left join auth.users u on u.id = p.id
      where p.is_leader and (u.id is null or u.last_sign_in_at is null or not exists (select 1 from role_assignments ra where ra.profile_id = p.id and ra.ends_at is null))))
  where public.is_case_hq();
$$;
revoke execute on function public.hq_user_readiness() from anon;

insert into public.schema_migrations (version, name) values (151, 'two_network_forms') on conflict (version) do nothing;
