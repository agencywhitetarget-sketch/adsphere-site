const API_BASE = "http://localhost:8787";

window.noirOnTelegramAuth = async function(user) {
  try {
    // user містить поля + hash; відправляємо на бекенд для верифікації
    const resp = await fetch(`${API_BASE}/auth/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(user)
    });
    const data = await resp.json();
    if (!data.ok) throw new Error("Auth failed");
    state.tgUser = data.session; // тепер перевірений
    store.set(state);
    renderTGUser();
  } catch (e) {
    alert("Auth error");
  }
};

// при завантаженні — перевіряємо поточну сесію
(async ()=>{
  try {
    const r = await fetch(`${API_BASE}/me`, { credentials: "include" });
    const j = await r.json();
    if (j.ok) { state.tgUser = j.session; store.set(state); }
    renderTGUser();
  } catch {}
})();
