// Centered, accessible in-app dialog modals (replaces native browser prompt/confirm/alert so site URL never leaks).

let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  stylesInjected = true;
  const st = document.createElement('style');
  st.id = 'sm-dialog-styles';
  st.textContent = `
.sm-dlg-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100500;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(15, 23, 42, 0.56);
  backdrop-filter: blur(4px);
  font-family: 'Segoe UI', 'Noto Sans', system-ui, -apple-system, sans-serif;
}
.sm-dlg-card {
  width: min(440px, calc(100vw - 32px));
  background: #ffffff;
  color: #0f172a;
  border-radius: 16px;
  border: 1px solid #cbd5e1;
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.34);
  padding: 20px 22px 18px;
  display: grid;
  gap: 12px;
  animation: smDlgIn 0.14s ease-out;
}
@keyframes smDlgIn {
  from { opacity: 0; transform: translateY(6px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.sm-dlg-card.night {
  background: #1e293b;
  color: #f1f5f9;
  border-color: #334155;
}
.sm-dlg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.sm-dlg-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.3;
  color: inherit;
}
.sm-dlg-x {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: #64748b;
  font-size: 1.15rem;
  line-height: 1;
  cursor: pointer;
  display: inline-grid;
  place-items: center;
}
.sm-dlg-x:hover { background: rgba(100, 116, 139, 0.14); color: inherit; }
.sm-dlg-msg {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.5;
  color: #334155;
  white-space: pre-line;
}
.sm-dlg-card.night .sm-dlg-msg { color: #cbd5e1; }
.sm-dlg-field {
  display: grid;
  gap: 6px;
}
.sm-dlg-field label {
  font-size: 0.82rem;
  font-weight: 600;
  color: #475569;
}
.sm-dlg-card.night .sm-dlg-field label { color: #94a3b8; }
.sm-dlg-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 0.94rem;
  color: #0f172a;
  background: #f8fafc;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.sm-dlg-input:focus {
  border-color: #2563eb;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.18);
}
.sm-dlg-card.night .sm-dlg-input {
  background: #0f172a;
  color: #f8fafc;
  border-color: #475569;
}
.sm-dlg-err {
  margin: 0;
  font-size: 0.8rem;
  color: #dc2626;
  min-height: 1em;
}
.sm-dlg-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.sm-dlg-btn {
  min-height: 36px;
  padding: 7px 16px;
  border-radius: 10px;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #0f172a;
  transition: background-color 0.12s, border-color 0.12s;
}
.sm-dlg-btn:hover { background: #f1f5f9; }
.sm-dlg-card.night .sm-dlg-btn {
  background: #334155;
  border-color: #475569;
  color: #f8fafc;
}
.sm-dlg-card.night .sm-dlg-btn:hover { background: #475569; }
.sm-dlg-btn.primary {
  background: #1d4ed8;
  border-color: #1d4ed8;
  color: #ffffff;
}
.sm-dlg-btn.primary:hover { background: #1e40af; }
.sm-dlg-btn.danger {
  background: #dc2626;
  border-color: #dc2626;
  color: #ffffff;
}
.sm-dlg-btn.danger:hover { background: #b91c1c; }
@media print {
  .sm-dlg-backdrop { display: none !important; }
}
`;
  document.head.appendChild(st);
}

function isNightTheme(explicitNight) {
  if (typeof explicitNight === 'boolean') return explicitNight;
  if (typeof document === 'undefined') return false;
  if (document.querySelector('.sm-we-backdrop.night')) return true;
  return document.documentElement.dataset.theme === 'dark';
}

function buildDialog({ title, message, night }) {
  ensureStyles();
  const prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const backdrop = document.createElement('div');
  backdrop.className = 'sm-dlg-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');

  const card = document.createElement('div');
  card.className = `sm-dlg-card${isNightTheme(night) ? ' night' : ''}`;

  const head = document.createElement('div');
  head.className = 'sm-dlg-head';
  const h = document.createElement('h3');
  h.className = 'sm-dlg-title';
  h.textContent = title || 'SmartMaktab';
  const closeX = document.createElement('button');
  closeX.type = 'button';
  closeX.className = 'sm-dlg-x';
  closeX.setAttribute('aria-label', 'Закрыть');
  closeX.textContent = '×';
  head.append(h, closeX);
  card.appendChild(head);

  if (message) {
    const p = document.createElement('p');
    p.className = 'sm-dlg-msg';
    p.textContent = String(message);
    card.appendChild(p);
  }

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);

  function cleanup() {
    backdrop.remove();
    if (prevFocus && typeof prevFocus.focus === 'function') {
      try { prevFocus.focus(); } catch {}
    }
  }

  return { backdrop, card, closeX, cleanup };
}

export function smAlert({ title = 'SmartMaktab', message = '', okLabel = 'OK', night } = {}) {
  return new Promise((resolve) => {
    const { backdrop, card, closeX, cleanup } = buildDialog({ title, message, night });
    const actions = document.createElement('div');
    actions.className = 'sm-dlg-actions';
    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'sm-dlg-btn primary';
    okBtn.textContent = okLabel;
    actions.appendChild(okBtn);
    card.appendChild(actions);

    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        done();
      }
    };
    const done = () => {
      document.removeEventListener('keydown', onKey, true);
      cleanup();
      resolve();
    };

    document.addEventListener('keydown', onKey, true);
    okBtn.addEventListener('click', done);
    closeX.addEventListener('click', done);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) done(); });
    requestAnimationFrame(() => okBtn.focus());
  });
}

export function smConfirm({
  title = 'Тасдиқ',
  message = '',
  confirmLabel = 'Тасдиқ',
  cancelLabel = 'Бекор',
  danger = false,
  night,
} = {}) {
  return new Promise((resolve) => {
    const { backdrop, card, closeX, cleanup } = buildDialog({ title, message, night });
    const actions = document.createElement('div');
    actions.className = 'sm-dlg-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'sm-dlg-btn';
    cancelBtn.textContent = cancelLabel;

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = `sm-dlg-btn ${danger ? 'danger' : 'primary'}`;
    okBtn.textContent = confirmLabel;

    actions.append(cancelBtn, okBtn);
    card.appendChild(actions);

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        done(false);
      }
    };
    const done = (val) => {
      document.removeEventListener('keydown', onKey, true);
      cleanup();
      resolve(Boolean(val));
    };

    document.addEventListener('keydown', onKey, true);
    cancelBtn.addEventListener('click', () => done(false));
    closeX.addEventListener('click', () => done(false));
    okBtn.addEventListener('click', () => done(true));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) done(false); });
    requestAnimationFrame(() => (danger ? cancelBtn : okBtn).focus());
  });
}

export function smPrompt({
  title = 'Ворид кардан',
  message = '',
  label = '',
  defaultValue = '',
  placeholder = '',
  confirmLabel = 'Сабт',
  cancelLabel = 'Бекор',
  required = true,
  requiredError = 'Майдонро пур кунед.',
  maxLength = 120,
  night,
} = {}) {
  return new Promise((resolve) => {
    const { backdrop, card, closeX, cleanup } = buildDialog({ title, message, night });
    const field = document.createElement('div');
    field.className = 'sm-dlg-field';
    if (label) {
      const lbl = document.createElement('label');
      lbl.textContent = label;
      field.appendChild(lbl);
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'sm-dlg-input';
    input.value = String(defaultValue || '');
    input.placeholder = String(placeholder || '');
    if (maxLength > 0) input.maxLength = maxLength;
    field.appendChild(input);

    const err = document.createElement('p');
    err.className = 'sm-dlg-err';
    card.append(field, err);

    const actions = document.createElement('div');
    actions.className = 'sm-dlg-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'sm-dlg-btn';
    cancelBtn.textContent = cancelLabel;
    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'sm-dlg-btn primary';
    okBtn.textContent = confirmLabel;
    actions.append(cancelBtn, okBtn);
    card.appendChild(actions);

    const submit = () => {
      const val = input.value.trim();
      if (required && !val) {
        err.textContent = requiredError;
        input.focus();
        return;
      }
      done(val);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        done(null);
      }
    };
    const done = (val) => {
      document.removeEventListener('keydown', onKey, true);
      cleanup();
      resolve(val);
    };

    document.addEventListener('keydown', onKey, true);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });
    input.addEventListener('input', () => { if (err.textContent) err.textContent = ''; });
    cancelBtn.addEventListener('click', () => done(null));
    closeX.addEventListener('click', () => done(null));
    okBtn.addEventListener('click', submit);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) done(null); });
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  });
}
