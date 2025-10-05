const API_BASE = "http://localhost:8787"; // або твій https бекенд

window.noirOnTelegramAuth = async function(user) {
  try {
    const resp = await fetch(`${API_BASE}/auth/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(user)
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "Auth failed");
    state.tgUser = data.session; // перевірений користувач
    store.set(state);
    renderTGUser();
  } catch (e) {
    alert("Auth error: " + e.message);
  }
};

// Авто-перевірка сесії при відкритті
(async ()=>{
  try {
    const r = await fetch(`${API_BASE}/me`, { credentials: "include" });
    const j = await r.json();
    if (j.ok) { state.tgUser = j.session; store.set(state); }
    renderTGUser();
  } catch {}
})();

// при завантаженні — перевіряємо поточну сесію
(async ()=>{
  try {
    const r = await fetch(`${API_BASE}/me`, { credentials: "include" });
    const j = await r.json();
    if (j.ok) { state.tgUser = j.session; store.set(state); }
    renderTGUser();
  } catch {}
})();
