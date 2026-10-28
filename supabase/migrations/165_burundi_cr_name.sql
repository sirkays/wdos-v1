-- 165 — Burundi Country Representative's surname (2 Oct 2026). APPLIED LIVE via the connector.
-- She wrote: "My name is Alice Orly Umuvyeyi, not Museli". Her login email
-- (aliceorlyumuvyeyi@gmail.com) and her Google account name agree.
update public.profiles set last_name = 'Orly Umuvyeyi', updated_at = now()
 where id = '16dd99cb-57a6-4f9a-b646-bfdb77fb18fe' and last_name = 'Orly Museli';
update public.leader_directory set last_name = 'Orly Umuvyeyi'
 where member_code = 'CR-BI' and last_name = 'Orly Museli';
update public.leader_contacts set full_name = 'Alice Orly Umuvyeyi' where full_name = 'Alice Orly Museli';
update public.leader_register set full_name = 'Alice Orly Umuvyeyi' where full_name = 'Alice Orly Museli';
update auth.users set raw_user_meta_data = raw_user_meta_data || '{"last_name":"Orly Umuvyeyi"}'::jsonb
 where id = '16dd99cb-57a6-4f9a-b646-bfdb77fb18fe';
insert into public.schema_migrations (version, name) values (165, 'burundi_cr_name') on conflict do nothing;
