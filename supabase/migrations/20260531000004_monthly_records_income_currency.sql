-- Tipo de recurrencia de un servicio
create type public.service_recurrence as enum ('monthly', 'one_time');

-- Recurrencia por servicio (monthly = se copia al mes siguiente, one_time = no se copia)
alter table public.services
  add column recurrence public.service_recurrence not null default 'monthly';

-- Moneda en ingresos
alter table public.income
  add column currency public.currency_type not null default 'ARS';

-- =============================================================
-- REGISTROS MENSUALES DE SERVICIOS
-- Reemplaza service_payments con soporte de overrides por mes
-- =============================================================
create table public.service_monthly_records (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  service_id  uuid not null references public.services(id) on delete cascade,
  year        smallint not null,
  month       smallint not null check (month between 1 and 12),
  -- Overrides opcionales para este mes (null = usar valor del servicio)
  amount      numeric(12, 2) check (amount > 0),
  currency    public.currency_type,
  notes       text,
  -- Estado de pago
  is_paid     boolean not null default false,
  paid_at     timestamptz,
  -- Activación mensual (null = heredar del registro anterior del mismo servicio)
  is_active   boolean,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (service_id, year, month)
);

-- Migrar datos existentes de service_payments
insert into public.service_monthly_records
  (user_id, service_id, year, month, is_paid, paid_at, is_active, created_at)
select user_id, service_id, year, month, is_paid, paid_at, is_active, created_at
from public.service_payments
on conflict do nothing;

drop table public.service_payments;

-- Trigger updated_at
create trigger set_updated_at_service_monthly_records
  before update on public.service_monthly_records
  for each row execute function public.set_updated_at();

-- RLS
alter table public.service_monthly_records enable row level security;

create policy "service_monthly_records: own rows only"
  on public.service_monthly_records for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Índices
create index on public.service_monthly_records (user_id, year, month);
create index on public.service_monthly_records (service_id);
