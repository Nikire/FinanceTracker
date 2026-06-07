-- Permitir adjuntar archivos (facturas/comprobantes) a consumos de tarjeta.
alter type public.attachment_entity add value if not exists 'card_purchase';
