-- ============================================================================
-- WDOS Migration 118 — Nigeria State / Assistant State Coordinators master
-- list (emails, phones, appointment dates) + seat backdating (Phase 150)
--   • leader_contacts_ng: the founder's updated list (73 rows).
--   • register_contacts_ng_apply(): matches each to the person in WDOS (login or
--     directory) by email or normalised name within Nigeria, fills missing
--     email/phone/state/appointment date, adds anyone not yet present.
--   • norm_state(): "Abuja (FCT)" / "FCT (Abuja)" / "Nassarawa" / "Nasarawa"
--     resolve to the same unit. directory_seat_target uses it, and returns
--     appointed_on so a seat created from the directory carries the real date.
--   • hq_backdate_seat(pid, role, d): sets starts_at of the current seat.
-- ============================================================================

create table if not exists public.leader_contacts_ng (
  id serial primary key, state text not null, full_name text not null, role public.role_code not null,
  email text, phone text, appointed_on date, applied_code text,
  matched_profile uuid references public.profiles(id) on delete set null, applied_at timestamptz
);
alter table public.leader_contacts_ng enable row level security;
drop policy if exists leader_contacts_ng_read on public.leader_contacts_ng;
create policy leader_contacts_ng_read on public.leader_contacts_ng for select to authenticated using (public.is_case_hq());
delete from public.leader_contacts_ng;
insert into public.leader_contacts_ng (state, full_name, role, email, phone, appointed_on) values
  ('Abia', 'Ogbonnaya Uwaezuoke Ndukwe', 'state_coordinator', 'uwaezundukwe12@gmail.com', '08033374025', '2026-03-14'),
  ('Abia', 'Onyinyechi Anne Nwafor', 'assistant_state_coordinator', 'annegift3@gmail.com', '+2347066046870', '2026-03-14'),
  ('Abuja (FCT)', 'Rahilla Success Daniel', 'state_coordinator', 'rdanielsuccess@gmail.com', '07012689778', '2026-06-11'),
  ('Abuja (FCT)', 'Mise Oluseyi Olufunke', 'assistant_state_coordinator', 'seyimise1@gmail.com', '+2348103473909', '2026-03-14'),
  ('Adamawa', 'Milcah Gaman', 'state_coordinator', 'milcahgaman41@gmail.com', '+2348104675570', '2026-03-14'),
  ('Adamawa', 'Hadiza Umar', 'assistant_state_coordinator', 'hajjaumar2013@gmail.com', '08036763689', '2026-03-14'),
  ('Akwa Ibom', 'Ikouwem Oku Isaac', 'state_coordinator', 'isaacikouwem@gmail.com', '09076306540', '2026-03-14'),
  ('Akwa Ibom', 'Essien Iniobong', 'assistant_state_coordinator', 'essieniniobong101@gmail.com', '07039571068', '2026-03-14'),
  ('Anambra', 'Chioma Okeoma Okonkwo', 'state_coordinator', 'chommy4life82@gmail.com', '08063594545', '2026-03-14'),
  ('Anambra', 'Chidubem Godfrey Nwachinemere', 'assistant_state_coordinator', 'chidubemnwachinemere@gmail.com', '+2348160218792', '2026-03-14'),
  ('Bauchi', 'Hajara Umaru', 'state_coordinator', 'hajaraumaru676@gmail.com', '08038194676', '2026-03-14'),
  ('Bauchi', 'Kubura Rabiu', 'assistant_state_coordinator', 'kuburarabiu@gmail.com', '08069250010', '2026-03-14'),
  ('Bayelsa', 'Doris Nurse-ere Ndoboke', 'state_coordinator', 'nurserendoboke@gmail.com', '07018211753', '2026-03-14'),
  ('Bayelsa', 'Etor Stella', 'assistant_state_coordinator', 'ebierestella@gmail.com', '08036338496', '2026-06-11'),
  ('Benue', 'Elizabeth Dooshima Akoh-Kohol', 'state_coordinator', 'doshliz69@gmail.com', '08034404559', '2026-03-14'),
  ('Benue', 'Ogoyi Ochanya Gloria', 'assistant_state_coordinator', 'g71876882@gmail.com', '08162562662', '2026-03-14'),
  ('Borno', 'Ruqayyah Abba Waziri', 'state_coordinator', 'ruqayyah6050@gmail.com', '+2347032029756', '2026-03-14'),
  ('Borno', 'Mary Dona Terry', 'assistant_state_coordinator', 'maryezekyel007@gmail.com', '07060982192', '2026-03-14'),
  ('Cross River', 'Inya Elemi', 'state_coordinator', 'inyaelemi@yahoo.com', '+2348068942035', '2026-03-14'),
  ('Cross River', 'James Ofem Otu', 'assistant_state_coordinator', 'james.otu2025@gmail.com', '08130020924', '2026-03-14'),
  ('Delta', 'Florence Ogonegbu', 'state_coordinator', 'overflowingflorence@gmail.com', '08142743623', '2026-03-14'),
  ('Delta', 'Erhuvwu Lisa Tarhe', 'assistant_state_coordinator', 'lisrus007@gmail.com', '+2348036172416', '2026-03-14'),
  ('Ebonyi', 'Nwali Esther Ndidi', 'state_coordinator', 'estheronyeka173@gmail.com', '08067478361', '2026-03-14'),
  ('Ebonyi', 'Oreke Chinazor', 'assistant_state_coordinator', 'chinazorchinedu@gmail.com', '+2348035118144', '2026-03-14'),
  ('Edo', 'Christy Okpedo', 'state_coordinator', 'iifychriss@gmail.com', '08039446122', '2026-03-14'),
  ('Edo', 'Emonvuon Helen', 'assistant_state_coordinator', 'helenoboh2020@gmail.com', '08063622180', '2026-03-14'),
  ('Ekiti', 'Adeniyi Ijeoma Kolawolle', 'state_coordinator', 'adeniyiijeoma87@gmail.com', '09011260466', '2026-06-11'),
  ('Ekiti', 'Hammed Omolayo Bello', 'assistant_state_coordinator', 'bellohammed6@gmail.com', '07064636892', '2026-03-14'),
  ('Enugu', 'Ruth Obioma Ngoka', 'state_coordinator', 'ngokaruthobioma@gmail.com', '+2348031933103', '2026-03-14'),
  ('Enugu', 'Asika Christiana Ogechi', 'assistant_state_coordinator', 'aogechiasika@gmail.com', '+2348063923944', '2026-03-14'),
  ('Gombe', 'Miriam Monday Umar', 'state_coordinator', 'miriamumar30@gmail.com', '08136597157', '2026-03-14'),
  ('Gombe', 'Elizabeth David Ankama', 'assistant_state_coordinator', 'elizabethankama222@gmail.com', '+2348130814198', '2026-03-14'),
  ('Imo', 'Theresa Ohanuba', 'state_coordinator', null, null, '2026-03-14'),
  ('Jigawa', 'Umma Mohammed Lawal', 'state_coordinator', 'uhmmarhhernie@gmail.com', '+2348134063987', '2026-03-14'),
  ('Jigawa', 'Aisha Muhammad Sabo', 'assistant_state_coordinator', 'aishamuhammadsabo2004@gmail.com', '08109021686', '2026-03-14'),
  ('Kaduna', 'Nafisa Shuaibu', 'state_coordinator', 'shuaibunafisa1@gmail.com', '08169198088', '2026-03-14'),
  ('Kaduna', 'Jemimah Adamu Dattijo', 'assistant_state_coordinator', 'jemdattijo@gmail.com', '07061807704', '2026-03-14'),
  ('Katsina', 'Murjanatu Yakubu', 'state_coordinator', 'murjanatuyakubusadauki@gmail.com', '+2348037143766', '2026-03-14'),
  ('Katsina', 'Rahab Sani', 'assistant_state_coordinator', 'rahamasanir@gmail.com', '08068384700', '2026-03-14'),
  ('Kano', 'Maryam Mshelia', 'state_coordinator', 'maryammshelia001@gmail.com', '07058070502', '2026-03-14'),
  ('Kano', 'Jennifer Azi', 'assistant_state_coordinator', 'azijenifa@gmail.com', '08027913810', '2026-03-14'),
  ('Kebbi', 'Esther Hindi', 'state_coordinator', 'estherhindi78@gmail.com', '08065289992', '2026-03-14'),
  ('Kebbi', 'Lami Abdullah', 'assistant_state_coordinator', 'beckyjatau23@gmail.com', '08025740853', '2026-03-14'),
  ('Kogi', 'Ahmed Safinat Lami', 'state_coordinator', 'ahmed.safinat88@gmail.com', '+2347036127120', '2026-03-14'),
  ('Kogi', 'Salimat Mohammed Mamma', 'assistant_state_coordinator', 'hellosalima07@gmail.com', '+2348153420491', '2026-03-14'),
  ('Kwara', 'Ojo Olasunkanmi Susan', 'state_coordinator', 'ojoolasunkanmisusan@gmail.com', null, '2026-06-11'),
  ('Kwara', 'Abdulganeey Abdullateef okubii', 'assistant_state_coordinator', 'abdullateefishola15@gmail.com', '+2348064032055', '2026-03-14'),
  ('Lagos', 'Ojo Ayodele Adedoyin', 'state_coordinator', 'ayodeleojo124@gmail.com', '08167632201', '2026-03-14'),
  ('Lagos', 'Ejim Esther Chinonyerem', 'assistant_state_coordinator', 'estherejim59@gmail.com', '+234 8134211654', '2026-03-14'),
  ('Nassarawa', 'Joy Naveh Joseph', 'state_coordinator', 'navehjoyjoseph@gmail.com', '2348103475574', '2026-03-14'),
  ('Nassarawa', 'Wubunna Ishaku Gofwen', 'assistant_state_coordinator', 'gwubunna@gmail.com', '+234 8038634711', '2026-03-14'),
  ('Niger', 'Olagoke Precious Abisola', 'state_coordinator', 'olagokeprecious12@gmail.com', '+2347087583976', '2026-03-14'),
  ('Niger', 'Alli Theophilus Umakhe', 'assistant_state_coordinator', 'theophilusalli@gmail.com', '+2348085370463', '2026-03-14'),
  ('Ogun', 'Oni-Ashamu Funmi', 'state_coordinator', 'mutualimpactcooperative@gmail.com', '07035608804', '2026-03-14'),
  ('Ogun', 'Enimehin Temilade Alice', 'assistant_state_coordinator', 'fantatemmy@gmail.com', '08164476170', '2026-03-14'),
  ('Ondo', 'Gbugbemi Erefe', 'state_coordinator', 'bubemierefe@gmail.com', null, '2026-06-11'),
  ('Ondo', 'Victor Olajide Olorundare', 'assistant_state_coordinator', 'olorundarevictor1930@gmail.com', '08062817564', '2026-03-14'),
  ('Osun', 'Odekunle Rolake Gladys', 'state_coordinator', 'nafiugladys@gmail.com', '08033921939', '2026-03-14'),
  ('Osun', 'Abioye Omowumi Selimot', 'assistant_state_coordinator', 'abioyeselimot3@gmail.com', '07036365239', '2026-03-14'),
  ('Oyo', 'Ishola Iyabode Olajumoke', 'state_coordinator', 'iyaboishola1981@gmail.com', '08034238204', '2026-03-14'),
  ('Oyo', 'Hamzat Aminat Abiola', 'assistant_state_coordinator', 'hamzataminatabolanle1999@gmail.com', '08118323677', '2026-03-14'),
  ('Plateau', 'Tabitha Solomon', 'state_coordinator', 'tabsy247@gmail.com', '08064338720', '2026-03-14'),
  ('Plateau', 'Pharm. Mercy Tanko Ndam', 'assistant_state_coordinator', 'ndammercytanko@gmail.com', '+2347066957401', '2026-03-14'),
  ('Rivers', 'Kaafor Tombari Elizabeth', 'state_coordinator', 'elizabethkaafortombari@gmail.com', '+234 7034602263', '2026-03-14'),
  ('Rivers', 'Mercy Sor-aniabari Joshua', 'assistant_state_coordinator', 'mercyjoshua211@gmail.com', '+2347039665850', '2026-03-14'),
  ('Sokoto', 'Bernardine Ezeobodo Uche', 'state_coordinator', 'ezeobodouche1975@gmail.com', '08100990052', '2026-03-14'),
  ('Sokoto', 'Aisha Bello', 'assistant_state_coordinator', 'aishaukpe@gmail.com', '08145581612', '2026-03-14'),
  ('Taraba', 'Kaltume Vogadika', 'state_coordinator', 'kvogadika@gmail.com', '+2348131307281', '2026-03-14'),
  ('Taraba', 'Gimba John Sule', 'assistant_state_coordinator', 'gimbason04@gmail.com', '+2348136836709', '2026-03-14'),
  ('Yobe', 'Hadiza Adamu Iyam', 'state_coordinator', 'iyamhadiza@gmail.com', '08039385101', '2026-06-11'),
  ('Yobe', 'Abubakar Dauda Maina', 'assistant_state_coordinator', 'abubakardmaina@gmail.com', '+2349036652164', '2026-03-14'),
  ('Zamfara', 'Asiya Muhammad Bello', 'state_coordinator', 'asiyabello98@gmail.com', '+2348130015022', '2026-03-14'),
  ('Zamfara', 'Aishatu Abdu Gusau', 'assistant_state_coordinator', 'hifactorinc34@yahoo.com', '08035299181', '2026-03-14');

alter table public.leader_directory add column if not exists appointed_on date;

create or replace function public.norm_state(s text) returns text
language sql immutable as $$
  select case
    when lower(coalesce(s, '')) ~ 'fct|abuja|federal capital' then 'fct'
    else regexp_replace(replace(replace(lower(coalesce(s, '')), 'nassarawa', 'nasarawa'), 'akwa-ibom', 'akwa ibom'), '[^a-z]', '', 'g') end;
$$;

create or replace function public.register_contacts_ng_apply()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; n_new int := 0; n_upd int := 0; n_prof int := 0; c text; code text; parts text[]; pid uuid; dcode text;
begin
  if auth.uid() is not null and not is_case_hq() then raise exception 'HQ only'; end if;
  for r in select * from leader_contacts_ng order by id loop
    select p.id into pid from profiles p where p.merged_into is null
      and ((r.email is not null and lower(p.email) = r.email)
           or (name_match(r.full_name, p.first_name || ' ' || p.last_name) and lower(coalesce(p.country, 'nigeria')) = 'nigeria')) limit 1;
    if pid is not null then
      update profiles set phone = coalesce(phone, r.phone), state_region = coalesce(state_region, r.state) where id = pid;
      update leader_contacts_ng set matched_profile = pid, applied_at = now() where id = r.id;
      n_prof := n_prof + 1; continue;
    end if;
    select d.member_code into dcode from leader_directory d where d.claimed_profile is null
      and ((r.email is not null and lower(coalesce(d.email, '')) = r.email)
           or (name_match(r.full_name, d.first_name || ' ' || d.last_name) and (d.state is null or norm_state(d.state) = norm_state(r.state)))) limit 1;
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
        (select o.id from org_units o, d where o.level = 'country'
           and (lower(o.name) = lower(d.country) or upper(coalesce(o.country_iso, '')) = upper(coalesce((select country_iso from leader_contacts where lower(country) = lower(d.country) limit 1), '')))
         limit 1)
      when (select role from role) in ('state_coordinator', 'assistant_state_coordinator') then
        (select o.id from org_units o, d where o.level = 'state_region' and d.state is not null
           and norm_state(o.name) = norm_state(d.state)
           and (lower(coalesce(d.country, 'nigeria')) <> 'nigeria' or exists (select 1 from unit_chain(o.id) c where c.level = 'country' and lower(c.name) = 'nigeria'))
         limit 1)
      when (select role from role) in ('district_coordinator', 'assistant_district_coordinator') then
        (select o.id from org_units o, d where o.level = 'district_lga' and d.state is not null and lower(o.name) = lower(d.state) limit 1)
      else null end as id)
  select jsonb_build_object('role', (select role from role), 'unit_id', (select id from unit),
           'unit', (select name from org_units where id = (select id from unit)),
           'appointed_on', (select appointed_on from d));
$$;
revoke execute on function public.directory_seat_target(text) from anon;

create or replace function public.hq_backdate_seat(pid uuid, p_role public.role_code, d date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_case_hq() then raise exception 'HQ only'; end if;
  if d is null then return; end if;
  update role_assignments set starts_at = d::timestamptz, accepted_at = coalesce(accepted_at, d::timestamptz)
   where profile_id = pid and role = p_role and ends_at is null;
end; $$;
revoke execute on function public.hq_backdate_seat(uuid, public.role_code, date) from anon;

insert into public.schema_migrations (version, name)
values (118, 'ng_state_coordinators_contacts') on conflict (version) do nothing;
