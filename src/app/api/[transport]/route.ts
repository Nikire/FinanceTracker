import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import * as ops from "@/lib/finance/operations";
import * as files from "@/lib/finance/attachments";
import * as groups from "@/lib/finance/groups";

export const runtime = "nodejs";
export const maxDuration = 60;

// Parámetros de período reutilizables: si no se pasan year+month, se usa el mes
// actual (BA); monthsAgo permite referirse a "mes pasado" (1), etc.
const periodShape = {
  year: z.number().int().optional().describe("Año, ej 2026. Si lo omitís se usa el mes actual."),
  month: z.number().int().min(1).max(12).optional().describe("Mes 1-12. Va junto con year."),
  monthsAgo: z
    .number()
    .int()
    .optional()
    .describe("Meses hacia atrás desde el actual. 1 = mes pasado. Ignorado si pasás year+month."),
};

const currency = z.enum(["ARS", "USD"]);

const handler = createMcpHandler(
  (server) => {
    const sb = createAdminClient();
    const userId = process.env.FINANCE_USER_ID;
    if (!userId) throw new Error("Falta la variable de entorno FINANCE_USER_ID");
    const ctx = { sb, userId };

    // Wrapper: ejecuta la operación y la envuelve en el formato de respuesta MCP.
    const tool = (
      name: string,
      description: string,
      shape: z.ZodRawShape,
      fn: (args: Record<string, unknown>) => Promise<ops.OpResult> | ops.OpResult
    ) => {
      server.tool(name, description, shape, async (args: Record<string, unknown>) => {
        try {
          const result = await fn(args ?? {});
          const isError = !!result && typeof result === "object" && "error" in result;
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
            isError,
          };
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
            isError: true,
          };
        }
      });
    };

    // ── Utilidad ──────────────────────────────────────────────────────────────
    tool(
      "get_current_period",
      "Devuelve el año/mes y fecha actuales según la zona horaria de Argentina. Útil para resolver referencias como 'este mes' o 'mes pasado' antes de operar.",
      {},
      () => ops.getCurrentPeriod()
    );

    // ── Servicios ───────────────────────────────────────────────────────────────
    tool(
      "list_services",
      "Lista los servicios/gastos fijos con su estado del período indicado (monto efectivo, moneda, si está pago, si está activo). Por defecto el mes actual.",
      { activeOnly: z.boolean().optional().describe("Si true, solo servicios activos en ese mes."), ...periodShape },
      (a) => ops.listServices(ctx, a)
    );

    tool(
      "get_service",
      "Trae el detalle de un servicio (por nombre o id) y sus últimos 12 registros mensuales.",
      { service: z.string().describe("Nombre (matching parcial) o id del servicio.") },
      (a) => ops.getService(ctx, a as { service: string })
    );

    tool(
      "create_service",
      "Crea un servicio/gasto fijo. Solo name y amount son obligatorios; el resto tiene valores por defecto (ARS, mensual, día de débito 1, activo).",
      {
        name: z.string().describe("Nombre del servicio, ej 'Google One', 'Netflix'."),
        amount: z.number().positive().describe("Monto del servicio."),
        currency: currency.optional().describe("Moneda. Default ARS."),
        debit_day: z.number().int().min(1).max(31).optional().describe("Día de débito (1-31). Default 1."),
        recurrence: z.enum(["monthly", "one_time"]).optional().describe("Recurrencia. Default monthly."),
        auto_debit: z.boolean().optional().describe("Si se debita automáticamente. Default false."),
        active: z.boolean().optional().describe("Si está activo. Default true."),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional().describe("Color hex, ej #3b82f6."),
        notes: z.string().optional(),
      },
      (a) => ops.createService(ctx, a as Parameters<typeof ops.createService>[1])
    );

    tool(
      "update_service",
      "Modifica los datos base de un servicio (nombre, monto, moneda, día, etc.). Esto cambia el valor por defecto a futuro; para cambiar solo un mes usá set_service_month_amount.",
      {
        service: z.string().describe("Nombre o id del servicio a modificar."),
        name: z.string().optional(),
        amount: z.number().positive().optional(),
        currency: currency.optional(),
        debit_day: z.number().int().min(1).max(31).optional(),
        recurrence: z.enum(["monthly", "one_time"]).optional(),
        auto_debit: z.boolean().optional(),
        active: z.boolean().optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
        notes: z.string().optional(),
      },
      (a) => ops.updateService(ctx, a as Parameters<typeof ops.updateService>[1])
    );

    tool(
      "delete_service",
      "Elimina un servicio y todos sus registros mensuales. Acción irreversible.",
      { service: z.string().describe("Nombre o id del servicio a eliminar.") },
      (a) => ops.deleteService(ctx, a as { service: string })
    );

    tool(
      "mark_service_paid",
      "Marca un servicio como PAGADO en un período (default mes actual). Para 'mes pasado' usá monthsAgo: 1.",
      { service: z.string().describe("Nombre o id del servicio."), ...periodShape },
      (a) => ops.setServicePayment(ctx, { ...(a as object), isPaid: true } as Parameters<typeof ops.setServicePayment>[1])
    );

    tool(
      "mark_service_unpaid",
      "Marca un servicio como NO pagado en un período (default mes actual).",
      { service: z.string().describe("Nombre o id del servicio."), ...periodShape },
      (a) => ops.setServicePayment(ctx, { ...(a as object), isPaid: false } as Parameters<typeof ops.setServicePayment>[1])
    );

    tool(
      "set_service_month_amount",
      "Define un override de monto/moneda/notas para un servicio en un mes puntual, sin cambiar el valor base. Default mes actual.",
      {
        service: z.string().describe("Nombre o id del servicio."),
        amount: z.number().positive().optional().describe("Monto solo para ese mes."),
        currency: currency.optional(),
        notes: z.string().optional(),
        ...periodShape,
      },
      (a) => ops.setServiceMonthAmount(ctx, a as Parameters<typeof ops.setServiceMonthAmount>[1])
    );

    tool(
      "set_service_active",
      "Activa o desactiva un servicio. scope 'global' cambia el servicio en general; scope 'month' lo activa/desactiva solo para ese mes.",
      {
        service: z.string().describe("Nombre o id del servicio."),
        active: z.boolean().describe("true = activo, false = inactivo."),
        scope: z.enum(["month", "global"]).optional().describe("Default global."),
        ...periodShape,
      },
      (a) => ops.setServiceActive(ctx, a as Parameters<typeof ops.setServiceActive>[1])
    );

    tool(
      "initialize_month",
      "Inicializa un mes copiando los registros del mes anterior (servicios mensuales), reseteando el estado de pago. Default mes actual.",
      { ...periodShape },
      (a) => ops.initializeMonth(ctx, a)
    );

    tool(
      "auto_mark_paid",
      "Marca como pagados los servicios con débito automático cuyo día de débito ya pasó en el período. Default mes actual.",
      { ...periodShape },
      (a) => ops.autoMarkPaid(ctx, a)
    );

    // ── Ingresos ────────────────────────────────────────────────────────────────
    tool(
      "list_income",
      "Lista los ingresos de un período (default mes actual).",
      { ...periodShape },
      (a) => ops.listIncome(ctx, a)
    );

    tool(
      "create_income",
      "Crea un ingreso en un período (default mes actual). description, amount y frequency son obligatorios.",
      {
        description: z.string().describe("Descripción del ingreso, ej 'Sueldo', 'Freelance'."),
        amount: z.number().positive(),
        frequency: z.enum(["monthly", "annual", "fixed"]).describe("monthly | annual | fixed."),
        currency: currency.optional().describe("Default ARS."),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
        notes: z.string().optional(),
        ...periodShape,
      },
      (a) => ops.createIncome(ctx, a as Parameters<typeof ops.createIncome>[1])
    );

    tool(
      "update_income",
      "Modifica un ingreso (resuelto por descripción o id). Si hay ambigüedad, pasá el período o el id.",
      {
        income: z.string().describe("Descripción (matching parcial) o id del ingreso."),
        description: z.string().optional(),
        amount: z.number().positive().optional(),
        frequency: z.enum(["monthly", "annual", "fixed"]).optional(),
        currency: currency.optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
        notes: z.string().optional(),
        ...periodShape,
      },
      (a) => ops.updateIncome(ctx, a as Parameters<typeof ops.updateIncome>[1])
    );

    tool(
      "delete_income",
      "Elimina un ingreso (resuelto por descripción o id). Acción irreversible.",
      { income: z.string().describe("Descripción o id del ingreso."), ...periodShape },
      (a) => ops.deleteIncome(ctx, a as Parameters<typeof ops.deleteIncome>[1])
    );

    // ── Gastos anuales ────────────────────────────────────────────────────────────
    tool(
      "list_annual_expenses",
      "Lista los gastos anuales. upcomingDays filtra a los que vencen dentro de esa cantidad de días.",
      { upcomingDays: z.number().int().positive().optional().describe("Ej 30 para próximos 30 días.") },
      (a) => ops.listAnnualExpenses(ctx, a)
    );

    tool(
      "create_annual_expense",
      "Crea un gasto anual con fecha de vencimiento (due_date en formato YYYY-MM-DD). currency default ARS.",
      {
        name: z.string(),
        amount: z.number().positive(),
        currency: currency.optional().describe("Moneda del gasto. Default ARS."),
        due_date: z.string().describe("Fecha de vencimiento YYYY-MM-DD."),
        recurring: z.boolean().optional().describe("Si se repite cada año (genera la entrada del año siguiente al vencer). Default false."),
        notes: z.string().optional(),
      },
      (a) => ops.createAnnualExpense(ctx, a as Parameters<typeof ops.createAnnualExpense>[1])
    );

    tool(
      "update_annual_expense",
      "Modifica un gasto anual (por nombre o id).",
      {
        expense: z.string().describe("Nombre o id del gasto anual."),
        name: z.string().optional(),
        amount: z.number().positive().optional(),
        currency: currency.optional(),
        due_date: z.string().optional().describe("YYYY-MM-DD."),
        recurring: z.boolean().optional().describe("Si se repite cada año."),
        notes: z.string().optional(),
      },
      (a) => ops.updateAnnualExpense(ctx, a as Parameters<typeof ops.updateAnnualExpense>[1])
    );

    tool(
      "delete_annual_expense",
      "Elimina un gasto anual (por nombre o id). Acción irreversible.",
      { expense: z.string().describe("Nombre o id del gasto anual.") },
      (a) => ops.deleteAnnualExpense(ctx, a as { expense: string })
    );

    // ── Cotizaciones ──────────────────────────────────────────────────────────────
    tool(
      "get_exchange_rate",
      "Consulta el tipo de cambio USD→ARS de un período. kind 'service' (gastos) o 'income' (ingresos). Default service y mes actual.",
      { kind: z.enum(["service", "income"]).optional(), ...periodShape },
      (a) => ops.getExchangeRate(ctx, a as Parameters<typeof ops.getExchangeRate>[1])
    );

    tool(
      "set_exchange_rate",
      "Define el tipo de cambio USD→ARS de un período. kind 'service' o 'income'. Default service y mes actual.",
      {
        usd_to_ars: z.number().positive().describe("Cuántos ARS vale 1 USD."),
        kind: z.enum(["service", "income"]).optional(),
        ...periodShape,
      },
      (a) => ops.setExchangeRate(ctx, a as Parameters<typeof ops.setExchangeRate>[1])
    );

    // ── Reporting ─────────────────────────────────────────────────────────────────
    tool(
      "get_pending_payments",
      "Devuelve qué servicios quedan por pagar en el período (activos y no pagados), con montos y total en ARS. Default mes actual.",
      { ...periodShape },
      (a) => ops.getPendingPayments(ctx, a)
    );

    tool(
      "get_monthly_summary",
      "Resumen financiero del mes en ARS: ingresos, gastos, balance, pendientes y gastos anuales próximos. Mismos cálculos que el dashboard. Default mes actual.",
      { ...periodShape },
      (a) => ops.getMonthlySummary(ctx, a)
    );

    tool(
      "get_financial_overview",
      "Panorama general: cantidades totales, resumen del mes actual y gastos anuales de los próximos 60 días.",
      {},
      () => ops.getFinancialOverview(ctx)
    );

    // ── Adjuntos / invoices ───────────────────────────────────────────────────────
    tool(
      "check_invoice",
      "DEDUP: dado el SHA-256 (hex) del archivo, indica si ese invoice ya fue subido y a qué entidades. Llamar SIEMPRE antes de procesar/subir, para evitar duplicados en cargas masivas.",
      { content_hash: z.string().describe("SHA-256 del archivo en hex minúscula (64 chars).") },
      (a) => files.checkInvoice(ctx, a as { content_hash: string })
    );

    tool(
      "upload_invoice",
      "Sube un invoice (base64) al Storage y lo vincula a un servicio/gasto/ingreso. Idempotente: si ese archivo ya está vinculado a esa entidad, no duplica.",
      {
        entity_type: z.enum(["service", "annual_expense", "income"]).describe("Tipo de entidad a la que pertenece el invoice."),
        entity_id: z.string().describe("id de la entidad (ej id del servicio)."),
        file_name: z.string().describe("Nombre original del archivo, ej 'google-2026-05.pdf'."),
        content_base64: z.string().describe("Contenido del archivo codificado en base64."),
        mime_type: z.string().optional().describe("Ej application/pdf, image/png."),
      },
      (a) => files.uploadInvoice(ctx, a as Parameters<typeof files.uploadInvoice>[1])
    );

    tool(
      "list_attachments",
      "Lista los adjuntos, opcionalmente filtrando por entidad. Incluye URLs firmadas temporales para verlos.",
      {
        entity_type: z.enum(["service", "annual_expense", "income"]).optional(),
        entity_id: z.string().optional(),
      },
      (a) => files.listAttachments(ctx, a as Parameters<typeof files.listAttachments>[1])
    );

    tool(
      "delete_attachment",
      "Elimina un adjunto (del Storage y de la base). Acción irreversible.",
      { id: z.string().describe("id del adjunto.") },
      (a) => files.deleteAttachment(ctx, a as { id: string })
    );

    // ── Grupos / carpetas (cross-tipo, muchos-a-muchos) ───────────────────────────
    const entityType = z
      .enum(["service", "annual_expense", "income"])
      .describe("Tipo de ítem: service (servicio), annual_expense (gasto anual) o income (ingreso).");

    tool(
      "create_group",
      "Crea un grupo/carpeta para agrupar servicios, gastos anuales e ingresos (cross-tipo). color opcional (hex).",
      {
        name: z.string().describe("Nombre del grupo, ej 'Borderless ATS', 'Personal'."),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional().describe("Color hex, ej #3b82f6."),
      },
      (a) => groups.createGroup(ctx, a as Parameters<typeof groups.createGroup>[1])
    );

    tool(
      "list_groups",
      "Lista los grupos con sus miembros (servicios, gastos anuales e ingresos que contiene cada uno).",
      {},
      () => groups.listGroups(ctx)
    );

    tool(
      "update_group",
      "Modifica un grupo (nombre y/o color), por nombre o id.",
      {
        group: z.string().describe("Nombre o id del grupo."),
        name: z.string().optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
      },
      (a) => groups.updateGroup(ctx, a as Parameters<typeof groups.updateGroup>[1])
    );

    tool(
      "delete_group",
      "Elimina un grupo (los ítems no se borran, solo se quita la agrupación). Por nombre o id.",
      { group: z.string().describe("Nombre o id del grupo.") },
      (a) => groups.deleteGroup(ctx, a as { group: string })
    );

    tool(
      "add_to_group",
      "Agrega un ítem (servicio/gasto anual/ingreso) a un grupo. Un ítem puede estar en varios grupos.",
      {
        group: z.string().describe("Nombre o id del grupo."),
        entity_type: entityType,
        entity: z.string().describe("Nombre o id del ítem a agregar."),
      },
      (a) => groups.addToGroup(ctx, a as Parameters<typeof groups.addToGroup>[1])
    );

    tool(
      "remove_from_group",
      "Quita un ítem de un grupo (no lo elimina, solo lo desvincula del grupo).",
      {
        group: z.string().describe("Nombre o id del grupo."),
        entity_type: entityType,
        entity: z.string().describe("Nombre o id del ítem a quitar."),
      },
      (a) => groups.removeFromGroup(ctx, a as Parameters<typeof groups.removeFromGroup>[1])
    );

    // ── Prompt reutilizable: procesar invoice ─────────────────────────────────────
    server.prompt(
      "process_invoice",
      "Workflow para procesar un invoice/factura: deduplicar, identificar el servicio, crear/editar con color de marca y aplicar el precio del mes.",
      () => ({
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                "Vas a procesar uno o más invoices/facturas para FinanceTracker. Seguí SIEMPRE este flujo:",
                "",
                "1. LEER: extraé del invoice → comercio/servicio, monto, moneda (ARS/USD), período (mes/año), fecha de vencimiento y si figura pago.",
                "2. DEDUP (obligatorio, antes de todo): calculá el SHA-256 del archivo y llamá check_invoice. Si exists=true, NO lo vuelvas a subir ni a aplicar; marcalo como 'salteado (ya cargado)'. Esto es clave en cargas masivas con repetidos.",
                "3. IDENTIFICAR SERVICIO: llamá list_services y matcheá por nombre del comercio. SIEMPRE primero verificá si ya existe.",
                "   - Si EXISTE: decidí si es cambio de precio permanente (update_service) o solo el monto de ese mes (set_service_month_amount).",
                "   - Si NO EXISTE: crealo con create_service. Buscá el color hex oficial de la marca (tu conocimiento o búsqueda web) y guardalo en 'color' — es importante como identidad visual.",
                "4. APLICAR: aplicá el precio/período correspondiente y, si el invoice está pago, mark_service_paid en ese mes.",
                "5. ADJUNTAR: subí el archivo con upload_invoice vinculándolo al servicio (entity_type='service', entity_id=<id>).",
                "",
                "ANTES de ejecutar cambios, mostrá un PREVIEW de qué vas a hacer con cada archivo (crear/editar/override, color, subir o saltear) y esperá confirmación del usuario. Recién con el OK, ejecutá.",
              ].join("\n"),
            },
          },
        ],
      })
    );

    // ── Prompt reutilizable: procesar un resumen/estado de cuenta del mes ──────────
    server.prompt(
      "process_statement",
      "Workflow para desglosar un resumen del mes (estado de cuenta, tarjeta, extracto) ítem por ítem: clasificar cada línea, dedup, y agregar como servicio/gasto/ingreso con preview y confirmación.",
      () => ({
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                "Vas a desglosar un RESUMEN DEL MES (estado de cuenta, resumen de tarjeta, extracto bancario) para FinanceTracker. Seguí SIEMPRE este flujo:",
                "",
                "1. LEER: identificá el período (mes/año) que cubre el resumen y extraé CADA línea: fecha, descripción/comercio, monto y moneda (ARS/USD). Ignorá líneas que no son movimientos (saldos, totales, pagos de la propia tarjeta, intereses si el usuario no los trackea).",
                "2. DEDUP del archivo: calculá el SHA-256 y llamá check_invoice. Si exists=true, avisá que ese resumen ya fue cargado y confirmá con el usuario si igual querés re-analizar los ítems.",
                "3. CLASIFICAR cada ítem (llamá list_services y list_groups una vez para tener contexto). Para cada línea decidí:",
                "   - Gasto de un SERVICIO EXISTENTE (matcheá por comercio) → set_service_month_amount(servicio, monto, moneda, período) + mark_service_paid (el resumen ya está pago).",
                "   - SERVICIO NUEVO recurrente → create_service con el color hex de la marca (conocimiento o búsqueda web) y luego aplicá el monto del mes.",
                "   - Gasto ÚNICO / no recurrente → create_annual_expense (con due_date = fecha del ítem) o un servicio recurrence='one_time', según corresponda.",
                "   - COBRO / INGRESO → create_income en ese período.",
                "   - No reconocido → marcá 'a revisar' y preguntá al usuario.",
                "4. IDEMPOTENCIA: los montos por mes de servicios son idempotentes (mismo servicio+mes no duplica). Ingresos y gastos anuales NO tienen dedup automático: si el resumen se solapa con uno ya cargado, avisá para no duplicar.",
                "5. PREVIEW (obligatorio): mostrá una TABLA ítem por ítem con [descripción · monto · clasificación · acción propuesta · servicio/grupo destino], más el total del mes y los ítems salteados/a revisar. Esperá confirmación del usuario.",
                "6. EJECUTAR (con el OK): aplicá cada acción. Sugerí agrupar los ítems en grupos con add_to_group cuando compartan origen.",
                "7. ADJUNTAR: subí el archivo del resumen con upload_invoice (vinculado a un servicio representativo o al período). Reportá un resumen final: agregados / actualizados / salteados / a revisar y el total.",
              ].join("\n"),
            },
          },
        ],
      })
    );
  },
  {
    // Capabilities: dejamos que mcp-handler infiera las tools registradas.
  },
  {
    basePath: "/api",
    maxDuration: 60,
    verboseLogs: true,
  }
);

// Autenticación por token bearer (app de un solo usuario).
async function authed(req: Request): Promise<Response> {
  const token = process.env.MCP_AUTH_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ error: "MCP_AUTH_TOKEN no configurado en el servidor" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${token}`) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "content-type": "application/json", "www-authenticate": "Bearer" },
    });
  }
  return handler(req);
}

export { authed as GET, authed as POST, authed as DELETE };
