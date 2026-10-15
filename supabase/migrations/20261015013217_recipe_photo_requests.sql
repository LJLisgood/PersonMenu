-- Photo proposals stay private until an administrator applies them to a published recipe.
alter table public.kitchen_requests drop constraint kitchen_requests_kind_check;
alter table public.kitchen_requests add constraint kitchen_requests_kind_check
  check (kind in ('meal', 'wish', 'submission', 'photo'));

create function public.set_recipe_cover(p_recipe text, p_cover text, p_base_cover text, p_owner uuid)
returns public.recipes language plpgsql security invoker set search_path = '' as $$
declare v_recipe public.recipes;
begin
  select * into v_recipe from public.recipes where id = p_recipe for update;
  if not found or v_recipe.state <> 'published' or p_owner is null
    or p_cover is null or p_cover !~ '^/api/media/[a-zA-Z0-9_.-]+$'
    or not exists(select 1 from public.uploads where id = substr(p_cover,12) and owner_id = p_owner)
    then raise exception 'photo_invalid'; end if;
  -- A lost HTTP response can be retried without another revision.
  if v_recipe.document->>'cover' = p_cover then return v_recipe; end if;
  if (v_recipe.document->>'cover') is distinct from p_base_cover then
    raise exception 'photo_conflict';
  end if;
  update public.recipes set document = jsonb_set(document, '{cover}', to_jsonb(p_cover), true)
    where id = p_recipe returning * into v_recipe;
  return v_recipe;
end; $$;
revoke all on function public.set_recipe_cover(text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.set_recipe_cover(text,text,text,uuid) to service_role;

create function public.approve_recipe_photo(p_request uuid, p_note text)
returns public.kitchen_requests language plpgsql security invoker set search_path = '' as $$
declare v_request public.kitchen_requests;
begin
  select * into v_request from public.kitchen_requests where id = p_request for update;
  if not found or v_request.kind <> 'photo' then raise exception 'photo_invalid'; end if;
  if v_request.state = 'completed' then return v_request; end if;
  if v_request.state not in ('pending', 'accepted') then raise exception 'photo_conflict'; end if;
  if v_request.payload->'photo'->>'recipeId' is null then raise exception 'photo_invalid'; end if;
  perform public.set_recipe_cover(v_request.payload->'photo'->>'recipeId',
    v_request.payload->'photo'->>'url', v_request.payload->'photo'->>'baseCover', v_request.owner_id);
  update public.kitchen_requests set state = 'completed', admin_note = coalesce(p_note,''), updated_at = now()
    where id = p_request returning * into v_request;
  return v_request;
end; $$;
revoke all on function public.approve_recipe_photo(uuid,text) from public,anon,authenticated;
grant execute on function public.approve_recipe_photo(uuid,text) to service_role;
notify pgrst, 'reload schema';
