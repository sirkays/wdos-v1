-- ============================================================================
-- 162b  Position mailboxes: patches applied LIVE on 27 Sep 2026 through the
--       Supabase connector (build v84.4). This file is the RECORD of what is
--       already in the database. Do not paste it into the SQL Editor; every
--       statement is idempotent, but nothing here is pending.
--
--   162b  name aliases between the workbook and WDOS unit names (16 rows)
--   162c  my_position_mailbox: role_code comparison fix (already in 162 file)
--   162d  staging table position_mailboxes_import with encrypt-on-insert
--         trigger (for the dashboard CSV import of the 139,444 LGA/ward rows)
--         and the wdos_mailbox_resolve cron (every 15 minutes)
--   162e  hq_position_mailboxes: one row per mailbox, holders[] and contested
--         (fixes the 1752/1750 double count when a seat has two holders)
--   +     mailbox_checksum(): per-country md5 used to byte-verify the load
-- ============================================================================

-- 162b -----------------------------------------------------------------------
create table if not exists public.mailbox_name_aliases (
  country_iso char(2) not null, level smallint not null, unit_key text not null, mailbox_key text not null, note text,
  primary key (country_iso, level, unit_key));
alter table public.mailbox_name_aliases enable row level security;
revoke all on public.mailbox_name_aliases from public, anon, authenticated;
insert into public.mailbox_name_aliases (country_iso, level, unit_key, mailbox_key, note) values
('BJ',1,'atakora','atacora','spelling'),
('CF',1,'nana grebizi','nana gribizi','spelling'),
('CG',1,'pointe noire','point noire','workbook typo'),
('CI',1,'abidjan','district autonome d abidjan','autonomous district'),
('CI',1,'yamoussoukro','district autonome de yamoussoukro','autonomous district'),
('GH',1,'north east','northern east','workbook wording'),
('GW',1,'bolama','bolama bijagos','workbook wording'),
('MA',1,'fes meknes','fez meknes','spelling'),
('MA',1,'tanger tetouan al hoceima','tangier tetouan al hoceima','spelling'),
('ML',1,'taoudenit','taoudenni','spelling'),
('ML',1,'tombouctou','timbuktu','French/English'),
('RW',1,'of kigali','kigali','City of Kigali'),
('TN',1,'kef','le kef','article'),
('TN',1,'manouba','manubah','spelling'),
('TN',1,'sidi bouzid','sidi bou zid','spelling'),
('ZA',1,'northern cape','nothern cape','workbook typo')
on conflict (country_iso, level, unit_key) do update set mailbox_key = excluded.mailbox_key, note = excluded.note;

CREATE OR REPLACE FUNCTION public.mailbox_unit_keys(p_unit uuid)
 RETURNS TABLE(country_iso character, level smallint, state_key text, lga_key text, ward_key text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare u org_units%rowtype; chain text[] := '{}'; iso char(2); lvl text; guard int := 0; sk text; lk text; wk text; lv smallint;
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
  iso := upper(iso);
  lv := (case lvl when 'country' then 0 when 'state_region' then 1 when 'district_lga' then 2 when 'community_cluster' then 3 when 'chapter' then 3 end)::smallint;
  sk := public.norm_name_core(chain[2]); lk := public.norm_name_core(chain[3]); wk := public.norm_name_core(chain[4]);
  sk := coalesce((select mailbox_key from mailbox_name_aliases a where a.country_iso = iso and a.level = 1 and a.unit_key = sk), sk);
  lk := coalesce((select mailbox_key from mailbox_name_aliases a where a.country_iso = iso and a.level = 2 and a.unit_key = lk), lk);
  wk := coalesce((select mailbox_key from mailbox_name_aliases a where a.country_iso = iso and a.level = 3 and a.unit_key = wk), wk);
  return query select iso::char(2), lv, sk, lk, wk;
end; $function$;

-- 162d -----------------------------------------------------------------------
create table if not exists public.position_mailboxes_import (
  post_id text, country_iso text, country_name text, level integer, state_name text, lga_name text, ward_name text, side text, email text, password text);
alter table public.position_mailboxes_import enable row level security;
revoke all on public.position_mailboxes_import from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.position_mailboxes_import_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare k text := public.mailbox_key();
begin
  if new.post_id is null or new.email is null or new.password is null or new.side not in ('C','A') then return null; end if;
  insert into position_mailboxes (post_id, country_iso, country_name, level, state_name, lga_name, ward_name, side, email, password_enc, state_key, lga_key, ward_key)
  values (trim(new.post_id), upper(trim(new.country_iso)), coalesce(new.country_name, ''), new.level, nullif(trim(new.state_name), ''), nullif(trim(new.lga_name), ''), nullif(trim(new.ward_name), ''),
          new.side, lower(trim(new.email)), extensions.pgp_sym_encrypt(new.password, k),
          public.norm_name_core(nullif(trim(new.state_name), '')), public.norm_name_core(nullif(trim(new.lga_name), '')), public.norm_name_core(nullif(trim(new.ward_name), '')))
  on conflict (post_id) do update set email = excluded.email, password_enc = excluded.password_enc, country_name = excluded.country_name,
    state_name = excluded.state_name, lga_name = excluded.lga_name, ward_name = excluded.ward_name,
    state_key = excluded.state_key, lga_key = excluded.lga_key, ward_key = excluded.ward_key, updated_at = now();
  return null;   -- nothing is kept in the staging table
end; $function$;

drop trigger if exists position_mailboxes_import_encrypt on public.position_mailboxes_import;
create trigger position_mailboxes_import_encrypt before insert on public.position_mailboxes_import for each row execute function public.position_mailboxes_import_trg();
revoke execute on function public.position_mailboxes_import_trg() from public, anon, authenticated;

select cron.unschedule('wdos_mailbox_resolve') where exists (select 1 from cron.job where jobname = 'wdos_mailbox_resolve');
select cron.schedule('wdos_mailbox_resolve', '*/15 * * * *', 'select public.position_mailboxes_resolve()');

-- verification helper ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mailbox_checksum(p_level_max integer DEFAULT 2)
 RETURNS TABLE(country_iso character, n bigint, sig text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select pm.country_iso, count(*), md5(string_agg(pm.post_id || '|' || pm.email || '|' || extensions.pgp_sym_decrypt(pm.password_enc, public.mailbox_key()), E'\n' order by pm.post_id collate "C"))
  from position_mailboxes pm where pm.level <= p_level_max group by pm.country_iso order by pm.country_iso;
$function$;
revoke execute on function public.mailbox_checksum(integer) from public, anon, authenticated;

-- 162e -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hq_position_mailboxes(p_country text DEFAULT NULL::text, p_q text DEFAULT NULL::text, p_level integer DEFAULT NULL::integer, p_only text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare out jsonb; q text := nullif(trim(coalesce(p_q, '')), '');
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  with hh as materialized (  -- every current holder of a resolved mailbox's seat, with her gate
    select pm.id as mailbox_id, ra.profile_id, p.first_name || ' ' || coalesce(p.last_name, '') as holder, p.email as holder_email, ra.role::text as role,
           g.ok as gate_ok, g.reason as gate_reason
      from position_mailboxes pm
      join role_assignments ra on ra.org_unit_id = pm.org_unit_id and ra.ends_at is null
      join profiles p on p.id = ra.profile_id
      join lateral public.mailbox_side_of(ra.role::text) ms on ms.level = pm.level and ms.side = pm.side
      cross join lateral public.leader_gate_state(ra.profile_id) g
      where pm.org_unit_id is not null),
  h as materialized (  -- one row per mailbox
    select mailbox_id, count(*) as holders_n, bool_or(gate_ok) as any_open, bool_and(gate_ok) as all_open,
           (array_agg(holder order by gate_ok desc, holder))[1] as holder, (array_agg(holder_email order by gate_ok desc, holder))[1] as holder_email,
           (array_agg(role order by gate_ok desc, holder))[1] as role, (array_agg(gate_ok order by gate_ok desc, holder))[1] as gate_ok, (array_agg(gate_reason order by gate_ok desc, holder))[1] as gate_reason,
           jsonb_agg(jsonb_build_object('name', holder, 'email', holder_email, 'role', role, 'gate_ok', gate_ok, 'gate_reason', gate_reason) order by holder) as holders
      from hh group by mailbox_id),
  r as (
    select pm.*, h.holders_n, h.holder, h.holder_email, h.role, h.gate_ok, h.gate_reason, h.holders
      from position_mailboxes pm left join h on h.mailbox_id = pm.id
     where (p_country is null or pm.country_iso = upper(p_country) or pm.country_name = p_country)
       and (p_level is null or pm.level = p_level)
       and (p_only is null or p_only = '' or (p_only = 'held' and h.holders_n > 0) or (p_only = 'open' and coalesce(h.gate_ok, false))
            or (p_only = 'locked' and h.holders_n > 0 and not coalesce(h.gate_ok, false))
            or (p_only = 'unmatched' and pm.org_unit_id is null) or (p_only = 'vacant' and pm.org_unit_id is not null and h.holders_n is null)
            or (p_only = 'contested' and h.holders_n > 1))
       and (q is null or (pm.email || ' ' || pm.post_id || ' ' || coalesce(pm.state_name, '') || ' ' || coalesce(pm.lga_name, '') || ' ' || coalesce(pm.ward_name, '') || ' ' || coalesce(h.holder, '')) ilike '%' || q || '%'))
  select jsonb_build_object(
    'totals', (select jsonb_build_object('mailboxes', count(*), 'matched', count(*) filter (where pm.org_unit_id is not null),
                 'held', count(*) filter (where h.holders_n > 0),
                 'open', count(*) filter (where coalesce(h.gate_ok, false)),
                 'locked', count(*) filter (where h.holders_n > 0 and not coalesce(h.gate_ok, false)),
                 'contested', count(*) filter (where h.holders_n > 1),
                 'vacant', count(*) filter (where pm.org_unit_id is not null and h.holders_n is null),
                 'unmatched', count(*) filter (where pm.org_unit_id is null),
                 'parked_at_hq', (select count(*) from role_assignments ra join org_units ou on ou.id = ra.org_unit_id cross join lateral public.mailbox_side_of(ra.role::text) ms
                                  where ra.ends_at is null and ms.level is not null and ou.level = 'headquarters'),
                 'reveals', (select count(*) from mailbox_access_log), 'gate_mode', (select mailbox_gate from activation_settings where id = 1), 'webmail_url', (select mailbox_webmail_url from activation_settings where id = 1))
               from position_mailboxes pm left join h on h.mailbox_id = pm.id),
    'by_country', (select coalesce(jsonb_agg(jsonb_build_object('country', country_name, 'iso', country_iso, 'mailboxes', n, 'matched', m, 'held', hd, 'open', op) order by country_name), '[]'::jsonb)
                   from (select pm.country_name, pm.country_iso, count(*) n, count(*) filter (where pm.org_unit_id is not null) m, count(*) filter (where h.holders_n > 0) hd, count(*) filter (where coalesce(h.gate_ok, false)) op
                         from position_mailboxes pm left join h on h.mailbox_id = pm.id group by 1, 2) c),
    'by_level', (select coalesce(jsonb_agg(jsonb_build_object('level', level, 'mailboxes', n, 'matched', m, 'held', hd, 'open', op) order by level), '[]'::jsonb)
                 from (select pm.level, count(*) n, count(*) filter (where pm.org_unit_id is not null) m, count(*) filter (where h.holders_n > 0) hd, count(*) filter (where coalesce(h.gate_ok, false)) op
                       from position_mailboxes pm left join h on h.mailbox_id = pm.id group by 1) c),
    'parked', (select coalesce(jsonb_agg(jsonb_build_object('name', p.first_name || ' ' || coalesce(p.last_name, ''), 'email', p.email, 'role', ra.role::text, 'country', p.country) order by p.last_name), '[]'::jsonb)
               from role_assignments ra join org_units ou on ou.id = ra.org_unit_id join profiles p on p.id = ra.profile_id cross join lateral public.mailbox_side_of(ra.role::text) ms
               where ra.ends_at is null and ms.level is not null and ou.level = 'headquarters'),
    'total', (select count(*) from r),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('post_id', r.post_id, 'email', r.email, 'level', r.level, 'side', r.side, 'country', r.country_name,
                'state', r.state_name, 'lga', r.lga_name, 'ward', r.ward_name, 'matched', r.org_unit_id is not null,
                'holder', r.holder, 'holder_email', r.holder_email, 'role', r.role, 'gate_ok', r.gate_ok, 'gate_reason', r.gate_reason, 'holders', r.holders, 'contested', coalesce(r.holders_n, 0) > 1)
                order by (r.holders_n is null), r.country_name, r.level, r.state_name, r.lga_name, r.ward_name, r.side), '[]'::jsonb)
             from (select * from r order by (r.holders_n is null), r.country_name, r.level, r.state_name, r.lga_name, r.ward_name, r.side limit greatest(1, least(p_limit, 500)) offset greatest(p_offset, 0)) r)
  ) into out;
  return out;
end; $function$;

revoke execute on function public.hq_position_mailboxes(text, text, integer, text, integer, integer) from public, anon;
grant execute on function public.hq_position_mailboxes(text, text, integer, text, integer, integer) to authenticated;
