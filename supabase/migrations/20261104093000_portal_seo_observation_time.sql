begin;
alter table public.portal_seo_observations add column if not exists observed_at timestamptz;
create index if not exists portal_seo_observation_time on public.portal_seo_observations(project_id,observed_at desc,id desc);
create or replace function public.portal_seo_current_observations(p_project uuid)
returns setof public.portal_seo_observations language sql stable security invoker set search_path=public as $$
 select o.* from public.portal_seo_observations o where o.id in (
  select ranked.id from (
   select e.id,row_number() over(partition by e.kind,case when e.kind='keyword' then lower(e.snapshot->'overview'->>'keyword') else (e.snapshot->'overview'->'prompts')::text end order by e.observed_at desc nulls last,e.created_at desc,e.id desc) as sequence
   from public.portal_seo_observations e join public.portal_seo_projects p on p.id=e.project_id
   where e.project_id=p_project
    and e.snapshot->'overview'->>'domain'=p.config->>'domain'
    and e.snapshot->'overview'->>'market'=p.config->>'market'
    and e.snapshot->'overview'->>'language'=p.config->>'language'
    and (e.kind<>'visibility' or e.snapshot->'overview'->>'brand'=p.config->>'brand')
  ) ranked where ranked.sequence<=2
 ) order by o.observed_at desc nulls last,o.created_at desc,o.id desc;
$$;
revoke all on function public.portal_seo_current_observations(uuid) from public,anon,authenticated;
grant execute on function public.portal_seo_current_observations(uuid) to service_role;
commit;
