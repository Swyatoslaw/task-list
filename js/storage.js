// Данные, которые хранятся только на этом устройстве.

const RECENT_ROOMS_KEY = 'taskList.recentRooms';
const PRIMARY_CARDS_KEY = 'taskList.primaryCards';

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// Недавно открытые комнаты

export function getRecentRooms() {
  const rooms = read(RECENT_ROOMS_KEY, []);
  return Array.isArray(rooms) ? rooms : [];
}

export function rememberRoom(room) {
  const rooms = getRecentRooms().filter((r) => r.id !== room.id);
  rooms.unshift({ id: room.id, name: room.name, visitedAt: new Date().toISOString() });
  write(RECENT_ROOMS_KEY, rooms.slice(0, 50));
}

export function forgetRoom(id) {
  write(RECENT_ROOMS_KEY, getRecentRooms().filter((r) => r.id !== id));
}

// Основная карточка комнаты: { [roomId]: cardId }

export function getPrimaryCard(roomId) {
  return read(PRIMARY_CARDS_KEY, {})[roomId] ?? null;
}

export function setPrimaryCard(roomId, cardId) {
  const map = read(PRIMARY_CARDS_KEY, {});
  if (cardId) map[roomId] = cardId;
  else delete map[roomId];
  write(PRIMARY_CARDS_KEY, map);
}
