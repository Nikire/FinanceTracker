-- Cada ingreso pertenece a un mes especifico y se muestra solo en ese mes
alter table public.income add column year smallint;
alter table public.income add column month smallint;

-- Backfill: asignar el mes segun la fecha de creacion
update public.income
set year = extract(year from created_at)::smallint,
    month = extract(month from created_at)::smallint
where year is null or month is null;

alter table public.income alter column year set not null;
alter table public.income alter column month set not null;

create index on public.income (user_id, year, month);
