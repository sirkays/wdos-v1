-- 168 (2 Oct 2026, APPLIED LIVE via the connector)
-- 25 profiles had a country of '' or spaces, which reports and filters treated
-- as a country of its own. Unknown is NULL.
update public.profiles set country = null where country is not null and trim(country) = '';
update public.profiles set state_region = null where state_region is not null and trim(state_region) = '';
insert into public.schema_migrations (version, name) values (168, 'blank_country_to_null') on conflict do nothing;
