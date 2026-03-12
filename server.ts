import express from 'express';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { Server } from 'socket.io';
import admin from 'firebase-admin';

// Initialize Firebase Admin
try {
  admin.initializeApp({
    projectId: 'studio-4616504978-c087a'
  });
} catch (e) {
  console.error('Firebase Admin initialization error:', e);
}

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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), env: process.env.NODE_ENV });
});

// Database Setup
let db: any;
try {
  const dbPath = process.env.NODE_ENV === 'production' && process.env.VERCEL ? '/tmp/database.db' : 'database.db';
  console.log(`Initializing database at: ${dbPath}`);
  db = new Database(dbPath);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT DEFAULT 'user',
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    -- ... rest of tables ...
  `);
} catch (err) {
  console.error('Failed to initialize database:', err);
}

if (db) {
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
      user_id TEXT,
      username TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT,
      message TEXT,
      type TEXT,
      is_read BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  try {
    db.exec(`ALTER TABLE users ADD COLUMN pocket_option_id TEXT;`);
  } catch (e) {}

  try {
    db.exec(`ALTER TABLE users ADD COLUMN ip_address TEXT;`);
  } catch (e) {}

  try {
    db.exec(`ALTER TABLE signals ADD COLUMN username TEXT;`);
  } catch (e) {}

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

  const apiKeyExists = db.prepare('SELECT * FROM settings WHERE key = ?').get('pocket_option_api_key');
  if (!apiKeyExists) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('pocket_option_api_key', '');
  }
}

// Middleware
const authenticateToken = async (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    // Fallback to cookie for legacy support
    const cookieToken = req.cookies.token;
    if (!cookieToken) return res.status(401).json({ error: 'Unauthorized' });
    
    jwt.verify(cookieToken, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.status(403).json({ error: 'Forbidden' });
      req.user = user;
      next();
    });
    return;
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = {
      id: decodedToken.uid,
      username: decodedToken.email || decodedToken.uid,
      role: decodedToken.role || 'user' // You might want to fetch role from Firestore if needed
    };
    next();
  } catch (error) {
    console.error('Firebase token verification failed:', error);
    return res.status(403).json({ error: 'Invalid token' });
  }
};

const requireAdmin = (req: any, res: any, next: any) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
};

// API Routes
app.post('/api/auth/signup', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';

    // Check IP limit
    const ipCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE ip_address = ?').get(ip) as { count: number };
    if (ipCount.count >= 2) {
      return res.status(400).json({ error: 'Maximum accounts reached for this IP' });
    }

    let role = 'user';

    if (username.toLowerCase() === 'blessedsuccess738@gmail.com') {
      role = 'admin';
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password, role, ip_address) VALUES (?, ?, ?, ?)').run(username, hashedPassword, role, ip);
    
    // Notify admin via Telegram/Discord (Placeholder)
    console.log(`[ALERT] New user signed up: ${username} (Role: ${role})`);
    
    // Create admin notification
    const adminMsg = `New user signup: ${username}`;
    const notifResult = db.prepare('INSERT INTO notifications (title, message, type) VALUES (?, ?, ?)').run('New User', adminMsg, 'admin');
    io.emit('admin_notification', { id: notifResult.lastInsertRowid, title: 'New User', message: adminMsg, type: 'admin', created_at: new Date().toISOString() });

    // Auto-login after signup
    const token = jwt.sign({ id: result.lastInsertRowid, username, role }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none' });

    res.json({ success: true, role, message: 'User created successfully' });
  } catch (err: any) {
    console.error('Signup error:', err);
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Internal server error during signup' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;

    if (user && bcrypt.compareSync(password, user.password)) {
      const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
      res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none' });
      
      const codeCount = db.prepare('SELECT COUNT(*) as count FROM access_codes WHERE used_by = ?').get(user.id) as { count: number };
      const hasAccessCode = codeCount.count > 0;
      
      res.json({ success: true, role: user.role, hasAccessCode });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

app.get('/api/auth/me', authenticateToken, (req: any, res) => {
  const user = db.prepare('SELECT id, username, role, pocket_option_id as pocketOptionId FROM users WHERE id = ?').get(req.user.id) as any;
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  const codeCount = db.prepare('SELECT COUNT(*) as count FROM access_codes WHERE used_by = ?').get(req.user.id) as { count: number };
  user.hasAccessCode = codeCount.count > 0;
  
  res.json({ user });
});

app.post('/api/auth/verify-code', authenticateToken, (req: any, res) => {
  const { accessCode } = req.body;
  if (!accessCode) return res.status(400).json({ error: 'Access code is required' });

  const codeRecord = db.prepare('SELECT * FROM access_codes WHERE code = ? AND is_used = 0').get(accessCode) as any;
  if (!codeRecord) {
    return res.status(400).json({ error: 'Invalid or already used access code' });
  }

  try {
    db.prepare('UPDATE access_codes SET is_used = 1, used_by = ? WHERE id = ?').run(req.user.id, codeRecord.id);
    res.json({ success: true, message: 'Access code verified successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify access code' });
  }
});

app.post('/api/auth/pocket-option', authenticateToken, (req: any, res) => {
  const { pocketOptionId } = req.body;
  if (!pocketOptionId) return res.status(400).json({ error: 'Pocket Option ID is required' });

  try {
    db.prepare('UPDATE users SET pocket_option_id = ? WHERE id = ?').run(pocketOptionId, req.user.id);
    
    // Notify user
    const userMsg = `Your Pocket Option ID (${pocketOptionId}) has been verified.`;
    const notifResult = db.prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)').run(req.user.id, 'Verification Complete', userMsg, 'user');
    io.to(`user_${req.user.id}`).emit('user_notification', { id: notifResult.lastInsertRowid, title: 'Verification Complete', message: userMsg, type: 'user', created_at: new Date().toISOString() });
    
    // Notify admin
    const adminMsg = `User ${req.user.username} verified Pocket Option ID: ${pocketOptionId}`;
    const adminNotifResult = db.prepare('INSERT INTO notifications (title, message, type) VALUES (?, ?, ?)').run('ID Verified', adminMsg, 'admin');
    io.emit('admin_notification', { id: adminNotifResult.lastInsertRowid, title: 'ID Verified', message: adminMsg, type: 'admin', created_at: new Date().toISOString() });

    res.json({ success: true, message: 'Pocket Option ID linked successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to link account' });
  }
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
  
  const result = db.prepare('INSERT INTO signals (asset, timeframe, signal, user_id, username) VALUES (?, ?, ?, ?, ?)').run(asset, timeframe, signal, req.user.id, req.user.username);
  
  const newSignal = {
    id: result.lastInsertRowid,
    asset,
    timeframe,
    signal,
    rsi,
    macd,
    trend,
    username: req.user.username,
    userId: req.user.id,
    created_at: new Date().toISOString()
  };

  io.emit('new_signal', newSignal);
  
  // Notify user
  const userMsg = `New signal generated for ${asset} (${timeframe}): ${signal}`;
  const notifResult = db.prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)').run(req.user.id, 'New Signal', userMsg, 'user');
  io.to(`user_${req.user.id}`).emit('user_notification', { id: notifResult.lastInsertRowid, title: 'New Signal', message: userMsg, type: 'user', created_at: new Date().toISOString() });

  // Notify admin
  const adminMsg = `User ${req.user.username} requested signal for ${asset}`;
  const adminNotifResult = db.prepare('INSERT INTO notifications (title, message, type) VALUES (?, ?, ?)').run('Signal Request', adminMsg, 'admin');
  io.emit('admin_notification', { id: adminNotifResult.lastInsertRowid, title: 'Signal Request', message: adminMsg, type: 'admin', created_at: new Date().toISOString() });
  
  res.json(newSignal);
});

// Notifications Routes
app.get('/api/notifications', authenticateToken, (req: any, res) => {
  let notifications;
  if (req.user.role === 'admin') {
    notifications = db.prepare('SELECT * FROM notifications WHERE type = ? OR type = ? ORDER BY created_at DESC LIMIT 50').all('admin', 'broadcast');
  } else {
    notifications = db.prepare('SELECT * FROM notifications WHERE (user_id = ? AND type = ?) OR type = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id, 'user', 'broadcast');
  }
  res.json(notifications);
});

app.post('/api/notifications/read', authenticateToken, (req: any, res) => {
  if (req.user.role === 'admin') {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE type = ?').run('admin');
  } else {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
  }
  res.json({ success: true });
});

// Admin Routes
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, role, ip_address, created_at, pocket_option_id FROM users').all();
  res.json(users);
});

app.get('/api/admin/signals', authenticateToken, requireAdmin, (req, res) => {
  const signals = db.prepare(`
    SELECT id, asset, timeframe, signal, created_at, user_id, username
    FROM signals
    ORDER BY created_at DESC
  `).all();
  res.json(signals);
});

app.post('/api/admin/broadcast', authenticateToken, requireAdmin, (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  const notifResult = db.prepare('INSERT INTO notifications (title, message, type) VALUES (?, ?, ?)').run('Broadcast Message', message, 'broadcast');
  const broadcastNotif = { id: notifResult.lastInsertRowid, title: 'Broadcast Message', message, type: 'broadcast', created_at: new Date().toISOString() };
  
  io.emit('broadcast_notification', broadcastNotif);
  
  res.json({ success: true });
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
  const maskedSettings = settings.map((s: any) => {
    if (s.key === 'pocket_option_api_key' && s.value) {
      return { ...s, value: '********' };
    }
    return s;
  });
  res.json(maskedSettings);
});

app.post('/api/admin/settings', authenticateToken, requireAdmin, (req, res) => {
  const { key, value } = req.body;
  if (key === 'pocket_option_api_key' && value === '********') {
    return res.json({ success: true, message: 'Value unchanged' });
  }
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  res.json({ success: true });
});

// Socket.io setup
io.on('connection', (socket) => {
  socket.on('join_user_room', (userId) => {
    socket.join(`user_${userId}`);
  });
});

export default app;

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
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
