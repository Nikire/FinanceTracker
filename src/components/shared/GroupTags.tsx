"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tag } from "lucide-react";
import { addToGroup, removeFromGroup } from "@/lib/actions/groups";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export type GroupOption = { id: string; name: string; color: string | null };
export type GroupEntityType = "service" | "annual_expense" | "income" | "card_purchase";

interface GroupTagsProps {
  entityType: GroupEntityType;
  entityId: string;
  groups: GroupOption[];
  memberIds: string[];
}

export function GroupTags({ entityType, entityId, groups, memberIds }: GroupTagsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const memberSet = new Set(memberIds);
  const members = groups.filter((g) => memberSet.has(g.id));

  async function toggle(g: GroupOption, isMember: boolean) {
    setBusy(true);
    const r = isMember
      ? await removeFromGroup(g.id, entityType, entityId)
      : await addToGroup(g.id, entityType, entityId);
    setBusy(false);
    if (r.error) toast.error(r.error);
    else router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {members.map((g) => (
        <Badge key={g.id} variant="outline" className="gap-1 text-xs">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.color ?? "transparent" }} />
          {g.name}
        </Badge>
      ))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={<Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" title="Grupos" />}
        >
          <Tag className="h-3.5 w-3.5" />
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grupos</DialogTitle>
          </DialogHeader>
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay grupos. Creá uno en la sección Grupos.
            </p>
          ) : (
            <div className="space-y-2">
              {groups.map((g) => {
                const isMember = memberSet.has(g.id);
                return (
                  <div key={g.id} className="flex items-center justify-between rounded-md border p-2">
                    <span className="flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.color ?? "transparent" }} />
                      {g.name}
                    </span>
                    <Switch checked={isMember} disabled={busy} onCheckedChange={() => toggle(g, isMember)} />
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
