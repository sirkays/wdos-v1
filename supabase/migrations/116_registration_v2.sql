-- ============================================================================
-- WDOS Migration 116 — Registration form v2 (Phase 145)
--   • submit_volunteer_reg gains state, preferred language and referral code;
--     phone is now required (the founder: phone must not be optional).
--   • pending-photos bucket: the applicant's photo is stored at registration
--     (no login yet) under a hash of her email; the app moves it onto her
--     profile the first time she signs in.
--   • profiles_enrich_from_registration: when the login is created, country,
--     state and preferred language from the registration land on the profile
--     (handle_new_user copies only name, phone and network).
-- ============================================================================

-- redefines submit_volunteer_reg
drop function if exists public.submit_volunteer_reg(text, text, text, text, text, text);
create or replace function public.submit_volunteer_reg(
  p_full_name text, p_email text, p_phone text,
  p_network text, p_country text, p_about text,
  p_state text default null, p_locale text default null, p_ref text default null)
returns jsonb language plpgsql
security definer set search_path = public as $$
declare rid uuid; rref text;
begin
  if coalesce(trim(p_full_name), '') = '' then raise exception 'Your full name is required'; end if;
  if coalesce(trim(p_email), '') = '' or position('@' in p_email) = 0 then
    raise exception 'A valid email is required';
  end if;
  if length(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')) < 7 then
    raise exception 'A phone number is required';
  end if;
  if p_network not in ('WGMN', 'WNNN') then
    raise exception 'Select your age range so your network can be set';
  end if;
  insert into volunteer_applications
    (full_name, email, phone, network, country, payload)
  values
    (trim(p_full_name), lower(trim(p_email)), trim(p_phone),
     p_network::public.network_code, nullif(trim(p_country), ''),
     jsonb_build_object('about', coalesce(p_about, ''),
                        'state_region', nullif(trim(coalesce(p_state, '')), ''),
                        'preferred_locale', nullif(lower(trim(coalesce(p_locale, ''))), ''),
                        'referral_code', nullif(upper(trim(coalesce(p_ref, ''))), '')))
  returning id, ref_no into rid, rref;
  return jsonb_build_object('ok', true, 'ref', rref, 'network', p_network);
end; $$;
revoke all on function public.submit_volunteer_reg(text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_volunteer_reg(text, text, text, text, text, text, text, text, text) to anon, authenticated;

-- pending photos: applicant uploads before she has a login
insert into storage.buckets (id, name, public) values ('pending-photos', 'pending-photos', false)
on conflict (id) do nothing;
drop policy if exists pending_photos_insert on storage.objects;
create policy pending_photos_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'pending-photos' and name ~ '^[a-f0-9]{64}\.(jpg|jpeg|png|webp)$');
drop policy if exists pending_photos_read on storage.objects;
create policy pending_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'pending-photos');
drop policy if exists pending_photos_delete on storage.objects;
create policy pending_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'pending-photos');

-- carry country / state / language from the registration onto the new profile
create or replace function public.profiles_enrich_from_registration()
returns trigger language plpgsql security definer set search_path = public as $$
declare vol record;
begin
  select * into vol from volunteer_applications
   where lower(email) = lower(new.email) order by created_at desc limit 1;
  if vol.id is not null then
    update profiles set
      country = coalesce(country, vol.country),
      state_region = coalesce(state_region, vol.payload->>'state_region'),
      preferred_locale = coalesce(nullif(vol.payload->>'preferred_locale', ''), preferred_locale),
      referral_code = coalesce(referral_code, vol.payload->>'referral_code')
    where id = new.id;
  end if;
  return new;
end; $$;
drop trigger if exists profiles_enrich_from_registration on public.profiles;
create trigger profiles_enrich_from_registration after insert on public.profiles
  for each row execute function public.profiles_enrich_from_registration();

insert into public.schema_migrations (version, name)
values (116, 'registration_v2') on conflict (version) do nothing;
