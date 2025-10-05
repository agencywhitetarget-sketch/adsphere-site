const $ = q => document.querySelector(q);
const $$ = q => Array.from(document.querySelectorAll(q));
const API = "http://localhost:8787";

// якщо деплоїш сервер, заміни на його HTTPS URL
let state = {
  me: null,
  token: null, // з cookie, але тримаємо копію для socket.auth
  chats: [],
  activeId: null,
  messages: {}
};

function fmtTime(ts){ const d = new Date(ts); return d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); }
function esc(s){ return String(s).replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

// ---------- Auth modal ----------
const authModal = $("#authModal");
const loginBtn = $("#loginBtn");
const logoutBtn = $("#logoutBtn");
const closeAuth = $("#closeAuth");
const tabLogin = $("#tabLogin");
const tabRegister = $("#tabRegister");
const authTitle = $("#authTitle");
const nameWrap = $("#nameWrap");
const authEmail = $("#authEmail");
const authPassword = $("#authPassword");
const authName = $("#authName");
const authSubmit = $("#authSubmit");
const authErr = $("#authErr");

let mode = "login";
function openAuth(){ authModal.classList.remove("hidden"); }
function closeAuthModal(){ authModal.classList.add("hidden"); authErr.textContent=""; }
tabLogin.onclick = ()=>{ mode="login"; tabLogin.classList.add("active"); tabRegister.classList.remove("active"); authTitle.textContent="Вхід"; nameWrap.classList.add("hidden"); };
tabRegister.onclick = ()=>{ mode="register"; tabRegister.classList.add("active"); tabLogin.classList.remove("active"); authTitle.textContent="Реєстрація"; nameWrap.classList.remove("hidden"); };

loginBtn.onclick = openAuth;
closeAuth.onclick = closeAuthModal;

// ---------- API helpers ----------
async function api(path, options={}){
  const r = await fetch(API+path, { credentials:"include", ...options });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "api_error");
  return j;
}

authSubmit.onclick = async ()=>{
  authErr.textContent = "";
  try{
    if (mode === "login") {
      await api("/api/login", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ email:authEmail.value, password:authPassword.value }) });
    } else {
      await api("/api/register", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ email:authEmail.value, password:authPassword.value, name:authName.value }) });
    }
    await fetchMe();
    closeAuthModal();
  }catch(e){ authErr.textContent = "Помилка: "+e.message; }
};

logoutBtn.onclick = async ()=>{ try{ await api("/api/logout",{method:"POST"}); }catch{} state.me=null; renderUser(); renderChats(); renderActive(); };

// ---------- Me / Chats ----------
async function fetchMe(){
  try{
    const j = await api("/api/me");
    state.me = j.user;
    renderUser();
    await fetchChats();
    await initSocket();
  }catch{
    state.me = null;
    renderUser();
  }
}

async function fetchChats(){
  if (!state.me) return;
  const j = await api("/api/chats");
  state.chats = j.chats;
  if (!state.activeId && state.chats[0]) state.activeId = state.chats[0].id;
  renderChats();
  renderActive();
}

async function fetchMessages(chatId){
  const j = await api(`/api/messages/${chatId}`);
  state.messages[chatId] = j.messages;
  renderActive();
}

// ---------- Socket.io ----------
let socket = null;
async function initSocket(){
  // витягнемо поточний cookie токен, щоб авторизувати сокет
  const token = document.cookie.split("; ").find(x=>x.startsWith("noir_token="))?.split("=")[1] || null;
  state.token = token;
  if (!token) return;

  if (socket) socket.disconnect();
  socket = io(API, { withCredentials:true });
  socket.on("connect", ()=> socket.emit("auth", token));
  socket.on("message", ({ chatId, message })=>{
    if (!state.messages[chatId]) state.messages[chatId]=[];
    state.messages[chatId].push(message);
    const chat = state.chats.find(c=>c.id===chatId);
    if (chat){ chat.last = { text: message.text, at: message.created_at, userId: message.userId }; chat.updated_at = message.created_at; }
    renderChats(); if (state.activeId===chatId) renderActive();
  });
}

// ---------- Render: user / chats / active ----------
function renderUser(){
  const userMini = $("#userMini");
  if (!state.me){
    userMini.classList.add("hidden");
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    $("#msgInput").disabled = true;
    $("#sendBtn").disabled = true;
    return;
  }
  userMini.textContent = `${state.me.name} (${state.me.email})`;
  userMini.classList.remove("hidden");
  loginBtn.classList.add("hidden");
  logoutBtn.classList.remove("hidden");
  $("#msgInput").disabled = false;
  $("#sendBtn").disabled = false;
}

function renderChats(filter=""){
  const list = $("#chatList"); list.innerHTML = "";
  const items = state.chats
    .filter(c => c.title.toLowerCase().includes(filter.toLowerCase()))
    .sort((a,b)=> (b.updated_at||0) - (a.updated_at||0));

  for (const c of items){
    const row = document.createElement("div");
    row.className = "chat-item" + (c.id===state.activeId ? " active": "");
    row.innerHTML = `
      <div class="ava">${esc(c.title.slice(0,1)).toUpperCase()}</div>
      <div>
        <div class="c-title">${esc(c.title)}</div>
        <div class="c-last">${c.last ? esc((c.last.userId===state.me?.id ? "Ти: " : "") + c.last.text) : "Порожньо"}</div>
      </div>
      <div class="time">${c.last ? esc(fmtTime(c.last.at)) : ""}</div>
    `;
    row.onclick = async ()=>{ state.activeId=c.id; renderChats($("#search").value); if (!state.messages[c.id]) await fetchMessages(c.id); renderActive(); };
    list.appendChild(row);
  }
}

function renderActive(){
  const wrap = $("#messages");
  const chat = state.chats.find(c=>c.id===state.activeId);
  if (!chat){ $("#activeTitle").textContent="No chat selected"; $("#activeMeta").textContent=""; wrap.innerHTML=`<div class="placeholder">Обери чат ліворуч або створи нов
