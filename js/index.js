import { isConfigured, createRoom } from './api.js';
import { getRecentRooms, rememberRoom, forgetRoom } from './storage.js';
import { h, icons, iconButton, initThemeToggle, showError, formatDate } from './ui.js';

initThemeToggle(document.getElementById('theme-toggle'));

const form = document.getElementById('create-room');
const nameInput = document.getElementById('room-name');
const submitButton = form.querySelector('button[type="submit"]');

if (!isConfigured) {
  document.getElementById('config-warning').hidden = false;
  nameInput.disabled = true;
  submitButton.disabled = true;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return nameInput.focus();

  submitButton.disabled = true;
  try {
    const room = await createRoom(name);
    rememberRoom(room);
    location.href = `room.html?id=${room.id}`;
  } catch (error) {
    showError(error, 'Не удалось создать комнату');
    submitButton.disabled = false;
  }
});

function renderRecentRooms() {
  const rooms = getRecentRooms();
  const list = document.getElementById('recent-rooms');
  document.getElementById('recent-section').hidden = rooms.length === 0;

  list.replaceChildren(
    ...rooms.map((room) =>
      h(
        'li',
        { class: 'room-row' },
        h(
          'a',
          { class: 'room-link', href: `room.html?id=${encodeURIComponent(room.id)}` },
          h('span', { class: 'room-name' }, room.name),
          h('span', { class: 'muted small' }, `Открыта ${formatDate(room.visitedAt)}`),
          h('span', { class: 'room-arrow', html: icons.arrow })
        ),
        iconButton('close', 'Убрать из списка на этом устройстве', () => {
          forgetRoom(room.id);
          renderRecentRooms();
        })
      )
    )
  );
}

renderRecentRooms();
