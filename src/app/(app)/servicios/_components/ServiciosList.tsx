"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, ChevronLeft, ChevronRight, Zap } from "lucide-react";
import { Tables } from "@/lib/supabase/database.types";
import {
  deleteService,
  togglePayment,
  autoMarkPaidForMonth,
  setMonthlyActive,
} from "@/lib/actions/services";
import { formatCurrency } from "@/lib/utils/format";
import { ServiceForm } from "./ServiceForm";
import { ExchangeRateBar } from "./ExchangeRateBar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface ServiciosListProps {
  services: Tables<"services">[];
  payments: Tables<"service_payments">[];
  exchangeRate: Tables<"exchange_rates"> | null;
}

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function isFutureMonth(year: number, month: number): boolean {
  const now = new Date();
  return year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1);
}

/** Calcula el estado activo efectivo del servicio para un mes dado.
 *  Recorre hacia atrás hasta encontrar un is_active explícito.
 *  Si no hay historial, usa el campo global `active`. */
function getEffectiveActive(
  service: Tables<"services">,
  payments: Tables<"service_payments">[],
  year: number,
  month: number
): boolean {
  const relevant = payments
    .filter((p) => p.service_id === service.id && p.is_active !== null)
    .filter((p) => p.year < year || (p.year === year && p.month <= month))
    .sort((a, b) => b.year - a.year || b.month - a.month);
  if (relevant.length > 0) return relevant[0].is_active!;
  return service.active;
}

function isPaidInMonth(
  serviceId: string,
  payments: Tables<"service_payments">[],
  year: number,
  month: number
): boolean {
  return payments.some(
    (p) => p.service_id === serviceId && p.year === year && p.month === month && p.is_paid
  );
}

function toARS(amount: number, currency: string, rate: number | null): number {
  if (currency === "USD" && rate) return amount * rate;
  return amount;
}

export function ServiciosList({ services, payments, exchangeRate }: ServiciosListProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [openCreate, setOpenCreate] = useState(false);
  const [editingService, setEditingService] = useState<Tables<"services"> | null>(null);

  const isFuture = isFutureMonth(year, month);
  const rate = exchangeRate?.usd_to_ars ?? null;

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  async function handleTogglePaid(serviceId: string, currentlyPaid: boolean) {
    const result = await togglePayment(serviceId, year, month, !currentlyPaid);
    if (result.error) toast.error(result.error);
  }

  async function handleToggleMonthlyActive(serviceId: string, currentlyActive: boolean) {
    if (isFuture) return;
    const result = await setMonthlyActive(serviceId, year, month, !currentlyActive);
    if (result.error) toast.error(result.error);
  }

  async function handleAutoMark() {
    const result = await autoMarkPaidForMonth(year, month);
    if (result.error) toast.error(result.error);
    else toast.success("Servicios con débito automático marcados como pagos");
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`¿Eliminar "${name}"?`)) return;
    const result = await deleteService(id);
    if (result.error) toast.error(result.error);
    else toast.success("Servicio eliminado");
  }

  const visibleServices = services.filter((s) => getEffectiveActive(s, payments, year, month));
  const totalARS = visibleServices.reduce(
    (sum, s) => sum + toARS(s.amount, s.currency, rate),
    0
  );
  const paidCount = visibleServices.filter((s) => isPaidInMonth(s.id, payments, year, month)).length;

  return (
    <div className="space-y-4">
      {/* Navegación de mes */}
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
          {isFuture && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Mes futuro — solo lectura
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleAutoMark} disabled={isFuture}>
            <Zap className="mr-1.5 h-3.5 w-3.5" />
            Marcar débitos automáticos
          </Button>
          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nuevo servicio
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nuevo servicio</DialogTitle></DialogHeader>
              <ServiceForm onSuccess={() => setOpenCreate(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <ExchangeRateBar year={year} month={month} rate={exchangeRate} />

      {/* Resumen */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>{visibleServices.length} activos este mes</span>
        <span>·</span>
        <span>{paidCount} pagos · {visibleServices.length - paidCount} pendientes</span>
        <span>·</span>
        <span>
          Total:{" "}
          <span className="font-semibold text-foreground">{formatCurrency(totalARS)}</span>
          {!rate && visibleServices.some((s) => s.currency === "USD") && (
            <span className="ml-1 text-amber-600">(sin tipo de cambio)</span>
          )}
        </span>
      </div>

      {services.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">No hay servicios cargados</p>
          <p className="mt-1 text-xs text-muted-foreground">Hacé click en "Nuevo servicio" para empezar</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Nombre</TableHead>
              <TableHead className="text-center">Moneda</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead className="text-center">Débito</TableHead>
              <TableHead className="text-center">Este mes</TableHead>
              <TableHead className="text-center">Pago</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((service) => {
              const effectiveActive = getEffectiveActive(service, payments, year, month);
              const paid = isPaidInMonth(service.id, payments, year, month);

              return (
                <TableRow
                  key={service.id}
                  className={!effectiveActive ? "opacity-40" : ""}
                >
                  {/* Color tag */}
                  <TableCell className="p-0 pl-1">
                    <div
                      className="h-10 w-1 rounded-full"
                      style={{ backgroundColor: service.color ?? "#e5e7eb" }}
                    />
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{service.name}</span>
                      {service.auto_debit && (
                        <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                          <Zap className="mr-0.5 h-2.5 w-2.5" />
                          Auto
                        </Badge>
                      )}
                    </div>
                    {service.notes && (
                      <p className="text-xs text-muted-foreground">{service.notes}</p>
                    )}
                  </TableCell>

                  <TableCell className="text-center">
                    <Badge variant={service.currency === "USD" ? "default" : "outline"} className="text-xs">
                      {service.currency}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-right font-mono text-sm">
                    <div>
                      <span>{service.currency === "USD" ? "USD " : "$"}{service.amount.toFixed(2)}</span>
                      {service.currency === "USD" && rate && (
                        <p className="text-xs text-muted-foreground">
                          ≈ {formatCurrency(service.amount * rate)}
                        </p>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="text-center">
                    <Badge variant="outline">día {service.debit_day}</Badge>
                  </TableCell>

                  {/* Activación mensual */}
                  <TableCell className="text-center">
                    <Switch
                      checked={effectiveActive}
                      onCheckedChange={() => handleToggleMonthlyActive(service.id, effectiveActive)}
                      disabled={isFuture}
                    />
                  </TableCell>

                  {/* Estado de pago */}
                  <TableCell className="text-center">
                    <button
                      onClick={() => !isFuture && effectiveActive && handleTogglePaid(service.id, paid)}
                      disabled={isFuture || !effectiveActive}
                      className={`cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        paid
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {paid ? "Pagado" : "Pendiente"}
                    </button>
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Dialog
                        open={editingService?.id === service.id}
                        onOpenChange={(open) => !open && setEditingService(null)}
                      >
                        <DialogTrigger
                          render={
                            <Button variant="ghost" size="icon" onClick={() => setEditingService(service)} />
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>Editar servicio</DialogTitle></DialogHeader>
                          <ServiceForm service={service} onSuccess={() => setEditingService(null)} />
                        </DialogContent>
                      </Dialog>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(service.id, service.name)}
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
