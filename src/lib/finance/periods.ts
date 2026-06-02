/**
 * Manejo de períodos (año/mes) con la zona horaria de Argentina (UTC-3, sin DST).
 * El servidor MCP corre en UTC en Vercel, así que calculamos el "mes actual"
 * según el reloj de Buenos Aires para que coincida con lo que ve el usuario.
 */

const BA_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC-3

export type Period = { year: number; month: number };

/** Fecha actual desplazada a la hora de Buenos Aires. */
export function nowInBA(): Date {
  return new Date(Date.now() - BA_OFFSET_MS);
}

/** Año/mes actual según Buenos Aires. */
export function currentPeriod(): Period {
  const d = nowInBA();
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/** Fecha ISO (YYYY-MM-DD) de hoy en Buenos Aires. */
export function todayISO(): string {
  return nowInBA().toISOString().slice(0, 10);
}

/** Desplaza un período una cantidad de meses (positivo = futuro, negativo = pasado). */
export function shiftPeriod(year: number, month: number, deltaMonths: number): Period {
  const index = year * 12 + (month - 1) + deltaMonths;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * Resuelve un período a partir de los parámetros de una tool:
 * - Si vienen `year` y `month` explícitos, se usan tal cual.
 * - Si no, se parte del mes actual y se restan `monthsAgo` meses
 *   (monthsAgo = 1 → "mes pasado", monthsAgo = 0 / ausente → mes actual).
 */
export function resolvePeriod(args: {
  year?: number;
  month?: number;
  monthsAgo?: number;
}): Period {
  if (args.year != null && args.month != null) {
    return { year: args.year, month: args.month };
  }
  const current = currentPeriod();
  if (args.monthsAgo) {
    return shiftPeriod(current.year, current.month, -args.monthsAgo);
  }
  return current;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Etiqueta legible de un período, ej "junio 2026". */
export function periodLabel(p: Period): string {
  return `${MESES[p.month - 1]} ${p.year}`;
}
