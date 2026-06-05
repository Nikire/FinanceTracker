-- Permitir que los consumos de tarjeta se agrupen con el sistema de grupos
-- (ej. agrupar todo lo de PedidosYa o MercadoLibre).

alter type public.group_entity add value if not exists 'card_purchase';

-- Al borrar un consumo de tarjeta, limpiar sus membresías de grupo.
create trigger cleanup_group_items_card
  after delete on public.card_purchases
  for each row execute function public.cleanup_group_items('card_purchase');
