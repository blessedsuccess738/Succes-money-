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
import crypto from 'crypto';
import { connectToPocketOption, disconnectPocketOption, getSessionScreenshot, getActiveSessions, placeTrade } from './botEngine.js';

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
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012'; // Must be 32 bytes
const IV_LENGTH = 16;

function encrypt(text: string) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text: string) {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift()!, 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

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
      trade_count INTEGER DEFAULT 0,
      level TEXT DEFAULT 'Rookie',
      balance REAL DEFAULT 0,
      is_live_synced BOOLEAN DEFAULT 0,
      auto_trade_amount REAL DEFAULT 1.0,
      total_profit REAL DEFAULT 0,
      total_loss REAL DEFAULT 0,
      win_count INTEGER DEFAULT 0,
      loss_count INTEGER DEFAULT 0,
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
      source TEXT DEFAULT 'Manual',
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
    db.exec(`ALTER TABLE users ADD COLUMN total_profit REAL DEFAULT 0;`);
  } catch (e) {}

  try {
    db.exec(`ALTER TABLE users ADD COLUMN auto_trade_amount REAL DEFAULT 1.0;`);
  } catch (e) {}

  try {
    db.exec(`ALTER TABLE users ADD COLUMN total_loss REAL DEFAULT 0;`);
  } catch (e) {}

  try {
    db.exec(`ALTER TABLE users ADD COLUMN win_count INTEGER DEFAULT 0;`);
  } catch (e) {}

  try {
    db.exec(`ALTER TABLE users ADD COLUMN loss_count INTEGER DEFAULT 0;`);
  } catch (e) {}

  try {
    db.exec(`ALTER TABLE signals ADD COLUMN username TEXT;`);
  } catch (e) {}

  try {
    db.exec(`ALTER TABLE signals ADD COLUMN source TEXT DEFAULT 'Manual';`);
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

  const affLinkExists = db.prepare('SELECT * FROM settings WHERE key = ?').get('pocket_option_affiliate_link');
  if (!affLinkExists) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('pocket_option_affiliate_link', 'https://pocketoption.com/register?a=YOUR_AFFILIATE_ID');
  }

  const webhookSecretExists = db.prepare('SELECT * FROM settings WHERE key = ?').get('webhook_secret');
  if (!webhookSecretExists) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('webhook_secret', Math.random().toString(36).substring(2, 15));
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

// Public Routes
app.get('/api/public/settings', (req, res) => {
  try {
    const settings = db.prepare('SELECT key, value FROM settings WHERE key IN (?, ?)').all('pocket_option_affiliate_link', 'public_link');
    const settingsMap = settings.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    res.json(settingsMap);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Webhook Routes
app.post('/api/webhooks/:source', (req, res) => {
  const { source } = req.params;
  const { secret, asset, timeframe, signal, price, type } = req.body;

  const webhookSecret = db.prepare('SELECT value FROM settings WHERE key = ?').get('webhook_secret') as { value: string };
  
  if (secret !== webhookSecret?.value) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  if (!asset || !signal) {
    return res.status(400).json({ error: 'Asset and signal are required' });
  }

  const newSignal = {
    id: Date.now(),
    asset,
    timeframe: timeframe || 'N/A',
    signal,
    price: price || 'N/A',
    type: type || 'N/A',
    source: source.toUpperCase(),
    username: 'System',
    created_at: new Date().toISOString()
  };

  // Store in DB
  try {
    db.prepare('INSERT INTO signals (asset, timeframe, signal, source, username) VALUES (?, ?, ?, ?, ?)').run(
      asset, 
      timeframe || 'N/A', 
      signal, 
      source.toUpperCase(), 
      'System'
    );
  } catch (err) {
    console.error('Failed to store webhook signal:', err);
  }

  io.emit('new_signal', newSignal);
  
  // Create broadcast notification
  try {
    const msg = `${asset} - ${signal} (${timeframe || 'N/A'}) from ${source.toUpperCase()}`;
    db.prepare('INSERT INTO notifications (title, message, type) VALUES (?, ?, ?)').run(`New ${source.toUpperCase()} Signal`, msg, 'broadcast');
    io.emit('broadcast_notification', {
      title: `New ${source.toUpperCase()} Signal`,
      message: msg,
      type: 'broadcast',
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to create webhook notification:', err);
  }

  res.json({ success: true });
});

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

app.get('/api/user/profile', authenticateToken, (req: any, res) => {
  try {
    const user = db.prepare('SELECT trade_count, level, balance, is_live_synced, auto_trade_amount, pocket_option_id, total_profit, total_loss, win_count, loss_count FROM users WHERE id = ?').get(req.user.id) as any;
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.post('/api/user/settings', authenticateToken, (req: any, res) => {
  const { auto_trade_amount } = req.body;
  
  if (typeof auto_trade_amount !== 'number' || auto_trade_amount <= 0) {
    return res.status(400).json({ error: 'Invalid trade amount' });
  }

  try {
    db.prepare('UPDATE users SET auto_trade_amount = ? WHERE id = ?').run(auto_trade_amount, req.user.id);
    res.json({ success: true, auto_trade_amount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

app.post('/api/auth/pocket-option', authenticateToken, async (req: any, res) => {
  const { pocketOptionId, pocketOptionEmail, pocketOptionPassword } = req.body;
  if (!pocketOptionId || !pocketOptionEmail || !pocketOptionPassword) {
    return res.status(400).json({ error: 'All Pocket Option credentials are required' });
  }

  try {
    // Encrypt the password before storing
    const encryptedPassword = encrypt(pocketOptionPassword);

    // Update SQLite
    db.prepare('UPDATE users SET pocket_option_id = ? WHERE id = ?').run(pocketOptionId, req.user.id);
    
    // Update Firestore via Admin SDK
    await admin.firestore().collection('users').doc(req.user.id).update({
      pocketOptionId,
      pocketOptionEmail,
      pocketOptionPassword: encryptedPassword // Store encrypted password
    });

    // Test the connection using Puppeteer
    io.to(`user_${req.user.id}`).emit('user_notification', { id: Date.now(), title: 'Connecting...', message: 'Testing connection to Pocket Option...', type: 'user', created_at: new Date().toISOString() });
    
    const onLog = (msg: string) => {
      io.emit('bot_log', { userId: req.user.id, message: msg, timestamp: new Date().toISOString() });
    };

    // We run this asynchronously so we don't block the response, but we could also await it
    // For now, we'll await it to ensure it works before returning success
    const connectionResult = await connectToPocketOption(req.user.id, pocketOptionEmail, pocketOptionPassword, onLog);
    
    if (!connectionResult.success) {
      // If connection fails, we might want to revert the save or just notify the user
      return res.status(400).json({ error: 'Failed to connect to Pocket Option. Please check your credentials.' });
    }

    // Don't disconnect immediately so the admin can debug the session in the Dev Tool
    // await disconnectPocketOption(req.user.id);

    // Notify user
    const userMsg = `Your Pocket Option ID (${pocketOptionId}) has been securely linked and verified.`;
    const notifResult = db.prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)').run(req.user.id, 'Connection Secure', userMsg, 'user');
    io.to(`user_${req.user.id}`).emit('user_notification', { id: notifResult.lastInsertRowid, title: 'Connection Secure', message: userMsg, type: 'user', created_at: new Date().toISOString() });
    
    // Notify admin
    const adminMsg = `User ${req.user.username} securely linked Pocket Option ID: ${pocketOptionId}`;
    const adminNotifResult = db.prepare('INSERT INTO notifications (title, message, type) VALUES (?, ?, ?)').run('Account Linked', adminMsg, 'admin');
    io.emit('admin_notification', { id: adminNotifResult.lastInsertRowid, title: 'Account Linked', message: adminMsg, type: 'admin', created_at: new Date().toISOString() });

    res.json({ success: true, message: 'Pocket Option account securely linked' });
  } catch (err) {
    console.error('Failed to link account:', err);
    res.status(500).json({ error: 'Failed to securely link account' });
  }
});

app.post('/api/sync/start', authenticateToken, (req: any, res) => {
  try {
    db.prepare('UPDATE users SET is_live_synced = 1, balance = ? WHERE id = ?').run(1000 + Math.random() * 5000, req.user.id);
    
    const user = db.prepare('SELECT balance, level FROM users WHERE id = ?').get(req.user.id) as any;
    
    io.to(`user_${req.user.id}`).emit('sync_status', { 
      is_live_synced: true, 
      balance: user.balance,
      status: 'Connected'
    });

    res.json({ success: true, balance: user.balance });
  } catch (err) {
    res.status(500).json({ error: 'Failed to start sync' });
  }
});

app.post('/api/sync/stop', authenticateToken, (req: any, res) => {
  try {
    db.prepare('UPDATE users SET is_live_synced = 0 WHERE id = ?').run(req.user.id);
    io.to(`user_${req.user.id}`).emit('sync_status', { is_live_synced: false, status: 'Disconnected' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to stop sync' });
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
  
  // Update user trade count and level
  try {
    const user = db.prepare('SELECT trade_count FROM users WHERE id = ?').get(req.user.id) as { trade_count: number };
    const newCount = (user.trade_count || 0) + 1;
    
    let newLevel = 'Rookie';
    if (newCount > 500) newLevel = 'Elite Legend';
    else if (newCount > 300) newLevel = 'Premium Member';
    else if (newCount > 150) newLevel = 'Trade Master';
    else if (newCount > 50) newLevel = 'Pro Trader';
    else if (newCount > 10) newLevel = 'Active Trader';

    db.prepare('UPDATE users SET trade_count = ?, level = ? WHERE id = ?').run(newCount, newLevel, req.user.id);
    
    // If level upgraded, notify user
    const oldLevel = db.prepare('SELECT level FROM users WHERE id = ?').get(req.user.id) as { level: string };
    // We check level after update, so we need to know if it changed. 
    // Let's simplify and just emit the update.
    io.to(`user_${req.user.id}`).emit('user_update', { trade_count: newCount, level: newLevel });
  } catch (err) {
    console.error('Failed to update user level:', err);
  }
  
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
// --- Signal Listener & Auto-Trade Execution ---
function setupSignalListener() {
  try {
    const q = admin.firestore().collection('signals').orderBy('timestamp', 'desc').limit(1);
    
    q.onSnapshot(async (snapshot) => {
      if (snapshot.empty) return;
      
      const signal = snapshot.docs[0].data();
      const signalId = snapshot.docs[0].id;
      
      // Check if we already processed this signal (simple in-memory check for now)
      if ((global as any).lastProcessedSignalId === signalId) return;
      (global as any).lastProcessedSignalId = signalId;

      console.log(`[Auto-Trade] New signal detected: ${signal.asset} ${signal.signal}`);

      // Find all users with Auto-Trade enabled
      const activeUsers = db.prepare('SELECT * FROM users WHERE is_live_synced = 1 AND isBanned = 0').all() as any[];
      
      for (const user of activeUsers) {
        const onLog = (msg: string) => {
          io.emit('bot_log', { userId: user.id.toString(), message: msg, timestamp: new Date().toISOString() });
        };

        try {
          // Execute trade via bot engine
          const result = await placeTrade(
            user.id.toString(), 
            signal.asset, 
            signal.signal as 'Buy' | 'Sell', 
            user.auto_trade_amount || 1.0, 
            signal.timeframe || '1m',
            onLog
          );

          if (result.success) {
            io.to(`user_${user.id}`).emit('user_notification', {
              id: Date.now(),
              title: 'Trade Placed',
              message: `Auto-trade executed: ${signal.asset} ${signal.signal} ($${user.auto_trade_amount})`,
              type: 'user',
              created_at: new Date().toISOString()
            });
          }
        } catch (err: any) {
          console.error(`[Auto-Trade] Failed for user ${user.id}:`, err.message);
          onLog(`Auto-trade failed: ${err.message}`);
        }
      }
    }, (error) => {
      console.error('[Auto-Trade] Firestore listener error:', error);
    });
  } catch (err) {
    console.error('[Auto-Trade] Failed to setup signal listener:', err);
  }
}

// Start the listener after a short delay to ensure DB is ready
setTimeout(setupSignalListener, 5000);

app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, role, ip_address, created_at, pocket_option_id, total_profit, total_loss, win_count, loss_count FROM users').all();
  res.json(users);
});

app.get('/api/admin/signals', authenticateToken, requireAdmin, (req, res) => {
  const signals = db.prepare(`
    SELECT id, asset, timeframe, signal, created_at, user_id, username, source
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

// Admin Bot Routes
app.get('/api/admin/bot/sessions', authenticateToken, requireAdmin, (req, res) => {
  res.json({ sessions: getActiveSessions() });
});

app.get('/api/admin/bot/screenshot/:userId', authenticateToken, requireAdmin, async (req, res) => {
  const base64 = await getSessionScreenshot(req.params.userId);
  if (base64) {
    res.json({ success: true, image: `data:image/png;base64,${base64}` });
  } else {
    res.status(404).json({ error: 'No active session or page closed' });
  }
});

app.post('/api/admin/codes/generate', authenticateToken, requireAdmin, (req, res) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
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

  socket.on('sync_view', (data) => {
    // Broadcast the admin's view (asset/timeframe) to all users
    io.emit('view_synced', data);
  });
});

// Background Balance Sync Simulation
setInterval(() => {
  try {
    const syncedUsers = db.prepare('SELECT id, balance FROM users WHERE is_live_synced = 1').all() as any[];
    syncedUsers.forEach(user => {
      // Simulate small balance fluctuations (market movement)
      const change = (Math.random() * 10 - 5);
      const newBalance = Math.max(0, user.balance + change);
      db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(newBalance, user.id);
      io.to(`user_${user.id}`).emit('balance_update', { balance: newBalance });
    });
  } catch (err) {
    // Silent error for background task
  }
}, 5000);

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
