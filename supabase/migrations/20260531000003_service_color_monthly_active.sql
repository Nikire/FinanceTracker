-- Color por servicio (hex, ej: #3b82f6)
alter table public.services add column color text;

-- Activación mensual independiente por servicio
-- null = heredar del mes anterior (o el campo global `active` si no hay historial)
-- true/false = override explícito para ese mes
alter table public.service_payments add column is_active boolean;
