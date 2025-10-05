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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.join(__dirname, "data.json");

// ---------- Simple JSON "DB" ----------
function readDB() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.writeFileSync(DATA_PATH, JSON.stringify({ users: [], chats: [], messages: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
}
function writeDB(db) { fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2)); }

// ---------- App / IO ----------
const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: true, credentials: true }
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ---------- In-memory sessions ----------
const sessions = new Map(); // token -> userId

function authMiddleware(req, res, next) {
  const token = req.cookies.noir_token;
  if (!token || !sessions.has(token)) return res.status(401).json({ ok: false, error: "unauthorized" });
  req.userId = sessions.get(token);
  next();
}

// ---------- Auth endpoints ----------
app.post("/api/register", async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) return res.status(400).json({ ok: false, error: "email_password_required" });

  const db = readDB();
  if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ ok: false, error: "email_taken" });
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
  res.cookie("noir_token", token, { httpOnly: true, sameSite: "Lax", maxAge: 1000 * 60 * 60 * 24 * 30 });
  res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};
  const db = readDB();
  const user = db.users.find(u => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ ok: false, error: "bad_credentials" });
  }
  const token = uuidv4();
  sessions.set(token, user.id);
  res.cookie("noir_token", token, { httpOnly: true, sameSite: "Lax", maxAge: 1000 * 60 * 60 * 24 * 30 });
  res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
});

app.post("/api/logout", authMiddleware, (req, res) => {
  for (const [t, uid] of sessions.entries()) if (uid === req.userId) sessions.delete(t);
  res.clearCookie("noir_token");
  res.json({ ok: true });
});

app.get("/api/me", authMiddleware, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.userId);
  res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
});

// ---------- Chats / Messages ----------
app.get("/api/chats", authMiddleware, (req, res) => {
  const db = readDB();
  const chats = db.chats
    .filter(c => c.participants.i
