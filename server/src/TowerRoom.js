import { Room } from 'colyseus';
import { GameState, PlayerState } from './schema.js';
import {
    getProfile, hasProfile, markDirty, saveProfiles, adoptGuestProgress, loadProfile, releaseProfile,
    topProfiles, recordSession, USE_DB,
} from './profiles.js';
import { sealProfile, openSave } from './saves.js';
import { verifyBloxityToken } from './bloxity.js';
import {
    CFG, LOBBY, STAGES, petById, boxById, rollBox, trailById, PASSES, PRODUCTS, priceOf,
    SPIN, rollSpin, GIFTS, DAILY, CODES, KITS, SKINS, dailyStatus, dayKey, rewardText, winsMult, equippedIds, petSlots, fmt, clamp,
} from '../../shared/config.js';
import { CHECKPOINTS, COINS, SUMMIT } from '../../shared/course.js';

const GREEN = '#7dff6b', RED = '#ff5a5a', GOLD = '#ffd028', BLUE = '#6fe0ff', PINK = '#ff8ad8';

// Empty string when the player left the name box blank
function cleanName(name) {
    return String(name || '').replace(/[^\w .\-]/g, '').trim().slice(0, 20);
}
const randomName = () => 'Player' + Math.floor(1000 + Math.random() * 9000);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
// Guest ids come from the browser; they can never claim a Bloxity identity
const guestUid = (uid, fallback) => String(uid || fallback).replace(/^legion_/, 'guest_').slice(0, 64);
const cleanAvatar = (av) => (typeof av === 'string' && av.length <= 2000 ? av : '');
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

export const liveRooms = new Set();

// One shared tower. Movement is client-side; everything that changes progress (Wins, climbs, pets,
// trails, gear, spins) is decided here. There are no real-money purchases: every price is in Wins,
// checked and taken by the server.
export class TowerRoom extends Room {
    maxClients = CFG.maxPlayers;

    onCreate() {
        liveRooms.add(this);
        this.setState(new GameState());
        this.setPatchRate(50);
        this.sessions = new Map();
        this.joinCount = 0;

        const on = (type, fn) => this.onMessage(type, (client, m) => { try { fn.call(this, client, m || {}); } catch (e) { console.warn('[msg]', type, e.message); } });
        on('move', this.onMove);
        on('cp', this.onCheckpoint);
        on('coin', this.onCoin);
        on('win', this.onWin);
        on('lobby', this.onLobby);
        on('fell', this.onFell);
        on('skip', this.onSkip);
        on('buy', this.onBuy);
        on('tool', this.onTool);
        on('hatch', this.onHatch);
        on('petEquip', this.onPetEquip);
        on('petBest', this.onPetBest);
        on('petDelete', this.onPetDelete);
        on('trail', this.onTrail);
        on('spin', this.onSpin);
        on('daily', this.onDaily);
        on('gift', this.onGift);
        on('code', this.onCode);
        on('vipChest', this.onVipChest);
        on('slap', this.onSlap);
        on('auth', this.onBloxityLogin);
        on('avatar', this.onAvatar);
        on('emote', this.onEmote);
        on('chat', this.onChat);
        on('friends', this.onFriends);

        this.setSimulationInterval((dt) => this.tick(dt), 1000);
        this.clock.setInterval(() => this.broadcastBoards(), 10000);
    }

    // A Bloxity token is verified with the Bloxity API; anyone else joins as a guest
    async onAuth(client, options) {
        const legion = options && options.token ? await verifyBloxityToken(options.token) : null;
        return legion ? { legion } : { guest: true };
    }

    async onJoin(client, options, auth) {
        options = options || {};
        const guest = guestUid(options.uid, client.sessionId);
        let uid = guest, name = cleanName(options.name);
        if (auth && auth.legion) {
            uid = 'legion_' + auth.legion.id;
            name = cleanName(auth.legion.name) || name;
            await adoptGuestProgress(uid, guest, name);
        }
        await loadProfile(uid);
        // A fresh server on a temporary disk restores the browser's signed backup.
        // With a database the profile is never lost, so backups are not accepted at all.
        const restore = !USE_DB && !hasProfile(uid) && openSave(options.save, [uid, guest]);
        const profile = getProfile(uid, name, randomName());
        if (restore) { Object.assign(profile, restore); markDirty(); }
        this.fixProfile(profile);
        const player = new PlayerState();
        player.name = profile.name;
        player.av = cleanAvatar(options.av);
        player.x = LOBBY.spawn.x; player.y = LOBBY.spawn.y; player.z = LOBBY.spawn.z; player.ry = 0;
        player.kit = this.joinCount % KITS.length;
        player.skin = (this.joinCount * 3) % SKINS.length;
        this.joinCount++;
        this.state.players.set(client.sessionId, player);
        const s = {
            client, profile, player,
            pos: { x: LOBBY.spawn.x, y: LOBBY.spawn.y, z: LOBBY.spawn.z },
            run: { cps: new Set(), coins: new Set(), start: 0 },
            joinedAt: Date.now(), lastWin: 0, giftClaimed: {}, friends: 0, guest, lastChat: 0, lastSlap: 0, playSecs: 0,
            stats: { fresh: Date.now() - (profile.firstPlay || 0) < 60000, maxStage: -1, climbs: 0, falls: 0, wins0: profile.totalWins, buys: 0 },
        };
        this.sessions.set(client.sessionId, s);
        this.syncPublic(client.sessionId);
        client.send('hello', { now: Date.now(), bloxity: uid.startsWith('legion_') });
        this.sendProfile(client.sessionId);
        this.broadcastBoards(client);
    }

    // Older saves / hand-edited data: keep every field the right shape
    fixProfile(p) {
        // Saves from the first build had Coins (spendable) and wins (= summit climbs)
        if (p.coins !== undefined) {
            if (!p.climbs) p.climbs = p.wins || 0;
            p.wins = p.coins || 0;
            p.totalWins = Math.max(p.totalWins || 0, p.totalCoins || 0);
            delete p.coins; delete p.totalCoins; delete p.donated; delete p.coinBoostUntil;
        }
        for (const k of ['wins', 'totalWins', 'climbs']) if (!finite(p[k])) p[k] = 0;
        if (p.passes && p.passes.DoubleCoins) { p.passes.DoubleWins = true; delete p.passes.DoubleCoins; }
        if (!Array.isArray(p.pets)) p.pets = [];
        p.pets = p.pets.filter((x) => x && petById[x.id]).slice(0, CFG.maxPets);
        if (!Array.isArray(p.equippedPets)) p.equippedPets = [];
        p.equippedPets = p.equippedPets.filter((u) => p.pets.some((x) => x.u === u)).slice(0, petSlots(p));
        if (!p.trails || typeof p.trails !== 'object') p.trails = { starter: true };
        if (!trailById[p.trail] || !p.trails[p.trail]) p.trail = 'starter';
        if (!p.gear || typeof p.gear !== 'object') p.gear = {};
        if (!p.passes || typeof p.passes !== 'object') p.passes = {};
        if (p.tool && !p.gear[p.tool]) p.tool = '';
        p.stage = clamp(Math.floor(finite(p.stage) ? p.stage : -1), -1, CHECKPOINTS.length - 1);
        if (!finite(p.spins)) p.spins = 0;
        if (!finite(p.spinAt)) p.spinAt = 0;
    }

    // A dropped connection keeps the player in the world for 30 s so the client can reconnect
    onDrop(client) {
        this.allowReconnection(client, 30);
    }
    onReconnect(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        s.client = client;
        client.send('hello', { now: Date.now(), bloxity: s.profile.uid.startsWith('legion_') });
        this.sendProfile(client.sessionId);
        this.broadcastBoards(client);
    }

    onLeave(client) {
        const s = this.sessions.get(client.sessionId);
        this.state.players.delete(client.sessionId);
        this.sessions.delete(client.sessionId);
        markDirty();
        if (!s) return;
        const st = s.stats;
        recordSession({
            at: new Date(), secs: Math.round((Date.now() - s.joinedAt) / 1000), fresh: st.fresh, maxStage: st.maxStage,
            endStage: s.profile.stage, climbs: st.climbs, falls: st.falls, wins: (s.profile.totalWins || 0) - (st.wins0 || 0), buys: st.buys,
        }).catch((e) => console.warn('[stats]', e.message));
        if (!isOnline(s.profile.uid)) releaseProfile(s.profile.uid, isOnline);
    }

    // Colyseus awaits this on SIGTERM, which is how Legion stops a pod on every deploy
    onDispose() { liveRooms.delete(this); markDirty(); return saveProfiles(); }

    // ----- helpers -----
    syncPublic(id) {
        const s = this.sessions.get(id);
        if (!s) return;
        const p = s.profile, pl = s.player;
        pl.wins = p.wins;
        pl.stage = p.stage;
        pl.tool = p.tool || '';
        pl.pets = equippedIds(p).join(',');
        pl.trail = p.trail || 'starter';
        pl.vip = !!(p.passes && p.passes.VIP);
        pl.name = p.name;
    }
    sendProfile(id) {
        const s = this.sessions.get(id);
        if (!s) return;
        const p = s.profile;
        s.client.send('profile', {
            wins: p.wins, totalWins: p.totalWins, climbs: p.climbs, playtime: p.playtime,
            stage: p.stage, maxStage: p.maxStage, best: p.best, pets: p.pets, equippedPets: p.equippedPets,
            trails: p.trails, trail: p.trail, gear: p.gear, tool: p.tool, passes: p.passes, starterPack: p.starterPack,
            boostUntil: p.boostUntil, spins: p.spins, spinAt: p.spinAt, daily: p.daily, codes: p.codes,
            vipClaimAt: p.vipClaimAt, firstPlay: p.firstPlay, freeBoxes: p.freeBoxes || {}, giftClaimed: s.giftClaimed, sessionSecs: s.playSecs,
            save: sealProfile(p),
        });
    }
    changed(id) { this.syncPublic(id); this.sendProfile(id); markDirty(); }
    toast(s, text, color) { s.client.send('toast', { text, color: color || '#ffffff' }); }
    mult(s) { return winsMult(s.profile, Date.now(), s.friends); }
    addWins(s, base, why, extra) {
        const n = Math.max(1, Math.round(base * this.mult(s)));
        s.profile.wins = (s.profile.wins || 0) + n;
        s.profile.totalWins = (s.profile.totalWins || 0) + n;
        s.client.send('earn', { n, why, ...(extra || {}) });
        return n;
    }

    // Every second: playtime, free spins
    tick() {
        for (const [id, s] of this.sessions) {
            const p = s.profile;
            p.playtime = (p.playtime || 0) + 1;
            s.playSecs++;
            if (p.spins < CFG.spinsMax) {
                p.spinAt = (p.spinAt || 0) + 1;
                if (p.spinAt >= CFG.spinMinutes * 60) {
                    p.spinAt = 0; p.spins++;
                    this.toast(s, '🎡 You got a free Spin!', PINK);
                    this.changed(id);
                }
            } else p.spinAt = 0;
        }
        markDirty();
    }

    // ----- movement & the climb -----
    onMove(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !finite(m.x) || !finite(m.y) || !finite(m.z)) return;
        const pl = s.player;
        pl.x = clamp(m.x, -80, 80); pl.y = clamp(m.y, -50, 400); pl.z = clamp(m.z, -80, 80);
        pl.ry = finite(m.ry) ? m.ry : 0;
        pl.anim = clamp(m.a | 0, 0, 4);
        s.pos = { x: pl.x, y: pl.y, z: pl.z };
        // Left the lobby floor: the climb clock starts
        if (!s.run.start && pl.y > 3) s.run.start = Date.now();
    }
    near(s, x, y, z, r, dy) { return dist2(s.pos, { x, z }) <= r * r && Math.abs(s.pos.y - y) <= dy; }

    onCheckpoint(client, m) {
        const s = this.sessions.get(client.sessionId);
        const cp = CHECKPOINTS[m.i | 0];
        if (!s || !cp || !this.near(s, cp.x, cp.y, cp.z, 11, 8)) return;
        const p = s.profile;
        if (!s.run.start) s.run.start = Date.now();
        if (cp.i > p.stage) { p.stage = cp.i; s.player.stage = cp.i; }
        p.maxStage = Math.max(p.maxStage || 0, cp.i + 1);
        s.stats.maxStage = Math.max(s.stats.maxStage, cp.i);
        if (!s.run.cps.has(cp.i)) {
            s.run.cps.add(cp.i);
            this.addWins(s, STAGES[cp.i].wins, 'cp', { i: cp.i });
        }
        this.changed(client.sessionId);
    }
    onCoin(client, m) {
        const s = this.sessions.get(client.sessionId);
        const c = COINS[m.i | 0];
        if (!s || !c || s.run.coins.has(c.i) || !this.near(s, c.x, c.y, c.z, 6, 7)) return;
        s.run.coins.add(c.i);
        this.addWins(s, CFG.pickupWins, 'coin', { i: c.i });
        this.changed(client.sessionId);
    }
    onWin(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !this.near(s, SUMMIT.x, SUMMIT.y, SUMMIT.z, SUMMIT.r + 3, 6)) return;
        const now = Date.now();
        const secs = s.run.start ? (now - s.run.start) / 1000 : 0;
        if (secs < CFG.minClimbSecs || now - s.lastWin < CFG.minClimbSecs * 1000) {
            this.toast(s, 'Climb the tower from the bottom to win!', BLUE);
            return;
        }
        const p = s.profile;
        s.lastWin = now;
        p.climbs = (p.climbs || 0) + 1;
        s.stats.climbs++;
        if (!p.best || secs < p.best) p.best = Math.round(secs);
        const n = this.addWins(s, CFG.summitWins, 'win');
        client.send('won', { climbs: p.climbs, secs: Math.round(secs), wins: n, best: p.best });
        this.broadcast('announce', { text: '🏆 ' + p.name + ' reached the top of ASMR Tower! (' + Math.round(secs) + 's)', color: GOLD }, { except: client });
        // A fresh climb: checkpoints and floating trophies pay again
        p.stage = -1;
        s.run = { cps: new Set(), coins: new Set(), start: 0 };
        this.changed(client.sessionId);
    }
    // Walked back into the lobby on purpose (lobby button): the run clock restarts, checkpoint kept
    onLobby(client) {
        const s = this.sessions.get(client.sessionId);
        if (s) s.run.start = 0;
    }
    onFell(client) {
        const s = this.sessions.get(client.sessionId);
        if (s) s.stats.falls++;
    }
    // Skip moves your checkpoint one up (the client teleports there)
    onSkip(client) { this.onBuy(client, { kind: 'product', key: 'Skip' }); }

    // ----- the Wins shop: the server checks the price, takes the Wins, then grants -----
    onBuy(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || (m.kind !== 'pass' && m.kind !== 'product')) return;
        const p = s.profile, key = String(m.key || '');
        const item = (m.kind === 'pass' ? PASSES : PRODUCTS)[key];
        if (!item) return;
        if (m.kind === 'pass' && p.passes[key]) return this.toast(s, item.name + ' already owned!', BLUE);
        if (key === 'StarterPack' && p.starterPack) return this.toast(s, 'Starter Pack already claimed!', BLUE);
        if (key === 'Skip' && p.stage >= CHECKPOINTS.length - 1) return this.toast(s, 'You are already at the last checkpoint!', BLUE);
        const price = priceOf(m.kind, key, p);
        if ((p.wins || 0) < price) return client.send('broke', { need: price - (p.wins || 0), price, name: item.name });
        p.wins -= price;
        this.grant({ ...s, id: client.sessionId }, m.kind, key);
    }
    grant(s, kind, key) {
        const client = s.client;
        const p = s.profile;
        if (s.stats) s.stats.buys++;
        if (kind === 'pass') {
            const pass = PASSES[key];
            if (!pass) return false;
            p.passes = p.passes || {};
            if (p.passes[key]) { this.toast(s, pass.name + ' already owned!', BLUE); return true; }
            p.passes[key] = true;
            if (pass.gear) { p.gear[pass.gear] = true; p.tool = pass.gear; }
            if (key === 'VIP') { p.trails.vip = true; p.trail = 'vip'; }
            this.toast(s, pass.ic + ' ' + pass.name + ' unlocked!', GREEN);
            client.send('fx', { kind: 'unlock', key });
        } else {
            const prod = PRODUCTS[key];
            if (!prod) return false;
            if (key === 'StarterPack') {
                if (p.starterPack) { this.toast(s, 'Starter Pack already claimed!', BLUE); return true; }
                p.starterPack = true;
                p.gear.speedCoil = true; p.passes.SpeedCoil = true; p.tool = p.tool || 'speedCoil';
                p.spins += 3;
                this.givePet(s, 'pinkSlime', true);
                this.toast(s, '🎁 Starter Pack: Speed Coil, 3 Spins and a Pink Slime!', GOLD);
            } else if (key === 'Skip') {
                if (p.stage >= CHECKPOINTS.length - 1) { this.toast(s, 'You are already at the last checkpoint!', BLUE); }
                else {
                    p.stage = p.stage + 1;
                    p.maxStage = Math.max(p.maxStage || 0, p.stage + 1);
                    if (s.run) { s.run.cps.add(p.stage); if (!s.run.start) s.run.start = Date.now(); }
                    client.send('skipTo', { i: p.stage });
                }
            } else if (key === 'NukeAll') {
                // Everyone else in the buyer's room falls back to the lobby
                if (s.id && this.broadcast) {
                    this.broadcast('nuke', { by: p.name, s: s.id }, { except: client });
                    this.toast(s, '☢️ You nuked everyone!', '#c8ff2a');
                    client.send('nukeSent', {});
                }
            } else if (key === 'WinsBoost') {
                p.boostUntil = Math.max(Date.now(), p.boostUntil || 0) + CFG.boostMinutes * 60000;
                this.toast(s, '⏱️ x2 Wins for ' + CFG.boostMinutes + ' minutes!', GOLD);
            } else if (prod.spins) {
                p.spins += prod.spins;
                this.toast(s, '+' + prod.spins + ' Spins!', PINK);
            }
            client.send('fx', { kind: 'confetti', key });
        }
        this.changed(s.id);
        return true;
    }

    // ----- gear -----
    onTool(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const id = String(m.id || '');
        if (id && !s.profile.gear[id]) return;
        s.profile.tool = id;
        this.changed(client.sessionId);
    }
    onSlap(client, m) {
        const s = this.sessions.get(client.sessionId);
        const t = this.sessions.get(String(m.t || ''));
        const now = Date.now();
        if (!s || !t || t === s || s.profile.tool !== 'slap' || now - s.lastSlap < CFG.slapCooldown * 1000 * 0.8) return;
        if (dist2(s.pos, t.pos) > (CFG.slapRange + 3) ** 2 || Math.abs(s.pos.y - t.pos.y) > 7) return;
        s.lastSlap = now;
        const dx = t.pos.x - s.pos.x, dz = t.pos.z - s.pos.z, l = Math.hypot(dx, dz) || 1;
        t.client.send('slapped', { dx: dx / l, dz: dz / l, by: s.profile.name });
        this.broadcast('slapFx', { s: client.sessionId, t: String(m.t) });
    }

    // ----- pets -----
    givePet(s, id, equip) {
        const p = s.profile;
        if (p.pets.length >= CFG.maxPets) return null;
        p.petSeq = (p.petSeq || 0) + 1;
        const pet = { u: p.petSeq, id };
        p.pets.push(pet);
        if (equip && p.equippedPets.length < petSlots(p)) p.equippedPets.push(pet.u);
        return pet;
    }
    onHatch(client, m) {
        const s = this.sessions.get(client.sessionId);
        const box = boxById[m.box];
        if (!s || !box) return;
        const p = s.profile, n = m.n === 3 ? 3 : 1;
        if (m.free) {
            // A free box from spins, gifts or the daily reward: they're queued on the profile
            p.freeBoxes = p.freeBoxes || {};
            if (!(p.freeBoxes[box.id] > 0)) return;
            if (p.pets.length >= CFG.maxPets) return this.toast(s, 'Your pet inventory is full! Delete some pets first.', RED);
            p.freeBoxes[box.id]--;
            this.hatchOut(s, box, 1);
            return;
        }
        const cost = box.price * n;
        if (p.wins < cost) return client.send('broke', { need: cost - p.wins, price: cost, name: box.name });
        if (p.pets.length + n > CFG.maxPets) return this.toast(s, 'Your pet inventory is full! Delete some pets first.', RED);
        p.wins -= cost;
        this.hatchOut(s, box, n);
    }
    hatchOut(s, box, n) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const id = rollBox(box, Math.random);
            out.push(this.givePet(s, id, true));
        }
        s.client.send('hatched', { box: box.id, pets: out.filter(Boolean) });
        const best = out.filter(Boolean).map((x) => petById[x.id]).sort((a, b) => b.mult - a.mult)[0];
        if (best && (best.rarity === 'legendary' || best.rarity === 'mythic')) {
            this.broadcast('announce', { text: '✨ ' + s.profile.name + ' hatched a ' + best.name + '!', color: GOLD });
        }
        this.changed(s.client.sessionId);
    }
    onPetEquip(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, u = m.u | 0;
        if (!p.pets.some((x) => x.u === u)) return;
        if (m.on) {
            if (p.equippedPets.includes(u)) return;
            if (p.equippedPets.length >= petSlots(p)) return this.toast(s, 'You can equip ' + petSlots(p) + ' pets at a time' + (p.passes.VIP ? '' : ' (VIP: 4)'), BLUE);
            p.equippedPets.push(u);
        } else p.equippedPets = p.equippedPets.filter((x) => x !== u);
        this.changed(client.sessionId);
    }
    onPetBest(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile;
        p.equippedPets = [...p.pets].sort((a, b) => petById[b.id].mult - petById[a.id].mult).slice(0, petSlots(p)).map((x) => x.u);
        this.toast(s, 'Equipped your best pets!', GREEN);
        this.changed(client.sessionId);
    }
    onPetDelete(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, list = Array.isArray(m.u) ? m.u.map((x) => x | 0) : [m.u | 0];
        p.pets = p.pets.filter((x) => !list.includes(x.u));
        p.equippedPets = p.equippedPets.filter((u) => !list.includes(u));
        this.changed(client.sessionId);
    }

    // ----- trails -----
    onTrail(client, m) {
        const s = this.sessions.get(client.sessionId);
        const d = trailById[m.id];
        if (!s || !d) return;
        const p = s.profile;
        if (!p.trails[d.id]) {
            if (d.vip) return this.toast(s, 'The VIP Gold trail comes with VIP!', GOLD);
            if (p.wins < d.price) return client.send('broke', { need: d.price - p.wins, price: d.price, name: d.name });
            p.wins -= d.price;
            p.trails[d.id] = true;
            this.toast(s, d.name + ' unlocked!', GREEN);
        }
        p.trail = d.id;
        this.changed(client.sessionId);
    }

    // ----- rewards -----
    giveReward(s, r) {
        const p = s.profile;
        if (r.wins) { p.wins += r.wins; p.totalWins += r.wins; }
        if (r.spins) p.spins += r.spins;
        if (r.boost) p.boostUntil = Math.max(Date.now(), p.boostUntil || 0) + CFG.boostMinutes * 60000;
        if (r.box) {
            p.freeBoxes = p.freeBoxes || {};
            p.freeBoxes[r.box] = (p.freeBoxes[r.box] || 0) + 1;
            s.client.send('freeBox', { box: r.box });
        }
    }
    onSpin(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile;
        if (p.spins <= 0) return this.toast(s, 'No spins left! You get a free one every ' + CFG.spinMinutes + ' minutes.', BLUE);
        p.spins--;
        const i = rollSpin(Math.random);
        client.send('spinResult', { i });
        // Paid when the wheel stops on the client (about 4 s); the server doesn't wait for it
        this.clock.setTimeout(() => {
            if (!this.sessions.has(client.sessionId)) { this.giveReward(s, SPIN[i]); markDirty(); return; }
            this.giveReward(s, SPIN[i]);
            this.changed(client.sessionId);
        }, 4200);
        this.changed(client.sessionId);
    }
    onDaily(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, now = Date.now();
        const st = dailyStatus(p.daily, now);
        if (!st.can) return this.toast(s, 'Come back tomorrow for more!', BLUE);
        const r = DAILY[st.day];
        p.daily = { last: dayKey(now), streak: st.streak + 1 };
        this.giveReward(s, r);
        this.toast(s, 'Day ' + p.daily.streak + ' reward: ' + rewardText(r) + '!', GREEN);
        client.send('fx', { kind: 'confetti' });
        this.changed(client.sessionId);
    }
    onGift(client, m) {
        const s = this.sessions.get(client.sessionId);
        const k = m.k | 0, g = GIFTS[k];
        if (!s || !g || s.giftClaimed[k]) return;
        if (s.playSecs < g.min * 60 - 2) return this.toast(s, 'Keep playing to unlock this gift!', BLUE);
        s.giftClaimed[k] = true;
        this.giveReward(s, g);
        this.toast(s, '🎁 ' + rewardText(g) + '!', GREEN);
        client.send('fx', { kind: 'confetti' });
        this.changed(client.sessionId);
    }
    onCode(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const code = String(m.code || '').trim().toUpperCase().slice(0, 24);
        const r = CODES[code];
        const p = s.profile;
        p.codes = p.codes || {};
        if (!r) return client.send('codeResult', { ok: false, text: 'Invalid code' });
        if (p.codes[code]) return client.send('codeResult', { ok: false, text: 'Code already used' });
        p.codes[code] = true;
        this.giveReward(s, r);
        client.send('codeResult', { ok: true, text: rewardText(r) + '!' });
        this.changed(client.sessionId);
    }
    onVipChest(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, now = Date.now();
        if (!p.passes.VIP) return this.toast(s, 'The VIP chest is for VIPs only!', GOLD);
        if (now - (p.vipClaimAt || 0) < CFG.vipChestMinutes * 60000) return this.toast(s, 'The VIP chest refills every ' + CFG.vipChestMinutes + ' minutes', BLUE);
        p.vipClaimAt = now;
        this.addWins(s, CFG.vipChestWins, 'vip');
        client.send('fx', { kind: 'confetti' });
        this.changed(client.sessionId);
    }

    broadcastBoards(client) {
        const row = (key) => topProfiles(key).filter((p) => (p[key] || 0) > 0).map((p) => ({ n: p.name, v: Math.floor(p[key] || 0) }));
        const m = { wins: row('totalWins'), playtime: row('playtime'), climbs: row('climbs') };
        if (client) client.send('boards', m); else this.broadcast('boards', m);
    }

    // ----- Bloxity -----
    // Logged in to Bloxity after joining: move this session onto the Bloxity profile
    async onBloxityLogin(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || s.authing) return;
        s.authing = true;
        const legion = await verifyBloxityToken(m.token);
        s.authing = false;
        if (!legion || !this.sessions.has(client.sessionId)) return;
        const uid = 'legion_' + legion.id;
        if (s.profile.uid === uid) return;
        const name = cleanName(legion.name) || s.profile.name;
        const guestProfile = s.profile;
        await adoptGuestProgress(uid, guestProfile.uid, name);
        await loadProfile(uid);
        if (!this.sessions.has(client.sessionId)) return;
        s.profile = getProfile(uid, name, randomName());
        this.fixProfile(s.profile);
        if (!isOnline(guestProfile.uid)) releaseProfile(guestProfile.uid, isOnline);
        s.player.name = s.profile.name;
        this.changed(client.sessionId);
        client.send('authed', { name: s.profile.name });
        this.toast(s, 'Logged in as ' + s.profile.name, GREEN);
        this.broadcastBoards();
    }
    onAvatar(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (s && m) s.player.av = cleanAvatar(m.av);
    }
    // Emote ids are opaque catalogue ids; other players play the same clip
    onEmote(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || typeof m.id !== 'string' || m.id.length > 40) return;
        this.broadcast('emote', { s: client.sessionId, id: m.id }, { except: client });
    }
    onChat(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || typeof m.text !== 'string') return;
        const now = Date.now();
        if (now - s.lastChat < 800) return;
        s.lastChat = now;
        const text = m.text.replace(/\s+/g, ' ').trim().slice(0, 120);
        if (text) this.broadcast('chat', { s: client.sessionId, name: s.profile.name, vip: !!s.profile.passes.VIP, text });
    }
    // Friend Boost: the client counts its Bloxity friends among the names in this room.
    // Only names actually present here are counted, and the bonus is capped.
    onFriends(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || !Array.isArray(m.names)) return;
        const here = new Set([...this.sessions.values()].filter((o) => o !== s).map((o) => o.profile.name));
        const n = new Set(m.names.slice(0, 50).map(String).filter((x) => here.has(x))).size;
        const friends = Math.min(CFG.friendMax, n);
        if (friends === s.friends) return;
        s.friends = friends;
        s.player.friends = friends;
    }
}

function isOnline(uid) {
    for (const room of liveRooms) for (const s of room.sessions.values()) if (s.profile.uid === uid) return true;
    return false;
}
