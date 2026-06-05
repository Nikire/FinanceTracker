-- Uso de tarjeta: consumos puntuales y compras en cuotas, con seguimiento de
-- cuotas pendientes. Separado de los servicios fijos.

create table public.card_purchases (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  description   text not null,
  purchase_date date not null,
  currency      public.currency_type not null default 'ARS',
  total_amount  numeric(12, 2) not null check (total_amount > 0),
  installments  smallint not null default 1 check (installments between 1 and 120),
  card          text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.card_installments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  purchase_id uuid not null references public.card_purchases(id) on delete cascade,
  number      smallint not null,
  amount      numeric(12, 2) not null,
  year        smallint not null,
  month       smallint not null check (month between 1 and 12),
  is_paid     boolean not null default false,
  paid_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (purchase_id, number)
);

create index card_installments_purchase_idx on public.card_installments (purchase_id);
create index card_installments_pending_idx on public.card_installments (user_id, is_paid, year, month);

create trigger set_updated_at_card_purchases
  before update on public.card_purchases
  for each row execute function public.set_updated_at();

alter table public.card_purchases enable row level security;
alter table public.card_installments enable row level security;

create policy "card_purchases: own rows only"
  on public.card_purchases for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "card_installments: own rows only"
  on public.card_installments for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
