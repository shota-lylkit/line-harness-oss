import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { LineClient } from '@line-crm/line-sdk';
import { getLineAccounts } from '@line-crm/db';
import { processStepDeliveries } from './services/step-delivery.js';
import { processScheduledBroadcasts } from './services/broadcast.js';
import { processReminderDeliveries } from './services/reminder-delivery.js';
import { checkAccountHealth } from './services/ban-monitor.js';
import { processJobReminders } from './services/job-reminders.js';
import { authMiddleware } from './middleware/auth.js';
import { webhook } from './routes/webhook.js';
import { friends } from './routes/friends.js';
import { tags } from './routes/tags.js';
import { scenarios } from './routes/scenarios.js';
import { broadcasts } from './routes/broadcasts.js';
import { users } from './routes/users.js';
import { lineAccounts } from './routes/line-accounts.js';
import { conversions } from './routes/conversions.js';
import { affiliates } from './routes/affiliates.js';
import { openapi } from './routes/openapi.js';
import { liffRoutes } from './routes/liff.js';
// Round 3 ルート
import { webhooks } from './routes/webhooks.js';
import { calendar } from './routes/calendar.js';
import { reminders } from './routes/reminders.js';
import { scoring } from './routes/scoring.js';
import { templates } from './routes/templates.js';
import { chats } from './routes/chats.js';
import { notifications } from './routes/notifications.js';
import { stripe } from './routes/stripe.js';
import { health } from './routes/health.js';
import { automations } from './routes/automations.js';
import { richMenus } from './routes/rich-menus.js';
import { trackedLinks } from './routes/tracked-links.js';
import { forms } from './routes/forms.js';
import { jobs } from './routes/jobs.js';
import { profiles } from './routes/profiles.js';
import { attendance } from './routes/attendance.js';
import { reviews } from './routes/reviews.js';

export type Env = {
  Bindings: {
    DB: D1Database;
    LINE_CHANNEL_SECRET: string;
    LINE_CHANNEL_ACCESS_TOKEN: string;
    API_KEY: string;
    LIFF_URL: string;
    LINE_CHANNEL_ID: string;
    LINE_LOGIN_CHANNEL_ID: string;
    LINE_LOGIN_CHANNEL_SECRET: string;
    WORKER_URL: string;
    ADMIN_LINE_USER_ID?: string;
    DOCUMENTS: R2Bucket;
  };
};

const app = new Hono<Env>();

// CORS — restrict to known origins
app.use('*', cors({
  origin: (origin, c) => {
    const liffUrl = c.env.LIFF_URL || '';
    const workerUrl = c.env.WORKER_URL || '';
    const allowed = [
      liffUrl,
      workerUrl,
      // LINE LIFF SDK loads from these origins
      'https://liff.line.me',
    ].filter(Boolean);
    // Allow if origin matches any allowed origin (strip trailing slash)
    if (origin && allowed.some((a) => origin.replace(/\/$/, '') === a.replace(/\/$/, ''))) {
      return origin;
    }
    // Allow requests with no origin (server-to-server, CLI, webhook)
    if (!origin) return liffUrl || '*';
    return null as unknown as string;
  },
}));

// Auth middleware — skips /webhook and /docs automatically
app.use('*', authMiddleware);

// Mount route groups — MVP & Round 2
app.route('/', webhook);
app.route('/', friends);
app.route('/', tags);
app.route('/', scenarios);
app.route('/', broadcasts);
app.route('/', users);
app.route('/', lineAccounts);
app.route('/', conversions);
app.route('/', affiliates);
app.route('/', openapi);
app.route('/', liffRoutes);

// Mount route groups — Round 3
app.route('/', webhooks);
app.route('/', calendar);
app.route('/', reminders);
app.route('/', scoring);
app.route('/', templates);
app.route('/', chats);
app.route('/', notifications);
app.route('/', stripe);
app.route('/', health);
app.route('/', automations);
app.route('/', richMenus);
app.route('/', trackedLinks);
app.route('/', forms);
app.route('/', jobs);
app.route('/', profiles);
app.route('/', attendance);
app.route('/', reviews);

// Short link: /r/:ref → landing page with LINE open button
app.get('/r/:ref', (c) => {
  const ref = c.req.param('ref');
  const liffUrl = c.env.LIFF_URL || 'https://liff.line.me/2009554425-4IMBmLQ9';
  const target = `${liffUrl}?ref=${encodeURIComponent(ref)}`;

  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LINE Harness</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Hiragino Sans',system-ui,sans-serif;background:#0d1117;color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh}
.card{text-align:center;max-width:400px;width:90%;padding:48px 24px}
h1{font-size:28px;font-weight:800;margin-bottom:8px}
.sub{font-size:14px;color:rgba(255,255,255,0.5);margin-bottom:40px}
.btn{display:block;width:100%;padding:18px;border:none;border-radius:12px;font-size:18px;font-weight:700;text-decoration:none;text-align:center;color:#fff;background:#06C755;transition:opacity .15s}
.btn:active{opacity:.85}
.note{font-size:12px;color:rgba(255,255,255,0.3);margin-top:24px;line-height:1.6}
</style>
</head>
<body>
<div class="card">
<h1>LINE Harness</h1>
<p class="sub">L-step / Utage の無料代替 OSS</p>
<a href="${target}" class="btn">LINE で体験する</a>
<p class="note">友だち追加するだけで<br>ステップ配信・フォーム・自動返信を体験できます</p>
</div>
</body>
</html>`);
});

// 404 fallback
app.notFound((c) => c.json({ success: false, error: 'Not found' }, 404));

// Scheduled handler for cron triggers — runs for all active LINE accounts
async function scheduled(
  _event: ScheduledEvent,
  env: Env['Bindings'],
  _ctx: ExecutionContext,
): Promise<void> {
  // Get all active accounts from DB, plus the default env account
  const dbAccounts = await getLineAccounts(env.DB);
  const activeTokens = new Set<string>();

  // Default account from env
  activeTokens.add(env.LINE_CHANNEL_ACCESS_TOKEN);

  // DB accounts
  for (const account of dbAccounts) {
    if (account.is_active) {
      activeTokens.add(account.channel_access_token);
    }
  }

  // Run delivery for each account
  const jobs = [];
  for (const token of activeTokens) {
    const lineClient = new LineClient(token);
    jobs.push(
      processStepDeliveries(env.DB, lineClient, env.WORKER_URL),
      processScheduledBroadcasts(env.DB, lineClient),
      processReminderDeliveries(env.DB, lineClient),
      processJobReminders(env.DB, lineClient),
    );
  }
  jobs.push(checkAccountHealth(env.DB, {
    adminLineUserId: env.ADMIN_LINE_USER_ID,
    lineAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
  }));

  // Daily backup — run once per day at the first cron execution after 2:00 AM JST
  const r2 = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  if (r2) {
    const jstHour = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours();
    if (jstHour === 2) {
      jobs.push(runD1Backup(env.DB, r2));
    }
  }

  const results = await Promise.allSettled(jobs);
  const failures = results
    .map((r, i) => (r.status === 'rejected' ? { index: i, reason: r.reason } : null))
    .filter(Boolean);

  if (failures.length > 0) {
    console.error(`Cron: ${failures.length}/${results.length} jobs failed:`,
      failures.map(f => `[${f!.index}] ${f!.reason}`).join('; '));
  }
}

async function runD1Backup(db: D1Database, r2: R2Bucket): Promise<void> {
  try {
    const tables = [
      'friends', 'tags', 'friend_tags', 'auto_replies', 'scenarios', 'scenario_steps',
      'friend_scenarios', 'broadcasts', 'messages_log', 'line_accounts', 'user_profiles',
      'user_documents', 'favorite_nurseries', 'jobs', 'calendar_bookings', 'reviews',
      'cancellation_log',
    ];
    const backup: Record<string, unknown[]> = {};

    for (const table of tables) {
      try {
        const result = await db.prepare(`SELECT * FROM ${table}`).all();
        backup[table] = result.results;
      } catch {
        // Table may not exist yet — skip
        backup[table] = [];
      }
    }

    const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const dateStr = now.toISOString().slice(0, 10);
    const key = `backups/d1-backup-${dateStr}.json`;

    await r2.put(key, JSON.stringify(backup), {
      httpMetadata: { contentType: 'application/json' },
    });

    console.log(`D1 backup completed: ${key}`);
  } catch (err) {
    console.error('D1 backup failed:', err);
  }
}

export default {
  fetch: app.fetch,
  scheduled,
};
