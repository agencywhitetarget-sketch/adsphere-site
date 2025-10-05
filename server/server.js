import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

/* ---------- CONFIG ---------- */
const ALLOWED_ORIGINS = (process.env.ALLOW_ORIGINS || [
  "http://localhost:8787",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "https://whitetargetagency.site"
]).toString().split(",");

const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || "localhost";        // прод: ".whitetargetagency.site"
const COOKIE_SECURE = process.env.COOKIE_SECURE === "1";               // прод: 1 (HTTPS)
const SAME_SITE = COOKIE_SECURE ? "None" : "Lax";                      // прод: None
const PORT = process.env.PORT || 8787;

/* ---------- JSON "DB" ---------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.join(__dirname, "data.json");

function ensureDB() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.writeFileSync(DATA_PATH, JSON.stringify({ users: [], chats: [], messages: [] }, null, 2));
  }
}
function readDB() { ensureDB(); return JSON.parse(fs.readFileSync(DATA_PATH, "utf8")); }
function writeDB(db) { fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2)); }

/* ---------- App / IO ---------- */
const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, { cors: { origin: (o, cb)=>cb(null,true), credentials:true }});

/* ---------- Middlewares ---------- */
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // file:// або curl
    const ok = ALLOWED_ORIGINS.includes(origin);
    cb(ok ? null : new Error("CORS blocked"), ok);
  },
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

/* ---------- Health ---------- */
app.get("/health", (_, res) => res.json({ ok: true, ts: Date.now() }));

/* ---------- Sessions ---------- */
const sessions = new Map(); // token -> userId
function setAuthCookie(res, token) {
  res.cookie("noir_token", token, {
    httpOnly: true,
    sameSite: SAME_SITE,     // 'None' на проді, 'Lax' локально
    secure: COOKIE_SECURE,   // true на HTTPS
    domain: COOKIE_DOMAIN,   // прод: ".whitetargetagency.site"
    maxAge: 1000*60*60*24*30
  });
}
function getUserIdByToken(token){
  return token && sessions.get(token) || null;
}

/* ---------- Auth middleware: кукі АБО Authorization: Bearer ---------- */
function auth(req, res, next) {
  let token = req.cookies.noir_token || null;
  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.slice(7);
  }
  const uid = getUserIdByToken(token);
  if (!uid) return res.status(401).json({ ok:false, error:"unauthorized" });
  req.userId = uid;
  req.token = token;
  next();
}

/* ---------- Auth endpoints ---------- */
app.post("/api/register", async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) return res.status(400).json({ ok:false, error:"email_password_required" });

  const db = readDB();
  if (db.users.some(u => u.email.toLowerCase() === String(email).toLowerCase())) {
    return res.status(409).json({ ok:false, error:"email_taken" });
  }
  const user = {
    id: uuidv4(),
    email,
    name: name || email.split("@")[0],
    password_hash: await bcrypt.hash(password, 10),
    created_at: Date.now()
  };
  db.users.push(user);
  writeDB(db);

  const token = uuidv4();
  sessions.set(token, user.id);
  setAuthCookie(res, token);
  res.json({ ok:true, token, user:{ id:user.id, email:user.email, name:user.name } });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};
  const db = readDB();
  const user = db.users.find(u => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ ok:false, error:"bad_credentials" });
  }
  const token = uuidv4();
  sessions.set(token, user.id);
  setAuthCookie(res, token);
  res.json({ ok:true, token, user:{ id:user.id, email:user.email, name:user.name } });
});

app.get("/api/token", auth, (req, res) => {
  res.json({ ok:true, token: req.token });
});

app.post("/api/logout", auth, (req, res) => {
  for (const [t, uid] of sessions.entries()) if (uid === req.userId) sessions.delete(t);
  res.clearCookie("noir_token", { domain: COOKIE_DOMAIN, secure: COOKIE_SECURE, sameSite: SAME_SITE });
  res.json({ ok:true });
});

app.get("/api/me", auth, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.userId);
  res.json({ ok:true, user:{ id:user.id, email:user.email, name:user.name } });
});

/* ---------- Chats / Messages ---------- */
app.get("/api/chats", auth, (req, res) => {
  const db = readDB();
  const chats = db.chats
    .filter(c => c.participants.includes(req.userId))
    .map(c => {
      const last = db.messages.filter(m => m.chatId === c.id).slice(-1)[0] || null;
      return {
        id: c.id,
        title: c.title,
        participants: c.participants,
        updated_at: c.updated_at,
        last: last ? { text:last.text, at:last.created_at, userId:last.userId } : null
      };
    })
    .sort((a,b)=> (b.updated_at||0) - (a.updated_at||0));
  res.json({ ok:true, chats });
});

app.post("/api/chats", auth, (req, res) => {
  const { title, inviteeEmails } = req.body || {};
  const db = readDB();
  const participants = new Set([req.userId]);
  if (Array.isArray(inviteeEmails)) {
    inviteeEmails.forEach(em => {
      const u = db.users.find(x => x.email.toLowerCase() === String(em).toLowerCase());
      if (u) participants.add(u.id);
    });
  }
  const chat = { id: uuidv4(), title: title || "New chat", participants: [...participants], created_at: Date.now(), updated_at: Date.now() };
  db.chats.push(chat);
  writeDB(db);
  res.json({ ok:true, chat });
});

app.get("/api/messages/:chatId", auth, (req, res) => {
  const { chatId } = req.params;
  const db = readDB();
  const chat = db.chats.find(c => c.id === chatId);
  if (!chat || !chat.participants.includes(req.userId)) return res.status(404).json({ ok:false, error:"not_found" });
  const messages = db.messages.filter(m => m.chatId === chatId).slice(-500);
  res.json({ ok:true, messages });
});

app.post("/api/messages/:chatId", auth, (req, res) => {
  const { chatId } = req.params;
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ ok:false, error:"empty" });

  const db = readDB();
  const chat = db.chats.find(c => c.id === chatId);
  if (!chat || !chat.participants.includes(req.userId)) return res.status(404).json({ ok:false, error:"not_found" });

  const msg = { id: uuidv4(), chatId, userId: req.userId, text: text.trim(), created_at: Date.now() };
  db.messages.push(msg);
  chat.updated_at = Date.now();
  writeDB(db);

  chat.participants.forEach(uid => io.to(`user:${uid}`).emit("message", { chatId, message: msg }));
  res.json({ ok:true, message: msg });
});

/* ---------- Sockets ---------- */
io.on("connection", (socket) => {
  socket.on("auth", (token) => {
    const uid = getUserIdByToken(token);
    if (uid) socket.join(`user:${uid}`);
  });
});

/* ---------- Start ---------- */
httpServer.listen(PORT, () => {
  console.log(`NoirChat server running on http://localhost:${PORT}`);
  console.log(`Origins: ${ALLOWED_ORIGINS.join(", ")}`);
  console.log(`Cookie domain=${COOKIE_DOMAIN} secure=${COOKIE_SECURE} sameSite=${SAME_SITE}`);
});
