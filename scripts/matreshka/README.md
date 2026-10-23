# matreshka isolation (block 3) tooling

Static audit + manual two-client test. No remote DB.

## audit
```
npm run audit:matreshka
# or
node scripts/matreshka/audit-isolation.mjs
```
Checks 20261023-matreshka-*.sql for:
- every created public table has enable row level security + at least select+insert policies
- client tables declare client_id/created_by_client_id NOT NULL + have create index if not exists
- no disable rls, no drop/truncate/delete outside rollback comments
- no create/alter policy on legacy tables (suppliers, purchase_*, etc) except in 03-legacy-guard

## two-client test (local Postgres only)
Requires a local Postgres with matreshka migrations applied (01+02+03), and the stub roles/functions.

```
psql -h 127.0.0.1 -U postgres -d your_test_db -v ON_ERROR_STOP=1 -f scripts/matreshka/two-client-test.sql
```

The script:
- creates stub `auth.uid()` from `request.jwt.claim.sub`
- seeds two clients + users + memberships
- asserts via DO/RAISE EXCEPTION:
  - B cannot read/insert A's client_requests / notes / prices
  - pending client_added_suppliers visible only to creator
  - client members cannot moderate/approve (update policy)
  - anon sees nothing (or privilege error)
  - platform owner sees clients metadata
  - `matreshka_is_legacy_allowed()` = false for client-only, true for non-member

Use literal UUIDs. Always reset jwt claim before anon switch.

## CI / manual
Run `npm run audit:matreshka` locally before PR. The two-client is manual on local replica (never against prod).
