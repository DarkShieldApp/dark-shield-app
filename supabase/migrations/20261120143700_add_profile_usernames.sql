-- HU-11: usernames are public handles; email addresses remain in Auth.
alter table public.profiles
  add column username text,
  add constraint profiles_username_check check (
    username is null or username ~ '^[a-z0-9_]{3,30}$'
  );

create unique index profiles_username_unique_idx
  on public.profiles (username)
  where username is not null;

create or replace function private.set_profile_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.created_at := old.created_at;
  if row(
    new.id, new.display_name, new.username, new.trust_level,
    new.is_active, new.role_code
  ) is distinct from row(
    old.id, old.display_name, old.username, old.trust_level,
    old.is_active, old.role_code
  ) then
    new.updated_at := clock_timestamp();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

revoke all on function private.set_profile_updated_at()
  from public, anon, authenticated, service_role;

create or replace function private.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
begin
  requested_username := nullif(
    lower(regexp_replace(btrim(new.raw_user_meta_data ->> 'username'), '^@', '')),
    ''
  );
  insert into public.profiles (id, username)
  values (new.id, requested_username);
  return new;
end;
$$;

revoke all on function private.create_profile_for_auth_user()
  from public, anon, authenticated, service_role;

create or replace function private.sync_profile_username_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
begin
  if new.raw_user_meta_data ? 'username' then
    requested_username := nullif(
      lower(regexp_replace(btrim(new.raw_user_meta_data ->> 'username'), '^@', '')),
      ''
    );
    update public.profiles
    set username = requested_username
    where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_profile_username_from_auth()
  from public, anon, authenticated, service_role;

create trigger auth_users_sync_profile_username
  after update of raw_user_meta_data on auth.users
  for each row
  when (new.raw_user_meta_data is distinct from old.raw_user_meta_data)
  execute function private.sync_profile_username_from_auth();
