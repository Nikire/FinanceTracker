"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { Tables } from "@/lib/supabase/database.types";
import { deleteIncome } from "@/lib/actions/income";
import { formatCurrency } from "@/lib/utils/format";
import { IngresoForm } from "./IngresoForm";
import { ExchangeRateBar } from "@/components/shared/ExchangeRateBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface IngresosListProps {
  ingresos: Tables<"income">[];
  exchangeRates: Tables<"exchange_rates">[];
}

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: "Mensual",
  annual: "Anual",
  fixed: "Fijo",
};

const FREQUENCY_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  monthly: "default",
  annual: "secondary",
  fixed: "outline",
};

export function IngresosList({ ingresos, exchangeRates }: IngresosListProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [openCreate, setOpenCreate] = useState(false);
  const [editingIngreso, setEditingIngreso] = useState<Tables<"income"> | null>(null);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  async function handleDelete(id: string, desc: string) {
    if (!confirm(`¿Eliminar "${desc}"?`)) return;
    const result = await deleteIncome(id);
    if (result.error) toast.error(result.error);
    else toast.success("Ingreso eliminado");
  }

  const exchangeRate = exchangeRates.find((r) => r.year === year && r.month === month) ?? null;
  const rate = exchangeRate?.usd_to_ars ?? null;

  // Solo los ingresos cargados en el mes seleccionado
  const monthIngresos = ingresos.filter((i) => i.year === year && i.month === month);

  function toARS(amount: number, currency: string, r: number | null): number {
    if (currency === "USD") return r ? amount * r : 0;
    return amount;
  }

  // Ingreso mensual recurrente del mes, unificado a ARS con la cotización del mes
  const monthlyUnifiedARS = monthIngresos
    .filter((i) => i.frequency === "monthly")
    .reduce((sum, i) => sum + toARS(i.amount, i.currency ?? "ARS", rate), 0);

  // Total del mes (mensual + anual + fijo), unificado a ARS
  const totalUnifiedARS = monthIngresos.reduce(
    (sum, i) => sum + toARS(i.amount, i.currency ?? "ARS", rate),
    0
  );

  // ¿Hay ingresos en USD que no podemos convertir por falta de cotización?
  const usdSinCotizar = !rate && monthIngresos.some((i) => i.currency === "USD");

  return (
    <div className="space-y-4">
      {/* Navegador de mes */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-36 text-center font-medium">
            {MONTHS[month - 1]} {year}
          </span>
          <Button variant="ghost" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nuevo ingreso
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo ingreso</DialogTitle>
            </DialogHeader>
            <IngresoForm year={year} month={month} onSuccess={() => setOpenCreate(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Tipo de cambio */}
      <ExchangeRateBar year={year} month={month} rate={exchangeRate} kind="income" />

      {/* Resumen de totales */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">{monthIngresos.length} ingresos del mes</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {monthIngresos.filter((i) => i.frequency === "monthly").length} mensuales ·{" "}
            {monthIngresos.filter((i) => i.frequency === "annual").length} anuales ·{" "}
            {monthIngresos.filter((i) => i.frequency === "fixed").length} fijos
          </p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Total del mes (ARS)</p>
          <p className="mt-0.5 font-semibold font-mono">{formatCurrency(totalUnifiedARS)}</p>
          {usdSinCotizar ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">configurá la cotización para incluir USD</p>
          ) : (
            <p className="text-xs text-muted-foreground">mensual + anual + fijo</p>
          )}
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Mensual recurrente (ARS)</p>
          <p className="mt-0.5 font-semibold font-mono">{formatCurrency(monthlyUnifiedARS)}</p>
          <p className="text-xs text-muted-foreground">solo frecuencia mensual</p>
        </div>
      </div>

      {monthIngresos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No hay ingresos cargados en {MONTHS[month - 1]} {year}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Hacé click en "Nuevo ingreso" para agregar uno a este mes
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-2 p-0" />
              <TableHead>Descripción</TableHead>
              <TableHead className="text-center">Frecuencia</TableHead>
              <TableHead className="text-center">Moneda</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {monthIngresos.map((ingreso) => {
              const currency = (ingreso.currency ?? "ARS") as "ARS" | "USD";
              return (
                <TableRow key={ingreso.id}>
                  <TableCell className="p-0 pl-2">
                    <div
                      className="h-10 w-1 rounded-full"
                      style={{ backgroundColor: ingreso.color ?? "#e5e7eb" }}
                    />
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{ingreso.description}</p>
                      {ingreso.notes && (
                        <p className="text-xs text-muted-foreground">{ingreso.notes}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={FREQUENCY_VARIANTS[ingreso.frequency] ?? "outline"}>
                      {FREQUENCY_LABELS[ingreso.frequency] ?? ingreso.frequency}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={currency === "USD" ? "default" : "outline"} className="text-xs">
                      {currency}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <div>
                      <span>
                        {currency === "USD"
                          ? `USD ${ingreso.amount.toFixed(2)}`
                          : formatCurrency(ingreso.amount)}
                      </span>
                      {currency === "USD" && rate && (
                        <p className="text-xs text-muted-foreground">
                          ≈ {formatCurrency(ingreso.amount * rate)}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Dialog
                        open={editingIngreso?.id === ingreso.id}
                        onOpenChange={(open) => !open && setEditingIngreso(null)}
                      >
                        <DialogTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingIngreso(ingreso)}
                            />
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Editar ingreso</DialogTitle>
                          </DialogHeader>
                          <IngresoForm
                            ingreso={ingreso}
                            year={year}
                            month={month}
                            onSuccess={() => setEditingIngreso(null)}
                          />
                        </DialogContent>
                      </Dialog>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(ingreso.id, ingreso.description)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
