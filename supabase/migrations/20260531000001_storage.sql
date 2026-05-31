-- Bucket para adjuntos (facturas, contratos, etc.)
-- La UI de carga se implementa en una etapa futura.
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false);

-- Solo el dueño del archivo puede leer/subir/eliminar
create policy "attachments: upload own files"
  on storage.objects for insert
  with check (
    bucket_id = 'attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "attachments: read own files"
  on storage.objects for select
  using (
    bucket_id = 'attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "attachments: delete own files"
  on storage.objects for delete
  using (
    bucket_id = 'attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
