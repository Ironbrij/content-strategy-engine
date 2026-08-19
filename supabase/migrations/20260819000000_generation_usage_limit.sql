-- Generation usage limiter: caps each account at a fixed number of
-- successful content-strategy generations (see
-- src/lib/generate-content.functions.ts). This repo has no linked Supabase
-- CLI project, so run this once in the Supabase SQL Editor.

create table if not exists public.generation_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  used_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.generation_usage enable row level security;

create policy "Users can view their own generation usage"
  on public.generation_usage
  for select
  using (auth.uid() = user_id);

grant select on public.generation_usage to authenticated;

-- Atomically reserves one generation slot for the calling user, capped at
-- p_limit, and returns the new used_count. Runs as the function owner
-- (security definer) so this is the only way rows in generation_usage are
-- ever written: clients can't inflate or reset their own count, and
-- deleting rows from `generations` (History) has no effect on it. Raises
-- 'generation_limit_reached' once the cap is hit. The upsert's row lock
-- makes this safe under concurrent requests from the same user.
create or replace function public.reserve_generation_slot(p_limit integer default 3)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.generation_usage (user_id, used_count, updated_at)
  values (auth.uid(), 1, now())
  on conflict (user_id) do update
    set used_count = generation_usage.used_count + 1,
        updated_at = now()
    where generation_usage.used_count < p_limit
  returning used_count into new_count;

  if new_count is null then
    raise exception 'generation_limit_reached';
  end if;

  return new_count;
end;
$$;

grant execute on function public.reserve_generation_slot(integer) to authenticated;
