-- Moneda para gastos anuales (igual que servicios/ingresos).
-- Permite cargar gastos anuales en USD y convertirlos con la cotización 'service'.
alter table public.annual_expenses
  add column currency public.currency_type not null default 'ARS';
