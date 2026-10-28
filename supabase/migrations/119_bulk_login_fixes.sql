-- ============================================================================
-- WDOS Migration 119 — fixes from the 9 Sep bulk-login run (Phase 151)
--   • Matching ran past the API statement timeout with 508 accounts: both
--     contact appliers now prefilter cheaply (email, then a name-word
--     position test) before the regex-based name_match, and raise their own
--     statement timeout to 120 s for the transaction.
--   • directory_seat_target: country aliases (DR Congo / Democratic Republic of
--     the Congo, Gambia / The Gambia, Côte d'Ivoire / Cote d'Ivoire ...) and the
--     state derived from the member code (SC-OYO → Oyo) when the row has none.
--   • leader_directory.on_hold: the founder's red names are held; the bulk
--     login step skips them. Accounts list exposes state, on_hold, appointed_on.
-- ============================================================================

create or replace function public.norm_country(s text) returns text
language sql immutable as $$
  select case
    when lower(coalesce(s, '')) ~ 'democratic|drc|kinshasa|dr congo' then 'cd'
    when lower(coalesce(s, '')) ~ '^(the )?republic of (the )?congo|brazzaville|^congo$' then 'cg'
    when lower(coalesce(s, '')) ~ 'gambia' then 'gm'
    when lower(coalesce(s, '')) ~ 'ivoire|ivory' then 'ci'
    when lower(coalesce(s, '')) ~ 'cabo verde|cape verde' then 'cv'
    when lower(coalesce(s, '')) ~ 'eswatini|swaziland' then 'sz'
    when lower(coalesce(s, '')) ~ 'tanzania' then 'tz'
    when lower(coalesce(s, '')) ~ 'sao tome|são tomé' then 'st'
    when lower(coalesce(s, '')) ~ 'central african' then 'cf'
    when lower(coalesce(s, '')) ~ 'south africa' then 'za'
    when lower(coalesce(s, '')) ~ 'south sudan' then 'ss'
    when lower(coalesce(s, '')) ~ 'guinea-bissau|guinea bissau' then 'gw'
    when lower(coalesce(s, '')) ~ 'equatorial' then 'gq'
    else regexp_replace(lower(coalesce(s, '')), '[^a-z]', '', 'g') end;
$$;

alter table public.leader_directory add column if not exists on_hold boolean not null default false;
update public.leader_directory set on_hold = true
 where lower(coalesce(email, '')) in ('bizonzi.prinelly@gmail.com', 'safaehcm@gmail.com', 'mukanzayiturikii@gmail.com', 'florenceumutoni2000@gmail.com', 'dapenkande@gmail.com', 'bensaadnesrineselima@gmail.com', 'nadiathligene@gmail.com', 'estkoue@yahoo.fr')
    or exists (select 1 from unnest(array['Bizonzi Prinelly Sergie Bonnel', 'Safaa Hachimi', 'Irene Mukanzayituriki', 'Florence Umutoni', 'Penda Kande', 'Nesrine Ben Saad', 'Nadia Thligene', 'SANOU Kouessessra Esther']) n where name_match(n, first_name || ' ' || last_name));

-- redefines register_contacts_apply
create or replace function public.register_contacts_apply()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; n_new int := 0; n_upd int := 0; n_prof int := 0; c text; code text; parts text[]; pid uuid; dcode text; w text;
begin
  if auth.uid() is not null and not is_case_hq() then raise exception 'HQ only'; end if;
  perform set_config('statement_timeout', '120s', true);
  for r in select * from leader_contacts order by id loop
    w := lower(split_part(r.full_name, ' ', 1));
    select p.id into pid from profiles p where p.merged_into is null
      and ((r.email is not null and lower(p.email) = r.email)
           or (position(w in lower(p.first_name || ' ' || p.last_name)) > 0 and norm_country(coalesce(p.country, r.country)) = norm_country(r.country)
               and name_match(r.full_name, p.first_name || ' ' || p.last_name))) limit 1;
    if pid is not null then
      update profiles set phone = coalesce(phone, r.phone) where id = pid;
      update leader_contacts set matched_profile = pid, applied_at = now() where id = r.id;
      n_prof := n_prof + 1; continue;
    end if;
    select d.member_code into dcode from leader_directory d where d.claimed_profile is null
      and ((r.email is not null and lower(coalesce(d.email, '')) = r.email)
           or (position(w in lower(d.first_name || ' ' || d.last_name)) > 0 and name_match(r.full_name, d.first_name || ' ' || d.last_name))) limit 1;
    if dcode is not null then
      update leader_directory set email = coalesce(email, r.email), phone = coalesce(phone, r.phone) where member_code = dcode;
      update leader_contacts set applied_code = dcode, applied_at = now() where id = r.id;
      n_upd := n_upd + 1; continue;
    end if;
    parts := string_to_array(r.full_name, ' ');
    code := case r.role when 'country_rep' then 'CR-' when 'deputy_country_rep' then 'DCR-' else 'SC-' end || r.country_iso;
    c := code;
    while exists (select 1 from leader_directory where member_code = c) loop c := code || '-' || (floor(random() * 90) + 10)::int; end loop;
    insert into leader_directory (member_code, first_name, last_name, email, phone, country, role_applied, sent_at)
    values (c, parts[1], array_to_string(parts[2:], ' '), r.email, r.phone, r.country,
            case r.role when 'country_rep' then 'Country Representative' when 'deputy_country_rep' then 'Deputy Country Representative' else 'Regional Coordinator' end, now());
    update leader_contacts set applied_code = c, applied_at = now() where id = r.id;
    n_new := n_new + 1;
  end loop;
  return jsonb_build_object('already_with_login', n_prof, 'directory_updated', n_upd, 'directory_added', n_new);
end; $$;
revoke execute on function public.register_contacts_apply() from anon;

-- redefines register_contacts_ng_apply
create or replace function public.register_contacts_ng_apply()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; n_new int := 0; n_upd int := 0; n_prof int := 0; c text; code text; parts text[]; pid uuid; dcode text; w text;
begin
  if auth.uid() is not null and not is_case_hq() then raise exception 'HQ only'; end if;
  perform set_config('statement_timeout', '120s', true);
  for r in select * from leader_contacts_ng order by id loop
    w := lower(split_part(r.full_name, ' ', 1));
    select p.id into pid from profiles p where p.merged_into is null
      and ((r.email is not null and lower(p.email) = r.email)
           or (position(w in lower(p.first_name || ' ' || p.last_name)) > 0 and lower(coalesce(p.country, 'nigeria')) = 'nigeria'
               and name_match(r.full_name, p.first_name || ' ' || p.last_name))) limit 1;
    if pid is not null then
      update profiles set phone = coalesce(phone, r.phone), state_region = coalesce(state_region, r.state) where id = pid;
      update leader_contacts_ng set matched_profile = pid, applied_at = now() where id = r.id;
      n_prof := n_prof + 1; continue;
    end if;
    select d.member_code into dcode from leader_directory d where d.claimed_profile is null
      and ((r.email is not null and lower(coalesce(d.email, '')) = r.email)
           or (position(w in lower(d.first_name || ' ' || d.last_name)) > 0
               and (d.state is null or norm_state(d.state) = norm_state(r.state))
               and name_match(r.full_name, d.first_name || ' ' || d.last_name))) limit 1;
    if dcode is not null then
      update leader_directory set email = coalesce(email, r.email), phone = coalesce(phone, r.phone),
             state = coalesce(state, r.state), appointed_on = coalesce(appointed_on, r.appointed_on) where member_code = dcode;
      update leader_contacts_ng set applied_code = dcode, applied_at = now() where id = r.id;
      n_upd := n_upd + 1; continue;
    end if;
    parts := string_to_array(r.full_name, ' ');
    code := (case r.role when 'state_coordinator' then 'SC-' else 'ASC-' end) || upper(regexp_replace(norm_state(r.state), '[^a-z]', '', 'g'));
    c := code;
    while exists (select 1 from leader_directory where member_code = c) loop c := code || '-' || (floor(random() * 90) + 10)::int; end loop;
    insert into leader_directory (member_code, first_name, last_name, email, phone, country, state, role_applied, appointed_on, sent_at)
    values (c, parts[1], array_to_string(parts[2:], ' '), r.email, r.phone, 'Nigeria', r.state,
            case r.role when 'state_coordinator' then 'State Coordinator' else 'Assistant State Coordinator' end, r.appointed_on, now());
    update leader_contacts_ng set applied_code = c, applied_at = now() where id = r.id;
    n_new := n_new + 1;
  end loop;
  return jsonb_build_object('already_with_login', n_prof, 'directory_updated', n_upd, 'directory_added', n_new);
end; $$;
revoke execute on function public.register_contacts_ng_apply() from anon;

-- redefines directory_seat_target
create or replace function public.directory_seat_target(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  with d as (select *, coalesce(state, nullif(regexp_replace(split_part(member_code, '-', 2), '[^A-Za-z]', '', 'g'), '')) as state_or_code
               from leader_directory where member_code = p_code),
  role as (select case
      when lower(d.role_applied) like 'deputy country%' then 'deputy_country_rep'
      when lower(d.role_applied) like 'country rep%' then 'country_rep'
      when lower(d.role_applied) like 'assistant state%' or lower(d.role_applied) like 'assistant regional%' then 'assistant_state_coordinator'
      when lower(d.role_applied) like 'state coord%' or lower(d.role_applied) like 'regional coord%' then 'state_coordinator'
      when lower(d.role_applied) like 'assistant lga%' or lower(d.role_applied) like 'assistant district%' then 'assistant_district_coordinator'
      when lower(d.role_applied) like 'lga coord%' or lower(d.role_applied) like 'district coord%' then 'district_coordinator'
      else null end as role from d),
  unit as (select case
      when (select role from role) in ('country_rep', 'deputy_country_rep') then
        (select o.id from org_units o, d where o.level = 'country'
           and (norm_country(o.name) = norm_country(d.country)
                or upper(coalesce(o.country_iso, '')) = upper(coalesce((select country_iso from leader_contacts where norm_country(country) = norm_country(d.country) limit 1), ''))
                or upper(coalesce(o.country_iso, '')) = upper(regexp_replace(split_part(d.member_code, '-', 2), '[^A-Za-z]', '', 'g')))
         limit 1)
      when (select role from role) in ('state_coordinator', 'assistant_state_coordinator') then
        (select o.id from org_units o, d where o.level = 'state_region'
           and norm_state(o.name) = norm_state(d.state_or_code)
           and exists (select 1 from unit_chain(o.id) c where c.level = 'country' and norm_country(c.name) = norm_country(coalesce(d.country, 'Nigeria')))
         limit 1)
      when (select role from role) in ('district_coordinator', 'assistant_district_coordinator') then
        (select o.id from org_units o, d where o.level = 'district_lga' and d.state is not null and lower(o.name) = lower(d.state) limit 1)
      else null end as id)
  select jsonb_build_object('role', (select role from role), 'unit_id', (select id from unit),
           'unit', (select name from org_units where id = (select id from unit)),
           'state', (select state from d), 'appointed_on', (select appointed_on from d), 'on_hold', (select on_hold from d));
$$;
revoke execute on function public.directory_seat_target(text) from anon;

-- redefines hq_account_list (directory rows carry state, on_hold, appointed_on)
create or replace function public.hq_account_list(q text default '', lim int default 300)
returns jsonb language plpgsql stable
security definer set search_path = public as $$
declare needle text := lower(coalesce(q, ''));
begin
  if not is_case_hq() then raise exception 'HQ only'; end if;
  return (
    select coalesce(jsonb_agg(rw order by
             (rw->>'has_login') desc, (rw->>'is_leader') desc, rw->>'name'), '[]'::jsonb)
    from (
      (select jsonb_build_object(
        'id', p.id, 'name', p.first_name || ' ' || p.last_name,
        'first_name', p.first_name, 'last_name', p.last_name,
        'email', p.email, 'phone', p.phone, 'membership_no', p.membership_no,
        'network', p.network, 'status', p.status, 'role_applied', p.role_applied,
        'country', p.country, 'state_region', p.state_region, 'lga', p.lga,
        'is_leader', p.is_leader,
        'is_staff', exists (select 1 from staff s where s.profile_id = p.id and s.is_active),
        'last_seen_at', p.last_seen_at,
        'last_sign_in_at', u.last_sign_in_at,
        'email_confirmed', u.email_confirmed_at is not null,
        'banned', (u.banned_until is not null and u.banned_until > now()),
        'created_at', p.created_at,
        'has_login', true,
        'roles', (select coalesce(jsonb_agg(jsonb_build_object(
                    'role', ra.role, 'unit_id', ou.id, 'unit', ou.name, 'level', ou.level,
                    'appointment_status', ra.appointment_status,
                    'accepted_at', ra.accepted_at, 'declined_at', ra.declined_at)
                    order by ra.starts_at), '[]'::jsonb)
                   from role_assignments ra join org_units ou on ou.id = ra.org_unit_id
                  where ra.profile_id = p.id and ra.ends_at is null)
      ) as rw
      from profiles p
      left join auth.users u on u.id = p.id
      where p.merged_into is null
        and (needle = '' or lower(p.first_name || ' ' || p.last_name) like '%' || needle || '%'
             or lower(p.email) like '%' || needle || '%'
             or lower(coalesce(p.membership_no, '')) like '%' || needle || '%'
             or lower(coalesce(p.country, '')) like '%' || needle || '%'
             or lower(coalesce(p.role_applied, '')) like '%' || needle || '%')
      order by p.is_leader desc, p.last_name, p.first_name
      limit lim)
      union all
      (select jsonb_build_object(
        'id', null, 'name', d.first_name || ' ' || d.last_name,
        'first_name', d.first_name, 'last_name', d.last_name,
        'email', d.email, 'phone', d.phone, 'membership_no', d.member_code,
        'state_region', d.state, 'on_hold', coalesce(d.on_hold, false), 'appointed_on', d.appointed_on,
        'network', case when d.member_code ~ '^(CL|DCL|CA|PM)' then 'WNNN' else 'WGMN' end,
        'status', null, 'role_applied', d.role_applied,
        'country', d.country, 'state_region', d.state, 'lga', null,
        'is_leader', true, 'is_staff', false,
        'last_seen_at', null, 'last_sign_in_at', null,
        'email_confirmed', false, 'banned', false,
        'created_at', d.sent_at, 'has_login', false, 'roles', '[]'::jsonb
      ) as rw
      from leader_directory d
      where d.claimed_profile is null
        and not exists (select 1 from profiles p2
                         where p2.merged_into is null
                           and (upper(p2.membership_no) = upper(d.member_code)
                                or (d.email is not null and lower(p2.email) = lower(d.email))))
        and (needle = '' or lower(d.first_name || ' ' || d.last_name) like '%' || needle || '%'
             or lower(coalesce(d.email, '')) like '%' || needle || '%'
             or lower(d.member_code) like '%' || needle || '%'
             or lower(d.country) like '%' || needle || '%'
             or lower(d.role_applied) like '%' || needle || '%'))
    ) sub);
end; $$;
revoke execute on function public.hq_account_list(text, int) from anon;

insert into public.schema_migrations (version, name)
values (119, 'bulk_login_fixes') on conflict (version) do nothing;
