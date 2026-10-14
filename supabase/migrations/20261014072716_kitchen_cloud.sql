-- Cloud runtime is authoritative; pinned content remains an import/export source.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated, service_role;
create table app_private.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table app_private.admins enable row level security;
create function app_private.is_admin() returns boolean language sql stable security definer
set search_path = '' as $$ select exists(select 1 from app_private.admins where user_id = (select auth.uid())); $$;
revoke all on function app_private.is_admin() from public, anon;
grant execute on function app_private.is_admin() to authenticated, service_role;
create function public.is_kitchen_admin() returns boolean language sql stable security invoker
set search_path = '' as $$ select app_private.is_admin(); $$;
revoke all on function public.is_kitchen_admin() from public, anon;
grant execute on function public.is_kitchen_admin() to authenticated, service_role;

create table public.recipes (
  id text primary key check (id ~ '^[a-zA-Z0-9_-]{1,100}$'),
  document jsonb not null check (document->>'id' = id and jsonb_typeof(document) = 'object'),
  original_document jsonb,
  state text not null default 'draft' check (state in ('draft','published','deleted')),
  revision bigint not null default 1,
  upstream_commit text,
  updated_at timestamptz not null default now()
);
create index recipes_publication on public.recipes(state, id);
alter table public.recipes enable row level security;
create policy recipes_read on public.recipes for select to anon, authenticated
using (state = 'published' or (select public.is_kitchen_admin()));
-- Anonymous public reads cannot call the authenticated-only admin helper.
drop policy recipes_read on public.recipes;
create policy recipes_public_read on public.recipes for select to anon, authenticated using (state = 'published');
create policy recipes_admin_read on public.recipes for select to authenticated using ((select public.is_kitchen_admin()));
grant select on public.recipes to anon, authenticated;
grant all on public.recipes to service_role;
revoke insert, update, delete on public.recipes from anon, authenticated;

create table public.kitchen_requests (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  kind text not null check (kind in ('meal','wish','submission')),
  nickname text not null check (length(nickname) between 1 and 40),
  contact_email text,
  payload jsonb not null,
  state text not null default 'pending' check (state in ('pending','accepted','rejected','completed','cancelled')),
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index requests_owner on public.kitchen_requests(owner_id, created_at desc);
create index requests_state on public.kitchen_requests(state, created_at desc);
alter table public.kitchen_requests enable row level security;
create policy requests_read on public.kitchen_requests for select to authenticated
using (owner_id = (select auth.uid()) or (select public.is_kitchen_admin()));
revoke all on public.kitchen_requests from anon, authenticated;
grant select on public.kitchen_requests to authenticated;
grant all on public.kitchen_requests to service_role;

create table public.recipe_revisions (
  recipe_id text not null references public.recipes(id),
  revision bigint not null,
  document jsonb not null,
  state text not null,
  saved_at timestamptz not null default now(),
  primary key(recipe_id, revision)
);
alter table public.recipe_revisions enable row level security;
create policy revisions_admin_read on public.recipe_revisions for select to authenticated using ((select public.is_kitchen_admin()));
revoke all on public.recipe_revisions from anon, authenticated;
grant select on public.recipe_revisions to authenticated;
grant all on public.recipe_revisions to service_role;
create function app_private.save_revision() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.recipe_revisions(recipe_id,revision,document,state) values(old.id,old.revision,old.document,old.state);
  new.revision := old.revision + 1; new.updated_at := now();
  new.original_document := old.original_document; new.upstream_commit := old.upstream_commit;
  return new;
end; $$;
revoke all on function app_private.save_revision() from public, anon, authenticated;
create trigger recipe_history before update on public.recipes for each row execute function app_private.save_revision();

create table public.uploads (
  id text primary key check (id ~ '^[a-zA-Z0-9_.-]{1,120}$'),
  owner_id uuid references auth.users(id),
  object_key text not null unique,
  content_type text not null,
  bytes integer not null check(bytes between 1 and 10485760),
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.uploads enable row level security;
create policy uploads_public on public.uploads for select to anon,authenticated using (is_public);
create policy uploads_own on public.uploads for select to authenticated using (owner_id = (select auth.uid()) or (select public.is_kitchen_admin()));
revoke all on public.uploads from anon, authenticated;
grant select on public.uploads to anon, authenticated;
grant all on public.uploads to service_role;

create table app_private.notifications (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.kitchen_requests(id),
  state text not null default 'pending' check(state in ('pending','sending','sent','failed','review')),
  attempts integer not null default 0,
  locked_until timestamptz,
  last_error text,
  provider_id text,
  created_at timestamptz not null default now()
);
alter table app_private.notifications enable row level security;
grant all on all tables in schema app_private to service_role;
create table app_private.rate_limits (
  key text primary key,
  bucket timestamptz not null,
  hits integer not null default 1
);
alter table app_private.rate_limits enable row level security;
grant all on app_private.rate_limits to service_role;
-- Fixed-window counters are updated atomically across all Pages Function instances.
create function public.kitchen_rate_limit(p_key text, p_limit integer) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare v_hits integer; v_bucket timestamptz := to_timestamp(floor(extract(epoch from now()) / 900) * 900);
begin
  insert into app_private.rate_limits as r(key,bucket,hits) values(p_key,v_bucket,1)
  on conflict(key) do update set bucket = excluded.bucket,
    hits = case when r.bucket = excluded.bucket then r.hits + 1 else 1 end
  returning hits into v_hits;
  return v_hits <= p_limit;
end; $$;
revoke all on function public.kitchen_rate_limit(text,integer) from public,anon,authenticated;
grant execute on function public.kitchen_rate_limit(text,integer) to service_role;

create function public.create_kitchen_request(p_id uuid, p_owner uuid, p_kind text, p_nickname text, p_email text, p_payload jsonb, p_ip text)
returns public.kitchen_requests language plpgsql security invoker set search_path = '' as $$
declare v_row public.kitchen_requests;
begin
  -- Serialize equal request IDs, including concurrent retries.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into v_row from public.kitchen_requests where id = p_id;
  if found then
    if v_row.owner_id <> p_owner or v_row.kind <> p_kind or v_row.payload <> p_payload
      or v_row.nickname <> p_nickname or v_row.contact_email is distinct from p_email
      then raise exception 'idempotency_conflict'; end if;
    return v_row;
  end if;
  if not public.kitchen_rate_limit('request:user:' || p_owner, 10)
     or not public.kitchen_rate_limit('request:ip:' || p_ip, 30) then raise exception 'rate_limited'; end if;
  insert into public.kitchen_requests(id,owner_id,kind,nickname,contact_email,payload)
    values(p_id,p_owner,p_kind,p_nickname,p_email,p_payload) returning * into v_row;
  insert into app_private.notifications(request_id) values(p_id);
  return v_row;
end; $$;
revoke all on function public.create_kitchen_request(uuid,uuid,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.create_kitchen_request(uuid,uuid,text,text,text,jsonb,text) to service_role;

create function public.kitchen_notifications() returns setof app_private.notifications language sql stable security invoker set search_path = ''
as $$ select * from app_private.notifications order by created_at desc limit 100; $$;
create function public.claim_kitchen_notification(p_id uuid) returns setof app_private.notifications language sql security invoker set search_path = ''
as $$ update app_private.notifications set state='sending', attempts=attempts+1, locked_until=now()+interval '2 minutes'
where id=p_id and state in ('pending','failed','sending') and (locked_until is null or locked_until < now())
and (attempts=0 or created_at > now()-interval '23 hours') returning *; $$;
create function public.finish_kitchen_notification(p_id uuid,p_state text,p_error text,p_provider text) returns void language sql security invoker set search_path = ''
as $$ update app_private.notifications set state=p_state,last_error=p_error,provider_id=p_provider,locked_until=null where id=p_id and state='sending'; $$;
revoke all on function public.kitchen_notifications() from public,anon,authenticated;
revoke all on function public.claim_kitchen_notification(uuid) from public,anon,authenticated;
revoke all on function public.finish_kitchen_notification(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.kitchen_notifications() to service_role;
grant execute on function public.claim_kitchen_notification(uuid) to service_role;
grant execute on function public.finish_kitchen_notification(uuid,text,text,text) to service_role;

-- Explicit grants also work with the current opt-in Data API exposure rules.
notify pgrst, 'reload schema';
