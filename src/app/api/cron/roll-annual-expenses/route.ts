import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron diario: genera la recurrencia anual de gastos.
 * Para cada gasto con recurring=true cuya fecha ya venció, crea la(s)
 * ocurrencia(s) del/los año(s) siguiente(s) y deja la fila vencida como
 * histórica (recurring=false). Solo la última (futura) queda recurring=true.
 */

function addOneYear(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y + 1, m - 1, d));
  // Si el día no existe el año siguiente (29-feb), cae a 28-feb.
  if (dt.getUTCMonth() !== m - 1) return `${y + 1}-${String(m).padStart(2, "0")}-28`;
  return `${y + 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const sb = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: dueRows, error } = await sb
    .from("annual_expenses")
    .select("*")
    .eq("recurring", true)
    .lt("due_date", today);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const created: Array<{ name: string; due_date: string; recurring: boolean }> = [];

  for (const row of dueRows ?? []) {
    let dueDate = addOneYear(row.due_date);
    let guard = 0;
    while (guard++ < 25) {
      const isTail = dueDate >= today;
      const { data: ins } = await sb
        .from("annual_expenses")
        .insert({
          user_id: row.user_id,
          name: row.name,
          amount: row.amount,
          currency: row.currency,
          due_date: dueDate,
          notes: row.notes,
          recurring: isTail,
        })
        .select("name, due_date, recurring")
        .single();
      if (ins) created.push(ins);
      if (isTail) break;
      dueDate = addOneYear(dueDate);
    }
    await sb.from("annual_expenses").update({ recurring: false }).eq("id", row.id);
  }

  return new Response(
    JSON.stringify({ ok: true, processed: dueRows?.length ?? 0, created }),
    { headers: { "content-type": "application/json" } }
  );
}

export { handler as GET, handler as POST };
