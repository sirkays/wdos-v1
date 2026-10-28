-- ============================================================================
-- WDOS Migration 144 — State Secretary: position, title, and the first account
-- RUN AFTER 143 HAS COMPLETED.
--   • position_master: state_secretary at state_region level, rank 3
--   • role_title(): Secretary titles for both networks
--   • first account: Chukwuemeka Okwah, WGMN, Secretary, Imo State
-- ============================================================================

insert into public.position_master (role, level, rank, seq)
values ('state_secretary', 'state_region', 3, 41)
on conflict (role) do nothing;

create or replace function public.role_title(p_role text, p_net text)
returns text language sql immutable as $$
  select case p_role
    when 'country_rep' then case when p_net = 'WNNN' then 'Country Lead' else 'Country Representative' end
    when 'deputy_country_rep' then case when p_net = 'WNNN' then 'Deputy Country Lead' else 'Deputy Country Representative' end
    when 'state_coordinator' then case when p_net = 'WNNN' then 'State or Regional Lead' else 'State or Regional Coordinator' end
    when 'assistant_state_coordinator' then case when p_net = 'WNNN' then 'Assistant State or Regional Lead' else 'Assistant State or Regional Coordinator' end
    when 'state_secretary' then case when p_net = 'WNNN' then 'State or Regional Secretary' else 'State Secretary' end
    when 'district_coordinator' then case when p_net = 'WNNN' then 'LGA, District or Municipality Lead' else 'LGA, District or Municipality Coordinator' end
    when 'assistant_district_coordinator' then case when p_net = 'WNNN' then 'Assistant LGA, District or Municipality Lead' else 'Assistant LGA, District or Municipality Coordinator' end
    when 'cluster_coordinator' then case when p_net = 'WNNN' then 'Community Cluster or Ward Lead' else 'Community Cluster or Ward Coordinator' end
    when 'assistant_cluster_coordinator' then case when p_net = 'WNNN' then 'Assistant Community Cluster or Ward Lead' else 'Assistant Community Cluster or Ward Coordinator' end
    when 'chapter_lead' then case when p_net = 'WNNN' then 'Chapter Lead' else 'Chapter Coordinator' end
    when 'assistant_chapter_lead' then case when p_net = 'WNNN' then 'Assistant Chapter Lead' else 'Assistant Chapter Coordinator' end
    else null end;
$$;

-- The Secretary receives the same weekly ACT line as the Assistant State
-- Coordinator (delegated, state-level, reports to the Coordinator).
insert into public.hq_message_inserts (message_id, network, role, language, insert_text)
select message_id, network, 'state_secretary', language, insert_text
  from public.hq_message_inserts where role = 'assistant_state_coordinator'
on conflict (message_id, network, role, language) do nothing;
insert into public.monthly_role_lens (network, role, language, lens)
select network, 'state_secretary', language, lens
  from public.monthly_role_lens where role = 'assistant_state_coordinator'
on conflict (network, role, language) do nothing;

-- ---------------------------------------------------------------------------
-- The first State Secretary: Chukwuemeka Okwah, WGMN, Imo State.
-- Creates the login, the profile, the leadership flag and the seat.
-- Temporary password: WqZ4hOUnFx9e   (he must change it at first sign in)
-- ---------------------------------------------------------------------------
do $$
declare
  v_email text := 'chukwuemeka9okwah@yahoo.co.uk';
  v_pw    text := 'WqZ4hOUnFx9e';
  v_uid   uuid;
  v_imo   uuid;
  v_ng    uuid;
begin
  select id into v_ng from org_units where level = 'country' and name = 'Nigeria' limit 1;
  select id into v_imo from org_units where level = 'state_region' and name = 'Imo' and parent_id = v_ng limit 1;
  if v_imo is null then raise exception 'Imo state unit not found under Nigeria'; end if;

  select id into v_uid from auth.users where lower(email) = v_email;
  if v_uid is null then
    v_uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
      crypt(v_pw, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('first_name', 'Chukwuemeka', 'last_name', 'Okwah'),
      now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_uid, v_uid::text,
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
  else
    update auth.users set encrypted_password = crypt(v_pw, gen_salt('bf')), updated_at = now() where id = v_uid;
  end if;

  -- profile (the sign-up trigger may already have created it, as 'applicant')
  insert into public.profiles (id, first_name, last_name, email, network, status)
  values (v_uid, 'Chukwuemeka', 'Okwah', v_email, 'WGMN', 'activated')
  on conflict (id) do nothing;
  update public.profiles
     set first_name = 'Chukwuemeka', last_name = 'Okwah', network = 'WGMN',
         country = 'Nigeria', state_region = 'Imo', org_unit_id = v_imo,
         role_applied = 'State Secretary', is_leader = true, preferred_locale = 'en'
   where id = v_uid;
  -- status must walk the lifecycle guard: applicant -> under_review -> approved -> activated
  update public.profiles set status = 'under_review' where id = v_uid and status = 'applicant';
  update public.profiles set status = 'approved'     where id = v_uid and status = 'under_review';
  update public.profiles set status = 'activated'    where id = v_uid and status = 'approved';

  -- seat: State Secretary at Imo (one open seat per person, so close any other open one first)
  update public.role_assignments set ends_at = now()
   where profile_id = v_uid and ends_at is null and not (role = 'state_secretary' and org_unit_id = v_imo);
  insert into public.role_assignments (profile_id, role, org_unit_id, appointment_status)
  select v_uid, 'state_secretary', v_imo, 'appointed'
   where not exists (select 1 from public.role_assignments
                      where profile_id = v_uid and role = 'state_secretary' and org_unit_id = v_imo and ends_at is null);
end $$;

-- confirm
select (p.first_name || ' ' || p.last_name) as name, p.email, p.is_leader, ra.role, ou.name as seat
  from public.profiles p
  join public.role_assignments ra on ra.profile_id = p.id and ra.ends_at is null
  join public.org_units ou on ou.id = ra.org_unit_id
 where lower(p.email) = 'chukwuemeka9okwah@yahoo.co.uk';

insert into public.schema_migrations (version, name) values (143, 'state_secretary_role') on conflict (version) do nothing;
insert into public.schema_migrations (version, name) values (144, 'state_secretary_seat_and_first_account') on conflict (version) do nothing;
