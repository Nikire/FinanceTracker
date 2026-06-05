"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, ChevronLeft, ChevronRight, Zap, RefreshCw, Settings2 } from "lucide-react";
import { Tables } from "@/lib/supabase/database.types";
import {
  deleteService,
  togglePayment,
  autoMarkPaidForMonth,
  setMonthlyActive,
  initializeMonth,
} from "@/lib/actions/services";
import { formatCurrency } from "@/lib/utils/format";
import { ServiceForm } from "./ServiceForm";
import { MonthlyRecordForm } from "./MonthlyRecordForm";
import { ExchangeRateBar } from "@/components/shared/ExchangeRateBar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { GroupTags, type GroupOption } from "@/components/shared/GroupTags";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface ServiciosListProps {
  services: Tables<"services">[];
  records: Tables<"service_monthly_records">[];
  exchangeRates: Tables<"exchange_rates">[];
  groups: GroupOption[];
  memberMap: Record<string, string[]>;
}

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function isFutureMonth(year: number, month: number): boolean {
  const now = new Date();
  return year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1);
}

function getRecord(
  records: Tables<"service_monthly_records">[],
  serviceId: string,
  year: number,
  month: number
): Tables<"service_monthly_records"> | null {
  return records.find((r) => r.service_id === serviceId && r.year === year && r.month === month) ?? null;
}

const ymOf = (year: number, month: number) => year * 12 + month;

/** Mes de inicio: registro más temprano, o mes de creación si no tiene registros */
function getServiceStartYm(
  service: Tables<"services">,
  records: Tables<"service_monthly_records">[]
): number {
  const recs = records.filter((r) => r.service_id === service.id);
  if (recs.length) return Math.min(...recs.map((r) => ymOf(r.year, r.month)));
  const d = new Date(service.created_at);
  return ymOf(d.getUTCFullYear(), d.getUTCMonth() + 1);
}

/** Calcula el estado activo efectivo (no cuenta antes de su mes de inicio) */
function getEffectiveActive(
  service: Tables<"services">,
  records: Tables<"service_monthly_records">[],
  year: number,
  month: number
): boolean {
  if (ymOf(year, month) < getServiceStartYm(service, records)) return false;
  const relevant = records
    .filter((r) => r.service_id === service.id && r.is_active !== null)
    .filter((r) => r.year < year || (r.year === year && r.month <= month))
    .sort((a, b) => b.year - a.year || b.month - a.month);
  if (relevant.length > 0) return relevant[0].is_active!;
  return service.active;
}

/** Valor efectivo del servicio para el mes (usa override si existe) */
function getEffectiveAmount(
  service: Tables<"services">,
  record: Tables<"service_monthly_records"> | null
): number {
  return record?.amount ?? service.amount;
}

function getEffectiveCurrency(
  service: Tables<"services">,
  record: Tables<"service_monthly_records"> | null
): "ARS" | "USD" {
  return (record?.currency ?? service.currency) as "ARS" | "USD";
}

function toARS(amount: number, currency: string, rate: number | null): number {
  if (currency === "USD" && rate) return amount * rate;
  return amount;
}

export function ServiciosList({ services, records, exchangeRates, groups, memberMap }: ServiciosListProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [openCreate, setOpenCreate] = useState(false);
  const [editingService, setEditingService] = useState<Tables<"services"> | null>(null);
  const [editingRecord, setEditingRecord] = useState<Tables<"services"> | null>(null);
  const [initializing, setInitializing] = useState(false);

  const isFuture = isFutureMonth(year, month);
  const exchangeRate = exchangeRates.find((r) => r.year === year && r.month === month) ?? null;
  const rate = exchangeRate?.usd_to_ars ?? null;

  // Registros del mes actual
  const monthRecords = records.filter((r) => r.year === year && r.month === month);
  const hasRecordsThisMonth = monthRecords.length > 0;

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  async function handleInitializeMonth() {
    setInitializing(true);
    const result = await initializeMonth(year, month);
    setInitializing(false);
    if (result.error) toast.error(result.error);
    else toast.success(`Mes inicializado con ${result.count} servicios`);
  }

  async function handleTogglePaid(serviceId: string, currentlyPaid: boolean) {
    if (isFuture) return;
    const result = await togglePayment(serviceId, year, month, !currentlyPaid);
    if (result.error) toast.error(result.error);
  }

  async function handleToggleMonthlyActive(serviceId: string, currentlyActive: boolean) {
    if (isFuture) return;
    const result = await setMonthlyActive(serviceId, year, month, !currentlyActive);
    if (result.error) toast.error(result.error);
  }

  async function handleAutoMark() {
    if (isFuture) return;
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

  // Calcular totales
  const activeServices = services.filter((s) => getEffectiveActive(s, records, year, month));

  const totalARS = activeServices
    .filter((s) => getEffectiveCurrency(s, getRecord(records, s.id, year, month)) === "ARS")
    .reduce((sum, s) => sum + getEffectiveAmount(s, getRecord(records, s.id, year, month)), 0);

  const totalUSD = activeServices
    .filter((s) => getEffectiveCurrency(s, getRecord(records, s.id, year, month)) === "USD")
    .reduce((sum, s) => sum + getEffectiveAmount(s, getRecord(records, s.id, year, month)), 0);

  const totalEstimado = totalARS + (rate ? totalUSD * rate : 0);

  const paidCount = activeServices.filter((s) => {
    const rec = getRecord(records, s.id, year, month);
    return rec?.is_paid ?? false;
  }).length;

  const visibleServices =
    groupFilter === "all"
      ? services
      : services.filter((s) => (memberMap[s.id] ?? []).includes(groupFilter));

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
          {!isFuture && !hasRecordsThisMonth && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleInitializeMonth}
              disabled={initializing}
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${initializing ? "animate-spin" : ""}`} />
              Inicializar mes
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleAutoMark} disabled={isFuture}>
            <Zap className="mr-1.5 h-3.5 w-3.5" />
            Débitos automáticos
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

      <ExchangeRateBar year={year} month={month} rate={exchangeRate} kind="service" />

      {/* Resumen + totales */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Pagos</p>
          <p className="mt-0.5 font-semibold">{paidCount} / {activeServices.length}</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Total ARS</p>
          <p className="mt-0.5 font-semibold font-mono">{formatCurrency(totalARS)}</p>
          {totalUSD > 0 && (
            <p className="text-xs text-muted-foreground">+ USD {totalUSD.toFixed(2)}</p>
          )}
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Total en ARS{rate && totalUSD > 0 ? " (con cotización)" : ""}
          </p>
          <p className="mt-0.5 font-semibold font-mono">
            {formatCurrency(totalEstimado)}
          </p>
          {!rate && totalUSD > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              USD no incluido — configurá cotización
            </p>
          )}
        </div>
      </div>

      {/* Aviso de mes sin inicializar */}
      {!isFuture && !hasRecordsThisMonth && services.length > 0 && (
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          Este mes no tiene registros. Hacé click en <strong>Inicializar mes</strong> para copiar los servicios del mes anterior.
        </div>
      )}

      {groups.length > 0 && services.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Grupo:</span>
          <Select
            items={{ all: "Todos", ...Object.fromEntries(groups.map((g) => [g.id, g.name])) }}
            value={groupFilter}
            onValueChange={(v) => setGroupFilter(v ?? "all")}
          >
            <SelectTrigger className="h-8 w-52 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {services.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">No hay servicios cargados</p>
          <p className="mt-1 text-xs text-muted-foreground">Hacé click en "Nuevo servicio" para empezar</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-4" />
              <TableHead>Nombre</TableHead>
              <TableHead>Grupos</TableHead>
              <TableHead className="text-center">Moneda</TableHead>
              <TableHead className="text-right">Monto mes</TableHead>
              <TableHead className="text-center">Débito</TableHead>
              <TableHead className="text-center">Este mes</TableHead>
              <TableHead className="text-center">Pago</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleServices.map((service) => {
              const record = getRecord(records, service.id, year, month);
              const effectiveActive = getEffectiveActive(service, records, year, month);
              const effectiveAmount = getEffectiveAmount(service, record);
              const effectiveCurrency = getEffectiveCurrency(service, record);
              const paid = record?.is_paid ?? false;
              const hasOverride = record?.amount !== null && record?.amount !== undefined;

              return (
                <TableRow key={service.id} className={!effectiveActive ? "opacity-40" : ""}>
                  {/* Color tag */}
                  <TableCell className="p-0 pl-2">
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
                      {service.recurrence === "one_time" && (
                        <Badge variant="outline" className="px-1.5 py-0 text-xs">Único</Badge>
                      )}
                    </div>
                    {(record?.notes ?? service.notes) && (
                      <p className="text-xs text-muted-foreground">{record?.notes ?? service.notes}</p>
                    )}
                  </TableCell>

                  <TableCell>
                    <GroupTags
                      entityType="service"
                      entityId={service.id}
                      groups={groups}
                      memberIds={memberMap[service.id] ?? []}
                    />
                  </TableCell>

                  <TableCell className="text-center">
                    <Badge variant={effectiveCurrency === "USD" ? "default" : "outline"} className="text-xs">
                      {effectiveCurrency}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-right font-mono text-sm">
                    <div>
                      <span className={hasOverride ? "text-blue-600 dark:text-blue-400" : ""}>
                        {effectiveCurrency === "USD" ? "USD " : "$"}{effectiveAmount.toFixed(2)}
                      </span>
                      {effectiveCurrency === "USD" && rate && (
                        <p className="text-xs text-muted-foreground">≈ {formatCurrency(effectiveAmount * rate)}</p>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="text-center">
                    <Badge variant="outline">día {service.debit_day}</Badge>
                  </TableCell>

                  <TableCell className="text-center">
                    <Switch
                      checked={effectiveActive}
                      onCheckedChange={() => handleToggleMonthlyActive(service.id, effectiveActive)}
                      disabled={isFuture}
                    />
                  </TableCell>

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
                      {/* Editar registro mensual */}
                      <Dialog
                        open={editingRecord?.id === service.id}
                        onOpenChange={(open) => !open && setEditingRecord(null)}
                      >
                        <DialogTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={isFuture || !hasRecordsThisMonth}
                              onClick={() => setEditingRecord(service)}
                              title="Editar valores de este mes"
                            />
                          }
                        >
                          <Settings2 className="h-4 w-4" />
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Valores de {MONTHS[month - 1]}</DialogTitle>
                          </DialogHeader>
                          <MonthlyRecordForm
                            service={service}
                            record={record}
                            year={year}
                            month={month}
                            onSuccess={() => setEditingRecord(null)}
                          />
                        </DialogContent>
                      </Dialog>

                      {/* Editar servicio global */}
                      <Dialog
                        open={editingService?.id === service.id}
                        onOpenChange={(open) => !open && setEditingService(null)}
                      >
                        <DialogTrigger
                          render={
                            <Button variant="ghost" size="icon" onClick={() => setEditingService(service)} title="Editar servicio" />
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
