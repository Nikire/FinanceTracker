"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Plus } from "lucide-react";
import { Tables } from "@/lib/supabase/database.types";
import { deleteService, toggleService } from "@/lib/actions/services";
import { formatCurrency, ordinalDay } from "@/lib/utils/format";
import { ServiceForm } from "./ServiceForm";
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
}

export function ServiciosList({ services }: ServiciosListProps) {
  const [openCreate, setOpenCreate] = useState(false);
  const [editingService, setEditingService] = useState<Tables<"services"> | null>(null);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`¿Eliminar "${name}"?`)) return;
    const result = await deleteService(id);
    if (result.error) toast.error(result.error);
    else toast.success("Servicio eliminado");
  }

  async function handleToggle(id: string, active: boolean) {
    const result = await toggleService(id, active);
    if (result.error) toast.error(result.error);
  }

  const activeServices = services.filter((s) => s.active);
  const totalMonthly = activeServices.reduce((sum, s) => sum + s.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {activeServices.length} activos · Total mensual:{" "}
          <span className="font-semibold text-foreground">
            {formatCurrency(totalMonthly)}
          </span>
        </p>

        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nuevo servicio
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo servicio</DialogTitle>
            </DialogHeader>
            <ServiceForm onSuccess={() => setOpenCreate(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {services.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">No hay servicios cargados</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Hacé click en "Nuevo servicio" para empezar
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead className="text-center">Débito</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((service) => (
              <TableRow key={service.id} className={!service.active ? "opacity-50" : ""}>
                <TableCell>
                  <div>
                    <p className="font-medium">{service.name}</p>
                    {service.notes && (
                      <p className="text-xs text-muted-foreground">{service.notes}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(service.amount)}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline">{ordinalDay(service.debit_day)}</Badge>
                </TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={service.active}
                    onCheckedChange={(val) => handleToggle(service.id, val)}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Dialog
                      open={editingService?.id === service.id}
                      onOpenChange={(open) => !open && setEditingService(null)}
                    >
                      <DialogTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingService(service)}
                          />
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Editar servicio</DialogTitle>
                        </DialogHeader>
                        <ServiceForm
                          service={service}
                          onSuccess={() => setEditingService(null)}
                        />
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
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
