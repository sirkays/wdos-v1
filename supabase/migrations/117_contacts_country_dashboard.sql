-- ============================================================================
-- WDOS Migration 117 — CR/DCR Contact Master List (emails + phones) into the
-- directory; Country Representative dashboard data (Phase 149)
--   • leader_contacts: the black rows of the founder's Contact Master List.
--     Rows the founder marked in red (Congo CR, Morocco CR, Rwanda CR and DCR,
--     Senegal DCR, Tunisia CR and DCR, and red vacant seats) are NOT loaded.
--   • register_contacts_apply(): matches each row to the person already in
--     WDOS (profile or directory) by normalised name within the country,
--     fills a missing email/phone on the directory row, and adds a directory
--     row for anyone not yet present, so Accounts can create the login.
--   • country_dashboard(p_unit): what a Country Representative sees for the
--     structure below her: coverage by level, leaders by state with
--     responsiveness (last seen), report status, tasks, activities, members;
--     drill-down by passing a state or LGA unit.
--   • directory_seat_target(code): the seat a directory row should get when
--     its login is created (role + unit from role_applied, country, state).
-- ============================================================================

create table if not exists public.leader_contacts (
  id serial primary key, country text not null, country_iso text not null,
  full_name text not null, role public.role_code not null, email text, phone text,
  applied_code text, matched_profile uuid references public.profiles(id) on delete set null, applied_at timestamptz
);
alter table public.leader_contacts enable row level security;
drop policy if exists leader_contacts_read on public.leader_contacts;
create policy leader_contacts_read on public.leader_contacts for select to authenticated using (public.is_case_hq());
delete from public.leader_contacts;
insert into public.leader_contacts (country, country_iso, full_name, role, email, phone) values
  ('Benin', 'BJ', 'Hessou Aline Félicienne', 'country_rep', 'hessou.aline@gmail.com', '+2290162204468'),
  ('Benin', 'BJ', 'Yorou Barkissou', 'deputy_country_rep', 'ybarkissou@gmail.com', '+229 01 97 18 66 54'),
  ('Burkina Faso', 'BF', 'Denne Irène', 'deputy_country_rep', 'irene.denne@gmail.com', '+226 71598366'),
  ('Burundi', 'BI', 'Alice Orly Museli', 'country_rep', 'aliceorlyumuvyeyi@gmail.com', '+234 810 849 2974'),
  ('Cameroon', 'CM', 'Mandunh Mbohou Awawou', 'country_rep', 'radhiyabintou@gmail.com', '+237 671590554'),
  ('Cameroon', 'CM', 'Kwedi Pyo Lydienne', 'deputy_country_rep', 'kwedilydia23@gmail.com', '+237 691 034476'),
  ('Cameroon', 'CM', 'Blessing Vinyoh', 'state_coordinator', 'vinyohblessing@gmail.com', '+237 650 660436'),
  ('Central African Republic', 'CF', 'Amina Bello', 'country_rep', 'aminabello745@gmail.com', '+236 75 42 42 69'),
  ('Central African Republic', 'CF', 'Koradjim Lionel', 'deputy_country_rep', 'koradjimlionel72@gmail.com', '+236 72999501'),
  ('Chad', 'TD', 'Hinberka Beblere Florice', 'country_rep', 'hinberkaflorice@gmail.com', '+23563379637'),
  ('Chad', 'TD', 'Tchindebe Antoinette Fanone', 'deputy_country_rep', 'famiel.tchad@gmail.com', '+235 62 46 75 13'),
  ('Cote d''Ivoire', 'CI', 'Soro Gnimey Cintia Louisette', 'country_rep', 'cintialouisette@yahoo.fr', '+2250707602002'),
  ('Cote d''Ivoire', 'CI', 'Attemene Yannick', 'deputy_country_rep', 'attemeneyannick@gmail.com', '+225 0777531432'),
  ('Democratic Republic of the Congo', 'CD', 'Furaha Maroy Judith', 'country_rep', 'judithmaroy@gmail.com', '+243995519371'),
  ('Democratic Republic of the Congo', 'CD', 'Nshembe Chishungu Eric Nice', 'deputy_country_rep', 'ericnshembe@gmail.com', '+243993008031'),
  ('The Gambia', 'GM', 'Haddy Semega Janneh', 'country_rep', 'haddysemegajanneh@gmail.com', null),
  ('Ghana', 'GH', 'Serwaa Brakatu', 'country_rep', null, '+233554841456'),
  ('Ghana', 'GH', 'Esther Takyiwaah Prempeh', 'deputy_country_rep', 'prempehesthertakyiwaah@gmail.com', '+233244791883'),
  ('Guinea', 'GN', 'Koulako Kamissoko', 'country_rep', 'koulako.kamissoko@gmail.com', '+224 621097639'),
  ('Guinea', 'GN', 'Bah Ramata Benny', 'deputy_country_rep', 'bahramatabenny@gmail.com', '+224622031660'),
  ('Guinea-Bissau', 'GW', 'Mariama Fati', 'country_rep', 'mariamafati065@gmail.com', '+245955400841'),
  ('Madagascar', 'MG', 'Ainasoa Rakotoniera', 'country_rep', 'ainasoarakoto@gmail.com', '+261 0320784716'),
  ('Madagascar', 'MG', 'Tinarivo Baby Emmanuel', 'deputy_country_rep', 'babyes.emmanuel@gmail.com', '+261 34 52 649 33'),
  ('Mali', 'ML', 'Salimata Coulibaly', 'country_rep', 'salimata.coulibaly.kane@gmail.com', '+223 75999453'),
  ('Mali', 'ML', 'Binta Coulibaly', 'deputy_country_rep', 'binete37@gmail.com', '+22390621900'),
  ('Niger', 'NE', 'Abdou Mariama', 'country_rep', 'amariama97@yahoo.fr', '+227 99 89 72 30'),
  ('Niger', 'NE', 'Zaleha Salha Abou', 'deputy_country_rep', 'salhaabouz@gmail.com', '+22788124816'),
  ('Nigeria', 'NG', 'Ngunan Addingi', 'country_rep', 'beekasinvest@gmail.com', '+234 803 349 9578'),
  ('Nigeria', 'NG', 'Maureen Nkechi Chukwuemeka', 'deputy_country_rep', 'maureenchukwuemeka@gmail.com', '+234 8034753667'),
  ('Senegal', 'SN', 'Sophie Dior Diack', 'country_rep', 'sodiordiack@gmail.com', '+221 76 228 09 80'),
  ('South Africa', 'ZA', 'Tshegofatso Gama', 'country_rep', 'molokoane.m.t@gmail.com', '+27730386265'),
  ('Togo', 'TG', 'Pakou Akouvi Emefa', 'country_rep', 'bonemef84@gmail.com', '+228 90 07 68 61'),
  ('Togo', 'TG', 'Soriyath Lisette Maëlle Bertille Gantua', 'deputy_country_rep', 'sgantua@gmail.com', '+228 91 54 94 87'),
  ('Uganda', 'UG', 'Zalwango Grace', 'country_rep', 'zalwangograce46@gmail.com', '+256 745 009128'),
  ('Uganda', 'UG', 'Mundrua Margaret', 'deputy_country_rep', 'mundruamargaret7@gmail.com', '+256 756 119160');

alter table public.leader_directory add column if not exists phone text;

create or replace function public.register_contacts_apply()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; n_new int := 0; n_upd int := 0; n_prof int := 0; c text; code text; parts text[]; pid uuid; dcode text;
begin
  if auth.uid() is not null and not is_case_hq() then raise exception 'HQ only'; end if;
  for r in select * from leader_contacts order by id loop
    -- already a person with a login?
    select p.id into pid from profiles p where p.merged_into is null
      and (lower(p.email) = lower(coalesce(r.email, '')) or (name_match(r.full_name, p.first_name || ' ' || p.last_name)
           and lower(coalesce(p.country, '')) in (lower(r.country), ''))) limit 1;
    if pid is not null then
      update profiles set phone = coalesce(phone, r.phone) where id = pid;
      update leader_contacts set matched_profile = pid, applied_at = now() where id = r.id;
      n_prof := n_prof + 1; continue;
    end if;
    -- already in the directory (no login yet)?
    select d.member_code into dcode from leader_directory d where d.claimed_profile is null
      and (lower(coalesce(d.email, '')) = lower(coalesce(r.email, '')) and r.email is not null
           or name_match(r.full_name, d.first_name || ' ' || d.last_name)) limit 1;
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

-- the seat a directory row should receive when its login is created
create or replace function public.directory_seat_target(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  with d as (select * from leader_directory where member_code = p_code),
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
        (select o.id from org_units o, d where o.level = 'country' and (lower(o.name) = lower(d.country) or upper(o.country_iso) = upper(coalesce((select country_iso from leader_contacts where lower(country) = lower(d.country) limit 1), ''))) limit 1)
      when (select role from role) in ('state_coordinator', 'assistant_state_coordinator', 'district_coordinator', 'assistant_district_coordinator') then
        (select o.id from org_units o, d where o.level in ('state_region', 'district_lga') and d.state is not null and lower(o.name) = lower(d.state) limit 1)
      else null end as id)
  select jsonb_build_object('role', (select role from role), 'unit_id', (select id from unit),
           'unit', (select name from org_units where id = (select id from unit)));
$$;
revoke execute on function public.directory_seat_target(text) from anon;

-- Country Representative dashboard
create or replace function public.country_dashboard(p_unit uuid default null, p_net text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare unit uuid := p_unit; net public.network_code; scope uuid[]; pr record;
begin
  if unit is null then select org_unit_id into unit from report_unit_for(auth.uid()); end if;
  if unit is null then raise exception 'No leadership unit'; end if;
  if not (is_case_hq() or unit in (select administered_units())) then raise exception 'Outside your leadership scope'; end if;
  net := coalesce(nullif(upper(p_net), ''), (select network from profiles where id = auth.uid()), 'WGMN')::public.network_code;
  select coalesce(array_agg(id), '{}') into scope from org_unit_subtree(unit) as s(id);
  select * into pr from report_period('monthly_leadership', (current_date - interval '1 month')::date);
  return jsonb_build_object(
    'unit', (select jsonb_build_object('id', o.id, 'name', o.name, 'level', o.level, 'country_iso', o.country_iso) from org_units o where o.id = unit),
    'period', jsonb_build_object('start', pr.period_start, 'due', pr.due_on),
    'totals', (select jsonb_build_object(
        'units', count(*), 'leaders', (select count(distinct ra.profile_id) from role_assignments ra join profiles p on p.id = ra.profile_id
                                         where ra.org_unit_id = any(scope) and ra.ends_at is null and p.network = net and ra.role in (select role from position_master)),
        'active7', (select count(distinct ra.profile_id) from role_assignments ra join profiles p on p.id = ra.profile_id
                      where ra.org_unit_id = any(scope) and ra.ends_at is null and p.network = net and ra.role in (select role from position_master) and p.last_seen_at > now() - interval '7 days'),
        'active30', (select count(distinct ra.profile_id) from role_assignments ra join profiles p on p.id = ra.profile_id
                      where ra.org_unit_id = any(scope) and ra.ends_at is null and p.network = net and ra.role in (select role from position_master) and p.last_seen_at > now() - interval '30 days'),
        'members', (select count(*) from profiles p where p.org_unit_id = any(scope) and p.network = net and p.merged_into is null and p.status not in ('applicant', 'under_review')),
        'tasks_open', (select count(*) from tasks t where t.org_unit_id = any(scope) and t.status in ('not_started', 'in_progress', 'awaiting_review')),
        'tasks_overdue', (select count(*) from tasks t where t.org_unit_id = any(scope) and t.status in ('not_started', 'in_progress', 'awaiting_review') and t.due_on < current_date),
        'activities30', (select count(*) from activity_records a where a.org_unit_id = any(scope) and a.occurred_at > now() - interval '30 days'),
        'meetings30', (select count(*) from meetings m where m.org_unit_id = any(scope) and m.starts_at > now() - interval '30 days'),
        'issues_open', (select count(*) from issues i where i.org_unit_id = any(scope) and i.status in ('open', 'in_progress', 'awaiting_decision')))
      from org_units o where o.id = any(scope) and o.id <> unit),
    'by_level', (select coalesce(jsonb_agg(jsonb_build_object('level', x.level, 'role', x.role, 'seats', x.seats, 'filled', x.filled) order by x.seq), '[]'::jsonb)
      from (select pm.level, pm.role, pm.seq, count(*) as seats,
                   count(*) filter (where exists (select 1 from role_assignments ra join profiles p on p.id = ra.profile_id
                                                   where ra.org_unit_id = s.id and ra.role = pm.role and ra.ends_at is null and p.network = net)) as filled
              from org_units s join position_master pm on pm.level = s.level
             where s.id = any(scope) and s.level <> 'headquarters' group by pm.level, pm.role, pm.seq) x),
    'children', (select coalesce(jsonb_agg(row_to_json(c)::jsonb order by c.name), '[]'::jsonb) from (
      select o.id as unit_id, o.name, o.level,
        (select count(*) from org_unit_subtree(o.id)) - 1 as sub_units,
        (select count(*) from org_units s join position_master pm on pm.level = s.level where s.id in (select id from org_unit_subtree(o.id))) as seats,
        (select count(*) from role_assignments ra join profiles p on p.id = ra.profile_id
          where ra.org_unit_id in (select id from org_unit_subtree(o.id)) and ra.ends_at is null and p.network = net and ra.role in (select role from position_master)) as filled,
        (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.first_name || ' ' || p.last_name, 'role', ra.role, 'unit', u2.name,
             'last_seen', p.last_seen_at, 'email', p.email, 'phone', p.phone,
             'resp', case when p.last_seen_at > now() - interval '7 days' then 'active' when p.last_seen_at > now() - interval '30 days' then 'quiet' when p.last_seen_at is null then 'never' else 'inactive' end)
             order by (select seq from position_master where role = ra.role), p.last_name), '[]'::jsonb)
           from role_assignments ra join profiles p on p.id = ra.profile_id join org_units u2 on u2.id = ra.org_unit_id
          where ra.org_unit_id in (select id from org_unit_subtree(o.id)) and ra.ends_at is null and p.network = net and ra.role in (select role from position_master)) as leaders,
        (select r.status::text from report_instances r where r.org_unit_id = o.id and r.template = 'monthly_leadership' and r.network = net and r.period_start = pr.period_start and r.is_current limit 1) as report_status,
        (select r.id from report_instances r where r.org_unit_id = o.id and r.template = 'monthly_leadership' and r.network = net and r.period_start = pr.period_start and r.is_current limit 1) as report_id,
        (select count(*) from tasks t where t.org_unit_id in (select id from org_unit_subtree(o.id)) and t.status in ('not_started', 'in_progress', 'awaiting_review')) as tasks_open,
        (select count(*) from tasks t where t.org_unit_id in (select id from org_unit_subtree(o.id)) and t.status in ('not_started', 'in_progress', 'awaiting_review') and t.due_on < current_date) as tasks_overdue,
        (select count(*) from activity_records a where a.org_unit_id in (select id from org_unit_subtree(o.id)) and a.occurred_at > now() - interval '30 days') as activities30,
        (select count(*) from profiles p where p.org_unit_id in (select id from org_unit_subtree(o.id)) and p.network = net and p.merged_into is null and p.status not in ('applicant', 'under_review')) as members
      from org_units o where o.parent_id = unit) c),
    'generated_at', now());
end; $$;
revoke execute on function public.country_dashboard(uuid, text) from anon;

insert into public.schema_migrations (version, name)
values (117, 'contacts_country_dashboard') on conflict (version) do nothing;
