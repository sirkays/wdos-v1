-- WDOS 173: WGMN 14-Day Activation congratulations email (7 Oct 2026, requested by Regina)
-- Sends once to every WGMN candidate who passed the 14-Day Activation
-- (activation_journeys.status = 'completed', same rule as activation_passed_export).
-- Each send is logged; running this again sends nothing to anyone already logged.

create table if not exists public.bulk_email_log (
  id bigserial primary key,
  batch text not null,
  profile_id uuid,
  email text not null,
  name text,
  subject text,
  request_id bigint,
  sent boolean not null default false,
  error text,
  created_at timestamptz not null default now(),
  unique (batch, email));
alter table public.bulk_email_log enable row level security;
revoke all on public.bulk_email_log from anon, authenticated;

with mail as (select 'wgmn14_congrats_2026-10-07'::text as batch,
                     'Congratulations on completing the WGMN 14-Day Activation Journey'::text as subj,
                     $mail$<div style="background:#f6f6f8;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #eeeeee;border-radius:12px;overflow:hidden;">
<div style="padding:18px 24px;border-bottom:3px solid #D4006A;text-align:center;">
<img src="https://woddicrm.org/assets/woddi-logo.png" alt="WODDI" style="height:52px;max-width:100%;">
</div>
<div style="padding:26px 26px 8px;color:#222222;font-size:15px;line-height:1.65;">
<p style="margin:0 0 16px;">Dear [First Name],</p>
<p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#D4006A;">Congratulations! &#127881;</p>
<p style="margin:0 0 16px;">You have successfully completed the 14-Day Activation Journey of the WODDI Good Mother Network (WGMN). This is a real achievement, and we are proud of you.</p>
<p style="margin:0 0 16px;">Over these 14 days you showed commitment, discipline and a genuine heart for service, the very qualities that make a WGMN leader. Thank you for giving your time and energy to this journey.</p>
<p style="margin:0 0 16px;">You are now part of a growing community of activated leaders across Africa who are ready to nurture lives and shape generations.</p>
<p style="margin:0 0 16px;">Our Headquarters team is reviewing leadership needs across countries, states and communities. We will reach out to you personally about how and where you can serve. Kindly join this WhatsApp group: <a href="https://chat.whatsapp.com/C6eCLogEeKBFciBX7Isqty" style="color:#D4006A;font-weight:700;">https://chat.whatsapp.com/C6eCLogEeKBFciBX7Isqty</a></p>
<p style="margin:0 0 8px;">In the meantime, we encourage you to:</p>
<ul style="margin:0 0 16px;padding-left:22px;">
<li style="margin:0 0 8px;">Begin or continue your learning on the WODDI Institute App (<a href="https://woddiinstitute.com" style="color:#D4006A;">https://woddiinstitute.com</a>) <a href="https://play.google.com/store/apps/details?id=org.thewoddi.institute" style="color:#D4006A;word-break:break-all;">https://play.google.com/store/apps/details?id=org.thewoddi.institute</a></li>
<li style="margin:0 0 8px;">Stay connected and active on your <a href="https://woddicrm.org" style="color:#D4006A;">dashboard</a></li>
</ul>
<p style="margin:0 0 20px;">Once again, congratulations and welcome. We look forward to the impact you will make.</p>
</div>
<div style="padding:14px 26px 22px;border-top:1px solid #f0f0f0;color:#7CB518;font-size:13px;font-weight:700;">
WODDI Good Mother Network &middot; <a href="https://woddicrm.org" style="color:#7CB518;text-decoration:none;">woddicrm.org</a>
</div>
</div>
</div>$mail$::text as html),
rcpt as (
  select distinct on (lower(trim(p.email))) p.id, lower(trim(p.email)) as email,
         trim(p.first_name) as first_name, trim(coalesce(p.last_name, '')) as last_name
    from (select distinct profile_id from activation_journeys where status = 'completed') j
    join profiles p on p.id = j.profile_id
   where p.merged_into is null and p.network = 'WGMN'
     and p.email is not null and position('@' in p.email) > 0
   order by lower(trim(p.email)), p.created_at),
todo as (
  select r.*, case when r.first_name = upper(r.first_name) or r.first_name = lower(r.first_name)
                   then initcap(r.first_name) else r.first_name end as fname
    from rcpt r, mail m
   where not exists (select 1 from bulk_email_log l where l.batch = m.batch and l.email = r.email)),
sent as (
  select t.id, t.email, t.fname, t.last_name, m.batch, m.subj,
         public.send_email_req(t.email, trim(t.fname || ' ' || t.last_name), m.subj,
           replace(m.html, '[First Name]',
             replace(replace(replace(coalesce(nullif(t.fname, ''), 'Friend'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'))) as rid
    from todo t, mail m)
insert into bulk_email_log (batch, profile_id, email, name, subject, request_id, sent, error)
select batch, id, email, trim(fname || ' ' || last_name), subj, rid, rid is not null,
       case when rid is null then 'mailer not configured or address unusable' end
  from sent
returning email, name, sent, request_id;

-- Ran 7 Oct 2026 at 16:13 (Lagos): 63 logged, 63 queued, 63 accepted by Brevo (HTTP 201 with a messageId).
-- Brevo's answer kept on each row (net._http_response is only held for a few hours):
alter table public.bulk_email_log add column if not exists brevo_status int, add column if not exists brevo_message_id text;
update public.bulk_email_log l
   set brevo_status = r.status_code, brevo_message_id = (r.content::jsonb ->> 'messageId')
  from net._http_response r
 where r.id = l.request_id and l.batch = 'wgmn14_congrats_2026-10-07' and l.brevo_status is null;
