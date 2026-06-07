import { createHash } from "node:crypto";
import type { AdminClient } from "@/lib/supabase/admin";
import type { OpResult } from "./operations";

/**
 * Adjuntos (invoices). El archivo se guarda en el bucket privado `attachments`
 * con el SHA-256 del contenido como nombre → el mismo archivo siempre cae en la
 * misma ruta, lo que hace el dedup exacto y no requiere cambios de schema.
 * Ruta: `${userId}/${sha256}.${ext}`.
 */

const BUCKET = "attachments";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 días
const ENTITY_TYPES = ["service", "annual_expense", "income", "card_purchase"] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

type Ctx = { sb: AdminClient; userId: string };

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function extFor(fileName: string, mime?: string): string {
  const fromName = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  if (fromName && fromName.length <= 5) return fromName;
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return (mime && map[mime]) || "bin";
}

async function signedUrl(ctx: Ctx, path: string): Promise<string | null> {
  const { data } = await ctx.sb.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  return data?.signedUrl ?? null;
}

/**
 * Dedup: dado un hash (SHA-256 hex lowercase del archivo), indica si ya fue
 * subido y a qué entidades está vinculado. Para usar ANTES de procesar/subir,
 * sin transferir el archivo completo.
 */
export async function checkInvoice(ctx: Ctx, args: { content_hash: string }): Promise<OpResult> {
  const hash = args.content_hash.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    return { error: "content_hash inválido: debe ser un SHA-256 en hex (64 caracteres)." };
  }
  const { data, error } = await ctx.sb
    .from("attachments")
    .select("*")
    .eq("user_id", ctx.userId)
    .like("file_url", `%/${hash}.%`);
  if (error) return { error: error.message };
  return {
    content_hash: hash,
    exists: (data?.length ?? 0) > 0,
    attachments: data ?? [],
  };
}

/**
 * Sube un invoice (base64) al Storage y lo vincula a una entidad. Idempotente:
 * si ese archivo ya está vinculado a esa entidad, no duplica (skipped=true).
 */
export async function uploadInvoice(
  ctx: Ctx,
  args: {
    entity_type: EntityType;
    entity_id: string;
    file_name: string;
    content_base64: string;
    mime_type?: string;
  }
): Promise<OpResult> {
  if (!ENTITY_TYPES.includes(args.entity_type)) {
    return { error: `entity_type inválido. Usá uno de: ${ENTITY_TYPES.join(", ")}` };
  }
  if (!args.entity_id || !args.file_name || !args.content_base64) {
    return { error: "Faltan datos: entity_type, entity_id, file_name y content_base64 son obligatorios." };
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(args.content_base64, "base64");
  } catch {
    return { error: "content_base64 no es un base64 válido." };
  }
  if (buf.length === 0) return { error: "El archivo está vacío." };
  if (buf.length > 10 * 1024 * 1024) return { error: "El archivo supera 10 MB." };

  const hash = sha256Hex(buf);
  const ext = extFor(args.file_name, args.mime_type);
  const path = `${ctx.userId}/${hash}.${ext}`;

  // ¿Ya está vinculado a esta misma entidad? → no duplicar.
  const { data: existing } = await ctx.sb
    .from("attachments")
    .select("*")
    .eq("user_id", ctx.userId)
    .eq("entity_type", args.entity_type)
    .eq("entity_id", args.entity_id)
    .like("file_url", `%/${hash}.%`)
    .maybeSingle();
  if (existing) {
    return {
      skipped: true,
      reason: "Este invoice ya estaba vinculado a esta entidad.",
      content_hash: hash,
      attachment: existing,
      url: await signedUrl(ctx, path),
    };
  }

  // Subir al Storage (upsert: si el mismo archivo ya existe en disco, no rompe).
  const { error: upErr } = await ctx.sb.storage.from(BUCKET).upload(path, buf, {
    contentType: args.mime_type || undefined,
    upsert: true,
  });
  if (upErr) return { error: `Storage: ${upErr.message}` };

  const { data: inserted, error: insErr } = await ctx.sb
    .from("attachments")
    .insert({
      user_id: ctx.userId,
      entity_type: args.entity_type,
      entity_id: args.entity_id,
      file_url: path,
      file_name: args.file_name,
      file_size: buf.length,
      mime_type: args.mime_type ?? null,
    })
    .select()
    .single();
  if (insErr) return { error: insErr.message };

  return {
    success: true,
    skipped: false,
    content_hash: hash,
    attachment: inserted,
    url: await signedUrl(ctx, path),
  };
}

export async function listAttachments(
  ctx: Ctx,
  args: { entity_type?: EntityType; entity_id?: string }
): Promise<OpResult> {
  let query = ctx.sb.from("attachments").select("*").eq("user_id", ctx.userId);
  if (args.entity_type) query = query.eq("entity_type", args.entity_type);
  if (args.entity_id) query = query.eq("entity_id", args.entity_id);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return { error: error.message };

  const withUrls = await Promise.all(
    (data ?? []).map(async (a) => ({ ...a, url: await signedUrl(ctx, a.file_url) }))
  );
  return { count: withUrls.length, attachments: withUrls };
}

export async function deleteAttachment(ctx: Ctx, args: { id: string }): Promise<OpResult> {
  const { data: row, error } = await ctx.sb
    .from("attachments")
    .select("*")
    .eq("user_id", ctx.userId)
    .eq("id", args.id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!row) return { error: `No existe un adjunto con id ${args.id}` };

  await ctx.sb.storage.from(BUCKET).remove([row.file_url]);
  const { error: delErr } = await ctx.sb
    .from("attachments")
    .delete()
    .eq("id", args.id)
    .eq("user_id", ctx.userId);
  if (delErr) return { error: delErr.message };
  return { success: true, deleted: { id: row.id, file_name: row.file_name } };
}
