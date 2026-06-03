"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Plus } from "lucide-react";
import { Tables } from "@/lib/supabase/database.types";
import { deleteAnnualExpense } from "@/lib/actions/annual-expenses";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { GastoForm } from "./GastoForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface GastosListProps {
  gastos: Tables<"annual_expenses">[];
  rate: number | null;
}

export function GastosList({ gastos, rate }: GastosListProps) {
  const [openCreate, setOpenCreate] = useState(false);
  const [editingGasto, setEditingGasto] = useState<Tables<"annual_expenses"> | null>(null);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`¿Eliminar "${name}"?`)) return;
    const result = await deleteAnnualExpense(id);
    if (result.error) toast.error(result.error);
    else toast.success("Gasto eliminado");
  }

  const totalARS = gastos
    .filter((g) => g.currency !== "USD")
    .reduce((sum, g) => sum + g.amount, 0);
  const totalUSD = gastos
    .filter((g) => g.currency === "USD")
    .reduce((sum, g) => sum + g.amount, 0);
  const totalEstimado = totalARS + (rate ? totalUSD * rate : 0);

  const sorted = [...gastos].sort(
    (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {gastos.length} gastos · Total anual:{" "}
          <span className="font-semibold text-foreground">{formatCurrency(totalEstimado)}</span>
          {totalUSD > 0 && (
            <span className="text-xs">
              {" "}
              ({formatCurrency(totalARS)} ARS + USD {totalUSD.toFixed(2)}
              {rate ? `, USD 1 = ${formatCurrency(rate)}` : ", sin cotización"})
            </span>
          )}
        </p>

        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nuevo gasto
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo gasto anual</DialogTitle>
            </DialogHeader>
            <GastoForm onSuccess={() => setOpenCreate(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {gastos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">No hay gastos anuales cargados</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Hacé click en "Nuevo gasto" para empezar
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead className="text-center">Moneda</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((gasto) => {
              const isUSD = gasto.currency === "USD";
              return (
                <TableRow key={gasto.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{gasto.name}</p>
                      {gasto.notes && (
                        <p className="text-xs text-muted-foreground">{gasto.notes}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(gasto.due_date)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={isUSD ? "default" : "outline"} className="text-xs">
                      {gasto.currency}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <div>
                      <span>{isUSD ? `USD ${gasto.amount.toFixed(2)}` : formatCurrency(gasto.amount)}</span>
                      {isUSD && rate && (
                        <p className="text-xs text-muted-foreground">
                          ≈ {formatCurrency(gasto.amount * rate)}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Dialog
                        open={editingGasto?.id === gasto.id}
                        onOpenChange={(open) => !open && setEditingGasto(null)}
                      >
                        <DialogTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingGasto(gasto)}
                            />
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Editar gasto</DialogTitle>
                          </DialogHeader>
                          <GastoForm
                            gasto={gasto}
                            onSuccess={() => setEditingGasto(null)}
                          />
                        </DialogContent>
                      </Dialog>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(gasto.id, gasto.name)}
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
