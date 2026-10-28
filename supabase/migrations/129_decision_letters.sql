-- ============================================================================
-- WDOS Migration 129 — Decision letters and the Community transition (Phase 167)
--   The founder's 2:00 PM requirement: the actual letters in the system, sent
--   automatically when a decision is made; the not-selected applicant is kept
--   as a WODDI Community member.
--   • Two templates in the Message Library (editable by HQ): decision_selected,
--     decision_not_selected. Placeholders: {first_name} {network} {country}
--     {next_step} {hq_name}.
--   • decision_letter(app_id): renders the template, emails it (Brevo via
--     send_email), drops the same text into the candidate's WDOS inbox when she
--     has a login, records decision_letter_sent_at. Not selected: her profile
--     becomes an active Community member (is_leader false) rather than a
--     rejected applicant, so she is not lost.
--   • decide_application now calls decision_letter after the decision.
-- ============================================================================

alter table public.applications add column if not exists decision_letter_sent_at timestamptz;
alter table public.applications add column if not exists decision_letter_channel text;

insert into public.message_templates (code, locale, category, name, subject, body, status, version)
values
('decision_selected', 'en', 'application', 'Successful candidate letter',
 'Congratulations, {first_name}: your WODDI volunteer leadership application has been successful',
 'Dear {first_name},

Congratulations. Following the review of your application and your activation, WODDI Headquarters is pleased to confirm that you have been selected for volunteer leadership with the {network} in {country}.

What happens next:
1. Your appointment will be issued in WDOS and you will be asked to accept it.
2. Read the Volunteer Leadership Pack and tick it on My Onboarding; your workspace opens once you have.
3. Complete your required learning on the WODDI Institute.
4. Your supervisor will schedule your commissioning and first assignment.

{next_step}

We are glad to have you. Together we advance women, transform communities, and leave no woman out.

Warm regards,
{hq_name}
Women of Divine Destiny Initiative (WODDI)', 'approved', 1),
('decision_not_selected', 'en', 'application', 'Not selected: WODDI Community invitation',
 'Your WODDI application, {first_name}: the outcome and an invitation',
 'Dear {first_name},

Thank you for applying for volunteer leadership with the {network} and for the effort you put into your activation. After careful review, Headquarters has not selected you for a leadership position at this time.

This is not the end of your journey with WODDI. You remain a member of the WODDI Community, and your WDOS login stays open so you can:
• take part in programmes and activities in {country};
• continue learning on the WODDI Institute;
• refer women you believe should lead;
• apply again when a future vacancy is announced.

{next_step}

We value you, and we look forward to seeing you in the community.

Warm regards,
{hq_name}
Women of Divine Destiny Initiative (WODDI)', 'approved', 1)
on conflict (code, locale) do update set subject = excluded.subject, body = excluded.body, name = excluded.name, updated_at = now();

create or replace function public.decision_letter(app_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a record; tpl record; subj text; body text; pid uuid; hqname text; sent boolean := false; chan text := '';
begin
  select * into a from applications where id = app_id;
  if a.id is null then return jsonb_build_object('ok', false, 'why', 'not found'); end if;
  if a.status not in ('approved', 'rejected') then return jsonb_build_object('ok', false, 'why', 'undecided'); end if;
  select * into tpl from message_templates where code = case when a.status = 'approved' then 'decision_selected' else 'decision_not_selected' end and locale = 'en' and status = 'approved' limit 1;
  if tpl.id is null then return jsonb_build_object('ok', false, 'why', 'no template'); end if;
  hqname := coalesce((select first_name || ' ' || last_name from profiles where id = auth.uid()), 'WODDI Headquarters');
  pid := coalesce(a.profile_id, (select p.id from profiles p where lower(p.email) = lower(a.email) and p.merged_into is null limit 1));
  subj := replace(replace(replace(replace(replace(tpl.subject, '{first_name}', a.first_name), '{network}', a.network::text), '{country}', coalesce((select c.name from unit_chain(a.org_unit_id) c where c.level = 'country' limit 1), '')), '{hq_name}', hqname), '{next_step}', '');
  body := replace(replace(replace(replace(replace(tpl.body, '{first_name}', a.first_name), '{network}', a.network::text), '{country}', coalesce((select c.name from unit_chain(a.org_unit_id) c where c.level = 'country' limit 1), '')), '{hq_name}', hqname),
                  '{next_step}', case when a.status = 'approved' then 'Sign in at https://woddicrm.org to see your appointment and your onboarding checklist.' else 'Sign in at https://woddicrm.org: your Community dashboard, programmes and learning are there.' end);
  begin sent := send_email(a.email, a.first_name, subj, email_wrap(subj, replace(body, E'\n', '<br>'))); exception when others then sent := false; end;
  if sent then chan := 'email'; end if;
  if pid is not null and auth.uid() is not null then
    insert into staff_messages (sender_id, recipient_id, body) values (auth.uid(), pid, subj || E'\n\n' || body);
    chan := chan || case when chan = '' then 'inbox' else '+inbox' end;
  end if;
  if a.status = 'rejected' and pid is not null then
    -- Community transition: keep her as an active community member, not a leader
    update profiles set status = case when status in ('applicant', 'under_review', 'approved') then 'active' else status end, is_leader = false where id = pid;
  end if;
  update applications set decision_letter_sent_at = now(), decision_letter_channel = nullif(chan, '') where id = app_id;
  return jsonb_build_object('ok', true, 'channel', chan, 'subject', subj);
end; $$;
revoke execute on function public.decision_letter(uuid) from anon;

-- redefines decide_application (adds the letter and transition)
create or replace function public.decide_application(app_id uuid, approve boolean, reason text)
returns public.applications language plpgsql security definer set search_path = public as $$
declare a public.applications;
begin
  select * into a from applications where id = app_id for update;
  if a.id is null then raise exception 'Application not found'; end if;
  if not can_approve(a.org_unit_id) then raise exception 'You are not an approver for this unit'; end if;
  if a.status not in ('submitted','under_review','recommended') then
    raise exception 'Application has already been decided (status: %)', a.status;
  end if;
  if reason is null or char_length(trim(reason)) < 5 then raise exception 'A reason is required for the decision'; end if;
  perform set_config('wdos.reason', reason, true);
  update applications
     set status = (case when approve then 'approved' else 'rejected' end)::public.application_status,
         decided_by = auth.uid(), decision_reason = reason, decided_at = now()
   where id = app_id returning * into a;
  perform decision_letter(app_id);
  select * into a from applications where id = app_id;
  return a;
end; $$;

insert into public.schema_migrations (version, name)
values (129, 'decision_letters') on conflict (version) do nothing;
