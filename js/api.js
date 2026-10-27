import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const isConfigured = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.startsWith('YOUR_') && !SUPABASE_ANON_KEY.startsWith('YOUR_')
);

const db = isConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// Комнаты

export async function createRoom(name) {
  return unwrap(await db.from('rooms').insert({ name }).select().single());
}

export async function getRoom(id) {
  return unwrap(await db.from('rooms').select('*').eq('id', id).maybeSingle());
}

// Карточки и пункты

export async function getRoomContent(roomId) {
  const [cards, items] = await Promise.all([
    db.from('cards').select('*').eq('room_id', roomId).order('created_at'),
    db.from('items').select('*').eq('room_id', roomId).order('created_at'),
  ]);
  return { cards: unwrap(cards), items: unwrap(items) };
}

export async function createCard(roomId, title) {
  return unwrap(await db.from('cards').insert({ room_id: roomId, title }).select().single());
}

export async function updateCard(id, patch) {
  return unwrap(await db.from('cards').update(patch).eq('id', id).select().single());
}

export async function deleteCard(id) {
  unwrap(await db.from('cards').delete().eq('id', id));
}

export async function createItem(cardId, text) {
  return unwrap(await db.from('items').insert({ card_id: cardId, text }).select().single());
}

export async function updateItem(id, patch) {
  return unwrap(await db.from('items').update(patch).eq('id', id).select().single());
}

export async function deleteItem(id) {
  unwrap(await db.from('items').delete().eq('id', id));
}

// Подписка на изменения в комнате. События удаления в Supabase Realtime
// не фильтруются, поэтому слушаем их без фильтра.
export function subscribeRoom(roomId, onChange) {
  const filter = `room_id=eq.${roomId}`;
  const channel = db.channel(`room-${roomId}`);
  for (const table of ['cards', 'items']) {
    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, onChange)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter }, onChange)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, onChange);
  }
  channel.subscribe();
  return () => db.removeChannel(channel);
}
