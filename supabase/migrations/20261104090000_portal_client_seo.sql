begin;
-- Business records are accessed through the authenticated internal Portal API.
-- Retain SEO history if a legacy client board is archived or removed.
create table public.portal_seo_projects (
 id uuid primary key default gen_random_uuid(), client_id uuid not null unique,
 client_name text not null, config jsonb not null, revision bigint not null default 1,
 updated_by uuid not null references auth.users(id),
 keyword_count integer generated always as (jsonb_array_length(config->'keywords')) stored,
 prompt_count integer generated always as (jsonb_array_length(config->'prompts')) stored,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(octet_length(config::text)<=200000)
);
create table public.portal_seo_observations (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.portal_seo_projects(id),
 kind text not null check(kind in ('keyword','visibility')), source_run_id uuid not null,
 snapshot jsonb not null,added_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(project_id,source_run_id,kind),check(octet_length(snapshot::text)<=12000000)
);
create index portal_seo_observation_history on public.portal_seo_observations(project_id,created_at desc,id desc);
create table public.portal_private_drafts (
 owner_id uuid not null references auth.users(id) on delete cascade,surface text not null,
 payload jsonb not null,revision bigint not null default 1,updated_at timestamptz not null default now(),
 primary key(owner_id,surface),check(surface ~ '^[-a-zA-Z0-9:_]{1,160}$'),check(octet_length(payload::text)<=200000)
);
alter table public.portal_seo_projects enable row level security;
alter table public.portal_seo_observations enable row level security;
alter table public.portal_private_drafts enable row level security;
revoke all on public.portal_seo_projects,public.portal_seo_observations,public.portal_private_drafts from anon,authenticated;
grant all on public.portal_seo_projects,public.portal_seo_observations,public.portal_private_drafts to service_role;
create function public.portal_seo_save_project(p_client uuid,p_expected bigint,p_config jsonb,p_actor uuid,p_name text)
returns setof public.portal_seo_projects language plpgsql security definer set search_path=public,pg_temp as $$
declare saved public.portal_seo_projects;
begin
 if p_expected=0 then
  insert into portal_seo_projects(client_id,client_name,config,updated_by)values(p_client,p_name,p_config,p_actor)
  on conflict(client_id)do nothing returning * into saved;
 else
  update portal_seo_projects set config=p_config,client_name=p_name,revision=revision+1,updated_by=p_actor,updated_at=now()
  where client_id=p_client and revision=p_expected returning * into saved;
 end if;
 if saved.id is null then raise sqlstate 'PT409' using message='Project changed elsewhere; reload the saved version';end if;
 return next saved;
end $$;
create function public.portal_save_private_draft(p_owner uuid,p_surface text,p_expected bigint,p_payload jsonb)
returns setof public.portal_private_drafts language plpgsql security definer set search_path=public,pg_temp as $$
declare saved public.portal_private_drafts;
begin
 if p_expected=0 then
  insert into portal_private_drafts(owner_id,surface,payload)values(p_owner,p_surface,p_payload)
  on conflict(owner_id,surface)do nothing returning * into saved;
 else
  update portal_private_drafts set payload=p_payload,revision=revision+1,updated_at=now()
  where owner_id=p_owner and surface=p_surface and revision=p_expected returning * into saved;
 end if;
 if saved.owner_id is null then raise sqlstate 'PT409' using message='Draft changed on another page or device';end if;
 return next saved;
end $$;
revoke all on function public.portal_seo_save_project(uuid,bigint,jsonb,uuid,text),public.portal_save_private_draft(uuid,text,bigint,jsonb)from public,anon,authenticated;
grant execute on function public.portal_seo_save_project(uuid,bigint,jsonb,uuid,text),public.portal_save_private_draft(uuid,text,bigint,jsonb)to service_role;
notify pgrst,'reload schema';
commit;
