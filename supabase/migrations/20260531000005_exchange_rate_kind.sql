-- Tipo de cambio independiente segun el flujo:
--   'service' = saliente (gastos / servicios)
--   'income'  = entrante (ingresos)
create type public.exchange_rate_kind as enum ('service', 'income');

-- Las filas existentes corresponden al cambio usado por servicios (saliente)
alter table public.exchange_rates
  add column kind public.exchange_rate_kind not null default 'service';

-- Permitir un tipo de cambio por flujo en cada mes
alter table public.exchange_rates
  drop constraint exchange_rates_user_id_year_month_key;

alter table public.exchange_rates
  add constraint exchange_rates_user_id_year_month_kind_key
  unique (user_id, year, month, kind);

create index on public.exchange_rates (user_id, kind, year, month);
