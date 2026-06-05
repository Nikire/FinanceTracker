"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import {
  createGroup, updateGroup, deleteGroup, addToGroup, removeFromGroup,
} from "@/lib/actions/groups";
import type { GroupView, EntityOption } from "../page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type EntityType = GroupView["members"][number]["entity_type"];
type Catalogs = Record<EntityType, EntityOption[]>;

const TYPE_LABEL: Record<EntityType, string> = {
  service: "Servicio",
  annual_expense: "Gasto anual",
  income: "Ingreso",
  card_purchase: "Consumo tarjeta",
};
const TYPE_LABEL_PLURAL: Record<EntityType, string> = {
  service: "Servicios",
  annual_expense: "Gastos anuales",
  income: "Ingresos",
  card_purchase: "Consumos de tarjeta",
};
const TYPES: EntityType[] = ["service", "annual_expense", "income", "card_purchase"];

export function GruposManager({ groups, catalogs }: { groups: GroupView[]; catalogs: Catalogs }) {
  const [openCreate, setOpenCreate] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{groups.length} grupos</p>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nuevo grupo
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo grupo</DialogTitle>
            </DialogHeader>
            <GroupForm onDone={() => setOpenCreate(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">No hay grupos todavía</p>
          <p className="mt-1 text-xs text-muted-foreground">Creá uno para agrupar tus gastos e ingresos</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} catalogs={catalogs} />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupCard({ group, catalogs }: { group: GroupView; catalogs: Catalogs }) {
  const router = useRouter();
  const [openEdit, setOpenEdit] = useState(false);

  async function handleDelete() {
    if (!confirm(`¿Eliminar el grupo "${group.name}"? Los ítems no se borran.`)) return;
    const r = await deleteGroup(group.id);
    if (r.error) toast.error(r.error);
    else { toast.success("Grupo eliminado"); router.refresh(); }
  }

  async function handleRemove(type: EntityType, id: string) {
    const r = await removeFromGroup(group.id, type, id);
    if (r.error) toast.error(r.error);
    else router.refresh();
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span
            className="h-3.5 w-3.5 shrink-0 rounded-full border"
            style={{ backgroundColor: group.color ?? "transparent" }}
          />
          <h3 className="font-semibold">{group.name}</h3>
        </div>
        <div className="flex gap-1">
          <Dialog open={openEdit} onOpenChange={setOpenEdit}>
            <DialogTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7" />}>
              <Pencil className="h-3.5 w-3.5" />
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Editar grupo</DialogTitle>
              </DialogHeader>
              <GroupForm group={group} onDone={() => setOpenEdit(false)} />
            </DialogContent>
          </Dialog>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDelete}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <span>Gastos: <span className="font-medium text-foreground">{formatCurrency(group.gastos_ars)}</span></span>
        <span>Ingresos: <span className="font-medium text-foreground">{formatCurrency(group.ingresos_ars)}</span></span>
      </div>

      <div className="mt-3 space-y-3">
        {TYPES.map((type) => {
          const members = group.members.filter((m) => m.entity_type === type);
          if (members.length === 0) return null;
          return (
            <div key={type}>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{TYPE_LABEL_PLURAL[type]}</p>
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => (
                  <Badge key={m.entity_id} variant="secondary" className="gap-1 pr-1">
                    {m.label}
                    <button
                      onClick={() => handleRemove(type, m.entity_id)}
                      className="ml-0.5 rounded-sm hover:text-destructive"
                      aria-label={`Quitar ${m.label}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          );
        })}
        {group.members.length === 0 && (
          <p className="text-xs text-muted-foreground">Sin ítems. Agregá uno abajo.</p>
        )}
      </div>

      <AddMemberRow group={group} catalogs={catalogs} />
    </div>
  );
}

function AddMemberRow({ group, catalogs }: { group: GroupView; catalogs: Catalogs }) {
  const router = useRouter();
  const [type, setType] = useState<EntityType>("service");
  const [entityId, setEntityId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const memberIds = new Set(group.members.filter((m) => m.entity_type === type).map((m) => m.entity_id));
  const options = catalogs[type].filter((o) => !memberIds.has(o.id));

  async function handleAdd() {
    if (!entityId) return;
    setSaving(true);
    const r = await addToGroup(group.id, type, entityId);
    setSaving(false);
    if (r.error) toast.error(r.error);
    else { setEntityId(""); router.refresh(); }
  }

  return (
    <div className="mt-3 flex items-center gap-2 border-t pt-3">
      <Select items={TYPE_LABEL} value={type} onValueChange={(v) => { setType(v as EntityType); setEntityId(""); }}>
        <SelectTrigger className="h-8 w-32 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TYPES.map((t) => (
            <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select items={Object.fromEntries(catalogs[type].map((o) => [o.id, o.label]))} value={entityId} onValueChange={(v) => setEntityId(v ?? "")}>
        <SelectTrigger className="h-8 flex-1 text-xs">
          <SelectValue placeholder={options.length ? "Elegí un ítem..." : "Nada para agregar"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" className="h-8" onClick={handleAdd} disabled={!entityId || saving}>
        Agregar
      </Button>
    </div>
  );
}

function GroupForm({ group, onDone }: { group?: GroupView; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(group?.name ?? "");
  const [color, setColor] = useState(group?.color ?? "#6366f1");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("El nombre es requerido"); return; }
    setSaving(true);
    const payload = { name: name.trim(), color };
    const r = group ? await updateGroup(group.id, payload) : await createGroup(payload);
    setSaving(false);
    if (r.error) { toast.error(r.error); return; }
    toast.success(group ? "Grupo actualizado" : "Grupo creado");
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="shrink-0">
          <label className="mb-2 block text-sm font-medium">Color</label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-9 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
          />
        </div>
        <div className="flex-1">
          <label className="mb-2 block text-sm font-medium">Nombre</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Borderless ATS, Personal..." autoFocus />
        </div>
      </div>
      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando..." : group ? "Actualizar" : "Crear"}
        </Button>
      </div>
    </form>
  );
}
