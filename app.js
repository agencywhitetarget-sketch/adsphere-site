/* ======= Minimal state ======= */
const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));

const store = {
  get() {
    try { return JSON.parse(localStorage.getItem('noirchat')) || { chats: [], activeId: null, theme: 'dark', tgUser: null }; }
    catch { return { chats: [], activeId: null, theme: 'dark', tgUser: null }; }
  },
  set(data) { localStorage.setItem('noirchat', JSON.stringify(data)); }
};

let state = store.get();

/* ======= Telegram Login callback (client demo) =======
   NOTE: For production, verify the hash server-side.
*/
window.noirOnTelegramAuth = function(user) {
  state.tgUser = user; // not verified
  store.set(state);
  renderTGUser();
};

/* ======= Utilities ======= */
const uuid = () => Math.random().toString(36).slice(2, 10);
const nowISO = () => new Date().toISOString();

function activeChat() {
  return state.chats.find(c => c.id === state.activeId) || null;
}

function setActive(id) {
  state.activeId = id;
  store.set(state);
  renderChats();
  renderConversation();
}

/* ======= Init demo data if empty ======= */
if (state.chats.length === 0) {
  state.chats = [
    { id: uuid(), title: "Welcome", handle: "@YOUR_BOT_NAME", messages: [
      { id: uuid(), me: false, text: "Вітаю у NoirChat. Це демо-інтерфейс поверх Telegram.", ts: nowISO() },
      { id: uuid(), me: true,  text: "Полетіли! Давай підключимо бота та канал.", ts: nowISO() }
    ]},
    { id: uuid(), title: "Community", handle: "@yourchannel", messages: [
      { id: uuid(), me: false, text: "Приєднуйся до каналу — кнопка ліворуч.", ts: nowISO() }
    ]}
  ];
  state.activeId = state.chats[0].id;
  store.set(state);
}

/* ======= Render TG user box ======= */
function renderTGUser() {
  const box = $("#tgUserBox");
  if (!state.tgUser) { box.classList.add('hidden'); box.innerHTML=''; return; }
  const u = state.tgUser;
  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="s">Увійшов: <strong>${u.first_name || ''} ${u.last_name || ''}</strong> ${u.username ? '(@'+u.username+')' : ''}</div>
    <div class="s muted">id: ${u.id}, lang: ${u.language_code || '—'}</div>
  `;
}

/* ======= Render chats list ======= */
function renderChats() {
  const wrap = $("#chatItems");
  wrap.innerHTML = '';
  state.chats.forEach(c => {
    const last = c.messages[c.messages.length-1];
    const el = document.createElement('div');
    el.className = 'chat-item' + (c.id === state.activeId ? ' active':'');
    el.innerHTML = `
      <div class="avatar">${(c.title||'?').slice(0,1).toUpperCase()}</div>
      <div>
        <div class="title">${c.title}</div>
        <div class="meta s">${last ? (last.me ? 'Ти: ' : '') + last.text.slice(0,36) : 'Порожньо'}</div>
      </div>
      <button class="del s">✕</button>
    `;
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('del')) return;
      setActive(c.id);
    });
    el.querySelector('.del').addEventListener('click', (e) => {
      e.stopPropagation();
      state.chats = state.chats.filter(x => x.id !== c.id);
      if (state.activeId === c.id) state.activeId = state.chats[0]?.id || null;
      store.set(state);
      renderChats();
      renderConversation();
    });
    wrap.appendChild(el);
  });
}

/* ======= Render conversation ======= */
function renderConversation() {
  const m = $("#messages");
  const chat = activeChat();
  if (!chat) {
    m.innerHTML = `<div class="placeholder">Обери чат ліворуч або створи новий.</div>`;
    $("#activeChatName").textContent = 'No chat selected';
    $("#activeChatMeta").textContent = '';
    $("#openInTG").disabled = true;
    return;
  }
  $("#activeChatName").textContent = chat.title;
  $("#activeChatMeta").textContent = chat.handle || '';
  $("#openInTG").disabled = false;

  m.innerHTML = '';
  chat.messages.forEach(msg => {
    const el = document.createElement('div');
    el.className = 'msg' + (msg.me ? ' me' : '');
    el.innerHTML = `
      <div class="text">${escapeHTML(msg.text)}</div>
      <div class="meta">${new Date(msg.ts).toLocaleString()}</div>
    `;
    m.appendChild(el);
  });
  m.scrollTop = m.scrollHeight;
}

function escapeHTML(s) {
  return s.replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c]));
}

/* ======= Send message (demo) ======= */
function sendMessage() {
  const input = $("#msgInput");
  const text = input.value.trim();
  if (!text) return;
  const chat = activeChat();
  if (!chat) return;
  chat.messages.push({ id: uuid(), me: true, text, ts: nowISO() });
  // demo auto-reply
  setTimeout(() => {
    chat.messages.push({ id: uuid(), me: false, text: "🤖 (демо) Відправлено. Для реального меседжингу відкрий цей чат у Telegram Web.", ts: nowISO() });
    store.set(state); renderConversation();
  }, 300);
  input.value = '';
  store.set(state);
  renderConversation();
}

/* ======= Bridge to Telegram Web ======= */
function openInTelegramWeb(handleOrLink) {
  let url = '';
  if (/^@/.test(handleOrLink)) {
    const clean = handleOrLink.slice(1);
    // K-версія Telegram Web стабільно працює
    url = `https://web.telegram.org/k/#@${clean}`;
  } else if (/^https?:\/\//.test(handleOrLink)) {
    url = handleOrLink;
  } else {
    url = `https://web.telegram.org/k/#@${handleOrLink}`;
  }
  window.open(url, '_blank');
}

/* ======= Events ======= */
$("#sendBtn").addEventListener('click', sendMessage);
$("#msgInput").addEventListener('keydown', (e)=> { if (e.key==='Enter') sendMessage(); });

$("#newChat").addEventListener('click', () => {
  const title = prompt('Назва чату (наприклад: Support / Bot / Channel):', 'New chat');
  if (!title) return;
  const handle = prompt('Telegram @username (необов’язково):', '');
  const chat = { id: uuid(), title, handle: handle || '', messages: [] };
  state.chats.unshift(chat);
  state.activeId = chat.id;
  store.set(state);
  renderChats(); renderConversation();
});

$("#openInTG").addEventListener('click', () => {
  const chat = activeChat(); if (!chat) return;
  if (!chat.handle) {
    alert('У цього чату немає @username. Додай у властивостях (видали й створи заново).');
    return;
  }
  openInTelegramWeb(chat.handle);
});

$("#openCustom").addEventListener('click', () => {
  const u = prompt('Введи Telegram @username без пробілів:', '@durov');
  if (!u) return;
  openInTelegramWeb(u);
});

$$('[data-open-web]').forEach(b=>{
  b.addEventListener('click', ()=> openInTelegramWeb(b.getAttribute('data-open-web')));
});

$("#exportData").addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `noirchat-export-${Date.now()}.json`;
  a.click();
});

$("#clearData").addEventListener('click', () => {
  if (!confirm('Очистити всі локальні дані NoirChat?')) return;
  localStorage.removeItem('noirchat');
  state = store.get();
  renderTGUser(); renderChats(); renderConversation();
});

/* Theme toggle */
$("#themeToggle").addEventListener('click', ()=>{
  // для майбутнього світлої теми; поки лишаємо іконку
  document.body.classList.toggle('alt');
});

/* ======= First render ======= */
renderTGUser();
renderChats();
renderConversation();
