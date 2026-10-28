-- ============================================================================
-- WDOS Migration 147 — Track each 3-Day link individually (Phase 193)
-- Every activation already stores the link code it began from. This exposes,
-- per link: who made it, for which seat, when, whether it is live, visits,
-- registrations, where each candidate is, and the outcomes. Plus the ability
-- to pause, resume or withdraw a link.
-- ============================================================================

-- Per-link summary for HQ and for the link's own creator.
create or replace function public.hq_link_tracking(p_route text default 'ref3')
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', l.id, 'code', l.code, 'label', l.label, 'route', l.route, 'network', l.network,
      'role', l.role, 'role_title', coalesce(public.role_title(l.role::text, l.network::text), l.role::text),
      'unit', ou.name, 'unit_level', ou.level,
      'owner', case when l.owner_id is null then 'WODDI HQ' else (select first_name || ' ' || last_name from profiles where id = l.owner_id) end,
      'created_by', (select first_name || ' ' || last_name from profiles where id = l.created_by),
      'created_at', l.created_at, 'expires_at', l.expires_at,
      'active', l.active and (l.expires_at is null or l.expires_at > now()),
      'visits', (select count(*) from referral_visits v where v.link_id = l.id),
      'visits_7d', (select count(*) from referral_visits v where v.link_id = l.id and v.visited_at >= now() - interval '7 days'),
      'last_visit', (select max(v.visited_at) from referral_visits v where v.link_id = l.id),
      'registrations', (select count(*) from candidate_activations a where a.referral_code = l.code),
      'in_progress', (select count(*) from candidate_activations a where a.referral_code = l.code and a.status = 'in_progress'),
      'completed', (select count(*) from candidate_activations a where a.referral_code = l.code and a.status = 'completed'),
      'incomplete', (select count(*) from candidate_activations a where a.referral_code = l.code and a.status in ('incomplete','closed')),
      'assess_submitted', (select count(*) from readiness_assessments ra join candidate_activations a on a.id = ra.activation_id where a.referral_code = l.code and ra.status = 'submitted'),
      'selected', (select count(*) from readiness_assessments ra join candidate_activations a on a.id = ra.activation_id where a.referral_code = l.code and ra.outcome = 'selected'),
      'not_selected', (select count(*) from readiness_assessments ra join candidate_activations a on a.id = ra.activation_id where a.referral_code = l.code and ra.outcome = 'not_selected'),
      'candidates', (select coalesce(jsonb_agg(jsonb_build_object(
          'name', p.first_name || ' ' || p.last_name, 'email', p.email, 'status', a.status,
          'day', a.current_day, 'started_at', a.started_at, 'completed_at', a.completed_at,
          'assessment', ra.status, 'outcome', ra.outcome) order by a.started_at desc), '[]'::jsonb)
        from candidate_activations a join profiles p on p.id = a.profile_id
        left join readiness_assessments ra on ra.activation_id = a.id
        where a.referral_code = l.code)) as x
    from referral_links l
    left join org_units ou on ou.id = l.org_unit_id
    where l.route = coalesce(p_route, 'ref3')
      and (public.is_case_hq() or l.owner_id = auth.uid() or l.created_by = auth.uid())) s;
$$;
revoke execute on function public.hq_link_tracking(text) from anon;

-- Pause / resume / withdraw a link. HQ, or the leader who owns it.
create or replace function public.referral_link_set(p_id uuid, p_active boolean, p_expires timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  update referral_links set active = p_active, expires_at = coalesce(p_expires, expires_at)
   where id = p_id and (public.is_case_hq() or owner_id = auth.uid() or created_by = auth.uid());
  if not found then raise exception 'Link not found or not yours'; end if;
end; $$;
revoke execute on function public.referral_link_set(uuid, boolean, timestamptz) from anon;

insert into public.schema_migrations (version, name) values (147, 'link_tracking') on conflict (version) do nothing;
