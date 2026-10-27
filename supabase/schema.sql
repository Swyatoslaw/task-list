-- Схема базы данных для «Списка задач».
-- Выполните целиком в Supabase: Dashboard → SQL Editor → New query → Run.
-- Скрипт можно запускать повторно.

create extension if not exists pgcrypto;

-- Комнаты
create table if not exists public.rooms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);

-- Карточки (списки) внутри комнаты
create table if not exists public.cards (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms (id) on delete cascade,
  title      text not null check (char_length(btrim(title)) between 1 and 100),
  created_at timestamptz not null default now()
);
create index if not exists cards_room_id_idx on public.cards (room_id);

-- Пункты карточки. room_id дублируется для фильтрации realtime-событий
-- и заполняется триггером из карточки.
create table if not exists public.items (
  id           uuid primary key default gen_random_uuid(),
  card_id      uuid not null references public.cards (id) on delete cascade,
  room_id      uuid not null references public.rooms (id) on delete cascade,
  text         text not null check (char_length(btrim(text)) between 1 and 500),
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists items_card_id_idx on public.items (card_id);
create index if not exists items_room_id_idx on public.items (room_id);

create or replace function public.items_set_room_id()
returns trigger
language plpgsql
as $$
begin
  select c.room_id into new.room_id from public.cards c where c.id = new.card_id;
  return new;
end;
$$;

drop trigger if exists items_set_room_id on public.items;
create trigger items_set_room_id
  before insert or update of card_id on public.items
  for each row execute function public.items_set_room_id();

-- Доступ без авторизации: любой, кто знает ссылку на комнату, может с ней работать.
alter table public.rooms enable row level security;
alter table public.cards enable row level security;
alter table public.items enable row level security;

drop policy if exists "rooms_select" on public.rooms;
drop policy if exists "rooms_insert" on public.rooms;
create policy "rooms_select" on public.rooms for select to anon, authenticated using (true);
create policy "rooms_insert" on public.rooms for insert to anon, authenticated with check (true);

drop policy if exists "cards_all" on public.cards;
create policy "cards_all" on public.cards for all to anon, authenticated using (true) with check (true);

drop policy if exists "items_all" on public.items;
create policy "items_all" on public.items for all to anon, authenticated using (true) with check (true);

-- Realtime: изменения сразу видны на всех устройствах, открывших комнату.
do $$
begin
  alter publication supabase_realtime add table public.cards;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.items;
exception when duplicate_object then null;
end $$;
