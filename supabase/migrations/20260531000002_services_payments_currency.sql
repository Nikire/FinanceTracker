-- Enum de moneda
create type public.currency_type as enum ('ARS', 'USD');

-- Columnas nuevas en services
alter table public.services
  add column auto_debit boolean not null default false,
  add column currency    public.currency_type not null default 'ARS';

-- Pagos mensuales por servicio
create table public.service_payments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  year       smallint not null,
  month      smallint not null check (month between 1 and 12),
  is_paid    boolean not null default false,
  paid_at    timestamptz,
  created_at timestamptz not null default now(),
  unique (service_id, year, month)
);

-- Tipo de cambio mensual (USD → ARS)
create table public.exchange_rates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  year       smallint not null,
  month      smallint not null check (month between 1 and 12),
  usd_to_ars numeric(12, 2) not null check (usd_to_ars > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, year, month)
);

create trigger set_updated_at_exchange_rates
  before update on public.exchange_rates
  for each row execute function public.set_updated_at();

-- RLS
alter table public.service_payments enable row level security;
alter table public.exchange_rates    enable row level security;

create policy "service_payments: own rows only"
  on public.service_payments for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "exchange_rates: own rows only"
  on public.exchange_rates for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Índices
create index on public.service_payments (user_id, year, month);
create index on public.service_payments (service_id);
create index on public.exchange_rates   (user_id, year, month);
