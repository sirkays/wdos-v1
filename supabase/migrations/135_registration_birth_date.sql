-- ============================================================================
-- WDOS Migration 135 — Date of birth on registration (Phase 174)
-- The birthday-greeting automation (built in 032) has been unable to fire
-- for almost anyone: neither the registration form nor the HQ contact lists
-- ever captured a date of birth. This adds it to the registration RPC (form
-- change follows in the app) and carries it onto the new profile exactly as
-- country/state/locale already are.
-- -- redefines submit_volunteer_reg
-- -- redefines profiles_enrich_from_registration
-- ============================================================================

drop function if exists public.submit_volunteer_reg(text, text, text, text, text, text, text, text, text);
create or replace function public.submit_volunteer_reg(
  p_full_name text, p_email text, p_phone text,
  p_network text, p_country text, p_about text,
  p_state text default null, p_locale text default null, p_ref text default null,
  p_birth_date date default null)
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
  if p_birth_date is not null and p_birth_date > current_date - interval '15 years' then
    raise exception 'Please check the date of birth entered';
  end if;
  insert into volunteer_applications
    (full_name, email, phone, network, country, payload)
  values
    (trim(p_full_name), lower(trim(p_email)), trim(p_phone),
     p_network::public.network_code, nullif(trim(p_country), ''),
     jsonb_build_object('about', coalesce(p_about, ''),
                        'state_region', nullif(trim(coalesce(p_state, '')), ''),
                        'preferred_locale', nullif(lower(trim(coalesce(p_locale, ''))), ''),
                        'referral_code', nullif(upper(trim(coalesce(p_ref, ''))), ''),
                        'birth_date', to_jsonb(p_birth_date)))
  returning id, ref_no into rid, rref;
  return jsonb_build_object('ok', true, 'ref', rref, 'network', p_network);
end; $$;
revoke all on function public.submit_volunteer_reg(text, text, text, text, text, text, text, text, text, date) from public;
grant execute on function public.submit_volunteer_reg(text, text, text, text, text, text, text, text, text, date) to anon, authenticated;

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
      referral_code = coalesce(referral_code, vol.payload->>'referral_code'),
      birth_date = coalesce(birth_date, nullif(vol.payload->>'birth_date', 'null')::date)
    where id = new.id;
  end if;
  return new;
end; $$;

-- HQ can set a birth date on an existing leader (Accounts → Edit details)
create or replace function public.hq_set_birth_date(pid uuid, d date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_case_hq() then raise exception 'HQ only'; end if;
  if d is not null and d > current_date - interval '15 years' then raise exception 'Please check the date entered'; end if;
  update profiles set birth_date = d where id = pid;
end; $$;
revoke execute on function public.hq_set_birth_date(uuid, date) from anon;

insert into public.schema_migrations (version, name)
values (135, 'registration_birth_date') on conflict (version) do nothing;
