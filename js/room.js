import {
  isConfigured,
  isUuid,
  getRoom,
  getRoomContent,
  createCard,
  updateCard,
  deleteCard,
  createItem,
  updateItem,
  deleteItem,
  subscribeRoom,
} from './api.js';
import { rememberRoom, getPrimaryCard, setPrimaryCard } from './storage.js';
import {
  h,
  icons,
  iconButton,
  initThemeToggle,
  toast,
  showError,
  confirmDialog,
  promptDialog,
  formatDate,
} from './ui.js';

const roomId = new URLSearchParams(location.search).get('id');

const els = {
  title: document.getElementById('room-title'),
  main: document.getElementById('room-main'),
  cardForm: document.getElementById('create-card'),
  cardInput: document.getElementById('card-title'),
  cards: document.getElementById('cards'),
  empty: document.getElementById('empty-state'),
  loading: document.getElementById('loading'),
  copyLink: document.getElementById('copy-link'),
};

const state = {
  room: null,
  cards: [],
  items: [],
  primaryId: null,
  drafts: new Map(), // cardId -> текст нового пункта
  editing: null, // { id, text } — пункт в режиме редактирования
};

initThemeToggle(document.getElementById('theme-toggle'));
document.getElementById('back-link').innerHTML = icons.back;
els.copyLink.innerHTML = icons.link;

init();

// Загрузка

async function init() {
  if (!isConfigured) return fatal('Supabase не настроен. Укажите ключи в js/config.js.');
  if (!isUuid(roomId)) return fatal('Комната не найдена.');

  try {
    state.room = await getRoom(roomId);
  } catch (error) {
    console.error(error);
    return fatal('Не удалось загрузить комнату. Проверьте подключение к интернету.');
  }
  if (!state.room) return fatal('Комната не найдена.');

  els.title.textContent = state.room.name;
  document.title = `${state.room.name} — Список задач`;
  rememberRoom(state.room);
  state.primaryId = getPrimaryCard(roomId);

  await reload();
  els.loading.hidden = true;
  els.cardForm.hidden = false;
  els.copyLink.hidden = false;

  subscribeRoom(roomId, scheduleReload);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleReload();
  });
}

function fatal(message) {
  els.title.textContent = 'Список задач';
  els.main.replaceChildren(
    h(
      'section',
      { class: 'panel center' },
      h('p', null, message),
      h('a', { class: 'btn btn-primary', href: './' }, 'К списку комнат')
    )
  );
}

let reloadTimer;
let reloadSeq = 0;

function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(reload, 250);
}

async function reload() {
  const seq = ++reloadSeq;
  try {
    const { cards, items } = await getRoomContent(roomId);
    if (seq !== reloadSeq) return; // пришёл более свежий запрос
    state.cards = cards;
    state.items = items;
    if (state.editing && !items.some((i) => i.id === state.editing.id)) state.editing = null;
    render();
  } catch (error) {
    showError(error, 'Не удалось обновить данные');
  }
}

// Отрисовка

const byDate = (field) => (a, b) => new Date(a[field]) - new Date(b[field]);

function sortedCards() {
  const cards = [...state.cards].sort(byDate('created_at'));
  const index = cards.findIndex((c) => c.id === state.primaryId);
  if (index > 0) cards.unshift(...cards.splice(index, 1));
  return cards;
}

function render() {
  const focus = captureFocus();
  const cards = sortedCards();
  els.cards.replaceChildren(...cards.map(renderCard));
  els.empty.hidden = cards.length > 0;
  restoreFocus(focus);
}

// Перерисовка заменяет DOM, поэтому сохраняем и возвращаем фокус по data-focus-key.
function captureFocus() {
  const el = document.activeElement;
  if (!el?.dataset?.focusKey) return null;
  return { key: el.dataset.focusKey, start: el.selectionStart, end: el.selectionEnd };
}

function restoreFocus(focus) {
  if (!focus) return;
  const el = els.cards.querySelector(`[data-focus-key="${focus.key}"]`);
  if (!el) return;
  el.focus({ preventScroll: true });
  if (focus.start != null && el.setSelectionRange) el.setSelectionRange(focus.start, focus.end);
}

function renderCard(card) {
  const items = state.items.filter((i) => i.card_id === card.id);
  const active = items.filter((i) => !i.completed_at).sort(byDate('created_at'));
  const done = items.filter((i) => i.completed_at).sort(byDate('completed_at'));
  const isPrimary = card.id === state.primaryId;

  const input = h('input', {
    class: 'input',
    type: 'text',
    placeholder: 'Новый пункт',
    maxlength: 500,
    autocomplete: 'off',
    'aria-label': `Новый пункт в «${card.title}»`,
    value: state.drafts.get(card.id) ?? '',
    dataset: { focusKey: `add-${card.id}` },
    onInput: (event) => state.drafts.set(card.id, event.target.value),
  });

  return h(
    'article',
    { class: `card${isPrimary ? ' is-primary' : ''}` },
    h(
      'header',
      { class: 'card-head' },
      h(
        'div',
        { class: 'card-heading' },
        isPrimary && h('span', { class: 'badge' }, 'Основная'),
        h('h2', { class: 'card-title' }, card.title)
      ),
      h('span', { class: 'card-count', title: 'Завершено / всего' }, `${done.length}/${items.length}`),
      h(
        'div',
        { class: 'card-actions' },
        iconButton(
          'star',
          isPrimary ? 'Убрать из основных' : 'Сделать основной на этом устройстве',
          () => togglePrimary(card),
          isPrimary ? 'is-active' : ''
        ),
        iconButton('edit', 'Переименовать карточку', () => renameCard(card)),
        iconButton('trash', 'Удалить карточку', () => removeCard(card), 'danger')
      )
    ),
    items.length > 0
      ? h('ul', { class: 'items' }, [...active, ...done].map(renderItem))
      : h('p', { class: 'card-empty' }, 'Пунктов пока нет'),
    h(
      'form',
      {
        class: 'add-item',
        onSubmit: (event) => {
          event.preventDefault();
          addItem(card, input);
        },
      },
      input,
      h('button', {
        type: 'submit',
        class: 'icon-btn btn-add',
        title: 'Добавить пункт',
        'aria-label': 'Добавить пункт',
        html: icons.plus,
      })
    )
  );
}

function renderItem(item) {
  if (state.editing?.id === item.id) return renderEditingItem(item);

  const done = Boolean(item.completed_at);
  return h(
    'li',
    { class: `item${done ? ' is-done' : ''}` },
    h(
      'label',
      { class: 'check' },
      h('input', {
        type: 'checkbox',
        checked: done,
        'aria-label': done ? 'Сделать активной' : 'Завершить',
        dataset: { focusKey: `check-${item.id}` },
        onChange: (event) => toggleItem(item, event.target.checked),
      })
    ),
    h(
      'div',
      { class: 'item-body', onDblclick: () => startEdit(item) },
      h('span', { class: 'item-text' }, item.text),
      done && h('time', { class: 'item-date', datetime: item.completed_at }, `Завершено ${formatDate(item.completed_at)}`)
    ),
    h(
      'div',
      { class: 'item-actions' },
      iconButton('edit', 'Редактировать', () => startEdit(item)),
      iconButton('trash', 'Удалить', () => removeItem(item), 'danger')
    )
  );
}

function renderEditingItem(item) {
  const input = h('input', {
    class: 'input input-sm',
    type: 'text',
    maxlength: 500,
    'aria-label': 'Текст пункта',
    value: state.editing.text,
    dataset: { focusKey: `edit-${item.id}` },
    onInput: (event) => (state.editing.text = event.target.value),
    onKeydown: (event) => {
      if (event.key === 'Escape') cancelEdit();
    },
  });
  return h(
    'li',
    { class: 'item is-editing' },
    h(
      'form',
      {
        class: 'edit-form',
        onSubmit: (event) => {
          event.preventDefault();
          saveEdit(item.id);
        },
      },
      input,
      h('button', { type: 'submit', class: 'icon-btn', title: 'Сохранить', 'aria-label': 'Сохранить', html: icons.check }),
      iconButton('close', 'Отмена', cancelEdit)
    )
  );
}

// Действия

const findItem = (id) => state.items.find((i) => i.id === id);

els.cardForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = els.cardInput.value.trim();
  if (!title) return els.cardInput.focus();

  const button = els.cardForm.querySelector('button');
  button.disabled = true;
  try {
    const card = await createCard(roomId, title);
    if (!state.cards.some((c) => c.id === card.id)) state.cards.push(card);
    els.cardInput.value = '';
    render();
    els.cards.querySelector(`[data-focus-key="add-${card.id}"]`)?.focus();
  } catch (error) {
    showError(error, 'Не удалось создать карточку');
  } finally {
    button.disabled = false;
  }
});

els.copyLink.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    toast('Ссылка на комнату скопирована');
  } catch {
    await promptDialog('Ссылка на комнату', location.href, { okText: 'Готово', maxlength: 2000 });
  }
});

function togglePrimary(card) {
  state.primaryId = state.primaryId === card.id ? null : card.id;
  setPrimaryCard(roomId, state.primaryId);
  render();
  if (state.primaryId) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast(`«${card.title}» — основная карточка на этом устройстве`);
  }
}

async function renameCard(card) {
  const title = await promptDialog('Название карточки', card.title);
  if (!title || title === card.title) return;
  card.title = title;
  render();
  try {
    await updateCard(card.id, { title });
  } catch (error) {
    showError(error, 'Не удалось переименовать карточку');
    reload();
  }
}

async function removeCard(card) {
  const ok = await confirmDialog(`Удалить карточку «${card.title}» вместе со всеми пунктами?`);
  if (!ok) return;
  state.cards = state.cards.filter((c) => c.id !== card.id);
  state.items = state.items.filter((i) => i.card_id !== card.id);
  if (state.primaryId === card.id) {
    state.primaryId = null;
    setPrimaryCard(roomId, null);
  }
  render();
  try {
    await deleteCard(card.id);
  } catch (error) {
    showError(error, 'Не удалось удалить карточку');
    reload();
  }
}

async function addItem(card, input) {
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  state.drafts.delete(card.id);
  try {
    const item = await createItem(card.id, text);
    if (!findItem(item.id)) state.items.push(item);
    render();
  } catch (error) {
    state.drafts.set(card.id, text);
    render();
    showError(error, 'Не удалось добавить пункт');
  }
}

async function toggleItem(item, done) {
  const completed_at = done ? new Date().toISOString() : null;
  const local = findItem(item.id);
  if (local) local.completed_at = completed_at;
  render();
  try {
    await updateItem(item.id, { completed_at });
  } catch (error) {
    showError(error, 'Не удалось изменить статус');
    reload();
  }
}

function startEdit(item) {
  state.editing = { id: item.id, text: item.text };
  render();
  const input = els.cards.querySelector(`[data-focus-key="edit-${item.id}"]`);
  input?.focus();
  input?.select();
}

function cancelEdit() {
  const id = state.editing?.id;
  state.editing = null;
  render();
  els.cards.querySelector(`[data-focus-key="check-${id}"]`)?.focus();
}

async function saveEdit(id) {
  const text = state.editing.text.trim();
  if (!text) return toast('Текст пункта не может быть пустым', 'error');
  const local = findItem(id);
  state.editing = null;
  if (!local || local.text === text) return render();
  local.text = text;
  render();
  try {
    await updateItem(id, { text });
  } catch (error) {
    showError(error, 'Не удалось сохранить пункт');
    reload();
  }
}

async function removeItem(item) {
  const ok = await confirmDialog(`Удалить пункт «${item.text}»?`);
  if (!ok) return;
  state.items = state.items.filter((i) => i.id !== item.id);
  render();
  try {
    await deleteItem(item.id);
  } catch (error) {
    showError(error, 'Не удалось удалить пункт');
    reload();
  }
}
