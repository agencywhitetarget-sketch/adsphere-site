const $ = q => document.querySelector(q);
const $$ = q => Array.from(document.querySelectorAll(q));

/* --------- STATE --------- */
const store = {
  get(){
    try { return JSON.parse(localStorage.getItem('noirchat')) || {chats:[],active:null,tgUser:null}; }
    catch { return {chats:[],active:null,tgUser:null}; }
  },
  set(s){ localStorage.setItem('noirchat', JSON.stringify(s)); }
};
let state = store.get();

const API_BASE = "http://localhost:8787"; // ← твій бекенд з /auth/telegram та /me

/* --------- DEMO SEED --------- */
if (state.chats.length === 0) {
  state.chats = [
    { id: uid(), title: "Design team", handle: "@yourchannel", last: "Почнемо з редизайну", messages:[
      m(false,"Почнемо з редизайну"), m(true,"Ок, беру на себе UI")
    ]},
    { id: uid(), title: "NoirChat Bot", handle: "@noirchat1bot", last: "Готово до інтеграції", messages:[
      m(false,"Готово до інтеграції"), m(true,"Тестую логін")
    ]},
  ];
  state.active = state.chats[0].id;
  store.set(state);
}

/* --------- HELPERS --------- */
function uid(){ return Math.random().toString(36).slice(2,10); }
function iso(){ return new Date().toISOString(); }
function m(me,text){ return { id:uid(), me, text, ts: iso() }; }
function active(){ return state.chats.find(c=>c.id===state.active) || null; }
function escapeHTML(s){ return s.replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }

/* --------- RENDER: CHAT LIST --------- */
function renderList(filter=""){
  const wrap = $("#chatList");
  wrap.innerHTML = "";
  state.chats
    .filter(c => c.title.toLowerCase().includes(filter.toLowerCase()))
    .forEach(c=>{
      const el = document.createElement('div');
      el.className = "chat-item" + (c.id===state.active ? " active":"");
      const last = c.messages[c.messages.length-1];
      el.innerHTML = `
        <div class="ava">${c.title.slice(0,1).toUpperCase()}</div>
        <div>
          <div class="c-title">${escapeHTML(c.title)}</div>
          <div class="c-last">${last ? (last.me?"Ти: ":"") + escapeHTML(last.text) : "Порожньо"}</div>
        </div>
        <div class="badge">demo</div>
      `;
      el.addEventListener('click',()=>{ state.active=c.id; store.set(state); renderMain(); renderList($("#search").value); });
      wrap.appendChild(el);
    });
}

/* --------- RENDER: MAIN DIALOG --------- */
function renderMain(){
  const chat = active();
  const msgWrap = $("#messages");
  if(!chat){
    $("#activeTitle").textContent = "No chat selected";
    $("#activeMeta").textContent = "";
    msgWrap.innerHTML = `<div class="placeholder">Обери чат ліворуч або створи новий.</div>`;
    $("#openInTG").disabled = true;
    return;
  }
  $("#activeTitle").textContent = chat.title;
  $("#activeMeta").textContent = chat.handle || "";
  $("#openInTG").disabled = !chat.handle;

  msgWrap.innerHTML = "";
  chat.messages.forEach(ms=>{
    const el = document.createElement('div');
    el.className = "msg" + (ms.me?" me":"");
    el.innerHTML = `<div>${escapeHTML(ms.text)}</div><div class="meta-s">${new Date(ms.ts).toLocaleString()}</div>`;
    msgWrap.appendChild(el);
  });
  msgWrap.scrollTop = msgWrap.scrollHeight;
}

/* --------- SEND --------- */
function send(){
  const chat = active(); if(!chat) return;
  const input = $("#msgInput"); const text = input.value.trim(); if(!text) return;
  chat.messages.push(m(true,text));
  setTimeout(()=>{ chat.messages.push(m(false,"🤖 (демо) Відправлено. Відкрий цей діалог у Telegram для реальних повідомлень.")); store.set(state); renderMain(); }, 250);
  input.value = ""; store.set(state); renderMain();
}

/* --------- TELEGRAM LOGIN (SSO) --------- */
window.noirOnTelegramAuth = async function(user){
  try{
    const r = await fetch(`${API_BASE}/auth/telegram`, {
      method:"POST", headers:{ "Content-Type":"application/json" },
      credentials:"include", body: JSON.stringify(user)
    });
    const j = await r.json(); if(!j.ok) throw new Error(j.error||"Auth failed");
    state.tgUser = j.session; store.set(state);
    renderUser(); closeModal();
  }catch(e){ alert("Auth error: "+e.message); }
};

async function checkMe(){
  try{
    const r = await fetch(`${API_BASE}/me`, { credentials:"include" });
    const j = await r.json(); if(j.ok){ state.tgUser=j.session; store.set(state); }
  }catch{}
  renderUser();
}

function renderUser(){
  const mini = $("#userMini");
  const box = $("#tgUserBox");
  if(!state.tgUser){
    mini.classList.add("hidden");
    box?.classList.add("hidden");
    return;
  }
  const u = state.tgUser;
  mini.classList.remove("hidden");
  mini.textContent = `${u.first_name || ""} ${u.last_name || ""}${u.username ? " (@"+u.username+")":""}`;
  if(box){
    box.classList.remove("hidden");
    box.innerHTML = `<div class="s">Увійшов: <strong>${u.first_name||""} ${u.last_name||""}</strong> ${u.username? "(@"+u.username+")":""}</div>
                     <div class="s muted">id: ${u.id}</div>`;
  }
}

/* --------- MODAL --------- */
function openModal(){ $("#loginModal").classList.remove("hidden"); }
function closeModal(){ $("#loginModal").classList.add("hidden"); }

/* --------- EVENTS --------- */
$("#sendBtn").addEventListener('click', send);
$("#msgInput").addEventListener('keydown', e=>{ if(e.key==="Enter") send(); });
$("#newChat").addEventListener('click', ()=>{
  const title = prompt("Назва чату:", "New chat"); if(!title) return;
  const handle = prompt("Telegram @username (необов’язково):", "");
  const c = { id:uid(), title, handle: handle||"", messages:[] };
  state.chats.unshift(c); state.active = c.id; store.set(state);
  renderList($("#search").value); renderMain();
});
$("#openInTG").addEventListener('click', ()=>{
  const chat = active(); if(!chat || !chat.handle) return;
  const u = chat.handle.startsWith("@") ? chat.handle.slice(1) : chat.handle;
  window.open(`https://web.telegram.org/k/#@${u}`, "_blank");
});
$("#search").addEventListener('input', e => renderList(e.target.value));

$("#loginBtn").addEventListener('click', openModal);
$("#closeModal").addEventListener('click', closeModal);

/* --------- INIT --------- */
checkMe();
renderList();
renderMain();
