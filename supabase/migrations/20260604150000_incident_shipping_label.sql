-- Tracking number / label reference for replacement shipments back to customers
alter table public.incidents
  add column if not exists shipping_label text;
