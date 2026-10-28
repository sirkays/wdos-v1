-- ============================================================================
-- WDOS Migration 148 — ONE referral link, the form captures position + place,
-- level names for every African country, 7-Day replaces 14-Day (Phase 196)
-- Built to "WDOS 3-Day & 7-Day Activation Programme Content Pack, Implementation
-- Document for Princewill" and the Founder's instruction of 17 Sep 2026.
-- ============================================================================

-- 1. The single, non-personalised referral link: woddicrm.org/#/join/WODDI
alter table public.referral_links alter column org_unit_id drop not null;
alter table public.referral_links add column if not exists generic boolean not null default false;
insert into public.referral_links (code, route, network, role, org_unit_id, owner_id, created_by, label, active, generic)
select 'WODDI', 'ref3', 'WGMN', null, null, null, null, 'WODDI 3-Day Referral Activation (single link for all referrals)', true, true
where not exists (select 1 from public.referral_links where code = 'WODDI');
update public.referral_links set generic = true, active = true, role = null, org_unit_id = null where code = 'WODDI';

-- 2. What the form captures, exactly as she typed or chose it
alter table public.candidate_activations
  add column if not exists position_code text,
  add column if not exists geo_country text,
  add column if not exists geo_state text,
  add column if not exists geo_lga text,
  add column if not exists geo_cluster text,
  add column if not exists geo_country_iso char(2),
  add column if not exists form_data jsonb not null default '{}'::jsonb;

-- 3. Level names, country by country (the WODDI level is kept in brackets in the UI).
--    NOTE: country_level_names already exists since Phase 26 with a different
--    shape (per org unit, two levels). This is a separate, ISO-keyed table
--    that also carries the fourth level (community cluster).
create table if not exists public.country_activation_levels (
  country_iso char(2) primary key,
  level2 text not null,           -- state / region / province
  level3 text not null,           -- LGA / district / department
  level4 text not null            -- community cluster (ward / commune / ...)
);
insert into public.country_activation_levels (country_iso, level2, level3, level4) values
  ('NG', 'State', 'Local Government Area (LGA)', 'Community Cluster (Ward)'),
  ('GH', 'Region', 'District', 'Community Cluster (Electoral Area)'),
  ('KE', 'County', 'Sub-County', 'Community Cluster (Ward)'),
  ('UG', 'Region', 'District', 'Community Cluster (Sub-county)'),
  ('TZ', 'Region', 'District', 'Community Cluster (Ward)'),
  ('RW', 'Province', 'District', 'Community Cluster (Sector)'),
  ('BI', 'Province', 'Commune', 'Community Cluster (Colline)'),
  ('ET', 'Region', 'Zone', 'Community Cluster (Woreda)'),
  ('ZA', 'Province', 'District Municipality', 'Community Cluster (Ward)'),
  ('ZM', 'Province', 'District', 'Community Cluster (Ward)'),
  ('ZW', 'Province', 'District', 'Community Cluster (Ward)'),
  ('MW', 'Region', 'District', 'Community Cluster (Traditional Authority)'),
  ('MZ', 'Province', 'District', 'Community Cluster (Posto Administrativo)'),
  ('BW', 'District', 'Sub-District', 'Community Cluster (Ward)'),
  ('NA', 'Region', 'Constituency', 'Community Cluster (Ward)'),
  ('LS', 'District', 'Constituency', 'Community Cluster (Community Council)'),
  ('SZ', 'Region', 'Tinkhundla', 'Community Cluster (Chiefdom)'),
  ('AO', 'Province', 'Municipality', 'Community Cluster (Comuna)'),
  ('CM', 'Region', 'Department', 'Community Cluster (Commune)'),
  ('CF', 'Prefecture', 'Sub-prefecture', 'Community Cluster (Commune)'),
  ('TD', 'Province', 'Department', 'Community Cluster (Sub-prefecture)'),
  ('CG', 'Department', 'District', 'Community Cluster (Commune)'),
  ('CD', 'Province', 'Territory', 'Community Cluster (Sector / Commune)'),
  ('GA', 'Province', 'Department', 'Community Cluster (Canton)'),
  ('GQ', 'Province', 'District', 'Community Cluster (Municipality)'),
  ('SN', 'Region', 'Department', 'Community Cluster (Commune)'),
  ('CI', 'District', 'Region', 'Community Cluster (Department / Commune)'),
  ('ML', 'Region', 'Cercle', 'Community Cluster (Commune)'),
  ('BF', 'Region', 'Province', 'Community Cluster (Department / Commune)'),
  ('NE', 'Region', 'Department', 'Community Cluster (Commune)'),
  ('BJ', 'Department', 'Commune', 'Community Cluster (Arrondissement)'),
  ('TG', 'Region', 'Prefecture', 'Community Cluster (Canton)'),
  ('GN', 'Region', 'Prefecture', 'Community Cluster (Sub-prefecture)'),
  ('GW', 'Region', 'Sector', 'Community Cluster (Section)'),
  ('SL', 'Province', 'District', 'Community Cluster (Chiefdom)'),
  ('LR', 'County', 'District', 'Community Cluster (Clan / Township)'),
  ('GM', 'Region', 'District', 'Community Cluster (Ward)'),
  ('MR', 'Region', 'Department (Moughataa)', 'Community Cluster (Commune)'),
  ('CV', 'Island', 'Municipality (Concelho)', 'Community Cluster (Parish / Freguesia)'),
  ('ST', 'Province', 'District', 'Community Cluster (Locality)'),
  ('SD', 'State', 'Locality', 'Community Cluster (Administrative Unit)'),
  ('SS', 'State', 'County', 'Community Cluster (Payam)'),
  ('ER', 'Region (Zoba)', 'Sub-region', 'Community Cluster (Administrative Area)'),
  ('DJ', 'Region', 'District', 'Community Cluster (Commune)'),
  ('SO', 'Federal Member State / Region', 'District', 'Community Cluster (Village Council)'),
  ('EG', 'Governorate', 'District (Markaz)', 'Community Cluster (Local Unit)'),
  ('LY', 'District (Shabiyah)', 'Basic People''s Congress', 'Community Cluster (Neighbourhood)'),
  ('TN', 'Governorate', 'Delegation', 'Community Cluster (Sector)'),
  ('DZ', 'Province (Wilaya)', 'District (Daira)', 'Community Cluster (Commune)'),
  ('MA', 'Region', 'Province / Prefecture', 'Community Cluster (Commune)'),
  ('MG', 'Region', 'District', 'Community Cluster (Commune)'),
  ('MU', 'District', 'Village Council Area', 'Community Cluster (Locality)'),
  ('SC', 'District', 'Sub-district', 'Community Cluster (Locality)'),
  ('KM', 'Island', 'Prefecture', 'Community Cluster (Commune)')
on conflict (country_iso) do update set level2 = excluded.level2, level3 = excluded.level3, level4 = excluded.level4;
alter table public.country_activation_levels enable row level security;
drop policy if exists cal_read on public.country_activation_levels;
create policy cal_read on public.country_activation_levels for select to anon, authenticated using (true);

-- The form asks for the country, then its levels. Anyone (not signed in yet) may read the lists.
create or replace function public.geo_countries()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', ou.id, 'name', ou.name, 'iso', ou.country_iso) order by ou.name), '[]'::jsonb)
    from org_units ou where ou.level = 'country' and ou.is_active;
$$;
grant execute on function public.geo_countries() to anon, authenticated;

create or replace function public.geo_children(p_parent uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', ou.id, 'name', ou.name, 'level', ou.level) order by ou.name), '[]'::jsonb)
    from org_units ou where ou.parent_id = p_parent and ou.is_active and ou.level in ('state_region','district_lga','chapter');
$$;
grant execute on function public.geo_children(uuid) to anon, authenticated;

create or replace function public.geo_levels(p_iso text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'level2', coalesce((select level2 from country_activation_levels where country_iso = upper(p_iso)), 'State / Region'),
    'level3', coalesce((select level3 from country_activation_levels where country_iso = upper(p_iso)), 'LGA / District'),
    'level4', coalesce((select level4 from country_activation_levels where country_iso = upper(p_iso)), 'Community Cluster (Ward)'));
$$;
grant execute on function public.geo_levels(text) to anon, authenticated;

-- 4. The generic link is valid without a seat
create or replace function public.referral_link_info(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('code', l.code, 'route', l.route, 'network', l.network, 'role', l.role,
    'role_title', case when l.role is null then null else public.role_title(l.role::text, l.network::text) end,
    'unit_id', l.org_unit_id, 'unit', ou.name, 'unit_level', ou.level,
    'country', (select c.name from org_units c where c.id = coalesce((select parent_id from org_units where id = ou.id), ou.id) and c.level = 'country'),
    'owner', coalesce((select p.first_name || ' ' || p.last_name from profiles p where p.id = l.owner_id), 'WODDI Headquarters'),
    'label', l.label, 'generic', l.generic,
    'active', l.active and (l.expires_at is null or l.expires_at > now()))
  from referral_links l left join org_units ou on ou.id = l.org_unit_id
  where l.code = p_code limit 1;
$$;
grant execute on function public.referral_link_info(text) to anon, authenticated;

-- 5. Begin the 3-Day route from the form: network from age, position and place as chosen
drop function if exists public.begin_referral_activation(text);
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

  net := coalesce(nullif(p_form->>'network',''), l.network::text, 'WGMN');
  pos := coalesce(nullif(p_form->>'position',''), l.role::text);
  unit := coalesce(nullif(p_form->>'unit_id','')::uuid, l.org_unit_id);
  iso := upper(nullif(p_form->>'country_iso',''));

  update profiles set network = net::network_code, org_unit_id = coalesce(unit, org_unit_id),
         country = coalesce(nullif(p_form->>'country',''), country),
         state_region = coalesce(nullif(p_form->>'state',''), state_region),
         referral_code = coalesce(referral_code, l.code),
         role_applied = coalesce(public.role_title(pos, net), role_applied),
         is_leader = false
   where id = me;

  select id into app_id from applications where lower(email) = lower(p.email) and status not in ('rejected','withdrawn') limit 1;
  if app_id is null then
    insert into applications (first_name, last_name, email, phone, network, org_unit_id, motivation, preferred_locale, referral_code, status, profile_id)
    values (p.first_name, p.last_name, p.email, p.phone, net::network_code, unit, 'Referred candidate: 3-Day Referral Activation in progress.', coalesce(p.preferred_locale,'en'), l.code, 'submitted', me)
    returning id into app_id;
  end if;

  insert into candidate_activations (profile_id, route, network, role, org_unit_id, referral_code, referrer_id, application_id,
                                     status, started_at, deadline, pack_version,
                                     position_code, geo_country, geo_state, geo_lga, geo_cluster, geo_country_iso, form_data)
  values (me, 'ref3', net, pos, unit, l.code, l.owner_id, app_id,
          'in_progress', now(), now() + make_interval(days => s.ref3_days), 'CE-1.0',
          pos, p_form->>'country', p_form->>'state', p_form->>'lga', p_form->>'cluster', iso, p_form)
  on conflict (profile_id, route) do update set
     status = case when candidate_activations.status = 'not_started' then 'in_progress' else candidate_activations.status end,
     position_code = coalesce(excluded.position_code, candidate_activations.position_code),
     geo_country = coalesce(excluded.geo_country, candidate_activations.geo_country),
     geo_state = coalesce(excluded.geo_state, candidate_activations.geo_state),
     geo_lga = coalesce(excluded.geo_lga, candidate_activations.geo_lga),
     geo_cluster = coalesce(excluded.geo_cluster, candidate_activations.geo_cluster),
     form_data = candidate_activations.form_data || excluded.form_data
  returning * into a;
  insert into candidate_activation_steps (activation_id, day, status, started_at)
  values (a.id, 1, 'in_progress', now()) on conflict do nothing;
  return public.my_activation();
end; $$;
revoke execute on function public.begin_referral_activation(text, jsonb) from anon;

-- 6. 7-Day replaces the 14-Day route for open-call applicants
update public.activation_settings set open7_days = 7 where id = 1;

insert into public.schema_migrations (version, name) values (148, 'single_link_form_geo_7day') on conflict (version) do nothing;

-- ---------------------------------------------------------------------------
-- 7. HQ master dashboard: everything the form captured, everything she did.
-- ---------------------------------------------------------------------------
create or replace function public.hq_activation_master(p_days int default 365)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => coalesce(p_days, 365)); out jsonb;
begin
  if not public.is_case_hq() then raise exception 'HQ only'; end if;
  perform public.activation_sweep();
  select jsonb_build_object(
    'link', (select jsonb_build_object('code', l.code, 'active', l.active,
              'visits', (select count(*) from referral_visits v where v.link_id = l.id),
              'visits_7d', (select count(*) from referral_visits v where v.link_id = l.id and v.visited_at >= now() - interval '7 days'),
              'visits_30d', (select count(*) from referral_visits v where v.link_id = l.id and v.visited_at >= now() - interval '30 days'),
              'last_visit', (select max(v.visited_at) from referral_visits v where v.link_id = l.id),
              'registrations', (select count(*) from candidate_activations a where a.referral_code = l.code))
             from referral_links l where l.code = 'WODDI'),
    'totals', (select jsonb_build_object(
        'candidates', count(*),
        'ref3', count(*) filter (where route = 'ref3'), 'open7', count(*) filter (where route = 'open7'),
        'not_started', count(*) filter (where status = 'not_started'),
        'in_progress', count(*) filter (where status = 'in_progress'),
        'completed', count(*) filter (where status = 'completed'),
        'incomplete', count(*) filter (where status in ('incomplete','closed')),
        'extension_requested', count(*) filter (where extension_status = 'requested'),
        'assess_submitted', (select count(*) from readiness_assessments r where r.status = 'submitted'),
        'assess_returned', (select count(*) from readiness_assessments r where r.status = 'returned'),
        'assess_completed', (select count(*) from readiness_assessments r where r.status = 'completed'),
        'selected', (select count(*) from readiness_assessments r where r.outcome = 'selected'),
        'reserve', (select count(*) from readiness_assessments r where r.outcome = 'reserve'),
        'further_review', (select count(*) from readiness_assessments r where r.outcome = 'further_review'),
        'not_selected', (select count(*) from readiness_assessments r where r.outcome = 'not_selected'),
        'wgmn', count(*) filter (where network = 'WGMN'), 'wnnn', count(*) filter (where network = 'WNNN'))
       from candidate_activations where created_at >= since),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('route', d.route, 'day', d.day, 'title', d.title,
        'reached', (select count(*) from candidate_activation_steps s join candidate_activations a on a.id = s.activation_id where a.route = d.route and s.day = d.day),
        'completed', (select count(*) from candidate_activation_steps s join candidate_activations a on a.id = s.activation_id where a.route = d.route and s.day = d.day and s.status = 'completed'))
        order by d.route, d.day), '[]'::jsonb) from activation_route_days d),
    'by_position', (select coalesce(jsonb_agg(x order by x->>'n' desc), '[]'::jsonb) from (
        select jsonb_build_object('position', coalesce(public.role_title(a.position_code, a.network), a.position_code, '—'), 'network', a.network,
          'n', count(*), 'completed', count(*) filter (where a.status = 'completed'),
          'selected', (select count(*) from readiness_assessments r where r.activation_id = any(array_agg(a.id)) and r.outcome = 'selected')) as x
        from candidate_activations a where a.created_at >= since group by a.position_code, a.network) s),
    'by_country', (select coalesce(jsonb_agg(x order by x->>'n' desc), '[]'::jsonb) from (
        select jsonb_build_object('country', coalesce(a.geo_country, '—'), 'n', count(*),
          'in_progress', count(*) filter (where a.status = 'in_progress'), 'completed', count(*) filter (where a.status = 'completed'),
          'incomplete', count(*) filter (where a.status in ('incomplete','closed')),
          'selected', (select count(*) from readiness_assessments r where r.activation_id = any(array_agg(a.id)) and r.outcome = 'selected')) as x
        from candidate_activations a where a.created_at >= since group by a.geo_country) s),
    'by_state', (select coalesce(jsonb_agg(x order by x->>'country', x->>'n' desc), '[]'::jsonb) from (
        select jsonb_build_object('country', coalesce(a.geo_country, '—'), 'state', coalesce(a.geo_state, '—'), 'n', count(*),
          'completed', count(*) filter (where a.status = 'completed')) as x
        from candidate_activations a where a.created_at >= since group by a.geo_country, a.geo_state) s),
    'candidates', (select coalesce(jsonb_agg(x order by x->>'started_at' desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'activation_id', a.id, 'profile_id', p.id, 'name', p.first_name || ' ' || p.last_name, 'email', p.email, 'phone', p.phone,
          'birth_date', p.birth_date, 'language', p.preferred_locale,
          'route', a.route, 'network', a.network,
          'position', coalesce(public.role_title(a.position_code, a.network), a.position_code),
          'country', a.geo_country, 'state', a.geo_state, 'lga', a.geo_lga, 'cluster', a.geo_cluster,
          'status', a.status, 'day', a.current_day,
          'days_total', (select count(*) from activation_route_days d where d.route = a.route),
          'started_at', a.started_at, 'deadline', coalesce(a.extension_until, a.deadline), 'completed_at', a.completed_at,
          'extension_status', a.extension_status,
          'steps', (select coalesce(jsonb_agg(jsonb_build_object('day', s.day, 'status', s.status, 'started_at', s.started_at,
                      'completed_at', s.completed_at, 'seconds', s.seconds_spent, 'reached_end', s.reached_end,
                      'acks', coalesce(jsonb_array_length(s.acks), 0), 'answers', s.answers) order by s.day), '[]'::jsonb)
                    from candidate_activation_steps s where s.activation_id = a.id),
          'assessment', ra.status, 'assessment_id', ra.id, 'total', ra.total, 'critical_ok', ra.critical_ok, 'outcome', ra.outcome,
          'submitted_at', ra.submitted_at, 'reviewer', (select first_name || ' ' || last_name from profiles where id = ra.reviewer_id)) as x
        from candidate_activations a join profiles p on p.id = a.profile_id
        left join readiness_assessments ra on ra.activation_id = a.id
        where a.created_at >= since) s)
  ) into out;
  return out;
end; $$;
revoke execute on function public.hq_activation_master(int) from anon;

-- pause/resume by code as well as by id
create or replace function public.referral_link_set(p_id uuid, p_active boolean, p_expires timestamptz default null, p_code text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  update referral_links set active = p_active, expires_at = coalesce(p_expires, expires_at)
   where (id = p_id or (p_code is not null and code = p_code))
     and (public.is_case_hq() or owner_id = auth.uid() or created_by = auth.uid());
  if not found then raise exception 'Link not found or not yours'; end if;
end; $$;
revoke execute on function public.referral_link_set(uuid, boolean, timestamptz, text) from anon;
