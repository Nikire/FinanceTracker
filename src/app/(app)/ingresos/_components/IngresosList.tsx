"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Plus } from "lucide-react";
import { Tables } from "@/lib/supabase/database.types";
import { deleteIncome } from "@/lib/actions/income";
import { formatCurrency } from "@/lib/utils/format";
import { IngresoForm } from "./IngresoForm";
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
}

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

export function IngresosList({ ingresos }: IngresosListProps) {
  const [openCreate, setOpenCreate] = useState(false);
  const [editingIngreso, setEditingIngreso] = useState<Tables<"income"> | null>(null);

  async function handleDelete(id: string, desc: string) {
    if (!confirm(`¿Eliminar "${desc}"?`)) return;
    const result = await deleteIncome(id);
    if (result.error) toast.error(result.error);
    else toast.success("Ingreso eliminado");
  }

  const monthlyTotal = ingresos
    .filter((i) => i.frequency === "monthly")
    .reduce((sum, i) => sum + i.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {ingresos.length} ingresos · Mensual recurrente:{" "}
          <span className="font-semibold text-foreground">{formatCurrency(monthlyTotal)}</span>
        </p>

        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nuevo ingreso
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo ingreso</DialogTitle>
            </DialogHeader>
            <IngresoForm onSuccess={() => setOpenCreate(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {ingresos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">No hay ingresos cargados</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Hacé click en "Nuevo ingreso" para empezar
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-center">Frecuencia</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {ingresos.map((ingreso) => (
              <TableRow key={ingreso.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{ingreso.description}</p>
                    {ingreso.notes && (
                      <p className="text-xs text-muted-foreground">{ingreso.notes}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={FREQUENCY_VARIANTS[ingreso.frequency]}>
                    {FREQUENCY_LABELS[ingreso.frequency]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(ingreso.amount)}
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
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
