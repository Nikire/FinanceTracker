"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, ChevronLeft, ChevronRight, Zap } from "lucide-react";
import { Tables } from "@/lib/supabase/database.types";
import { deleteService, toggleService, togglePayment, autoMarkPaidForMonth } from "@/lib/actions/services";
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

function toARS(amount: number, currency: string, rate: number | null): number {
  if (currency === "USD" && rate) return amount * rate;
  return amount;
}

export function ServiciosList({ services, payments, exchangeRate }: ServiciosListProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [currentRate, setCurrentRate] = useState(exchangeRate);
  const [openCreate, setOpenCreate] = useState(false);
  const [editingService, setEditingService] = useState<Tables<"services"> | null>(null);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  const isPaid = (serviceId: string) =>
    payments.some((p) => p.service_id === serviceId && p.year === year && p.month === month && p.is_paid);

  async function handleTogglePaid(serviceId: string, currentlyPaid: boolean) {
    const result = await togglePayment(serviceId, year, month, !currentlyPaid);
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

  async function handleToggleActive(id: string, active: boolean) {
    const result = await toggleService(id, active);
    if (result.error) toast.error(result.error);
  }

  const activeServices = services.filter((s) => s.active);
  const rate = currentRate?.usd_to_ars ?? null;

  const totalARS = activeServices.reduce(
    (sum, s) => sum + toARS(s.amount, s.currency, rate),
    0
  );

  const paidCount = activeServices.filter((s) => isPaid(s.id)).length;

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
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleAutoMark}>
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

      {/* Tipo de cambio */}
      <ExchangeRateBar year={year} month={month} rate={currentRate} />

      {/* Resumen */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>{activeServices.length} activos</span>
        <span>·</span>
        <span>{paidCount} pagos · {activeServices.length - paidCount} pendientes</span>
        <span>·</span>
        <span>
          Total mensual:{" "}
          <span className="font-semibold text-foreground">{formatCurrency(totalARS)}</span>
          {!rate && activeServices.some((s) => s.currency === "USD") && (
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
              <TableHead>Nombre</TableHead>
              <TableHead className="text-center">Moneda</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead className="text-center">Débito</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-center">Pago</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((service) => {
              const paid = isPaid(service.id);
              return (
                <TableRow key={service.id} className={!service.active ? "opacity-50" : ""}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{service.name}</span>
                      {service.auto_debit && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0">
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
                  <TableCell className="text-center">
                    <Switch
                      checked={service.active}
                      onCheckedChange={(val) => handleToggleActive(service.id, val)}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <button
                      onClick={() => handleTogglePaid(service.id, paid)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
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
