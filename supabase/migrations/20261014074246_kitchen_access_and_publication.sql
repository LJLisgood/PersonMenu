-- Link attachments to recipes so publication and access changes are transactional.
create table app_private.recipe_uploads (
  recipe_id text not null references public.recipes(id) on delete cascade,
  upload_id text not null references public.uploads(id),
  primary key(recipe_id, upload_id)
);
alter table app_private.recipe_uploads enable row level security;
grant all on app_private.recipe_uploads to service_role;
create function app_private.sync_recipe_uploads() returns trigger language plpgsql security invoker set search_path = '' as $$
declare affected text[];
begin
  select array_agg(distinct upload_id) into affected from app_private.recipe_uploads where recipe_id=new.id;
  delete from app_private.recipe_uploads where recipe_id=new.id;
  insert into app_private.recipe_uploads(recipe_id,upload_id)
    select new.id,u.id from public.uploads u join
      (select distinct m[1] id from regexp_matches(new.document::text,'/api/media/([a-zA-Z0-9_.-]+)','g') m) refs on u.id=refs.id;
  update public.uploads u set is_public=exists(
    select 1 from app_private.recipe_uploads link join public.recipes r on r.id=link.recipe_id
    where link.upload_id=u.id and r.state='published'
  ) where u.id=any(coalesce(affected,'{}'::text[])) or u.id in(select upload_id from app_private.recipe_uploads where recipe_id=new.id);
  return new;
end; $$;
revoke all on function app_private.sync_recipe_uploads() from public, anon, authenticated;
create trigger recipe_upload_access after insert or update on public.recipes for each row execute function app_private.sync_recipe_uploads();

create table public.favorites (
  owner_id uuid not null references auth.users(id) on delete cascade,
  recipe_id text not null references public.recipes(id),
  created_at timestamptz not null default now(),
  primary key(owner_id,recipe_id)
);
alter table public.favorites enable row level security;
create policy favorites_own on public.favorites for select to authenticated using(owner_id=(select auth.uid()));
create policy favorites_add on public.favorites for insert to authenticated with check(owner_id=(select auth.uid()) and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false));
create policy favorites_remove on public.favorites for delete to authenticated using(owner_id=(select auth.uid()));
revoke all on public.favorites from anon,authenticated;
grant select,insert,delete on public.favorites to authenticated;
grant all on public.favorites to service_role;

-- A direct lookup avoids losing a retry when the inbox contains more than 100 rows.
create function public.kitchen_notification_for_request(p_request uuid) returns setof app_private.notifications
language sql stable security invoker set search_path='' as $$ select * from app_private.notifications where request_id=p_request; $$;
revoke all on function public.kitchen_notification_for_request(uuid) from public,anon,authenticated;
grant execute on function public.kitchen_notification_for_request(uuid) to service_role;
notify pgrst,'reload schema';

create function public.kitchen_notifications_page(p_page integer) returns setof app_private.notifications
language sql stable security invoker set search_path='' as $$
select * from app_private.notifications order by created_at desc,id limit 100 offset (greatest(0,least(1000,p_page))*100);
$$;
revoke all on function public.kitchen_notifications_page(integer) from public,anon,authenticated;
grant execute on function public.kitchen_notifications_page(integer) to service_role;
notify pgrst,'reload schema';
