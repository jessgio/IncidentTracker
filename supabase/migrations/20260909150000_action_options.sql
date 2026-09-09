create table if not exists public.action_options (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.action_options enable row level security;

drop policy if exists "action_options_select_authenticated" on public.action_options;
create policy "action_options_select_authenticated"
  on public.action_options for select
  to authenticated
  using (true);

drop policy if exists "action_options_insert_authenticated" on public.action_options;
create policy "action_options_insert_authenticated"
  on public.action_options for insert
  to authenticated
  with check (true);

drop policy if exists "action_options_update_authenticated" on public.action_options;
create policy "action_options_update_authenticated"
  on public.action_options for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "action_options_delete_authenticated" on public.action_options;
create policy "action_options_delete_authenticated"
  on public.action_options for delete
  to authenticated
  using (true);

grant select, insert, update, delete on table public.action_options to authenticated;

insert into public.action_options (name)
values
  ('Retur Replace Manual'),
  ('Retur Replace By Marketplace'),
  ('Retur Refund Manual'),
  ('Retur Refund By Marketplace'),
  ('Voucher Kompensasi'),
  ('Only Refund'),
  ('Only Replacement'),
  ('Kirim Susulan Produk'),
  ('Dana Dicairkan Ke Penjual')
on conflict (name) do nothing;

do $$
begin
  alter publication supabase_realtime add table public.action_options;
exception
  when duplicate_object then null;
end $$;
