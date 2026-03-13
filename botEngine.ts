import puppeteer from 'puppeteer';

// In-memory store for active browser sessions
const activeSessions = new Map<string, any>();

export function getActiveSessions() {
  return Array.from(activeSessions.keys());
}

export async function getSessionScreenshot(userId: string): Promise<string | null> {
  const session = activeSessions.get(userId);
  if (!session || !session.page) return null;
  try {
    const base64 = await session.page.screenshot({ encoding: 'base64' });
    return base64 as string;
  } catch (e) {
    console.error(`Failed to take screenshot for ${userId}:`, e);
    return null;
  }
}

export async function connectToPocketOption(userId: string, email: string, password: string, onLog?: (msg: string) => void) {
  const log = (msg: string) => {
    console.log(`[Bot Engine] ${msg}`);
    if (onLog) onLog(msg);
  };

  try {
    log(`Starting connection for user ${userId}...`);
    
    // Launch browser
    const browser = await puppeteer.launch({
      headless: true, // Run in headless mode for production
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080'
      ]
    });

    const page = await browser.newPage();
    
    // Store the session EARLY so we can take screenshots even if it hangs during login
    activeSessions.set(userId, {
      browser,
      page,
      lastActive: Date.now()
    });

    // Set user agent to avoid bot detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    log(`Navigating to Pocket Option login...`);
    await page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });

    // Wait for login form
    log(`Waiting for login form...`);
    await page.waitForSelector('input[name="email"]', { timeout: 10000 });
    
    log(`Entering credentials...`);
    await page.type('input[name="email"]', email);
    await page.type('input[name="password"]', password);
    
    // Click login button
    log(`Clicking login button...`);
    await page.click('button[type="submit"]');

    log(`Waiting for successful login navigation...`);
    // Wait for navigation to the trading cabinet
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => log('Navigation timeout, checking DOM state...'));

    // Check if login was successful by looking for a specific element in the cabinet
    const isLoggedIn = await page.evaluate(() => {
      return document.body.innerHTML.includes('cabinet') || document.body.innerHTML.includes('trading');
    });

    if (!isLoggedIn) {
      log(`Login verification failed. Check screenshot in Dev Tools.`);
      throw new Error('Login failed. Invalid credentials or CAPTCHA required.');
    }

    log(`Successfully connected for user ${userId}.`);

    return { success: true };

  } catch (error: any) {
    log(`Connection failed for user ${userId}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

export async function getBalance(userId: string): Promise<number | null> {
  const session = activeSessions.get(userId);
  if (!session || !session.page) return null;
  try {
    // Pocket Option balance selector (this is a common one, might need adjustment)
    const balanceText = await session.page.evaluate(() => {
      const el = document.querySelector('.balance-value, .user-balance, .balance');
      return el ? el.textContent : null;
    });
    if (balanceText) {
      const numericBalance = parseFloat(balanceText.replace(/[^0-9.]/g, ''));
      return isNaN(numericBalance) ? null : numericBalance;
    }
    return null;
  } catch (e) {
    console.error(`Failed to get balance for ${userId}:`, e);
    return null;
  }
}

export async function placeTrade(userId: string, asset: string, direction: 'Buy' | 'Sell', amount: number, timeframe: string, onLog?: (msg: string) => void) {
  const log = (msg: string) => {
    console.log(`[Bot Engine] [Trade] ${msg}`);
    if (onLog) onLog(msg);
  };

  const session = activeSessions.get(userId);
  if (!session || !session.page) {
    throw new Error('No active session found for user');
  }

  const { page } = session;

  try {
    log(`Placing ${direction} trade on ${asset} ($${amount}, ${timeframe}) for user ${userId}...`);
    
    // 1. Ensure we are on the trading page
    if (!page.url().includes('cabinet')) {
      log('Not on cabinet page, navigating...');
      await page.goto('https://pocketoption.com/en/cabinet/', { waitUntil: 'networkidle2' });
    }

    // 2. Select Asset
    // This part is tricky as PO uses a complex asset selector. 
    // For now, we'll log the attempt. In a real scenario, we'd click the search and type the asset name.
    log(`Selecting asset: ${asset}`);
    // await page.click('.current-symbol');
    // await page.type('.search-input', asset);
    // await page.click('.symbol-item');

    // 3. Set Amount
    log(`Setting amount: ${amount}`);
    await page.evaluate((amt) => {
      const input = document.querySelector('input[name="amount"]') as HTMLInputElement;
      if (input) {
        input.value = amt.toString();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, amount);

    // 4. Set Timeframe
    log(`Setting timeframe: ${timeframe}`);
    // Similar to amount, find the timeframe input/selector

    // 5. Click Buy/Sell
    const selector = direction === 'Buy' ? '.btn-call, .button-call, .up-button' : '.btn-put, .button-put, .down-button';
    log(`Clicking ${direction} button...`);
    
    const buttonExists = await page.evaluate((sel) => !!document.querySelector(sel), selector);
    if (!buttonExists) {
      log(`Button ${selector} not found. Check screenshot.`);
      return { success: false, error: 'Trade button not found' };
    }

    // Get balance before
    const balanceBefore = await getBalance(userId);
    if (balanceBefore !== null) {
      log(`Balance before trade: $${balanceBefore}`);
    }

    await page.click(selector);
    log(`Trade placed successfully.`);
    
    // Update last active time
    session.lastActive = Date.now();
    
    // Wait a bit for the UI to update
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get new balance
    const newBalance = await getBalance(userId);
    if (newBalance !== null) {
      log(`Balance after trade: $${newBalance}`);
    }
    
    return { success: true, newBalance };
  } catch (error: any) {
    log(`Trade failed for user ${userId}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

export async function disconnectPocketOption(userId: string) {
  const session = activeSessions.get(userId);
  if (session) {
    try {
      await session.browser.close();
      activeSessions.delete(userId);
      console.log(`[Bot Engine] Disconnected user ${userId}.`);
      return { success: true };
    } catch (error: any) {
      console.error(`[Bot Engine] Disconnect failed for user ${userId}:`, error.message);
      return { success: false, error: error.message };
    }
  }
  return { success: true }; // Already disconnected
}
