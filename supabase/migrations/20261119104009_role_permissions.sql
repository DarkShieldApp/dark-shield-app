-- HU-14/T3. Tables are closed to API roles. Only the five scoped RPCs below
-- cross that boundary. The historical private schema stays inaccessible.
create table public.permissions (
  code text primary key check (code in ('reports.create', 'evidences.add', 'assessments.submit',
                                        'users.read', 'users.change_role', 'roles.manage_permissions')),
  name text not null check (char_length(name) between 1 and 80 and
                            name ~ '[^[:space:]]' and name !~ '[[:cntrl:]]'),
  description text
);
create table public.role_permissions (
  role_code text references public.roles(code) on delete restrict on update restrict,
  permission_code text references public.permissions(code) on delete restrict on update restrict,
  primary key (role_code, permission_code),
  check (role_code = 'admin' or permission_code in ('reports.create','evidences.add','assessments.submit'))
);

insert into public.permissions values
  ('reports.create', 'Crear reportes', 'Permiso base para registrar un reporte.'),
  ('evidences.add', 'Aportar evidencias', 'Permiso base para aportar imágenes.'),
  ('assessments.submit', 'Enviar valoraciones', 'Sujeto además a las reglas de elegibilidad de HU-08.'),
  ('users.read', 'Consultar cuentas', 'Leer la proyección administrativa de perfiles.'),
  ('users.change_role', 'Cambiar roles', 'Cambiar el rol principal de otro perfil.'),
  ('roles.manage_permissions', 'Gestionar permisos', 'Consultar la matriz y modificar asignaciones de colaboración.');
insert into public.role_permissions
  select r.code, p.code from public.roles r cross join public.permissions p
  where r.code = 'admin' or p.code in ('reports.create','evidences.add','assessments.submit');

create table private.authorization_audit (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  actor_id uuid not null,
  operation text not null,
  target_id uuid,
  role_code text,
  permission_code text,
  old_role text,
  new_role text,
  check (
    (operation = 'change_role' and target_id is not null and target_id <> actor_id
     and old_role is not null and new_role is not null and old_role <> new_role
     and role_code is null and permission_code is null)
    or (operation in ('grant','revoke') and role_code is not null and permission_code is not null
        and target_id is null and old_role is null and new_role is null)
  )
);
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table private.authorization_audit enable row level security;
revoke all on public.permissions, public.role_permissions, private.authorization_audit
  from public, anon, authenticated, service_role;
revoke all on sequence private.authorization_audit_id_seq from public, anon, authenticated, service_role;

create schema authorization_internal;
revoke all on schema authorization_internal from public, anon, authenticated, service_role;
grant usage on schema authorization_internal to authenticated;

create function authorization_internal.my_permissions() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('roleCode', p.role_code, 'permissions', array(
    select rp.permission_code from public.role_permissions rp
    where rp.role_code = p.role_code order by rp.permission_code))
  from public.profiles p where p.id = auth.uid() and p.is_active
$$;

-- Only internal functions owned by the migration role may invoke these guards.
create function authorization_internal.require_admin(capability text) returns void
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not exists (select from public.profiles p join public.role_permissions rp using (role_code)
    where p.id = auth.uid() and p.is_active and p.role_code = 'admin' and rp.permission_code = capability)
  then raise insufficient_privilege; end if;
end;
$$;

create function authorization_internal.lock_admin(capability text) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  perform authorization_internal.require_admin(capability);
  -- Common lock for all T3 mutations, acquired before locking either profile.
  perform from public.roles where code = 'admin' for update;
  -- Recheck after waiting. A concurrent demotion invalidates authorization.
  -- At stronger isolation FOR SHARE fails on a concurrently changed actor.
  perform from public.profiles where id = auth.uid() and role_code = 'admin' and is_active for share;
  if not found then raise insufficient_privilege; end if;
  perform authorization_internal.require_admin(capability);
end;
$$;

create function authorization_internal.list_users(page_size integer, after_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform authorization_internal.require_admin('users.read');
  if page_size is null or page_size not between 1 and 100 then raise invalid_parameter_value; end if;
  return (with page as (
    select id, display_name as "displayName", role_code as "roleCode", is_active as "isActive"
    from public.profiles where after_id is null or id > after_id order by id limit page_size + 1
  ), items as (select * from page order by id limit page_size)
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(to_jsonb(items) order by id), '[]'::jsonb),
    'nextCursor', case when (select count(*) from page) > page_size
      then (select id from items order by id desc limit 1) end)
  from items);
end;
$$;

create function authorization_internal.permission_matrix() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform authorization_internal.require_admin('roles.manage_permissions');
  return jsonb_build_object(
    'permissions', (select jsonb_agg(to_jsonb(p) order by code) from public.permissions p),
    'roles', (select jsonb_object_agg(r.code, array(select permission_code from public.role_permissions
       where role_code = r.code order by permission_code)) from public.roles r));
end;
$$;

create function authorization_internal.change_role(target_id uuid, requested_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare previous_role text;
begin
  perform authorization_internal.lock_admin('users.change_role');
  if target_id = auth.uid() then raise exception using errcode = 'PT409', message = 'Own role'; end if;
  if target_id is null or not exists (select from public.roles where code = requested_role)
    then raise invalid_parameter_value; end if;
  select role_code into previous_role from public.profiles where id = target_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'Unknown profile'; end if;
  if previous_role = requested_role then return; end if;
  update public.profiles set role_code = requested_role where id = target_id;
  insert into private.authorization_audit(actor_id, operation, target_id, old_role, new_role)
    values (auth.uid(), 'change_role', target_id, previous_role, requested_role);
end;
$$;

create function authorization_internal.set_permission(target_role text, capability text, enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authorization_internal.lock_admin('roles.manage_permissions');
  if enabled is null or not exists (select from public.roles where code = target_role)
    or not exists (select from public.permissions where code = capability)
    then raise invalid_parameter_value; end if;
  if capability in ('users.read','users.change_role','roles.manage_permissions')
    then raise exception using errcode = 'PT409', message = 'Fixed administrative assignment'; end if;
  if enabled then
    insert into public.role_permissions values (target_role, capability) on conflict do nothing;
  else
    delete from public.role_permissions where role_code = target_role and permission_code = capability;
  end if;
  if found then
    insert into private.authorization_audit(actor_id, operation, role_code, permission_code)
      values (auth.uid(), case when enabled then 'grant' else 'revoke' end, target_role, capability);
  end if;
end;
$$;

revoke all on all functions in schema authorization_internal from public, anon, authenticated, service_role;

create function public.my_permissions() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select authorization_internal.my_permissions()
$$;
revoke all on function public.my_permissions() from public, anon, authenticated, service_role;
grant execute on function public.my_permissions(), authorization_internal.my_permissions() to authenticated;

create function public.list_users(page_size integer, after_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select authorization_internal.list_users($1, $2)
$$;
revoke all on function public.list_users(integer, uuid) from public, anon, authenticated, service_role;
grant execute on function public.list_users(integer, uuid), authorization_internal.list_users(integer, uuid) to authenticated;

create function public.permission_matrix() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select authorization_internal.permission_matrix()
$$;
revoke all on function public.permission_matrix() from public, anon, authenticated, service_role;
grant execute on function public.permission_matrix(), authorization_internal.permission_matrix() to authenticated;

create function public.change_role(target_id uuid, requested_role text) returns void
language sql volatile security invoker set search_path = '' as $$
  select authorization_internal.change_role($1, $2)
$$;
revoke all on function public.change_role(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.change_role(uuid, text), authorization_internal.change_role(uuid, text) to authenticated;

create function public.set_permission(target_role text, capability text, enabled boolean) returns void
language sql volatile security invoker set search_path = '' as $$
  select authorization_internal.set_permission($1, $2, $3)
$$;
revoke all on function public.set_permission(text, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.set_permission(text, text, boolean), authorization_internal.set_permission(text, text, boolean) to authenticated;
