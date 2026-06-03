-- Recurrencia anual de gastos. La fila marcada recurring=true es la "cola":
-- cuando su due_date vence, un cron crea la ocurrencia del año siguiente
-- (recurring=true) y marca la anterior como histórica (recurring=false).
alter table public.annual_expenses
  add column recurring boolean not null default false;
