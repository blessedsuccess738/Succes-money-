import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { Server } from 'socket.io';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_change_me_in_production';

app.use(express.json());
app.use(cookieParser());

// Database Setup
const db = new Database('database.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user',
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS access_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    is_used BOOLEAN DEFAULT 0,
    used_by INTEGER,
    FOREIGN KEY(used_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset TEXT,
    timeframe TEXT,
    signal TEXT,
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Seed Admin User and Settings
const adminExists = db.prepare('SELECT * FROM users WHERE role = ?').get('admin');
if (!adminExists) {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', hashedPassword, 'admin');
}

const linkExists = db.prepare('SELECT * FROM settings WHERE key = ?').get('public_link');
if (!linkExists) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('public_link', 'https://signal.com');
}

// Middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'Forbidden' });
    req.user = user;
    next();
  });
};

const requireAdmin = (req: any, res: any, next: any) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
};

// API Routes
app.post('/api/auth/signup', (req, res) => {
  const { username, password, accessCode } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  // Check IP limit
  const ipCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE ip_address = ?').get(ip) as { count: number };
  if (ipCount.count >= 2) {
    return res.status(400).json({ error: 'Maximum accounts reached for this IP' });
  }

  let role = 'user';
  let codeRecord = null;

  if (username.toLowerCase() === 'blessedsuccess738@gmail.com') {
    role = 'admin';
  } else {
    // Verify access code
    codeRecord = db.prepare('SELECT * FROM access_codes WHERE code = ? AND is_used = 0').get(accessCode) as any;
    if (!codeRecord) {
      return res.status(400).json({ error: 'Invalid or already used access code' });
    }
  }

  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password, role, ip_address) VALUES (?, ?, ?, ?)').run(username, hashedPassword, role, ip);
    
    if (codeRecord) {
      // Mark code as used
      db.prepare('UPDATE access_codes SET is_used = 1, used_by = ? WHERE id = ?').run(result.lastInsertRowid, codeRecord.id);
    }

    // TODO: Notify admin via Telegram/Discord (Placeholder)
    console.log(`[ALERT] New user signed up: ${username} (Role: ${role})`);

    res.json({ success: true, message: 'User created successfully' });
  } catch (err: any) {
    res.status(400).json({ error: 'Username may already exist' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;

  if (user && bcrypt.compareSync(password, user.password)) {
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'none' });
    res.json({ success: true, role: user.role });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

app.get('/api/auth/me', authenticateToken, (req: any, res) => {
  res.json({ user: req.user });
});

// User Routes
app.post('/api/signals/generate', authenticateToken, (req: any, res) => {
  const { asset, timeframe } = req.body;
  
  // Sophisticated mock logic for signal generation
  const rsi = Math.floor(Math.random() * 100);
  const macd = (Math.random() * 2 - 1).toFixed(4);
  const trend = Math.random() > 0.5 ? 'Bullish' : 'Bearish';
  
  let signal = 'Wait';
  if (rsi > 70) signal = 'Sell';
  else if (rsi < 30) signal = 'Buy';
  else if (trend === 'Bullish' && rsi > 50) signal = 'Buy';
  else if (trend === 'Bearish' && rsi < 50) signal = 'Sell';
  else signal = Math.random() > 0.5 ? 'Buy' : 'Sell';
  
  const result = db.prepare('INSERT INTO signals (asset, timeframe, signal, user_id) VALUES (?, ?, ?, ?)').run(asset, timeframe, signal, req.user.id);
  
  const newSignal = {
    id: result.lastInsertRowid,
    asset,
    timeframe,
    signal,
    rsi,
    macd,
    trend,
    username: req.user.username,
    created_at: new Date().toISOString()
  };

  io.emit('new_signal', newSignal);
  
  res.json(newSignal);
});

// Admin Routes
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, role, ip_address, created_at FROM users').all();
  res.json(users);
});

app.get('/api/admin/signals', authenticateToken, requireAdmin, (req, res) => {
  const signals = db.prepare(`
    SELECT s.id, s.asset, s.timeframe, s.signal, s.created_at, u.username 
    FROM signals s 
    JOIN users u ON s.user_id = u.id
    ORDER BY s.created_at DESC
  `).all();
  res.json(signals);
});

app.get('/api/admin/codes', authenticateToken, requireAdmin, (req, res) => {
  const codes = db.prepare(`
    SELECT c.id, c.code, c.is_used, u.username as used_by_username
    FROM access_codes c
    LEFT JOIN users u ON c.used_by = u.id
  `).all();
  res.json(codes);
});

app.post('/api/admin/codes/generate', authenticateToken, requireAdmin, (req, res) => {
  const code = Math.random().toString(36).substring(2, 10).toUpperCase();
  db.prepare('INSERT INTO access_codes (code) VALUES (?)').run(code);
  res.json({ success: true, code });
});

app.get('/api/admin/settings', authenticateToken, requireAdmin, (req, res) => {
  const settings = db.prepare('SELECT * FROM settings').all();
  res.json(settings);
});

app.post('/api/admin/settings', authenticateToken, requireAdmin, (req, res) => {
  const { key, value } = req.body;
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  res.json({ success: true });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
