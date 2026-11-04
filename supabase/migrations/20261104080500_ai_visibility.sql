begin;
create table public.ai_visibility_projects (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 name text not null, domain text not null, agency text not null default 'Frog Online',
 aliases jsonb not null default '[]', competitors jsonb not null default '[]',
 market text not null default 'Australia', language text not null default 'English',
 engines jsonb not null default '["chatgpt","gemini","perplexity"]', repetitions integer not null default 1 check(repetitions between 1 and 3),
 prompts jsonb not null default '[]', schedule_enabled boolean not null default false,
 archived boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.ai_visibility_runs (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.ai_visibility_projects(id),owner_id uuid not null references auth.users(id),
 period text not null check(period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),mode text not null check(mode in ('api','consumer')),
 fingerprint text not null, snapshot jsonb not null,models jsonb not null,prompt_snapshot jsonb not null,
 created_at timestamptz not null default now(),unique(project_id,period,mode,fingerprint)
);
create table public.ai_visibility_samples (
 id uuid primary key default gen_random_uuid(),run_id uuid not null references public.ai_visibility_runs(id),
 engine text not null check(engine in ('chatgpt','gemini','perplexity')),prompt_index integer not null,repetition integer not null,
 prompt text not null,category text not null,status text not null default 'pending' check(status in ('pending','running','complete','failed')),
 attempts integer not null default 0,lease_id uuid,lease_expires_at timestamptz,
 answer text,model text,citations jsonb not null default '[]',source_url text,observed_at timestamptz,
 mentioned boolean,cited boolean,competitors jsonb not null default '[]',recommendation text check(recommendation in ('yes','no','unclear')),
 reviewed_by uuid,reviewed_at timestamptz,error_code text,provider_id text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(run_id,engine,prompt_index,repetition)
);
create index on public.ai_visibility_projects(owner_id);
create index on public.ai_visibility_runs(project_id,created_at desc);
create index on public.ai_visibility_samples(status,created_at);
alter table public.ai_visibility_projects enable row level security;
alter table public.ai_visibility_runs enable row level security;
alter table public.ai_visibility_samples enable row level security;
revoke all on public.ai_visibility_projects,public.ai_visibility_runs,public.ai_visibility_samples from anon,authenticated;
grant all on public.ai_visibility_projects,public.ai_visibility_runs,public.ai_visibility_samples to service_role;

create function public.ai_visibility_create_run(subject uuid,project uuid,month text,collection text,hash text,model_set jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare p ai_visibility_projects;r uuid;q jsonb;e text;idx integer;rep integer;
begin
 select * into p from ai_visibility_projects where id=project and owner_id=subject and not archived for update;
 if not found then raise exception 'PROJECT_NOT_FOUND';end if;
 if jsonb_array_length(p.prompts)<1 then raise exception 'PROMPTS_REQUIRED';end if;
 insert into ai_visibility_runs(project_id,owner_id,period,mode,fingerprint,snapshot,models,prompt_snapshot)
 values(p.id,p.owner_id,month,collection,hash,to_jsonb(p)-'owner_id',model_set,p.prompts)
 on conflict(project_id,period,mode,fingerprint) do nothing returning id into r;
 if r is null then select id into r from ai_visibility_runs where project_id=project and period=month and mode=collection and fingerprint=hash;return r;end if;
 for e in select jsonb_array_elements_text(p.engines) loop
  idx:=0;
  for q in select * from jsonb_array_elements(p.prompts) loop
   for rep in 1..p.repetitions loop
    insert into ai_visibility_samples(run_id,engine,prompt_index,repetition,prompt,category) values(r,e,idx,rep,q->>'text',q->>'category');
   end loop;idx:=idx+1;
  end loop;
 end loop;return r;
end $$;
create function public.ai_visibility_claim(worker uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s ai_visibility_samples;r ai_visibility_runs;
begin
 -- Never silently rerun a request whose upstream outcome is uncertain after restart.
 update ai_visibility_samples set status='failed',error_code='INTERRUPTED_REVIEW_BEFORE_RETRY',lease_id=null,lease_expires_at=null where status='running' and lease_expires_at<now();
 select s0.* into s from ai_visibility_samples s0 join ai_visibility_runs r0 on r0.id=s0.run_id join ai_visibility_projects p on p.id=r0.project_id
 where s0.status='pending' and r0.mode='api' and not p.archived
 and exists(select 1 from auth.users u join public.allowed_users a on lower(a.email)=lower(u.email) where u.id=p.owner_id and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<now()) and u.deleted_at is null)
 order by s0.created_at,s0.id for update of s0 skip locked limit 1;
 if not found then return null;end if;
 update ai_visibility_samples set status='running',attempts=attempts+1,lease_id=worker,lease_expires_at=now()+interval '3 minutes',updated_at=now() where id=s.id returning * into s;
 select * into r from ai_visibility_runs where id=s.run_id;
 return jsonb_build_object('sample',to_jsonb(s),'run',to_jsonb(r));
end $$;
revoke all on function public.ai_visibility_create_run(uuid,uuid,text,text,text,jsonb),public.ai_visibility_claim(uuid) from public,anon,authenticated;
grant execute on function public.ai_visibility_create_run(uuid,uuid,text,text,text,jsonb),public.ai_visibility_claim(uuid) to service_role;
notify pgrst,'reload schema';
commit;
