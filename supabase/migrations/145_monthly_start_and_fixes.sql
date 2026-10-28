-- ============================================================================
-- WDOS Migration 145 — Monthly inspiration starts at Month 1 (Phase 190)
-- September 2026 was resolving to Month 60 ("Carry the Work Forward", the
-- final month of Year 5) because the cycle was anchored to October 2026 and
-- wrapped backwards. Month 1 is now September 2026, the month it went live,
-- and the cycle only ever moves forward.
-- ============================================================================
create or replace function public.my_monthly_inspiration(p_any_day boolean default false)
returns jsonb language plpgsql
security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p profiles%rowtype; seat record;
  net text; role_code text; role_title text; lang text;
  first_wed date; abs_m int; mi monthly_inspiration%rowtype; lens_txt text;
begin
  if me is null then return null; end if;
  select * into p from profiles where id = me;
  if not found then return null; end if;

  first_wed := date_trunc('month', current_date)::date
             + ((3 - extract(isodow from date_trunc('month', current_date))::int + 7) % 7);
  if current_date < first_wed and not coalesce(p_any_day, false) then return null; end if;

  select ra.role::text as role, ou.name as unit_name into seat
    from role_assignments ra join org_units ou on ou.id = ra.org_unit_id
   where ra.profile_id = me and ra.ends_at is null
   order by case ra.role::text when 'country_rep' then 1 when 'deputy_country_rep' then 2 else 3 end
   limit 1;
  if seat.role is null then return null; end if;

  net := coalesce(p.network::text, 'WGMN');
  role_code := seat.role;
  lang := coalesce(nullif(p.preferred_locale, ''), 'en');
  role_title := coalesce(public.role_title(role_code, net), 'volunteer leader');

  -- Month 1 = September 2026. Months count forward from there and cycle after 60.
  abs_m := (extract(year from current_date)::int - 2026) * 12 + extract(month from current_date)::int - 9;
  if abs_m < 0 then abs_m := 0; end if;
  abs_m := (abs_m % 60) + 1;

  select * into mi from monthly_inspiration
   where abs_month = abs_m and publish_status in ('approved','published') and language = lang
   order by version desc limit 1;
  if not found then
    select * into mi from monthly_inspiration
     where abs_month = abs_m and publish_status in ('approved','published') and language = 'en'
     order by version desc limit 1;
  end if;
  if not found then return null; end if;

  select lens into lens_txt from monthly_role_lens where network = net and role = role_code and language = lang;
  if lens_txt is null then
    select lens into lens_txt from monthly_role_lens where network = net and role = role_code and language = 'en';
  end if;

  insert into hq_message_delivery (profile_id, message_id, network, version, channel)
  values (me, mi.content_id, net, mi.version, 'monthly')
  on conflict (profile_id, message_id, version, channel) do nothing;

  return jsonb_build_object(
    'content_id', mi.content_id, 'category', 'monthly_inspiration',
    'network', net, 'language', mi.language, 'role_title', role_title,
    'year_number', mi.year_number, 'month_number', mi.month_number,
    'month_label', to_char(current_date, 'FMMonth YYYY'),
    'greeting', case when lang = 'fr' then 'Chère ' || p.first_name || ',' else 'Dear ' || p.first_name || ',' end,
    'theme_title', mi.theme_title, 'core_message', mi.core_message,
    'network_lens', case when net = 'WNNN' then mi.wnnn_lens else mi.wgmn_lens end,
    'role_lens', lens_txt, 'reflection', mi.reflection,
    'closing', case when lang = 'fr' then 'Avec reconnaissance, le siège WODDI.' else 'With appreciation, WODDI HQ.' end,
    'image', '/assets/monthly/' || mi.image_slug || '.svg', 'image_alt', mi.image_alt,
    'released_on', first_wed);
end; $$;
revoke execute on function public.my_monthly_inspiration(boolean) from anon;

insert into public.schema_migrations (version, name) values (145, 'monthly_start_and_fixes') on conflict (version) do nothing;
