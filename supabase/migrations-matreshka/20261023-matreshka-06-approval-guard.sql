-- Примечание (2026-10-23): в проекте hmubcbmutdmowpcdohll эта миграция применялась под прежним
-- техническим именем схемы и затем переименована миграцией 07; текст приведён к схеме matreshka
-- для чистой установки (на чистой БД 07 не нужна).
-- matreshka 06: approval guard on matreshka.client_requests (NEW project hmubcbmutdmowpcdohll only).
-- Only platform owner, client_admin of the request's client, or the approver resolved from
-- matreshka.client_approval_rules (first rule by priority for the request's supply_kind:
-- approver_user_id = auth.uid() or approver_position_id = caller's member position) may change
-- approval fields. Workflow `status` may not be changed by others while approval is pending/rejected.
-- service_role / direct DB (no JWT sub) bypasses the guard.

create or replace function matreshka.matreshka_can_approve(p_client uuid, p_supply_kind text)
returns boolean
language sql stable security definer
set search_path = matreshka, public
as $$
  select matreshka.matreshka_is_platform_owner()
      or exists (select 1 from matreshka.client_members m
                  where m.client_id = p_client and m.user_id = auth.uid() and m.role = 'client_admin')
      or exists (
        select 1 from (
          select r.approver_user_id, r.approver_position_id
            from matreshka.client_approval_rules r
           where r.client_id = p_client
             and lower(trim(r.supply_kind)) = lower(trim(coalesce(p_supply_kind, '')))
           order by r.priority asc nulls last, r.created_at asc
           limit 1
        ) rr
        where rr.approver_user_id = auth.uid()
           or (rr.approver_user_id is null and rr.approver_position_id is not null and exists (
                select 1 from matreshka.client_members m
                 where m.client_id = p_client and m.user_id = auth.uid()
                   and m.position_id = rr.approver_position_id))
      );
$$;
revoke all on function matreshka.matreshka_can_approve(uuid, text) from public;
grant execute on function matreshka.matreshka_can_approve(uuid, text) to authenticated, service_role;

create or replace function matreshka.matreshka_initial_approval_status(p_client uuid, p_supply_kind text)
returns text
language sql stable security definer
set search_path = matreshka, public
as $$
  select case
    when coalesce((select (c.settings->>'approval_required')::boolean from matreshka.clients c where c.id = p_client), false)
     and exists (select 1 from matreshka.client_approval_rules r
                  where r.client_id = p_client
                    and lower(trim(r.supply_kind)) = lower(trim(coalesce(p_supply_kind, ''))))
    then 'pending' else 'not_required' end;
$$;
revoke all on function matreshka.matreshka_initial_approval_status(uuid, text) from public;
grant execute on function matreshka.matreshka_initial_approval_status(uuid, text) to authenticated, service_role;

create or replace function matreshka.matreshka_client_requests_approval_guard()
returns trigger
language plpgsql security definer
set search_path = matreshka, public
as $$
declare
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '');
begin
  -- trusted server-side / maintenance paths
  if auth.uid() is null and (v_role = 'service_role' or v_role = '') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if matreshka.matreshka_can_approve(new.client_id, new.supply_kind) then
      return new;
    end if;
    -- ordinary members cannot pre-approve or skip approval
    new.approval_status := matreshka.matreshka_initial_approval_status(new.client_id, new.supply_kind);
    new.approved_by := null; new.approved_at := null; new.approval_method := null;
    new.bitrix_approval_ref := null; new.bitrix_approval_note := null;
    return new;
  end if;

  -- UPDATE
  if new.client_id is distinct from old.client_id and not matreshka.matreshka_is_platform_owner() then
    raise exception 'matreshka: client_id cannot be changed' using errcode = '42501';
  end if;

  if matreshka.matreshka_can_approve(old.client_id, old.supply_kind)
     and matreshka.matreshka_can_approve(new.client_id, new.supply_kind) then
    return new;
  end if;

  if new.approval_status      is distinct from old.approval_status
  or new.approved_by          is distinct from old.approved_by
  or new.approved_at          is distinct from old.approved_at
  or new.approval_method      is distinct from old.approval_method
  or new.bitrix_approval_ref  is distinct from old.bitrix_approval_ref
  or new.bitrix_approval_note is distinct from old.bitrix_approval_note then
    raise exception 'matreshka: only platform owner, client_admin or assigned approver may change approval fields'
      using errcode = '42501';
  end if;

  if new.supply_kind is distinct from old.supply_kind then
    -- changing the kind by a non-approver resets approval to the rule-derived initial state
    new.approval_status := matreshka.matreshka_initial_approval_status(new.client_id, new.supply_kind);
    new.approved_by := null; new.approved_at := null; new.approval_method := null;
    new.bitrix_approval_ref := null; new.bitrix_approval_note := null;
  end if;

  if new.status is distinct from old.status and old.approval_status in ('pending', 'rejected') then
    raise exception 'matreshka: request status cannot change while approval is %', old.approval_status
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists matreshka_client_requests_approval_guard on matreshka.client_requests;
create trigger matreshka_client_requests_approval_guard
  before insert or update on matreshka.client_requests
  for each row execute function matreshka.matreshka_client_requests_approval_guard();
