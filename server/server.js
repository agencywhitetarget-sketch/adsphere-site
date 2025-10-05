import crypto from "crypto";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

// ==== SECURITY ====
// На продакшені: збережи токен у змінній середовища TELEGRAM_BOT_TOKEN.
// Тут для зручності поставлено фолбек на твій токен з BotFather.
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8426243389:AAFI11ivhifFkQzffrz3Mk-rHF_hOlFxcaY";
if (!BOT_TOKEN) { console.error("Set TELEGRAM_BOT_TOKEN"); process.exit(1); }

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Перевірка підпису від Telegram Login Widget
function checkTelegramAuth(data) {
  const secret = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const checkString = Object.keys(data)
    .filter(k => k !== "hash")
    .sort()
    .map(k => `${k}=${data[k]}`)
    .join("\n");
  const hash = crypto.createHmac("sha256", secret).update(checkString).digest("hex");
  return hash === String(data.hash || "").toLowerCase();
}

app.post("/auth/telegram", (req, res) => {
  const payload = req.body;
  if (!checkTelegramAuth(payload)) return res.status(401).json({ ok:false, error:"bad_hash" });

  const session = {
    id: payload.id,
    username: payload.username || null,
    first_name: payload.first_name || "",
    last_name: payload.last_name || "",
    photo_url: payload.photo_url || null,
    auth_date: Number(payload.auth_date)
  };
  const sessionStr = Buffer.from(JSON.stringify(session)).toString("base64url");
  res.cookie("noir_session", sessionStr, {
    httpOnly: true,
    sameSite: "Lax",
    maxAge: 1000*60*60*24*30
  });
  res.json({ ok:true, session });
});

app.get("/me", (req, res) => {
  const c = req.cookies.noir_session;
  if (!c) return res.json({ ok:false });
  try {
    const session = JSON.parse(Buffer.from(c, "base64url").toString("utf8"));
    res.json({ ok:true, session });
  } catch {
    res.json({ ok:false });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, ()=> console.log("NoirChat auth http://localhost:"+PORT));
