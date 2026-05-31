-- =============================================================
-- Finance Tracker — Initial Schema
-- =============================================================

-- Tipos enumerados
create type public.income_frequency as enum ('monthly', 'annual', 'fixed');
create type public.attachment_entity as enum ('service', 'annual_expense', 'income');

-- =============================================================
-- SERVICIOS — gastos mensuales fijos
-- =============================================================
create table public.services (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  amount      numeric(12, 2) not null check (amount > 0),
  debit_day   smallint not null check (debit_day between 1 and 31),
  active      boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- =============================================================
-- GASTOS ANUALES — gasto con fecha específica en el calendario
-- =============================================================
create table public.annual_expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  amount      numeric(12, 2) not null check (amount > 0),
  due_date    date not null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- =============================================================
-- INGRESOS — mensual / anual / fijo
-- =============================================================
create table public.income (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  description text not null,
  amount      numeric(12, 2) not null check (amount > 0),
  frequency   public.income_frequency not null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- =============================================================
-- ATTACHMENTS — adjuntos (factura, contrato, etc.)
-- Tabla preparada; la UI de carga se implementa después.
-- =============================================================
create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  entity_type  public.attachment_entity not null,
  entity_id    uuid not null,
  file_url     text not null,
  file_name    text not null,
  file_size    bigint,
  mime_type    text,
  created_at   timestamptz not null default now()
);

-- =============================================================
-- UPDATED_AT automático
-- =============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_services
  before update on public.services
  for each row execute function public.set_updated_at();

create trigger set_updated_at_annual_expenses
  before update on public.annual_expenses
  for each row execute function public.set_updated_at();

create trigger set_updated_at_income
  before update on public.income
  for each row execute function public.set_updated_at();

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================
alter table public.services        enable row level security;
alter table public.annual_expenses enable row level security;
alter table public.income          enable row level security;
alter table public.attachments     enable row level security;

-- services
create policy "services: own rows only"
  on public.services for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- annual_expenses
create policy "annual_expenses: own rows only"
  on public.annual_expenses for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- income
create policy "income: own rows only"
  on public.income for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- attachments
create policy "attachments: own rows only"
  on public.attachments for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =============================================================
-- ÍNDICES
-- =============================================================
create index on public.services        (user_id);
create index on public.annual_expenses (user_id);
create index on public.annual_expenses (due_date);
create index on public.income          (user_id);
create index on public.attachments     (entity_type, entity_id);
