// Небольшие DOM-хелперы, диалоги, уведомления и тема.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'html') el.innerHTML = value; // только для доверенной разметки (иконки)
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value') el.value = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const svg = (body) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  trash: svg('<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  star: svg('<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  arrow: svg('<path d="M9 18l6-6-6-6"/>'),
};

export function iconButton(icon, label, onClick, extraClass = '') {
  return h('button', {
    type: 'button',
    class: `icon-btn ${extraClass}`.trim(),
    title: label,
    'aria-label': label,
    html: icons[icon],
    onClick,
  });
}

// Тема

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#0f1115' : '#f4f5f7';
}

export function initThemeToggle(button) {
  const update = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    button.innerHTML = dark ? icons.sun : icons.moon;
    const label = dark ? 'Светлая тема' : 'Тёмная тема';
    button.title = label;
    button.setAttribute('aria-label', label);
  };
  applyTheme(document.documentElement.dataset.theme || 'light');
  update();
  button.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    applyTheme(next);
    update();
  });
}

// Уведомления

export function toast(message, type = 'info') {
  let host = document.querySelector('.toasts');
  if (!host) {
    host = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  const el = h('div', { class: `toast toast-${type}` }, message);
  host.append(el);
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 250);
  }, 3000);
}

export function showError(error, prefix = 'Ошибка') {
  console.error(error);
  toast(`${prefix}: ${error?.message ?? error}`, 'error');
}

// Модальные диалоги

function openDialog({ title, message, input, okText = 'OK', cancelText = 'Отмена', danger = false }) {
  return new Promise((resolve) => {
    const field = input
      ? h('input', { class: 'input', type: 'text', value: input.value ?? '', maxlength: input.maxlength ?? 100, required: true })
      : null;
    const form = h(
      'form',
      { method: 'dialog', class: 'dialog-body' },
      title && h('h2', { class: 'dialog-title' }, title),
      message && h('p', { class: 'dialog-message' }, message),
      field,
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost', value: 'cancel', onClick: () => close(null) }, cancelText),
        h('button', { type: 'submit', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, value: 'ok' }, okText)
      )
    );
    const dialog = h('dialog', { class: 'dialog' }, form);

    let done = false;
    function close(result) {
      if (done) return;
      done = true;
      dialog.close();
      dialog.remove();
      resolve(result);
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (field) {
        const value = field.value.trim();
        if (!value) return field.focus();
        close(value);
      } else {
        close(true);
      }
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close(null);
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) close(null); // клик по подложке
    });

    document.body.append(dialog);
    dialog.showModal();
    if (field) {
      field.focus();
      field.select();
    }
  });
}

export async function confirmDialog(message, { title = 'Подтверждение', okText = 'Удалить', danger = true } = {}) {
  return (await openDialog({ title, message, okText, danger })) === true;
}

export function promptDialog(title, value = '', { okText = 'Сохранить', maxlength = 100 } = {}) {
  return openDialog({ title, input: { value, maxlength }, okText });
}

// Даты

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatDate = (iso) => dateFormat.format(new Date(iso));
