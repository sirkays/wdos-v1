-- ============================================================================
-- 162 - Position mailboxes: the WGMN Africa structure's role email accounts
--       (141,194 mailboxes: one Coordinator and one Assistant mailbox for
--       every national, state, local-government and ward post in 55
--       countries), shown to the ONE person who holds that seat, and only
--       after she has passed her gate. APPLIED LIVE 27 Sep 2026; the rows
--       were loaded through the connector from the Founder's workbook
--       (WGMN_Africa_Volunteer_Leadership_Structure_Simplified_2.xlsx).
--       This file is the record. Do not paste it again.
--
-- Security model
--   * passwords are encrypted at rest (pgp_sym_encrypt) with a key that lives
--     in Supabase Vault and is never returned to any client;
--   * the table has RLS on and no policies: no client role can read it;
--   * my_position_mailbox() resolves the caller's OWN open seat, checks her
--     gate, and returns her mailbox; the password only on an explicit reveal,
--     and every reveal is logged;
--   * HQ sees the register (who holds what, open or locked) without passwords.
--
-- The gate (activation_settings.mailbox_gate)
--   'activation_or_onboarding' (default): a candidate who came through the
--     3-day or 7-day activation must be SELECTED and seated; a leader seated
--     before activations existed (no activation record at all) must have
--     completed her Leadership Pack onboarding (onboarding_gate_open).
--   'activation_only': only a selected activation opens the mailbox.
-- ============================================================================
create extension if not exists unaccent with schema extensions;

-- names as keys: lower, no accents, no punctuation; "core" also drops generic
-- tier words so "Central Region" = "Central" and "Lagos State" = "Lagos"
create or replace function public.norm_name(t text) returns text language sql immutable as $$
  select nullif(trim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, ''))), '[^a-z0-9]+', ' ', 'g')), '');
$$;
create or replace function public.norm_name_core(t text) returns text language sql immutable as $$
  select coalesce(nullif(trim(regexp_replace(public.norm_name(t),
    '\m(state|region|province|county|district|prefecture|sub prefecture|department|governorate|wilaya|territory|municipality|municipal|metropolitan|metropolis|division|zone|island|lga|local government area|area council|sub county|subcounty|town council|city council|city|town|commune|federal capital territory)\M', '', 'g')), ''), public.norm_name(t));
$$;

create table if not exists public.position_mailboxes (
  id bigserial primary key,
  post_id text not null unique,
  network text not null default 'WGMN',
  country_iso char(2) not null,
  country_name text not null,
  level smallint not null check (level between 0 and 3),      -- 0 national, 1 state, 2 LGA, 3 ward/community cluster
  state_name text, lga_name text, ward_name text,
  side char(1) not null check (side in ('C', 'A')),           -- C coordinator, A assistant/deputy
  email text not null unique,
  password_enc bytea not null,
  org_unit_id uuid references public.org_units(id) on delete set null,
  resolved_at timestamptz,
  state_key text, lga_key text, ward_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists position_mailboxes_unit_idx on public.position_mailboxes (org_unit_id, level, side) where org_unit_id is not null;
create index if not exists position_mailboxes_keys_idx on public.position_mailboxes (country_iso, level, state_key, lga_key, ward_key);
alter table public.position_mailboxes enable row level security;
revoke all on public.position_mailboxes from anon, authenticated;

create table if not exists public.mailbox_access_log (
  id bigserial primary key,
  profile_id uuid not null,
  mailbox_id bigint not null,
  action text not null default 'reveal',
  at timestamptz not null default now()
);
create index if not exists mailbox_access_log_profile_idx on public.mailbox_access_log (profile_id, at desc);
alter table public.mailbox_access_log enable row level security;
revoke all on public.mailbox_access_log from anon, authenticated;

alter table public.activation_settings
  add column if not exists mailbox_gate text not null default 'activation_or_onboarding',
  add column if not exists mailbox_webmail_url text not null default 'https://9.qservers.net:2096/';
alter table public.activation_settings drop constraint if exists activation_settings_mailbox_gate_chk;
alter table public.activation_settings add constraint activation_settings_mailbox_gate_chk check (mailbox_gate in ('activation_only', 'activation_or_onboarding'));

-- the encryption key lives in Vault; created once, never returned to a client
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'wdos_mailbox_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'wdos_mailbox_key', 'Encrypts WDOS position mailbox passwords');
  end if;
end $$;
create or replace function public.mailbox_key() returns text language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'wdos_mailbox_key' limit 1;
$$;
revoke execute on function public.mailbox_key() from public, anon, authenticated;

-- loader: tab-separated lines
--   post_id  iso  country  level  state  lga  ward  side  email  password
create or replace function public.mailbox_import(p_tsv text) returns integer
language plpgsql security definer set search_path = public as $$
declare n int; k text := public.mailbox_key();
begin
  if k is null then raise exception 'mailbox key missing'; end if;
  insert into position_mailboxes (post_id, country_iso, country_name, level, state_name, lga_name, ward_name, side, email, password_enc, state_key, lga_key, ward_key)
  select f[1], upper(f[2]), f[3], f[4]::int, nullif(f[5], ''), nullif(f[6], ''), nullif(f[7], ''), f[8], lower(f[9]), extensions.pgp_sym_encrypt(f[10], k),
         public.norm_name_core(nullif(f[5], '')), public.norm_name_core(nullif(f[6], '')), public.norm_name_core(nullif(f[7], ''))
  from (select string_to_array(line, E'\t') f from regexp_split_to_table(p_tsv, E'\n') line where line <> '') x
  where array_length(f, 1) >= 10
  on conflict (post_id) do update set email = excluded.email, password_enc = excluded.password_enc, country_name = excluded.country_name,
    state_name = excluded.state_name, lga_name = excluded.lga_name, ward_name = excluded.ward_name,
    state_key = excluded.state_key, lga_key = excluded.lga_key, ward_key = excluded.ward_key, updated_at = now();
  get diagnostics n = row_count; return n;
end; $$;
revoke execute on function public.mailbox_import(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- resolving a structure unit to its mailbox rows
-- ---------------------------------------------------------------------------
create or replace function public.mailbox_unit_keys(p_unit uuid)
returns table (country_iso char(2), level smallint, state_key text, lga_key text, ward_key text)
language plpgsql stable security definer set search_path = public as $$
declare u org_units%rowtype; chain text[] := '{}'; iso char(2); lvl text; guard int := 0;
begin
  select * into u from org_units where id = p_unit; if not found then return; end if;
  lvl := u.level::text; iso := u.country_iso;
  loop
    chain := array_prepend(u.name, chain);
    if u.level = 'country' then iso := coalesce(iso, u.country_iso); exit; end if;
    if u.parent_id is null then exit; end if;
    select * into u from org_units where id = u.parent_id; if not found then exit; end if;
    iso := coalesce(iso, u.country_iso);
    guard := guard + 1; if guard > 8 then exit; end if;
  end loop;
  return query select upper(iso)::char(2),
    (case lvl when 'country' then 0 when 'state_region' then 1 when 'district_lga' then 2 when 'community_cluster' then 3 when 'chapter' then 3 end)::smallint,
    public.norm_name_core(chain[2]), public.norm_name_core(chain[3]), public.norm_name_core(chain[4]);
end; $$;
revoke execute on function public.mailbox_unit_keys(uuid) from public, anon, authenticated;

create or replace function public.position_mailboxes_resolve(p_unit uuid default null) returns integer
language plpgsql security definer set search_path = public as $$
declare r record; k record; n int := 0; m int;
begin
  for r in select id from org_units where level in ('country','state_region','district_lga','community_cluster','chapter') and coalesce(is_active, true) and (p_unit is null or id = p_unit) loop
    select * into k from public.mailbox_unit_keys(r.id);
    if k.country_iso is null or k.level is null then continue; end if;
    if k.level >= 1 and k.state_key is null then continue; end if;
    if k.level >= 2 and k.lga_key is null then continue; end if;
    if k.level >= 3 and k.ward_key is null then continue; end if;
    update position_mailboxes pm set org_unit_id = r.id, resolved_at = now()
     where pm.country_iso = k.country_iso and pm.level = k.level
       and (k.level < 1 or pm.state_key = k.state_key) and (k.level < 2 or pm.lga_key = k.lga_key) and (k.level < 3 or pm.ward_key = k.ward_key)
       and pm.org_unit_id is distinct from r.id;
    get diagnostics m = row_count; n := n + m;
  end loop;
  return n;
end; $$;
revoke execute on function public.position_mailboxes_resolve(uuid) from public, anon, authenticated;

-- a new or renamed unit (for example the community cluster created when HQ
-- approves an appointment) finds its mailbox at once
create or replace function public.org_units_mailbox_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.position_mailboxes_resolve(new.id);
  return new;
end; $$;
drop trigger if exists org_units_mailbox on public.org_units;
create trigger org_units_mailbox after insert or update of name, parent_id, country_iso on public.org_units
  for each row execute function public.org_units_mailbox_trg();

-- ---------------------------------------------------------------------------
-- which mailbox a role uses
-- ---------------------------------------------------------------------------
create or replace function public.mailbox_side_of(p_role text, out level smallint, out side char(1))
language sql immutable as $$
  select (case p_role when 'country_rep' then 0 when 'deputy_country_rep' then 0
      when 'state_coordinator' then 1 when 'assistant_state_coordinator' then 1
      when 'district_coordinator' then 2 when 'assistant_district_coordinator' then 2
      when 'cluster_coordinator' then 3 when 'assistant_cluster_coordinator' then 3 end)::smallint,
    (case when p_role in ('deputy_country_rep','assistant_state_coordinator','assistant_district_coordinator','assistant_cluster_coordinator') then 'A'
          when p_role in ('country_rep','state_coordinator','district_coordinator','cluster_coordinator') then 'C' end)::char(1);
$$;

-- ---------------------------------------------------------------------------
-- the gate, for one person
-- ---------------------------------------------------------------------------
create or replace function public.leader_gate_state(pid uuid, out ok boolean, out reason text, out route text)
language plpgsql stable security definer set search_path = public as $$
declare s activation_settings%rowtype; act record;
begin
  select * into s from activation_settings where id = 1;
  select a.status, a.route as r, (select outcome from readiness_assessments x where x.activation_id = a.id) as outcome
    into act from candidate_activations a where a.profile_id = pid and not a.is_test
   order by (a.status = 'completed') desc, a.created_at desc limit 1;
  route := act.r;
  if act.status is not null then
    if act.status = 'completed' and act.outcome = 'selected' then ok := true; reason := 'activation_passed';
    elsif act.status = 'completed' then ok := false; reason := 'awaiting_decision';
    elsif act.status in ('incomplete', 'closed') then ok := false; reason := 'activation_incomplete';
    else ok := false; reason := 'activation_in_progress'; end if;
  elsif s.mailbox_gate = 'activation_or_onboarding' then
    if public.onboarding_gate_open(pid) then ok := true; reason := 'onboarding_complete'; else ok := false; reason := 'onboarding_pending'; end if;
  else ok := false; reason := 'no_activation'; end if;
end; $$;
revoke execute on function public.leader_gate_state(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- the leader's own mailbox. Never takes a profile id: it is always the caller.
-- ---------------------------------------------------------------------------
create or replace function public.my_position_mailbox(p_reveal boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); seat record; mb record; g record; ms record; s activation_settings%rowtype; net text; pw text; has_seat boolean; has_mb boolean := false;
begin
  if me is null then return jsonb_build_object('state', 'not_signed_in'); end if;
  select * into s from activation_settings where id = 1;
  select ra.role::text as role, ra.org_unit_id, ou.name as unit, ou.level::text as unit_level, ra.starts_at, p.network::text as network
    into seat
    from role_assignments ra join org_units ou on ou.id = ra.org_unit_id join profiles p on p.id = ra.profile_id
   where ra.profile_id = me and ra.ends_at is null and ra.role in (select pm.role from position_master pm)
   order by ra.starts_at desc nulls last limit 1;
  has_seat := found;
  if not has_seat then return jsonb_build_object('state', 'no_seat'); end if;
  net := coalesce(seat.network, 'WGMN');
  select * into ms from public.mailbox_side_of(seat.role);
  select * into g from public.leader_gate_state(me);
  if ms.level is not null then
    select pm.id, pm.email, pm.post_id, pm.password_enc into mb from position_mailboxes pm
     where pm.org_unit_id = seat.org_unit_id and pm.level = ms.level and pm.side = ms.side and pm.network = net limit 1;
    has_mb := found;
  end if;
  if has_mb and g.ok and p_reveal then
    pw := extensions.pgp_sym_decrypt(mb.password_enc, public.mailbox_key());
    insert into mailbox_access_log (profile_id, mailbox_id, action) values (me, mb.id, 'reveal');
  end if;
  return jsonb_build_object(
    'state', case when not has_mb then 'none' when g.ok then 'open' else 'locked' end,
    'seat', jsonb_build_object('role', seat.role, 'title', coalesce(public.role_title(seat.role, net), seat.role), 'unit', seat.unit, 'unit_level', seat.unit_level, 'network', net),
    'gate', jsonb_build_object('ok', g.ok, 'reason', g.reason, 'route', g.route, 'mode', s.mailbox_gate),
    'webmail_url', s.mailbox_webmail_url,
    'reason_none', case when has_mb then null when ms.level is null then 'position_has_no_mailbox' when net <> 'WGMN' then 'network_not_provisioned' else 'unit_not_matched' end,
    'mailbox', case when not has_mb or not g.ok then null else jsonb_build_object('email', mb.email, 'post_id', mb.post_id, 'password', pw) end);
end; $$;
revoke execute on function public.my_position_mailbox(boolean) from anon;

-- ---------------------------------------------------------------------------
-- HQ: the register (no passwords), the gate setting
-- ---------------------------------------------------------------------------
create or replace function public.hq_position_mailboxes(p_country text default null, p_q text default null, p_level int default null, p_only text default null, p_limit int default 100, p_offset int default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare out jsonb; q text := nullif(trim(coalesce(p_q, '')), '');
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  with h as materialized (  -- current holder of each resolved mailbox's seat, with her gate, computed once
    select pm.id as mailbox_id, ra.profile_id, p.first_name || ' ' || coalesce(p.last_name, '') as holder, p.email as holder_email, ra.role::text as role,
           g.ok as gate_ok, g.reason as gate_reason
      from position_mailboxes pm
      join role_assignments ra on ra.org_unit_id = pm.org_unit_id and ra.ends_at is null
      join profiles p on p.id = ra.profile_id
      join lateral public.mailbox_side_of(ra.role::text) ms on ms.level = pm.level and ms.side = pm.side
      cross join lateral public.leader_gate_state(ra.profile_id) g
      where pm.org_unit_id is not null),
  r as (
    select pm.*, h.profile_id, h.holder, h.holder_email, h.role, h.gate_ok, h.gate_reason
      from position_mailboxes pm left join h on h.mailbox_id = pm.id
     where (p_country is null or pm.country_iso = upper(p_country) or pm.country_name = p_country)
       and (p_level is null or pm.level = p_level)
       and (p_only is null or p_only = '' or (p_only = 'held' and h.profile_id is not null) or (p_only = 'open' and coalesce(h.gate_ok, false))
            or (p_only = 'locked' and h.profile_id is not null and not coalesce(h.gate_ok, false))
            or (p_only = 'unmatched' and pm.org_unit_id is null) or (p_only = 'vacant' and pm.org_unit_id is not null and h.profile_id is null))
       and (q is null or (pm.email || ' ' || pm.post_id || ' ' || coalesce(pm.state_name, '') || ' ' || coalesce(pm.lga_name, '') || ' ' || coalesce(pm.ward_name, '') || ' ' || coalesce(h.holder, '')) ilike '%' || q || '%'))
  select jsonb_build_object(
    'totals', (select jsonb_build_object('mailboxes', count(*), 'matched', count(*) filter (where pm.org_unit_id is not null),
                 'held', count(*) filter (where h.profile_id is not null),
                 'open', count(*) filter (where coalesce(h.gate_ok, false)),
                 'locked', count(*) filter (where h.profile_id is not null and not coalesce(h.gate_ok, false)),
                 'reveals', (select count(*) from mailbox_access_log), 'gate_mode', (select mailbox_gate from activation_settings where id = 1), 'webmail_url', (select mailbox_webmail_url from activation_settings where id = 1))
               from position_mailboxes pm left join h on h.mailbox_id = pm.id),
    'by_country', (select coalesce(jsonb_agg(jsonb_build_object('country', country_name, 'iso', country_iso, 'mailboxes', n, 'matched', m, 'held', hd) order by country_name), '[]'::jsonb)
                   from (select pm.country_name, pm.country_iso, count(*) n, count(*) filter (where pm.org_unit_id is not null) m, count(h.profile_id) hd
                         from position_mailboxes pm left join h on h.mailbox_id = pm.id group by 1, 2) c),
    'by_level', (select coalesce(jsonb_agg(jsonb_build_object('level', level, 'mailboxes', n, 'matched', m, 'held', hd) order by level), '[]'::jsonb)
                 from (select pm.level, count(*) n, count(*) filter (where pm.org_unit_id is not null) m, count(h.profile_id) hd from position_mailboxes pm left join h on h.mailbox_id = pm.id group by 1) c),
    'total', (select count(*) from r),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('post_id', r.post_id, 'email', r.email, 'level', r.level, 'side', r.side, 'country', r.country_name,
                'state', r.state_name, 'lga', r.lga_name, 'ward', r.ward_name, 'matched', r.org_unit_id is not null,
                'holder', r.holder, 'holder_email', r.holder_email, 'role', r.role, 'gate_ok', r.gate_ok, 'gate_reason', r.gate_reason) order by (r.profile_id is null), r.country_name, r.level, r.state_name, r.lga_name, r.ward_name, r.side), '[]'::jsonb)
             from (select * from r order by (r.profile_id is null), r.country_name, r.level, r.state_name, r.lga_name, r.ward_name, r.side limit greatest(1, least(p_limit, 500)) offset greatest(p_offset, 0)) r)
  ) into out;
  return out;
end; $$;
revoke execute on function public.hq_position_mailboxes(text, text, int, text, int, int) from anon;

create or replace function public.hq_set_mailbox_gate(p_mode text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  if p_mode not in ('activation_only', 'activation_or_onboarding') then raise exception 'Unknown gate mode'; end if;
  update activation_settings set mailbox_gate = p_mode, updated_by = auth.uid(), updated_at = now() where id = 1;
end; $$;
revoke execute on function public.hq_set_mailbox_gate(text) from anon;

insert into public.schema_migrations (version, name) values (162, 'position_mailboxes') on conflict (version) do nothing;
