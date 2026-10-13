import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config, { listen } from '@colyseus/tools';
import { defineRoom } from 'colyseus';
import express from 'express';
import { TowerRoom, grantPurchase } from './TowerRoom.js';
import { WEBHOOK_SECRET, installStatReporter } from './bloxity.js';
import { saveProfiles, firstDelivery } from './profiles.js';
import { statsSummary } from './stats.js';
import { skuLookup } from '../../shared/config.js';

// Serves the built client (client/dist) and the game room on the same port,
// so one Node host is enough to run the whole game.
const CLIENT_DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');

// Play stats are private: /api/stats needs ?key=<stats key>. Only the key's SHA-256 lives in the
// public repo (the key itself is in server/STATS_KEY.local.txt); locally (not on Legion) they're open.
const STATS_KEY_SHA256 = 'bf7ffa2aeead29f7baa9eef6903d76d224cb17cde05748b7cfef65d872d53aa0';
const ON_LEGION = !!process.env.BLOXITY_GAME_ID;
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest();
const keyOk = (key) => !!key && crypto.timingSafeEqual(sha256(key), Buffer.from(STATS_KEY_SHA256, 'hex'));

// Bloxity calls this after deducting Bux; answer 2xx within 10 s or the Bux are refunded
async function buxWebhook(req, res) {
    if (WEBHOOK_SECRET && req.get('x-legion-webhook-secret') !== WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'bad secret' });
    }
    const b = req.body || {};
    const item = skuLookup(b.sku);
    if (!b.transactionId || !b.userId || !item) return res.status(400).json({ error: 'unknown purchase' });
    const tx = String(b.transactionId);
    try {
        if (!(await firstDelivery(tx))) return res.json({ ok: true, duplicate: true });
    } catch (e) {
        // Database down: a non-2xx makes Bloxity refund instead of charging for nothing
        console.warn('[Bux]', tx, e.message);
        return res.status(503).json({ error: 'storage unavailable' });
    }
    const ok = await grantPurchase('legion_' + b.userId, String(b.username || '').slice(0, 20), item.kind, item.key, tx).catch(() => false);
    saveProfiles();
    console.log('[Bux]', b.transactionId, b.username, b.sku, ok ? 'granted' : 'rejected');
    return ok ? res.json({ ok: true }) : res.status(400).json({ error: 'grant failed' });
}

const app = config({
    rooms: {
        tower: defineRoom(TowerRoom),
    },
    initializeExpress: (expressApp) => {
        expressApp.get('/health', (req, res) => res.json({ ok: true }));
        expressApp.post('/api/legion-webhook', express.json({ limit: '32kb' }), buxWebhook);
        // Play stats (aggregate, no names): /api/stats?key=<stats key>&days=7
        expressApp.get('/api/stats', async (req, res) => {
            const key = typeof req.query.key === 'string' ? req.query.key : '';
            if (ON_LEGION && !keyOk(key)) return res.status(401).json({ error: 'bad key' });
            const days = Math.min(60, Math.max(1, Number(req.query.days) || 7));
            try { res.json(await statsSummary(days)); } catch (e) { res.status(503).json({ error: e.message }); }
        });
        if (fs.existsSync(CLIENT_DIST)) expressApp.use(express.static(CLIENT_DIST));
    },
});

const reporter = installStatReporter();
process.once('beforeExit', () => { reporter.flush(); });

// 2605 locally so this game can run beside the other Legion games; Legion sets PORT
listen(app, Number(process.env.PORT) || 2605);
