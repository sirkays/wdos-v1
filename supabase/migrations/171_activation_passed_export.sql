-- ============================================================================
-- WDOS Migration 171 — 14-Day Activation: passed candidates contact list
-- (Phase 218)
--
-- Regina asked for the candidates who passed the 14-Day Activation with their
-- name, email, phone, network, position applied for and location. Reports >
-- 14-day activation now downloads that list as PDF, CSV and Excel. This
-- function feeds all three.
--
-- "Passed" = activation_journeys.status = 'completed' (set only by
-- try_finalize_activation when eval_activation passes: all required tasks,
-- both gate days, score >= 50%). Unlike activation_report(), candidates who
-- have since been appointed to a leadership seat are INCLUDED (they did pass);
-- their current seat is returned so the export can mark them.
-- HQ only, same check as activation_report().
-- ============================================================================
create or replace function public.activation_passed_export()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_case_hq() then raise exception 'HQ only'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'first_name',    p.first_name,
             'last_name',     p.last_name,
             'email',         p.email,
             'phone',         p.phone,
             'network',       p.network::text,
             'role_applied',  p.role_applied,
             'country',       p.country,
             'state',         p.state_region,
             'lga',           p.lga,
             'membership_no', p.membership_no,
             'seat', (select ra.role::text from role_assignments ra
                       where ra.profile_id = p.id
                         and (ra.ends_at is null or ra.ends_at > now())
                       order by ra.starts_at desc nulls last limit 1))
           order by p.network, p.country, p.state_region, p.first_name, p.last_name)
      from (select distinct profile_id from activation_journeys
             where status = 'completed') j
      join profiles p on p.id = j.profile_id
     where p.merged_into is null), '[]'::jsonb);
end; $$;

revoke all on function public.activation_passed_export() from public, anon;
grant execute on function public.activation_passed_export() to authenticated;

insert into public.schema_migrations (version, name)
values (171, 'activation_passed_export') on conflict (version) do nothing;
