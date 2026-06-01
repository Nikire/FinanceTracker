"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Check, X } from "lucide-react";
import { upsertExchangeRate } from "@/lib/actions/services";
import { Tables } from "@/lib/supabase/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils/format";

interface ExchangeRateBarProps {
  year: number;
  month: number;
  rate: Tables<"exchange_rates"> | null;
  kind?: "service" | "income";
}

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const KIND_LABELS: Record<"service" | "income", string> = {
  service: "saliente",
  income: "entrante",
};

export function ExchangeRateBar({ year, month, rate, kind = "service" }: ExchangeRateBarProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(rate?.usd_to_ars?.toString() ?? "");
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) {
      toast.error("Ingresá un tipo de cambio válido");
      return;
    }
    setLoading(true);
    const result = await upsertExchangeRate(year, month, num, kind);
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Tipo de cambio actualizado");
    setEditing(false);
    router.refresh();
  }

  function handleEdit() {
    setValue(rate?.usd_to_ars?.toString() ?? "");
    setEditing(true);
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-2.5 text-sm">
      <span className="text-muted-foreground">
        USD/ARS {KIND_LABELS[kind]} {MONTHS[month - 1]} {year}:
      </span>

      {editing ? (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">USD 1 =</span>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-7 w-28 text-sm"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <span className="text-muted-foreground">ARS</span>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSave} disabled={loading}>
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : rate ? (
        <div className="flex items-center gap-2">
          <span className="font-semibold">
            USD 1 = {formatCurrency(rate.usd_to_ars)}
          </span>
          <Button size="icon" variant="ghost" className="h-7 w-7 cursor-pointer" onClick={handleEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="h-7 cursor-pointer text-xs" onClick={() => setEditing(true)}>
          Configurar
        </Button>
      )}
    </div>
  );
}
