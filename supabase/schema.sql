-- ===========================================================================
-- EGA × Focus 9 — Supabase schema
-- ===========================================================================
-- Running this is OPTIONAL: the app calls `create table if not exists` on first
-- boot and seeds demo users + materials automatically. Run it in the Supabase
-- SQL Editor if you prefer to provision the schema up front.
--
-- The middleware stores each document collection (users, materials, requests,
-- deliveries, invoices, audit, erpQueue, …) as a row in this single jsonb table.
-- ===========================================================================

create table if not exists kv (
  collection text        not null,
  id         text        not null,
  data       jsonb       not null,
  created_at timestamptz not null default now(),
  primary key (collection, id)
);

create index if not exists kv_collection_idx on kv (collection);

-- Helpful read-only views over the jsonb (optional, for inspection in Supabase):
create or replace view v_requests as
  select data->>'requestNo'  as request_no,
         data->>'status'     as status,
         data->>'department' as department,
         data->>'salesOrderNo' as sales_order_no,
         data->>'invoiceNo'  as invoice_no,
         created_at
  from kv where collection = 'requests';

create or replace view v_audit as
  select data->>'action'    as action,
         data->>'actorName'  as actor,
         data->>'actorRole'  as role,
         created_at
  from kv where collection = 'audit'
  order by created_at desc;
