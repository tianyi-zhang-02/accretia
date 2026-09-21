-- Work Optional — cloud sync schema.
-- Run once in the Supabase SQL editor (Dashboard → SQL → New query).
--
-- One row per user, holding ONE encrypted envelope. The server never sees
-- plaintext: encryption happens in the browser with a key derived from a
-- passphrase the server never receives (see src/lib/cloud/crypto.ts).
-- Row-level security makes each row visible to its owner only.

create table if not exists public.vaults (
  user_id    uuid primary key default auth.uid()
             references auth.users (id) on delete cascade,
  envelope   jsonb not null,
  updated_at timestamptz not null default now(),
  -- Ciphertext of a whole backup is a few KB; this just stops abuse.
  constraint vaults_envelope_size check (pg_column_size(envelope) < 6000000)
);

alter table public.vaults enable row level security;
alter table public.vaults force row level security;

drop policy if exists "vault: owner can read"   on public.vaults;
drop policy if exists "vault: owner can insert" on public.vaults;
drop policy if exists "vault: owner can update" on public.vaults;
drop policy if exists "vault: owner can delete" on public.vaults;

create policy "vault: owner can read"   on public.vaults for select to authenticated using (auth.uid() = user_id);
create policy "vault: owner can insert" on public.vaults for insert to authenticated with check (auth.uid() = user_id);
create policy "vault: owner can update" on public.vaults for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "vault: owner can delete" on public.vaults for delete to authenticated using (auth.uid() = user_id);

-- Signed-out visitors get nothing at all. Signed-in users get exactly the
-- four row operations: Supabase's default grants also include TRUNCATE, which
-- row-level security does not cover, so everything is revoked first.
revoke all on public.vaults from anon;
revoke all on public.vaults from authenticated;
grant select, insert, update, delete on public.vaults to authenticated;

-- updated_at is set by the DATABASE clock, never the client's: it's the
-- version stamp the app uses to detect a write from another device.
create or replace function public.vaults_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.user_id := old.user_id;      -- a row can never be re-assigned
  return new;
end $$;

drop trigger if exists vaults_touch on public.vaults;
create trigger vaults_touch before update on public.vaults
for each row execute function public.vaults_touch();
