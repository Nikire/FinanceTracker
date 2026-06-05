"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { createCardPurchase, deleteCardPurchase, setInstallmentPaid } from "@/lib/actions/cards";
import { GroupTags, type GroupOption } from "@/components/shared/GroupTags";
import type { CardPurchaseView, Cuota } from "../page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const periodLabel = (c: Cuota) => `${MESES[c.month - 1]} ${String(c.year).slice(2)}`;

interface Props {
  purchases: CardPurchaseView[];
  groups: GroupOption[];
  memberMap: Record<string, string[]>;
  rate: number | null;
}

function fmt(amount: number, currency: string) {
  return currency === "USD" ? `USD ${amount.toFixed(2)}` : formatCurrency(amount);
}

export function TarjetaManager({ purchases, groups, memberMap, rate }: Props) {
  const router = useRouter();
  const [openCreate, setOpenCreate] = useState(false);
  const [groupFilter, setGroupFilter] = useState<string>("all");

  // Cuotas pendientes (todas las compras)
  const pending = purchases.flatMap((p) =>
    p.cuotas.filter((c) => !c.is_paid).map((c) => ({ p, c }))
  );
  pending.sort((a, b) => a.c.year - b.c.year || a.c.month - b.c.month);
  const pendingArs = pending.reduce(
    (s, { p, c }) => s + (p.currency === "USD" ? (rate ? c.amount * rate : 0) : c.amount),
    0
  );

  const visible =
    groupFilter === "all"
      ? purchases
      : purchases.filter((p) => (memberMap[p.id] ?? []).includes(groupFilter));

  async function toggleCuota(c: Cuota) {
    const r = await setInstallmentPaid(c.id, !c.is_paid);
    if (r.error) toast.error(r.error);
    else router.refresh();
  }

  async function handleDelete(id: string, desc: string) {
    if (!confirm(`¿Eliminar "${desc}" y sus cuotas?`)) return;
    const r = await deleteCardPurchase(id);
    if (r.error) toast.error(r.error);
    else { toast.success("Consumo eliminado"); router.refresh(); }
  }

  return (
    <div className="space-y-5">
      {/* Resumen de pendientes */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Cuotas pendientes</p>
            <p className="mt-0.5 text-xl font-semibold">
              {pending.length} · {formatCurrency(pendingArs)}
            </p>
          </div>
          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nuevo consumo
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuevo consumo de tarjeta</DialogTitle>
              </DialogHeader>
              <ConsumoForm onDone={() => setOpenCreate(false)} />
            </DialogContent>
          </Dialog>
        </div>
        {pending.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {pending.slice(0, 12).map(({ p, c }) => (
              <Badge key={c.id} variant="outline" className="text-xs">
                {p.description} · cuota {c.number}/{p.installments} · {periodLabel(c)} · {fmt(c.amount, p.currency)}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {groups.length > 0 && purchases.length > 0 && (
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

      {purchases.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">No hay consumos cargados</p>
          <p className="mt-1 text-xs text-muted-foreground">Hacé click en "Nuevo consumo" para empezar</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((p) => (
            <div key={p.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{p.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.purchase_date}
                    {p.card ? ` · ${p.card}` : ""} · Total {fmt(p.total_amount, p.currency)}
                    {p.installments > 1 ? ` en ${p.installments} cuotas` : " (pago único)"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <GroupTags
                    entityType="card_purchase"
                    entityId={p.id}
                    groups={groups}
                    memberIds={memberMap[p.id] ?? []}
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(p.id, p.description)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.cuotas.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => toggleCuota(c)}
                    title={c.is_paid ? "Marcar como pendiente" : "Marcar como paga"}
                    className={`rounded-md px-2 py-1 text-xs transition-colors ${
                      c.is_paid
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground hover:bg-muted/70"
                    }`}
                  >
                    {p.installments > 1 ? `${c.number}/${p.installments} · ` : ""}
                    {periodLabel(c)} · {fmt(c.amount, p.currency)}
                    {c.is_paid ? " ✓" : ""}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConsumoForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    description: "",
    total_amount: "",
    currency: "ARS" as "ARS" | "USD",
    purchase_date: "",
    installments: "1",
    paid_count: "0",
    card: "",
  });

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const total = parseFloat(f.total_amount);
    const inst = parseInt(f.installments || "1", 10);
    const paid = parseInt(f.paid_count || "0", 10);
    if (!f.description.trim() || !(total > 0) || !f.purchase_date) {
      toast.error("Completá descripción, monto y fecha");
      return;
    }
    setSaving(true);
    const r = await createCardPurchase(
      {
        description: f.description.trim(),
        total_amount: total,
        currency: f.currency,
        purchase_date: f.purchase_date,
        installments: inst,
        card: f.card,
        notes: "",
      },
      { paidCount: paid }
    );
    setSaving(false);
    if (r.error) { toast.error(r.error); return; }
    toast.success("Consumo agregado");
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium">Descripción</label>
        <Input value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="MercadoPago, PedidosYa..." autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium">Monto total</label>
          <Input type="number" step="0.01" min="0" value={f.total_amount} onChange={(e) => set("total_amount", e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Moneda</label>
          <Select items={{ ARS: "ARS — Peso argentino", USD: "USD — Dólar" }} value={f.currency} onValueChange={(v) => set("currency", v ?? "ARS")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ARS">ARS — Peso argentino</SelectItem>
              <SelectItem value="USD">USD — Dólar</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium">Fecha (1ª cuota)</label>
          <Input type="date" value={f.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Tarjeta (opcional)</label>
          <Input value={f.card} onChange={(e) => set("card", e.target.value)} placeholder="Visa ICBC" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium">Cuotas</label>
          <Input type="number" min="1" max="120" value={f.installments} onChange={(e) => set("installments", e.target.value)} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Cuotas ya pagas</label>
          <Input type="number" min="0" value={f.paid_count} onChange={(e) => set("paid_count", e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Agregar"}</Button>
      </div>
    </form>
  );
}
