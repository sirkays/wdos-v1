-- ============================================================================
-- WDOS Migration 139 — Bodies for the weekly and monthly inspiration (Phase 185)
-- The 52 weekly and 12 monthly messages carried a title only, so the dashboard
-- card had nothing to say. Each now has a short body: two or three sentences,
-- long enough to be worth reading, short enough to read on a phone between
-- meetings. The dashboard adds her name and signs it WODDI HQ.
-- HQ edits any of them in Content Studio.
-- ============================================================================

update public.engagement_content set body = 'You did not join WODDI to serve alone. Across more than fifty countries, women are doing the same quiet work you are doing this week. When the day feels small, remember the size of what you belong to.' where kind = 'weekly' and period = 1 and coalesce(body,'') = '';
update public.engagement_content set body = 'Titles organise work, but hearts move people. The leaders members remember are the ones who noticed them. Lead this week from the heart first, and let the structure follow.' where kind = 'weekly' and period = 2 and coalesce(body,'') = '';
update public.engagement_content set body = 'Purpose carries you further than pressure ever will. Pressure asks what others will think; purpose asks who needs you. Serve from purpose this week and the weight becomes lighter.' where kind = 'weekly' and period = 3 and coalesce(body,'') = '';
update public.engagement_content set body = 'Consistency is the rarest leadership gift. One faithful meeting, one message sent on time, one member followed up. Done weekly, these small acts become the reason people trust the network.' where kind = 'weekly' and period = 4 and coalesce(body,'') = '';
update public.engagement_content set body = 'When a woman lifts another woman, two homes change. Nations are not built by speeches but by women who refuse to rise alone. Reach for someone this week.' where kind = 'weekly' and period = 5 and coalesce(body,'') = '';
update public.engagement_content set body = 'Somewhere in your chapter a woman is close to giving up. Your voice, used kindly and on purpose, may be the reason she stays. Encouragement costs little and changes much.' where kind = 'weekly' and period = 6 and coalesce(body,'') = '';
update public.engagement_content set body = 'A title tells people where you sit. Responsibility tells them what they can count on. Let this week show the second more than the first.' where kind = 'weekly' and period = 7 and coalesce(body,'') = '';
update public.engagement_content set body = 'Much of leadership is unseen: the follow-up call, the record kept, the member remembered. Heaven and your members notice what no report captures. The quiet work still matters.' where kind = 'weekly' and period = 8 and coalesce(body,'') = '';
update public.engagement_content set body = 'A good mother does not stop at her gate. What she nurtures at home she carries into her street, her chapter and her community. Build beyond your home this week.' where kind = 'weekly' and period = 9 and coalesce(body,'') = '';
update public.engagement_content set body = 'Mentorship is simply one woman holding the light steady while another finds her footing. You do not need to be an expert, only a step ahead and willing to turn around.' where kind = 'weekly' and period = 10 and coalesce(body,'') = '';
update public.engagement_content set body = 'Waiting to be perfect is how good work dies. Members need a leader who is present, honest and learning, not one who is flawless. Begin with what you have.' where kind = 'weekly' and period = 11 and coalesce(body,'') = '';
update public.engagement_content set body = 'Strength that cannot be gentle is not yet mature. A woman who can be firm and tender in the same hour is the kind of leader communities follow for years.' where kind = 'weekly' and period = 12 and coalesce(body,'') = '';
update public.engagement_content set body = 'Influence built on humility lasts. People forget what position you held and remember how you treated them. Build slowly, build humbly, and it will hold.' where kind = 'weekly' and period = 13 and coalesce(body,'') = '';
update public.engagement_content set body = 'Transformation rarely arrives as an event. It comes as a hundred small services, repeated. What you do this week may look ordinary and still be the thing that lasts.' where kind = 'weekly' and period = 14 and coalesce(body,'') = '';
update public.engagement_content set body = 'Others are watching how you keep going. Your steadiness gives permission to women who are not yet sure they can lead. Your commitment is contagious.' where kind = 'weekly' and period = 15 and coalesce(body,'') = '';
update public.engagement_content set body = 'Recognition is pleasant, but service is the work. Serve first, serve when nobody records it, and recognition will find you carrying something worth recognising.' where kind = 'weekly' and period = 16 and coalesce(body,'') = '';
update public.engagement_content set body = 'Emotional strength is not hardness. It is the ability to stay calm, listen well and not repay hurt with hurt. In volunteer leadership this gift holds teams together.' where kind = 'weekly' and period = 17 and coalesce(body,'') = '';
update public.engagement_content set body = 'Work disconnected from vision becomes a chore. Return this week to why WODDI exists and why you said yes. The tasks will make sense again.' where kind = 'weekly' and period = 18 and coalesce(body,'') = '';
update public.engagement_content set body = 'Service changes the one who serves. The patience, courage and clarity you are gaining now are not side effects; they are part of the reason you were called.' where kind = 'weekly' and period = 19 and coalesce(body,'') = '';
update public.engagement_content set body = 'Three members, one small chapter, one honest report. Do not despise it. Every large work in WODDI began with a beginning that looked like yours.' where kind = 'weekly' and period = 20 and coalesce(body,'') = '';
update public.engagement_content set body = 'No chapter has ever begun with a crowd. It begins with one woman willing to gather others. If that is you this week, you are exactly enough to start.' where kind = 'weekly' and period = 21 and coalesce(body,'') = '';
update public.engagement_content set body = 'Correction without encouragement discourages. Encouragement without honesty flatters. Bring both this week and your members will grow in confidence and in standard.' where kind = 'weekly' and period = 22 and coalesce(body,'') = '';
update public.engagement_content set body = 'Purposeful service is never wasted, even when results come slowly. Keep sowing. The harvest belongs to the women who did not stop in the middle.' where kind = 'weekly' and period = 23 and coalesce(body,'') = '';
update public.engagement_content set body = 'When you strengthen one woman, you strengthen the home she leads. Your influence reaches children you may never meet. Carry it carefully.' where kind = 'weekly' and period = 24 and coalesce(body,'') = '';
update public.engagement_content set body = 'People grow at different speeds, and grace is what makes the difference. Be patient with your team this week, and with yourself.' where kind = 'weekly' and period = 25 and coalesce(body,'') = '';
update public.engagement_content set body = 'You are not only giving; you are becoming. Every difficult conversation and every plan you carried through has made you a steadier leader than you were last year.' where kind = 'weekly' and period = 26 and coalesce(body,'') = '';
update public.engagement_content set body = 'Service that drains you completely helps no one for long. Rest, ask for help, share the load. A sustained leader serves longer than a heroic one.' where kind = 'weekly' and period = 27 and coalesce(body,'') = '';
update public.engagement_content set body = 'Women open up where they feel safe. Guard confidences, refuse gossip, protect the vulnerable. A safe chapter is a growing chapter.' where kind = 'weekly' and period = 28 and coalesce(body,'') = '';
update public.engagement_content set body = 'Sisterhood is what makes WODDI more than a structure. A woman in Lagos, one in Kigali, one in Abidjan, carrying the same vision. You are part of that bond.' where kind = 'weekly' and period = 29 and coalesce(body,'') = '';
update public.engagement_content set body = 'Trust is built at the speed of consistency. Every promise kept this week adds to something that will let you lead far bigger things later.' where kind = 'weekly' and period = 30 and coalesce(body,'') = '';
update public.engagement_content set body = 'A group you administer well, a message sent with care, a meeting that begins on time. Digital leadership shapes real lives. Treat it as the real work it is.' where kind = 'weekly' and period = 31 and coalesce(body,'') = '';
update public.engagement_content set body = 'Leaders who stop learning start repeating. Read, ask, observe, take the course. What you learn this month becomes what you can give next month.' where kind = 'weekly' and period = 32 and coalesce(body,'') = '';
update public.engagement_content set body = 'Listening is not waiting for your turn. When you listen deeply, members tell you the truth, and the truth is what you need to lead them well.' where kind = 'weekly' and period = 33 and coalesce(body,'') = '';
update public.engagement_content set body = 'Your deputy, your fellow leaders, HQ and the network stand with you. Ask before you struggle alone. Assignments are carried better in company.' where kind = 'weekly' and period = 34 and coalesce(body,'') = '';
update public.engagement_content set body = 'Skill impresses; love remains. Long after your term, members will remember how you made them feel. Serve with love and you leave footprints.' where kind = 'weekly' and period = 35 and coalesce(body,'') = '';
update public.engagement_content set body = 'The same words can heal, guide or inspire depending on how they are carried. Choose deliberately this week; your leadership has that much weight.' where kind = 'weekly' and period = 36 and coalesce(body,'') = '';
update public.engagement_content set body = 'What a family lives by, it passes on. Lead your home in the values you teach your chapter, and your leadership will carry a weight nothing else gives it.' where kind = 'weekly' and period = 37 and coalesce(body,'') = '';
update public.engagement_content set body = 'Transformation starts when someone refuses to accept what everyone else has accepted. Let your concern for your community become one concrete action this week.' where kind = 'weekly' and period = 38 and coalesce(body,'') = '';
update public.engagement_content set body = 'Every new level asks for courage before it gives confidence. Do the thing you have been postponing. Courage first, capacity follows.' where kind = 'weekly' and period = 39 and coalesce(body,'') = '';
update public.engagement_content set body = 'Joy is not a luxury in service; it is fuel. If the joy has faded, something needs attention. Recover it, and the work becomes lighter.' where kind = 'weekly' and period = 40 and coalesce(body,'') = '';
update public.engagement_content set body = 'Raising, guiding, restoring. These three are the work of a good mother and of a good leader. Someone in your chapter needs one of them this week.' where kind = 'weekly' and period = 41 and coalesce(body,'') = '';
update public.engagement_content set body = 'You influence whether you intend to or not. Decide what your presence should leave behind, and be that on purpose.' where kind = 'weekly' and period = 42 and coalesce(body,'') = '';
update public.engagement_content set body = 'Programmes end and reports are filed away. What you built inside a person stays. Invest in people this week and it will outlive your term.' where kind = 'weekly' and period = 43 and coalesce(body,'') = '';
update public.engagement_content set body = 'Maturity is what you do when you are misunderstood, overlooked or provoked. Handle this week''s difficulty well and you have led, whatever else happens.' where kind = 'weekly' and period = 44 and coalesce(body,'') = '';
update public.engagement_content set body = 'Someone younger is watching how you speak, keep time and treat people. You are teaching whether or not you are talking.' where kind = 'weekly' and period = 45 and coalesce(body,'') = '';
update public.engagement_content set body = 'Faith gives you a reason, courage gives you a start, resilience gets you to the end. Volunteer leadership needs all three, and you have them.' where kind = 'weekly' and period = 46 and coalesce(body,'') = '';
update public.engagement_content set body = 'WGMN is not a programme running on women; it is women building women. Your hands are part of how the movement moves.' where kind = 'weekly' and period = 47 and coalesce(body,'') = '';
update public.engagement_content set body = 'A volunteer with vision is never a small player. Position is temporary; vision decides what you build with the position you have.' where kind = 'weekly' and period = 48 and coalesce(body,'') = '';
update public.engagement_content set body = 'Say thank you this week, specifically and by name. Appreciation is what keeps volunteers giving when nothing else is offered.' where kind = 'weekly' and period = 49 and coalesce(body,'') = '';
update public.engagement_content set body = 'Look back honestly at this year: the members you gained, the skills you grew, the difficulties you survived. Gratitude is good record-keeping.' where kind = 'weekly' and period = 50 and coalesce(body,'') = '';
update public.engagement_content set body = 'Celebrate your members, your team and yourself. Service that is never celebrated quietly runs dry. Make room for joy this week.' where kind = 'weekly' and period = 51 and coalesce(body,'') = '';
update public.engagement_content set body = 'Close the year with clear eyes. What worked, what did not, what you are called to next. Renew the vision, and step into the new year with intent.' where kind = 'weekly' and period = 52 and coalesce(body,'') = '';

update public.engagement_content set body = 'A new year is an invitation to serve with clearer purpose. Set your intention for the year, choose the two things you will do faithfully, and begin. Clarity now saves effort later.' where kind = 'monthly' and period = 1 and coalesce(body,'') = '';
update public.engagement_content set body = 'WGMN exists because a strengthened woman strengthens a home, and strengthened homes strengthen nations. Everything we ask of you this year flows from that single idea.' where kind = 'monthly' and period = 2 and coalesce(body,'') = '';
update public.engagement_content set body = 'Your leadership matters because someone is reachable through you and through no one else. The women in your state or country are not a list; they are your assignment.' where kind = 'monthly' and period = 3 and coalesce(body,'') = '';
update public.engagement_content set body = 'Grace lets you serve without carrying what was never yours. Do your part faithfully, ask for help early, and refuse the pressure to appear superhuman.' where kind = 'monthly' and period = 4 and coalesce(body,'') = '';
update public.engagement_content set body = 'You are meant to grow while you serve. Take the course, seek the mentor, accept the correction. A leader who grows keeps the people she leads growing too.' where kind = 'monthly' and period = 5 and coalesce(body,'') = '';
update public.engagement_content set body = 'Lead from the heart and structure will support you. Lead only from structure and people will comply without ever belonging. Choose the first this month.' where kind = 'monthly' and period = 6 and coalesce(body,'') = '';
update public.engagement_content set body = 'Africa changes when its women are equipped. Every member you recruit, train and encourage is part of a continental work far larger than a chapter meeting.' where kind = 'monthly' and period = 7 and coalesce(body,'') = '';
update public.engagement_content set body = 'One committed woman can start a chapter, revive a state or change a family line. Do not underestimate what your consistency alone can begin.' where kind = 'monthly' and period = 8 and coalesce(body,'') = '';
update public.engagement_content set body = 'When the vision fades the work feels heavy. Reconnect this month: reread why WGMN exists, speak with a fellow leader, remember who you are serving.' where kind = 'monthly' and period = 9 and coalesce(body,'') = '';
update public.engagement_content set body = 'For the woman who is tired: strength is not pretending. Rest, share the load, return. Sustained service outlasts heroic bursts every time.' where kind = 'monthly' and period = 10 and coalesce(body,'') = '';
update public.engagement_content set body = 'Appreciation is the currency of volunteer work. Thank your team by name, celebrate a member''s milestone, and notice what people give quietly.' where kind = 'monthly' and period = 11 and coalesce(body,'') = '';
update public.engagement_content set body = 'End the year by renewing the vision. Review honestly, give thanks genuinely, and set your intention for the year ahead with the clarity of someone who has learned.' where kind = 'monthly' and period = 12 and coalesce(body,'') = '';

-- The dashboard now shows every message in place (nothing links out to the
-- retired #/me), so the "others" entries carry their body too.
create or replace function public.my_message_stream()
returns jsonb language plpgsql
security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p profiles%rowtype;
  wk int := least(52, greatest(1, extract(week from now())::int));
  mo int := extract(month from now())::int;
  is_bday boolean := false; bday_on boolean := false;
  weekly record; monthly record;
  primary_msg jsonb; others jsonb := '[]'::jsonb;
  bday_body text;
begin
  if me is null then return jsonb_build_object('primary', null, 'others', others); end if;
  select * into p from profiles where id = me;
  if not found then return jsonb_build_object('primary', null, 'others', others); end if;

  select coalesce(bool_or(is_active), false) into bday_on from automation_rules where code = 'birthday_wishes';
  is_bday := p.birth_date is not null and to_char(p.birth_date, 'MM-DD') = to_char(now(), 'MM-DD');
  bday_body := public.birthday_notice_body(p.first_name);

  select title, focus, body, tone into weekly
    from engagement_content where kind = 'weekly' and period = wk and is_active;
  select title, focus, body, tone into monthly
    from engagement_content where kind = 'monthly' and period = mo and is_active;

  if is_bday and bday_on then
    insert into member_notices (profile_id, kind, title, body, meta)
    select me, 'birthday', 'Happy birthday, ' || p.first_name || '!', bday_body,
           jsonb_build_object('tone', 'celebration')
     where not exists (select 1 from member_notices mn
                        where mn.profile_id = me and mn.kind = 'birthday'
                          and mn.created_at > now() - interval '300 days');
    primary_msg := jsonb_build_object('kind', 'birthday', 'tone', 'celebration',
      'title', 'Happy birthday, ' || p.first_name || '!',
      'lead', 'From all of us at WODDI HQ', 'body', bday_body, 'signature', 'WODDI HQ');
  end if;

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

  if weekly.title is not null and coalesce(primary_msg->>'kind', '') <> 'weekly' then
    others := others || jsonb_build_array(jsonb_build_object('kind', 'weekly', 'title', weekly.title,
      'tone', coalesce(weekly.tone, 'courage'), 'period_label', 'Week ' || wk,
      'lead', p.first_name || ', this week''s message from WODDI HQ for you',
      'body', nullif(weekly.body, ''), 'focus', weekly.focus, 'signature', 'WODDI HQ'));
  end if;
  if monthly.title is not null and coalesce(primary_msg->>'kind', '') <> 'monthly' then
    others := others || jsonb_build_array(jsonb_build_object('kind', 'monthly', 'title', monthly.title,
      'tone', coalesce(monthly.tone, 'purpose'), 'period_label', to_char(now(), 'FMMonth YYYY'),
      'lead', 'This month''s message from WODDI HQ, for ' || p.first_name,
      'body', nullif(monthly.body, ''), 'focus', monthly.focus, 'signature', 'WODDI HQ'));
  end if;
  if is_bday and bday_on and coalesce(primary_msg->>'kind', '') <> 'birthday' then
    others := others || jsonb_build_array(jsonb_build_object('kind', 'birthday', 'tone', 'celebration',
      'title', 'Happy birthday, ' || p.first_name || '!', 'lead', 'From all of us at WODDI HQ',
      'body', bday_body, 'signature', 'WODDI HQ'));
  end if;

  return jsonb_build_object('primary', primary_msg, 'others', others,
                            'first_name', p.first_name, 'birthday_today', is_bday,
                            'birthday_enabled', bday_on);
end; $$;
revoke execute on function public.my_message_stream() from anon;

insert into public.schema_migrations (version, name)
values (139, 'inspiration_bodies') on conflict (version) do nothing;
