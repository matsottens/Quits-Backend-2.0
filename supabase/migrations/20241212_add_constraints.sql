-- Unique key to reduce duplicates by normalized name per user
create extension if not exists pg_trgm;

-- Add a functional index for case-insensitive matching on name
create index if not exists idx_subscriptions_user_name_trgm on public.subscriptions using gin (lower(name) gin_trgm_ops);

-- Optional: enforce soft uniqueness via trigger (safer than strict unique)
-- This trigger prevents inserting a row when a similar name already exists for the same user.
create or replace function public.prevent_duplicate_subscriptions()
returns trigger as $$
begin
  if exists (
    select 1 from public.subscriptions s
    where s.user_id = new.user_id
      and lower(s.name) = lower(new.name)
  ) then
    -- skip insert by raising a notice and returning null
    raise notice 'Duplicate subscription for user %, name % prevented', new.user_id, new.name;
    return null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_prevent_duplicate_subscriptions on public.subscriptions;
create trigger trg_prevent_duplicate_subscriptions
before insert on public.subscriptions
for each row execute procedure public.prevent_duplicate_subscriptions();


