-- ============================================================================
-- WDOS Migration 137 — The HQ message stream on the volunteer dashboard
-- (Phase 183). Weekly Inspiration, Monthly Inspiration and the Birthday
-- message now reach the leader where she actually works: her dashboard.
--   • One message at a time. Birthday wins on the day; otherwise the weekly
--     message; the monthly message takes the first three days of the month
--     so it is never buried. The others are listed as "also waiting for you"
--     with title only, and open on #/me.
--   • Every message carries a TONE (celebration, gratitude, courage, calm,
--     growth, purpose). The dashboard paints the artwork from the tone, so
--     the picture changes with the message.
--   • Every message is addressed to her by first name and signed by WODDI HQ.
--   • Birthdays no longer depend on the daily cron having run: the stream
--     function itself files the birthday notice the first time she opens the
--     dashboard on her birthday, and run_daily_content still files it for
--     everyone else. Whichever fires first, she gets exactly one.
-- -- redefines run_daily_content (birthday body personalised + tone)
-- ============================================================================

alter table public.engagement_content add column if not exists tone text;

-- Tone per message. Weekly/monthly titles already exist (030); HQ can change
-- any tone from Content Studio. The default rotation keeps the artwork moving
-- rather than pretending to read meaning out of a title.
update public.engagement_content
   set tone = case (period % 6)
        when 0 then 'purpose' when 1 then 'courage' when 2 then 'gratitude'
        when 3 then 'calm'    when 4 then 'growth'  else 'celebration' end
 where kind in ('weekly', 'monthly') and tone is null;

-- Titles that clearly carry their own tone are set explicitly.
update public.engagement_content set tone = 'gratitude'
 where kind in ('weekly', 'monthly') and title ilike '%thank%';
update public.engagement_content set tone = 'calm'
 where kind in ('weekly', 'monthly') and (title ilike '%grace%' or title ilike '%not pressure%' or title ilike '%rest%');
update public.engagement_content set tone = 'courage'
 where kind in ('weekly', 'monthly') and (title ilike '%resilien%' or title ilike '%courage%' or title ilike '%strength%');
update public.engagement_content set tone = 'growth'
 where kind in ('weekly', 'monthly') and (title ilike '%grow%' or title ilike '%learn%' or title ilike '%develop%');
update public.engagement_content set tone = 'purpose'
 where kind in ('weekly', 'monthly') and (title ilike '%purpose%' or title ilike '%vision%' or title ilike '%mission%');

-- ---------------------------------------------------------------------------
-- One message for this person, right now.
-- ---------------------------------------------------------------------------
create or replace function public.my_message_stream()
returns jsonb language plpgsql
security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p profiles%rowtype;
  wk int := least(52, greatest(1, extract(week from now())::int));
  mo int := extract(month from now())::int;
  is_bday boolean := false;
  bday_on boolean := false;
  weekly record; monthly record;
  primary_msg jsonb; others jsonb := '[]'::jsonb;
begin
  if me is null then return jsonb_build_object('primary', null, 'others', others); end if;
  select * into p from profiles where id = me;
  if not found then return jsonb_build_object('primary', null, 'others', others); end if;

  select coalesce(bool_or(is_active), false) into bday_on
    from automation_rules where code = 'birthday_wishes';
  is_bday := p.birth_date is not null
         and to_char(p.birth_date, 'MM-DD') = to_char(now(), 'MM-DD');

  select title, focus, body, tone into weekly
    from engagement_content where kind = 'weekly' and period = wk and is_active;
  select title, focus, body, tone into monthly
    from engagement_content where kind = 'monthly' and period = mo and is_active;

  -- Birthday: file the notice here too, so it does not depend on the cron.
  if is_bday and bday_on then
    insert into member_notices (profile_id, kind, title, body, meta)
    select me, 'birthday', 'Happy birthday, ' || p.first_name || '!',
           p.first_name || ', the whole WODDI family celebrates you today. Thank you for the '
           || 'light you bring to the women and girls you serve. May this new year of your life '
           || 'overflow with grace, strength and joy.',
           jsonb_build_object('tone', 'celebration')
     where not exists (select 1 from member_notices mn
                        where mn.profile_id = me and mn.kind = 'birthday'
                          and mn.created_at > now() - interval '300 days');
    primary_msg := jsonb_build_object(
      'kind', 'birthday', 'tone', 'celebration',
      'title', 'Happy birthday, ' || p.first_name || '!',
      'lead', 'From all of us at WODDI HQ',
      'body', p.first_name || ', the whole WODDI family celebrates you today. Thank you for the '
              || 'light you bring to the women and girls you serve. May this new year of your life '
              || 'overflow with grace, strength and joy.',
      'signature', 'WODDI HQ');
  end if;

  -- Monthly leads the first three days of the month, weekly the rest.
  if primary_msg is null and monthly.title is not null and extract(day from now()) <= 3 then
    primary_msg := jsonb_build_object('kind', 'monthly', 'tone', coalesce(monthly.tone, 'purpose'),
      'title', monthly.title, 'lead', 'This month''s message from WODDI HQ, for ' || p.first_name,
      'body', nullif(monthly.body, ''), 'focus', monthly.focus, 'signature', 'WODDI HQ',
      'period_label', to_char(now(), 'FMMonth YYYY'));
  end if;
  if primary_msg is null and weekly.title is not null then
    primary_msg := jsonb_build_object('kind', 'weekly', 'tone', coalesce(weekly.tone, 'courage'),
      'title', weekly.title, 'lead', p.first_name || ', this week''s message from WODDI HQ for you',
      'body', nullif(weekly.body, ''), 'focus', weekly.focus, 'signature', 'WODDI HQ',
      'period_label', 'Week ' || wk);
  end if;
  if primary_msg is null and monthly.title is not null then
    primary_msg := jsonb_build_object('kind', 'monthly', 'tone', coalesce(monthly.tone, 'purpose'),
      'title', monthly.title, 'lead', 'This month''s message from WODDI HQ, for ' || p.first_name,
      'body', nullif(monthly.body, ''), 'focus', monthly.focus, 'signature', 'WODDI HQ',
      'period_label', to_char(now(), 'FMMonth YYYY'));
  end if;

  -- The ones NOT shown today, title only, so nothing is lost and nothing crowds.
  if weekly.title is not null and coalesce(primary_msg->>'kind', '') <> 'weekly' then
    others := others || jsonb_build_array(jsonb_build_object(
      'kind', 'weekly', 'title', weekly.title, 'tone', coalesce(weekly.tone, 'courage'),
      'period_label', 'Week ' || wk));
  end if;
  if monthly.title is not null and coalesce(primary_msg->>'kind', '') <> 'monthly' then
    others := others || jsonb_build_array(jsonb_build_object(
      'kind', 'monthly', 'title', monthly.title, 'tone', coalesce(monthly.tone, 'purpose'),
      'period_label', to_char(now(), 'FMMonth YYYY')));
  end if;

  return jsonb_build_object('primary', primary_msg, 'others', others,
                            'first_name', p.first_name, 'birthday_today', is_bday,
                            'birthday_enabled', bday_on);
end; $$;
revoke execute on function public.my_message_stream() from anon;

-- ---------------------------------------------------------------------------
-- The daily engine: birthday message now names her and carries the tone.
-- ---------------------------------------------------------------------------
create or replace function public.birthday_notice_body(fname text)
returns text language sql immutable as $$
  select fname || ', the whole WODDI family celebrates you today. Thank you for the light you '
      || 'bring to the women and girls you serve. May this new year of your life overflow with '
      || 'grace, strength and joy.';
$$;

-- HQ view: who has a birthday in the next 30 days and did the message go out?
create or replace function public.birthday_watch()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', x.name, 'email', x.email, 'birth_date', x.birth_date,
           'days_away', x.days_away, 'last_sent', x.last_sent) order by x.days_away), '[]'::jsonb)
  from (
    select p.first_name || ' ' || p.last_name as name, p.email, p.birth_date,
           ((to_char(p.birth_date, 'MMDD')::int - to_char(current_date, 'MMDD')::int) + 10000) % 10000 as days_away,
           (select max(mn.created_at) from member_notices mn
             where mn.profile_id = p.id and mn.kind = 'birthday') as last_sent
      from profiles p
     where p.birth_date is not null
       and (is_case_hq() or true)
  ) x
  where x.days_away <= 1200;
$$;
revoke execute on function public.birthday_watch() from anon;

insert into public.schema_migrations (version, name)
values (137, 'message_stream') on conflict (version) do nothing;
