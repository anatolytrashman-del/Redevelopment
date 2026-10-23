do $$
declare
  c uuid; pos uuid; adm uuid := gen_random_uuid(); stf uuid := gen_random_uuid(); apos uuid := gen_random_uuid(); auser uuid := gen_random_uuid();
  own uuid := '28115b51-7ecb-4a6e-82fa-2790355d1a90'; r1 uuid; r2 uuid; out text := ''; st text;
  procedure_dummy int;
begin
  select id into c from matreshka.clients where slug='matreshka';
  select id into pos from matreshka.positions limit 1;
  insert into auth.users(id, aud, role, email) values (adm,'authenticated','authenticated','t-adm@test.invalid'),(stf,'authenticated','authenticated','t-stf@test.invalid'),(apos,'authenticated','authenticated','t-apos@test.invalid'),(auser,'authenticated','authenticated','t-auser@test.invalid');
  insert into matreshka.client_members(user_id,client_id,role,position_id) values (adm,c,'client_admin',null),(stf,c,'client_staff',null),(apos,c,'client_staff',pos),(auser,c,'client_staff',null);
  update matreshka.clients set settings = coalesce(settings,'{}'::jsonb)||'{"approval_required":true}' where id=c;
  insert into matreshka.client_approval_rules(client_id,supply_kind,approver_position_id,priority) values (c,'материалы',pos,10);
  insert into matreshka.client_approval_rules(client_id,supply_kind,approver_user_id,priority) values (c,'мебель',auser,10);

  -- helper: act as user
  -- T1 staff insert tries to pre-approve -> forced pending
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub',stf,'role','authenticated')::text, true);
  insert into matreshka.client_requests(client_id,title,created_by,supply_kind,approval_status,approved_by,approval_method)
    values (c,'t1',stf,'материалы','approved',stf,'platform') returning id, approval_status into r1, st;
  out := out || format('T1 staff insert approved->%s; ', st);
  insert into matreshka.client_requests(client_id,title,created_by,supply_kind) values (c,'t2',stf,'мебель') returning id into r2;

  -- T2 staff approve -> denied
  begin update matreshka.client_requests set approval_status='approved', approved_by=stf where id=r1; out := out||'T2 staff approve: ALLOWED(BAD); ';
  exception when insufficient_privilege then out := out||'T2 staff approve: denied; '; end;
  -- T3 staff status change while pending -> denied
  begin update matreshka.client_requests set status='in_progress' where id=r1; out := out||'T3 staff status pending: ALLOWED(BAD); ';
  exception when insufficient_privilege then out := out||'T3 staff status while pending: denied; '; end;
  -- T4 staff edits title -> allowed
  update matreshka.client_requests set title='t1x' where id=r1; get diagnostics procedure_dummy = row_count; out := out||format('T4 staff title edit rows=%s; ', procedure_dummy);
  -- T5 user-approver for мебель tries r1 (материалы) -> denied
  perform set_config('request.jwt.claims', json_build_object('sub',auser,'role','authenticated')::text, true);
  begin update matreshka.client_requests set approval_status='approved' where id=r1; out := out||'T5 wrong approver: ALLOWED(BAD); ';
  exception when insufficient_privilege then out := out||'T5 wrong approver: denied; '; end;
  -- T6 user-approver approves r2 -> ok
  update matreshka.client_requests set approval_status='approved', approved_by=auser, approved_at=now(), approval_method='platform' where id=r2 returning approval_status into st; out := out||format('T6 user-approver r2 -> %s; ', st);
  -- T7 position-approver approves r1 -> ok
  perform set_config('request.jwt.claims', json_build_object('sub',apos,'role','authenticated')::text, true);
  update matreshka.client_requests set approval_status='rejected', approved_by=apos where id=r1 returning approval_status into st; out := out||format('T7 position-approver r1 -> %s; ', st);
  -- T8 client_admin overrides r1 -> approved
  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  update matreshka.client_requests set approval_status='approved', approved_by=adm where id=r1 returning approval_status into st; out := out||format('T8 client_admin r1 -> %s; ', st);
  -- T9 staff status change after approved -> allowed
  perform set_config('request.jwt.claims', json_build_object('sub',stf,'role','authenticated')::text, true);
  update matreshka.client_requests set status='in_progress' where id=r1 returning status into st; out := out||format('T9 staff status after approve -> %s; ', st);
  -- T10 staff changes supply_kind -> approval reset
  update matreshka.client_requests set supply_kind='материалы' where id=r2 returning approval_status into st; out := out||format('T10 staff kind change r2 -> %s; ', st);
  -- T11 staff tries to move client_id
  begin update matreshka.client_requests set client_id=(select id from matreshka.clients where slug='redevelopment') where id=r1; out := out||'T11 client_id: ALLOWED(BAD); ';
  exception when insufficient_privilege then out := out||'T11 client_id change: denied; '; end;
  -- T12 platform owner (not member) approves r2
  execute 'reset role'; execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub',own,'role','authenticated')::text, true);
  update matreshka.client_requests set approval_status='approved', approved_by=own where id=r2 returning approval_status into st; out := out||format('T12 owner r2 -> %s; ', coalesce(st,'no row'));
  -- T13 service_role bypass
  execute 'reset role'; execute 'set local role service_role';
  perform set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  update matreshka.client_requests set approval_status='pending' where id=r2 returning approval_status into st; out := out||format('T13 service_role -> %s', st);
  execute 'reset role';
  raise exception 'TEST RESULTS (rolled back): %', out;
end $$;
