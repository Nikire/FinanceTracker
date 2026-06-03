-- Grupos/carpetas cross-tipo con relación muchos-a-muchos (etiquetas).
-- Un grupo puede contener servicios, gastos anuales e ingresos a la vez,
-- y cada ítem puede pertenecer a varios grupos.

create type public.group_entity as enum ('service', 'annual_expense', 'income');

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  color       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

create table public.group_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  group_id    uuid not null references public.groups(id) on delete cascade,
  entity_type public.group_entity not null,
  entity_id   uuid not null,
  created_at  timestamptz not null default now(),
  unique (group_id, entity_type, entity_id)
);

create index group_items_entity_idx on public.group_items (entity_type, entity_id);
create index group_items_group_idx on public.group_items (group_id);

create trigger set_updated_at_groups
  before update on public.groups
  for each row execute function public.set_updated_at();

-- RLS: cada usuario solo ve/maneja lo suyo
alter table public.groups enable row level security;
alter table public.group_items enable row level security;

create policy "groups: own rows only"
  on public.groups for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "group_items: own rows only"
  on public.group_items for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Al borrar una entidad, limpiar sus membresías de grupo (relación polimórfica
-- sin FK directa). El tipo se pasa como argumento del trigger.
create or replace function public.cleanup_group_items()
returns trigger language plpgsql as $$
begin
  delete from public.group_items
   where entity_id = old.id
     and entity_type = tg_argv[0]::public.group_entity;
  return old;
end;
$$;

create trigger cleanup_group_items_services
  after delete on public.services
  for each row execute function public.cleanup_group_items('service');

create trigger cleanup_group_items_annual
  after delete on public.annual_expenses
  for each row execute function public.cleanup_group_items('annual_expense');

create trigger cleanup_group_items_income
  after delete on public.income
  for each row execute function public.cleanup_group_items('income');
