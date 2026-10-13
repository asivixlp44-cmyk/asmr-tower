// HUD and panels: Wins, the six tiles (Store, Pets, Worlds, Trails, Config, Boxes), Spin / Invite /
// Gift / Day, Nuke All, the progress bar and Skip, Friend Boost, the gear hotbar, the "Oops! You
// fell?" card, gear pad popups, the win banner, the lucky wheel, pet hatching and every panel.
import { $ } from './engine.js';
import { S, actions, net } from './state.js';
import { sfx, setMusicDuck, getVolumes, setVolume } from './audio.js';
import * as BX from './bloxity.js';
import { petThumb, petThumbLater, thumbReady } from './pets.js';
import { getQuality, setQuality } from './fx.js';
import {
    CFG, STAGES, DIFFS, PETS, petById, RARITY, BOXES, boxById, TRAILS, trailById, GEAR, gearById, PASSES, PRODUCTS, priceOf,
    SPIN, GIFTS, DAILY, dailyStatus, rewardText, winsMult, petSlots, equippedIds, passForGear, fmt, fmtComma, clock, playtimeText,
} from '../../shared/config.js';
import { CHECKPOINTS } from '../../shared/course.js';

const C = (n) => '<span class="cup">🏆</span>' + fmt(n);
function setHtml(node, html) { if (node && node.innerHTML !== html) node.innerHTML = html; }
function setText(node, t) { if (node && node.textContent !== t) node.textContent = t; }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const promptEl = $('#promptBtn'), promptTxtEl = $('#promptTxt');

// Every button clicks
document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b) sfx(b.classList.contains('g-green') ? 'clickBuy' : 'click'); }, true);

// ----- Wins counter (counts up smoothly) -----
let shownCoins = 0;
export function animateCounters(dt) {
    if (Math.abs(shownCoins - S.wins) < 0.5) shownCoins = S.wins;
    else shownCoins += (S.wins - shownCoins) * Math.min(1, dt * 8);
    setText($('#coinVal'), fmtComma(Math.round(shownCoins)));
}
export function bumpCoins() { const p = $('#coinPill'); p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump'); }

// ----- HUD refresh (10x a second) -----
export function updateHud() {
    const now = net.now();
    const spins = S.spins || 0;
    $('#spinBadge').hidden = spins <= 0; setText($('#spinBadge'), String(spins));
    // Gift: minutes until the next unclaimed playtime gift
    const secs = sessionSecs();
    const next = GIFTS.findIndex((g, k) => !S.giftClaimed[k]);
    const ready = GIFTS.some((g, k) => !S.giftClaimed[k] && secs >= g.min * 60);
    $('#giftBadge').hidden = !ready;
    setText($('#giftLb'), ready ? 'READY' : next < 0 ? 'DONE' : Math.max(1, Math.ceil((GIFTS[next].min * 60 - secs) / 60)) + 'm');
    $('#dailyBadge').hidden = !dailyStatus(S.daily, now).can;
    // Starter Pack: a 30-minute offer from when you first played
    const left = CFG.starterPackMinutes * 60 - (Date.now() - S.joinedAt) / 1000;
    $('#starter').hidden = !!S.starterPack;
    setText($('#starterTime'), clock(left > 0 ? left : 0));
    $('#boostTag').hidden = !((S.boostUntil || 0) > now || (S.passes && S.passes.DoubleWins));
    setText($('#friendBoost'), 'Friend Boost: ' + Math.round(Math.min(CFG.friendMax, S.friends || 0) * CFG.friendBoost * 100) + '%');
    const free = Object.values(S.freeBoxes || {}).reduce((a, b) => a + b, 0);
    $('#boxBadge').hidden = free <= 0; setText($('#boxBadge'), String(free));
    $('#skipBtn').hidden = (S.stage ?? -1) >= CHECKPOINTS.length - 1;
}
const sessionSecs = () => (S.sessionSecs || 0) + (Date.now() - S.profileAt) / 1000;

// ----- toasts, banners -----
export function toast(text, color) {
    const d = document.createElement('div');
    d.className = 'toast o';
    d.style.color = color || '#fff';
    d.textContent = text;
    const box = $('#toasts');
    box.appendChild(d);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => d.remove(), 2900);
}
let titleTimer;
export function showStageTitle(i) {
    const s = STAGES[i];
    if (!s) return;
    setText($('#stageName'), 'Stage ' + (i + 1) + ': ' + s.name);
    const d = DIFFS[s.diff];
    setHtml($('#stageSub'), `<span class="diff" style="background:${d.color}">${d.label}</span> ${esc(s.sub)}${s.wins ? ' · <span class="cup">🏆</span>+' + s.wins : ''}`);
    const t = $('#stageTitle');
    t.style.opacity = 1;
    clearTimeout(titleTimer);
    titleTimer = setTimeout(() => { t.style.opacity = 0; }, 2600);
}
export function showWin(m) {
    setText($('#winSub'), '+' + fmt(m.wins) + ' Wins · climb #' + m.climbs + ' · ' + m.secs + 's' + (m.best && m.best === m.secs ? ' (new best!)' : ''));
    $('#winBanner').hidden = false;
    setTimeout(() => { $('#winBanner').hidden = true; }, 3800);
}
let clearTimer;
export function showStageClear(i, n) {
    const s = STAGES[i], next = STAGES[i + 1];
    setText($('#clearT'), 'STAGE ' + (i + 1) + ' CLEAR!');
    const d = next && DIFFS[next.diff];
    setHtml($('#clearS'), '<span class="cup">🏆</span>+' + fmt(n) + ' Wins' + (d ? ' · next: <span class="diff" style="background:' + d.color + '">' + d.label + '</span>' : ''));
    const b = $('#clearBanner');
    b.hidden = false; b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => { b.hidden = true; }, 1900);
    void s;
}
export function showOof() { const o = $('#oof'); o.hidden = false; setTimeout(() => { o.hidden = true; }, 900); }
export function flash(color, ms) {
    const f = $('#flash');
    f.style.transition = 'none'; f.style.background = color || '#fff'; f.style.opacity = 0.9;
    requestAnimationFrame(() => { f.style.transition = 'opacity ' + ((ms || 600) / 1000) + 's ease'; f.style.opacity = 0; });
}
export function teleportFx() { const t = $('#tpFx'); t.classList.remove('go'); void t.offsetWidth; t.classList.add('go'); }

// ----- "Oops! You fell?" -----
let oopsTimer = null, oopsUntil = 0;
export function showOops(text, title) {
    if (S.stage < 0) return;
    setText($('#oopsTitle'), title || 'Oops! You fell?');
    setText($('#oopsText'), text || 'Return to your last checkpoint for free.');
    $('#oops').hidden = false;
    oopsUntil = Date.now() + 15000;
    clearInterval(oopsTimer);
    oopsTimer = setInterval(() => {
        const k = Math.max(0, (oopsUntil - Date.now()) / 15000);
        $('#oopsTimer').style.width = (k * 100) + '%';
        if (k <= 0) hideOops();
    }, 100);
}
export function hideOops() { $('#oops').hidden = true; clearInterval(oopsTimer); }
$('#oopsTp').addEventListener('click', () => { hideOops(); actions.teleportCheckpoint(); });
$('#oopsClose').addEventListener('click', hideOops);
export const oopsOpen = () => !$('#oops').hidden;

// ----- gear pad popup -----
let gearPopId = null, gearPopTimer;
export function showGearPop(id) {
    const g = gearById[id], pass = PASSES[passForGear(id)];
    gearPopId = id;
    setText($('#gpIc'), g.ic); setText($('#gpName'), g.name); setText($('#gpDesc'), g.desc + '.');
    setHtml($('#gpBuy'), S.gear[id] ? (S.tool === id ? 'Unequip' : 'Equip') : C(pass.price));
    $('#gearPop').hidden = false;
    clearTimeout(gearPopTimer);
    gearPopTimer = setTimeout(() => { $('#gearPop').hidden = true; }, 7000);
}
$('#gpBuy').addEventListener('click', () => {
    $('#gearPop').hidden = true;
    if (!gearPopId) return;
    if (S.gear[gearPopId]) actions.equip(gearPopId); else buy('pass', passForGear(gearPopId));
});
$('#gpClose').addEventListener('click', () => { $('#gearPop').hidden = true; });

// ----- hotbar (gear you own) -----
let hotKey = '';
export function renderHotbar() {
    const owned = GEAR.filter((g) => S.gear[g.id]);
    const key = owned.map((g) => g.id).join(',') + '|' + S.tool;
    if (key === hotKey) return;
    hotKey = key;
    const bar = $('#hotbar');
    bar.innerHTML = '';
    owned.forEach((g, i) => {
        const b = document.createElement('button');
        b.className = 'slot' + (S.tool === g.id ? ' on' : '');
        b.innerHTML = `<span class="n o1">${i + 1}</span>${g.ic}<span class="nm o1">${esc(g.name)}</span>`;
        b.title = g.name + ' (' + (i + 1) + ')';
        b.addEventListener('click', () => actions.equip(g.id));
        bar.appendChild(b);
    });
}
export const hotbarGear = () => GEAR.filter((g) => S.gear[g.id]);
export function setFuel(k, show) {
    $('#fuel').hidden = !show;
    if (show) $('#fuelF').style.width = Math.round(Math.max(0, Math.min(1, k)) * 100) + '%';
}

// ----- the progress bar: every player's height up the tower -----
{
    const bar = $('#progBar');
    STAGES.forEach((s) => { const d = document.createElement('div'); d.className = 'seg'; d.style.background = '#' + s.bar.toString(16).padStart(6, '0'); bar.appendChild(d); });
}
const markEls = new Map();
// list: [{ id, name, k (0..1), me, color }]
export function renderProgress(list) {
    const box = $('#progMarks'), H = $('#progress').clientHeight;
    const seen = new Set();
    for (const p of list) {
        seen.add(p.id);
        let el = markEls.get(p.id);
        if (!el) {
            el = document.createElement('div');
            el.className = 'mk o1' + (p.me ? ' me' : '');
            el.style.background = p.color;
            el.textContent = (p.name || '?').slice(0, 1).toUpperCase();
            el.title = p.name;
            box.appendChild(el); markEls.set(p.id, el);
        }
        el.style.top = Math.round((1 - p.k) * H) + 'px';
        if (p.me) $('#progArrow').style.top = Math.round((1 - p.k) * H) + 'px';
    }
    for (const [id, el] of markEls) if (!seen.has(id)) { el.remove(); markEls.delete(id); }
}

// =====================================================================================
// Purchases: everything costs Wins. A confirm shows the price; the server checks it and takes
// the Wins.
// =====================================================================================
let pendingBuy = null;
export function buy(kind, key) {
    const item = kind === 'pass' ? PASSES[key] : PRODUCTS[key];
    if (!item) return;
    if (kind === 'pass' && S.passes[key]) { toast(item.name + ' already owned!', '#6fe0ff'); if (item.gear) actions.equip(item.gear); return; }
    if (key === 'StarterPack' && S.starterPack) { toast('Starter Pack already claimed!', '#6fe0ff'); return; }
    pendingBuy = { kind, key };
    const price = priceOf(kind, key, S);
    const short = price - (S.wins || 0);
    setText($('#confirmIc'), item.ic || '🛒');
    setText($('#confirmTitle'), item.name);
    setText($('#confirmText'), item.desc || '');
    setHtml($('#confirmCost'), C(price) + ' Wins');
    const yes = $('#confirmYes');
    yes.disabled = short > 0;
    setText(yes, short > 0 ? 'Need ' + fmt(short) + ' more' : 'Buy');
    setText($('#confirmNote'), short > 0 ? 'Climb the tower to earn Wins: every checkpoint pays more the higher you go!' : 'You have ' + fmtComma(S.wins) + ' Wins');
    $('#confirm').hidden = false;
    setMusicDuck(true);
}
// The server said you can't afford it (prices can change while the dialog is open)
export function notEnough(m) { toast('Not enough Wins! You need ' + fmt(m.need) + ' more for ' + m.name, '#ff5a5a'); }
function closeConfirm() { $('#confirm').hidden = true; pendingBuy = null; if (!modalOpen()) setMusicDuck(false); }
$('#confirmYes').addEventListener('click', () => { const p = pendingBuy; closeConfirm(); if (p) net.send('buy', p); });
$('#confirmNo').addEventListener('click', closeConfirm);
$('#confirmClose').addEventListener('click', closeConfirm);

// =====================================================================================
// Panels
// =====================================================================================
let modalKind = null, modalTab = null;
export function openModal(kind, tab) { modalKind = kind; modalTab = tab || null; renderModal(); $('#modal').hidden = false; setMusicDuck(true); }
export function closeModal() { $('#modal').hidden = true; modalKind = null; setMusicDuck(false); }
export function refreshModal() { if (!$('#modal').hidden) renderModal(); }
export const modalOpen = () => !$('#modal').hidden;
$('#modalClose').addEventListener('click', closeModal);
$('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal') closeModal(); });

function el(tag, cls, html) { const d = document.createElement(tag); if (cls) d.className = cls; if (html !== undefined) d.innerHTML = html; return d; }
function sec(body, text) { body.appendChild(el('div', 'sec o1', esc(text))); }
function note(body, text) { body.appendChild(el('p', 'note o1', text)); }
function card(o) {
    const d = el('div', 'card' + (o.cls ? ' ' + o.cls : ''));
    d.innerHTML = `<div class="ic">${o.ic}</div><div class="nm o1">${esc(o.name)}</div>${o.desc ? `<div class="ds o1">${esc(o.desc)}</div>` : ''}`;
    if (o.btn) {
        const b = el('button', 'btn ' + (o.btnCls || 'g-green') + ' o1', o.btn);
        b.disabled = !!o.disabled;
        b.addEventListener('click', o.onClick);
        d.appendChild(b);
    }
    return d;
}
function tabs(list) {
    const t = $('#modalTabs');
    t.innerHTML = '';
    if (!list) return;
    for (const [id, label] of list) {
        const b = el('button', 'btn g-purple o1' + (modalTab === id ? ' on' : ''), label);
        b.addEventListener('click', () => { modalTab = id; renderModal(); });
        t.appendChild(b);
    }
}
function renderModal() {
    const body = $('#modalBody');
    const scroll = body.scrollTop;
    body.innerHTML = '';
    const titles = { store: 'STORE!', pets: 'PETS', worlds: 'WORLDS', trails: 'TRAILS', config: 'CONFIG', boxes: 'BOXES', gifts: 'GIFTS', invite: 'INVITE', teleport: 'TELEPORT' };
    setText($('#modalTitle'), titles[modalKind] || '');
    tabs(null);
    ({ store: renderStore, pets: renderPets, worlds: renderWorlds, trails: renderTrails, config: renderConfig, boxes: renderBoxes, gifts: renderGifts, invite: renderInvite, teleport: renderTeleport }[modalKind] || (() => {}))(body);
    body.scrollTop = scroll;
}

// ----- Store -----
function passCard(key, cls) {
    const p = PASSES[key], own = !!S.passes[key];
    return card({ ic: p.ic, name: p.name, desc: p.desc, cls: (cls || '') + (own ? ' own' : ''), btn: own ? (p.gear ? (S.tool === p.gear ? 'Equipped' : 'Equip') : 'Owned') : C(p.price), btnCls: own ? 'g-blue' : S.wins >= p.price ? 'g-green' : 'g-grey', disabled: own && !p.gear, onClick: () => (own && p.gear ? actions.equip(p.gear) : buy('pass', key)) });
}
function prodCard(key, cls) {
    const p = PRODUCTS[key];
    const price = priceOf('product', key, S);
    return card({ ic: p.ic, name: p.name, desc: p.desc, cls, btn: (p.was ? `<span class="was">${fmt(p.was)}</span>` : '') + C(price), btnCls: S.wins >= price ? 'g-green' : 'g-grey', onClick: () => buy('product', key) });
}
function renderStore(body) {
    tabs([['featured', '⭐ Featured'], ['gear', '🌀 Gear'], ['boosts', '⏱️ Boosts'], ['more', '✨ More']]);
    const tab = modalTab || 'featured';
    const g = el('div', 'grid');
    if (tab === 'featured') {
        if (!S.starterPack) g.appendChild(prodCard('StarterPack', 'hot'));
        g.appendChild(passCard('VIP', 'vip'));
        g.appendChild(passCard('MagicCarpet', 'carpet'));
        g.appendChild(passCard('Jetpack'));
        g.appendChild(passCard('GrappleHook'));
        g.appendChild(passCard('SlapTool'));
        g.appendChild(passCard('DoubleWins'));
    } else if (tab === 'gear') {
        for (const k of ['SpeedCoil', 'GravityCoil', 'SlapTool', 'SuperCoil', 'GrappleHook', 'Jetpack', 'MagicCarpet']) g.appendChild(passCard(k, k === 'MagicCarpet' ? 'carpet' : ''));
    } else if (tab === 'boosts') {
        g.appendChild(prodCard('WinsBoost'));
        g.appendChild(passCard('DoubleWins'));
        g.appendChild(prodCard('Spins5'));
    } else {
        g.appendChild(prodCard('Skip'));
        g.appendChild(prodCard('NukeAll'));
        g.appendChild(passCard('VIP', 'vip'));

    }
    body.appendChild(g);
    note(body, 'Everything is bought with Wins. Earn them at every checkpoint (more on the harder stages) and at the top of the tower!');
}

// ----- Pets -----
const thumbImg = (url) => (url ? `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:contain">` : '🟢');
function petIcon(def) {
    if (thumbReady(def.id)) return thumbImg(petThumb(def));
    petThumbLater(def, (url) => { document.querySelectorAll('[data-thumb="' + def.id + '"]').forEach((n) => { n.innerHTML = thumbImg(url); }); });
    return `<span data-thumb="${def.id}" style="display:contents">⏳</span>`;
}
function renderPets(body) {
    const eq = new Set(S.equippedPets || []);
    const mult = winsMult({ ...S, passes: {}, boostUntil: 0 }, 0, 0);
    const top = el('div', 'row');
    top.innerHTML = `<span class="ic">🐾</span><span class="tx"><b class="o1">Equipped ${eq.size}/${petSlots(S)} · Wins x${(Math.round(mult * 100) / 100)}</b><small class="o1">${S.pets.length}/${CFG.maxPets} pets · click a pet to equip or unequip it</small></span>`;
    const best = el('button', 'btn g-green o1', 'Equip Best');
    best.addEventListener('click', () => net.send('petBest'));
    top.appendChild(best);
    body.appendChild(top);
    if (!S.pets.length) {
        note(body, 'No pets yet! Open a Box to hatch your first squishy pet. Pets multiply the Wins you earn.');
        const b = el('button', 'btn g-purple o', 'Open Boxes');
        b.addEventListener('click', () => openModal('boxes'));
        body.appendChild(b);
        return;
    }
    const grid = el('div', 'petgrid');
    const list = [...S.pets].sort((a, b) => (eq.has(b.u) - eq.has(a.u)) || petById[b.id].mult - petById[a.id].mult);
    for (const p of list) {
        const d = petById[p.id], on = eq.has(p.u), r = RARITY[d.rarity];
        const c = el('div', 'pet' + (on ? ' on' : ''));
        c.innerHTML = `${on ? '<span class="chk">✅</span>' : ''}<div class="ic" style="background:radial-gradient(circle,${r.color}55,transparent 70%)">${petIcon(d)}</div><div class="nm o1">${esc(d.name)}</div><div class="rr o1" style="color:${r.color}">${r.name}</div><div class="m o1">x${d.mult}</div>`;
        c.addEventListener('click', () => net.send('petEquip', { u: p.u, on: !on }));
        c.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!on && confirm('Delete ' + d.name + '?')) net.send('petDelete', { u: p.u }); });
        grid.appendChild(c);
    }
    body.appendChild(grid);
    note(body, 'Right-click (long-press) an unequipped pet to delete it.');
}

// ----- Boxes -----
function renderBoxes(body) {
    note(body, 'Hatch squishy pets with Wins! Equipped pets multiply every Win you earn.');
    for (const box of BOXES) {
        const total = box.drops.reduce((a, d) => a + d[1], 0);
        const wrap = el('div', 'row');
        wrap.style.flexWrap = 'wrap';
        wrap.innerHTML = `<span class="ic">${box.ic}</span><span class="tx"><b class="o1">${esc(box.name)}</b><small class="o1">${C(box.price)} each</small></span>`;
        const free = (S.freeBoxes && S.freeBoxes[box.id]) || 0;
        if (free > 0) {
            const f = el('button', 'btn g-rainbow o1', 'FREE x' + free);
            f.addEventListener('click', () => net.send('hatch', { box: box.id, free: true }));
            wrap.appendChild(f);
        }
        const b1 = el('button', 'btn g-green o1', 'Open 1');
        b1.disabled = S.wins < box.price;
        b1.addEventListener('click', () => net.send('hatch', { box: box.id, n: 1 }));
        const b3 = el('button', 'btn g-blue o1', 'Open 3');
        b3.disabled = S.wins < box.price * 3;
        b3.addEventListener('click', () => net.send('hatch', { box: box.id, n: 3 }));
        wrap.appendChild(b1); wrap.appendChild(b3);
        const drops = el('div', 'petgrid');
        drops.style.width = '100%';
        for (const [id, w] of box.drops) {
            const d = petById[id], r = RARITY[d.rarity];
            const c = el('div', 'pet');
            c.style.cursor = 'default';
            c.innerHTML = `<div class="ic" style="background:radial-gradient(circle,${r.color}55,transparent 70%)">${petIcon(d)}</div><div class="nm o1">${esc(d.name)}</div><div class="rr o1" style="color:${r.color}">${(Math.round(w / total * 1000) / 10)}%</div><div class="m o1">x${d.mult}</div>`;
            drops.appendChild(c);
        }
        wrap.appendChild(drops);
        body.appendChild(wrap);
    }
}

// ----- Trails -----
function renderTrails(body) {
    const g = el('div', 'grid');
    for (const t of TRAILS) {
        const own = !!S.trails[t.id], on = S.trail === t.id;
        const sw = `<span style="display:inline-block;width:3.6rem;height:1.2rem;border-radius:1rem;border:3px solid #2a1040;background:${t.rainbow ? 'linear-gradient(90deg,#ff3c5a,#ffb51c,#46ec50,#28c8ff,#8a5aff)' : '#' + t.color.toString(16).padStart(6, '0')};box-shadow:0 0 0.8rem #${t.color.toString(16).padStart(6, '0')}"></span>`;
        g.appendChild(card({
            ic: sw, name: t.name, desc: t.vip ? 'Comes with VIP' : t.price ? '' : 'Free', cls: on ? 'own' : '',
            btn: on ? 'Equipped' : own ? 'Equip' : t.vip ? '👑 VIP' : C(t.price), btnCls: own ? 'g-blue' : t.vip ? 'g-gold' : 'g-green',
            disabled: on || (!own && !t.vip && S.wins < t.price),
            onClick: () => (t.vip && !own ? buy('pass', 'VIP') : net.send('trail', { id: t.id })),
        }));
    }
    body.appendChild(g);
}

// ----- Worlds -----
function renderWorlds(body) {
    const g = el('div', 'grid');
    g.appendChild(card({ ic: '🗼', name: 'World 1: ASMR Tower', desc: 'Slime, squishies and keyboard clicks · ' + STAGES.length + ' stages', cls: 'own', btn: 'You are here', btnCls: 'g-blue', disabled: true }));
    g.appendChild(card({ ic: '🍬', name: 'World 2: Candy Tower', desc: 'Coming soon!', btn: '🔒 Locked', btnCls: 'g-grey', disabled: true }));
    g.appendChild(card({ ic: '☁️', name: 'World 3: Cloud Tower', desc: 'Coming soon!', btn: '🔒 Locked', btnCls: 'g-grey', disabled: true }));
    body.appendChild(g);
    sec(body, 'Teleport');
    const r = el('div', 'grid');
    r.appendChild(card({ ic: '🏠', name: 'Lobby', desc: 'Back to the bottom', btn: 'Go', onClick: () => { closeModal(); actions.teleportLobby(); } }));
    if (S.stage >= 0) r.appendChild(card({ ic: '🚩', name: 'My checkpoint', desc: 'Stage ' + (S.stage + 1) + ': ' + STAGES[S.stage].name, btn: 'Go', onClick: () => { closeModal(); actions.teleportCheckpoint(); } }));
    r.appendChild(card({ ic: '👑', name: 'Any stage', desc: 'VIP: teleport to every stage you reached', btn: S.passes.VIP ? 'Open' : C(PASSES.VIP.price), btnCls: S.passes.VIP ? 'g-gold' : 'g-green', onClick: () => (S.passes.VIP ? openModal('teleport') : buy('pass', 'VIP')) }));
    body.appendChild(r);
}
function renderTeleport(body) {
    if (!S.passes.VIP) { note(body, 'Teleporting to any stage is a VIP perk.'); const b = el('button', 'btn g-gold o', '👑 Get VIP'); b.addEventListener('click', () => buy('pass', 'VIP')); body.appendChild(b); return; }
    const g = el('div', 'grid');
    CHECKPOINTS.forEach((cp, i) => {
        const ok = i < (S.maxStage || 0);
        g.appendChild(card({ ic: ok ? '🚩' : '🔒', name: 'Stage ' + (i + 1), desc: STAGES[i].name, btn: ok ? 'Teleport' : 'Not reached', btnCls: ok ? 'g-green' : 'g-grey', disabled: !ok, onClick: () => { closeModal(); actions.teleportTo(i); } }));
    });
    body.appendChild(g);
}

// ----- Config -----
function slider(body, ic, label, kind) {
    const r = el('div', 'row');
    r.innerHTML = `<span class="ic">${ic}</span><span class="tx" style="flex:0 0 9rem"><b class="o1">${label}</b></span>`;
    const s = el('input');
    s.type = 'range'; s.min = 0; s.max = 100; s.value = Math.round((getVolumes()[kind] ?? 1) * 100);
    s.setAttribute('aria-label', label);
    s.addEventListener('input', () => setVolume(kind, s.value / 100));
    r.appendChild(s);
    body.appendChild(r);
}
function renderConfig(body) {
    sec(body, 'Sound');
    slider(body, '🎵', 'Music', 'music');
    slider(body, '🫧', 'ASMR sounds', 'asmr');
    slider(body, '🔔', 'Effects', 'sfx');
    sec(body, 'Graphics');
    const q = el('div', 'row');
    q.innerHTML = '<span class="ic">✨</span><span class="tx"><b class="o1">Quality</b><small class="o1">Lower it if the game feels slow</small></span>';
    for (const [k, n] of [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]) {
        const b = el('button', 'btn ' + (getQuality() === k ? 'g-green' : 'g-grey') + ' o1', n);
        b.addEventListener('click', () => { setQuality(k); renderModal(); });
        q.appendChild(b);
    }
    body.appendChild(q);
    const pets = el('div', 'row');
    pets.innerHTML = '<span class="ic">🐾</span><span class="tx"><b class="o1">Other players\' pets</b><small class="o1">Hide them for a calmer view</small></span>';
    const pb = el('button', 'btn ' + (actions.showOtherPets() ? 'g-green' : 'g-grey') + ' o1', actions.showOtherPets() ? 'Shown' : 'Hidden');
    pb.addEventListener('click', () => { actions.toggleOtherPets(); renderModal(); });
    pets.appendChild(pb);
    body.appendChild(pets);
    sec(body, 'Codes');
    const c = el('div', 'row');
    c.innerHTML = '<span class="ic">🎟️</span>';
    const inp = el('input', 'input'); inp.placeholder = 'Enter a code'; inp.maxLength = 24;
    const go = el('button', 'btn g-green o1', 'Redeem');
    go.addEventListener('click', () => { if (inp.value.trim()) net.send('code', { code: inp.value.trim() }); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); e.stopPropagation(); });
    c.appendChild(inp); c.appendChild(go);
    body.appendChild(c);
    const stats = el('div', 'row');
    stats.innerHTML = `<span class="ic">📊</span><span class="tx"><b class="o1">Climbs ${fmt(S.climbs)} · Best climb ${S.best ? S.best + 's' : '—'}</b><small class="o1">Playtime ${playtimeText(S.playtime)} · Wins earned ${fmt(S.totalWins)}</small></span>`;
    body.appendChild(stats);
}
export function codeResult(m) { toast(m.ok ? '🎟️ ' + m.text : m.text, m.ok ? '#7dff6b' : '#ff5a5a'); }

// ----- Gifts (playtime) -----
function renderGifts(body) {
    note(body, 'Keep playing to unlock gifts! (' + Math.floor(sessionSecs() / 60) + ' min played this session)');
    const g = el('div', 'grid');
    const secs = sessionSecs();
    GIFTS.forEach((gift, k) => {
        const claimed = !!S.giftClaimed[k], ready = secs >= gift.min * 60;
        const left = Math.max(0, gift.min * 60 - secs);
        g.appendChild(card({
            ic: gift.box ? boxById[gift.box].ic : gift.spins ? '🎡' : '🪙', name: rewardText(gift), desc: gift.min + ' min',
            cls: claimed ? 'own' : ready ? 'hot' : '', btn: claimed ? 'Claimed' : ready ? 'CLAIM' : clock(left), btnCls: ready && !claimed ? 'g-green' : 'g-grey',
            disabled: claimed || !ready, onClick: () => net.send('gift', { k }),
        }));
    });
    body.appendChild(g);
}

// ----- Invite -----
function renderInvite(body) {
    note(body, 'Play with friends! Friend Boost gives +' + Math.round(CFG.friendBoost * 100) + '% Wins for every Bloxity friend in your server (up to +' + Math.round(CFG.friendBoost * CFG.friendMax * 100) + '%).');
    const r = el('div', 'row');
    r.innerHTML = '<span class="ic">🔗</span><span class="tx"><b class="o1">Invite link</b><small class="o1">Send it to a friend</small></span>';
    const b = el('button', 'btn g-green o1', 'Copy');
    b.addEventListener('click', async () => {
        const link = BX.getInviteLink() || location.href;
        try { await navigator.clipboard.writeText(link); toast('Invite link copied!', '#7dff6b'); } catch (e) { toast(link, '#ffffff'); }
    });
    r.appendChild(b);
    body.appendChild(r);
    const list = el('div', 'grid');
    body.appendChild(list);
    if (BX.bloxity.ready && BX.identity().loggedIn) {
        BX.getFriends().then((fr) => {
            if (!fr.length) { list.appendChild(el('p', 'note o1', 'No Bloxity friends yet.')); return; }
            for (const f of fr.slice(0, 24)) {
                const nm = f.displayName || f.username || 'Friend';
                list.appendChild(card({ ic: '🙂', name: nm, btn: 'Invite', onClick: async () => { const ok = await BX.inviteFriend(f._id || f.id); toast(ok ? 'Invited ' + nm + '!' : 'Could not invite ' + nm, ok ? '#7dff6b' : '#ff5a5a'); } }));
            }
        });
    } else note(body, 'Log in to Bloxity to invite your friends directly.');
}

// =====================================================================================
// Daily rewards
// =====================================================================================
export function openDailyOnJoin() {
    if (dailyStatus(S.daily, net.now()).can && !openDailyOnJoin.done) { openDailyOnJoin.done = true; setTimeout(openDaily, 1500); }
}
function openDaily() { renderDaily(); $('#daily').hidden = false; setMusicDuck(true); }
function renderDaily() {
    const st = dailyStatus(S.daily, net.now());
    const cards = $('#dailyCards');
    cards.innerHTML = '';
    DAILY.forEach((r, i) => {
        const done = i < st.day || (!st.can && i === st.day);
        const now = st.can && i === st.day;
        const d = el('div', 'dcard o1' + (done ? ' done' : '') + (now ? ' now' : ''));
        d.innerHTML = `<span class="d">Day ${i + 1}</span><span class="i">${r.box ? boxById[r.box].ic : r.spins && !r.wins ? '🎡' : '🏆'}</span><span>${esc(rewardText(r))}</span>`;
        cards.appendChild(d);
    });
    $('#dailyClaim').disabled = !st.can;
    setText($('#dailyLeft'), st.can ? 'Your daily reward is ready!' : 'Come back tomorrow for Day ' + ((st.streak % 7) + 1) + '!');
}
$('#dailyClaim').addEventListener('click', () => { net.send('daily'); setTimeout(renderDaily, 300); });
$('#dailyClose').addEventListener('click', () => { $('#daily').hidden = true; setMusicDuck(false); });
export const refreshDaily = () => { if (!$('#daily').hidden) renderDaily(); };

// =====================================================================================
// Lucky Spin
// =====================================================================================
const wheel = $('#wheel'), wctx = wheel.getContext('2d');
let wheelAngle = 0, spinning = false;
function drawWheel() {
    const N = SPIN.length, R = 250, cx = 256, cy = 256;
    wctx.clearRect(0, 0, 512, 512);
    wctx.save(); wctx.translate(cx, cy); wctx.rotate(wheelAngle);
    SPIN.forEach((s, i) => {
        const a0 = (i / N) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / N) * Math.PI * 2 - Math.PI / 2;
        wctx.beginPath(); wctx.moveTo(0, 0); wctx.arc(0, 0, R, a0, a1); wctx.closePath();
        wctx.fillStyle = s.color; wctx.fill();
        wctx.lineWidth = 5; wctx.strokeStyle = '#2a1040'; wctx.stroke();
        wctx.save(); wctx.rotate((a0 + a1) / 2);
        wctx.textAlign = 'right'; wctx.textBaseline = 'middle';
        wctx.font = '44px "Segoe UI Emoji", sans-serif'; wctx.fillText(s.ic, R - 18, 0);
        wctx.font = '700 28px Fredoka, sans-serif'; wctx.lineWidth = 6; wctx.strokeStyle = '#2a1040'; wctx.fillStyle = '#fff';
        wctx.strokeText(s.label, R - 76, 0); wctx.fillText(s.label, R - 76, 0);
        wctx.restore();
    });
    wctx.restore();
    wctx.beginPath(); wctx.arc(cx, cy, 34, 0, Math.PI * 2); wctx.fillStyle = '#ffd028'; wctx.fill(); wctx.lineWidth = 6; wctx.strokeStyle = '#2a1040'; wctx.stroke();
}
function openSpin() { drawWheel(); renderSpinInfo(); $('#spinWin').hidden = false; setMusicDuck(true); }
function renderSpinInfo() {
    const next = Math.max(0, CFG.spinMinutes * 60 - (S.spinAt || 0) - (Date.now() - S.profileAt) / 1000);
    setText($('#spinInfo'), 'Spins: ' + (S.spins || 0) + (S.spins < CFG.spinsMax ? ' · next free spin in ' + clock(next) : ''));
    $('#spinGo').disabled = spinning || (S.spins || 0) <= 0;
}
export const refreshSpin = () => { if (!$('#spinWin').hidden) renderSpinInfo(); };
$('#spinGo').addEventListener('click', () => { if (spinning || S.spins <= 0) return; spinning = true; $('#spinGo').disabled = true; net.send('spin'); });
$('#spinBuy').addEventListener('click', () => buy('product', 'Spins5'));
$('#spinClose').addEventListener('click', () => { if (spinning) return; $('#spinWin').hidden = true; setMusicDuck(false); });
// The server picked slice i: spin there over ~4 s with ticks as each slice passes the pin
export function spinTo(i) {
    const N = SPIN.length, slice = (Math.PI * 2) / N;
    const target = -(i + 0.5) * slice + (Math.random() - 0.5) * slice * 0.6;
    const start = wheelAngle, end = start - ((start - target) % (Math.PI * 2)) - Math.PI * 2 * 6 + Math.PI * 2;
    const t0 = performance.now(), dur = 4000;
    let lastSlice = Math.floor(-start / slice);
    if ($('#spinWin').hidden) openSpin();
    (function frame() {
        const k = Math.min(1, (performance.now() - t0) / dur), e = 1 - Math.pow(1 - k, 4);
        wheelAngle = start + (end - start) * e;
        const sl = Math.floor(-wheelAngle / slice);
        if (sl !== lastSlice) { lastSlice = sl; sfx('spinTick'); }
        drawWheel();
        if (k < 1) requestAnimationFrame(frame);
        else {
            spinning = false;
            const s = SPIN[i];
            toast('🎡 You won ' + (s.wins ? fmt(s.wins) + ' Wins' : s.label) + '!', '#ffd028');
            sfx('buy');
            renderSpinInfo();
        }
    })();
}

// =====================================================================================
// Hatching
// =====================================================================================
export function showHatch(m) {
    const box = boxById[m.box];
    $('#hatch').hidden = false;
    setMusicDuck(true);
    const hb = $('#hatchBox');
    hb.textContent = box ? box.ic : '📦';
    hb.hidden = false; hb.classList.add('shake');
    $('#hatchOut').innerHTML = '';
    $('#hatchOk').hidden = true;
    let n = 0;
    const tick = setInterval(() => { sfx('hatchShake'); if (++n > 8) clearInterval(tick); }, 170);
    setTimeout(() => {
        hb.classList.remove('shake'); hb.hidden = true;
        let best = 'common';
        for (const p of m.pets) {
            const d = petById[p.id], r = RARITY[d.rarity];
            if (r.order > RARITY[best].order) best = d.rarity;
            const res = el('div', 'hres');
            const url = petThumb(d);
            res.innerHTML = `${url ? `<img src="${url}" alt="" style="width:9rem;height:9rem;filter:drop-shadow(0 0 1rem ${r.color})">` : ''}<div class="nm o">${esc(d.name)}</div><div class="rr o1" style="color:${r.color}">${r.name} · x${d.mult}</div>`;
            $('#hatchOut').appendChild(res);
        }
        sfx(best);
        $('#hatchOk').hidden = false;
    }, 1600);
}
$('#hatchOk').addEventListener('click', () => { $('#hatch').hidden = true; if (!modalOpen()) setMusicDuck(false); refreshModal(); });

// =====================================================================================
// HUD buttons
// =====================================================================================
$('#btnStore').addEventListener('click', () => openModal('store'));
$('#btnPets').addEventListener('click', () => openModal('pets'));
$('#btnWorlds').addEventListener('click', () => openModal('worlds'));
$('#btnTrails').addEventListener('click', () => openModal('trails'));
$('#btnConfig').addEventListener('click', () => openModal('config'));
$('#btnBoxes').addEventListener('click', () => openModal('boxes'));
$('#coinPlus').addEventListener('click', () => openModal('store', 'boosts'));
$('#starter').addEventListener('click', () => buy('product', 'StarterPack'));
$('#btnSpin').addEventListener('click', openSpin);
$('#btnInvite').addEventListener('click', () => openModal('invite'));
$('#btnGift').addEventListener('click', () => openModal('gifts'));
$('#btnDaily').addEventListener('click', openDaily);
$('#nukeBtn').addEventListener('click', () => buy('product', 'NukeAll'));
$('#skipBtn').addEventListener('click', () => buy('product', 'Skip'));
actions.openWorlds = () => openModal('worlds');
actions.openStore = () => openModal('store');
actions.openTeleport = () => openModal('teleport');
actions.buy = buy;

// Closes the topmost popup (Escape / controller B); false when nothing was open
export function closeTop() {
    for (const id of ['#hatch', '#confirm', '#spinWin', '#daily']) {
        if (!$(id).hidden) {
            if (id === '#hatch') $('#hatchOk').click(); else if (id === '#confirm') closeConfirm(); else if (id === '#spinWin') $('#spinClose').click(); else $('#dailyClose').click();
            return true;
        }
    }
    if (modalOpen()) { closeModal(); return true; }
    if (!$('#gearPop').hidden) { $('#gearPop').hidden = true; return true; }
    return false;
}
export const anyPopup = () => ['#hatch', '#confirm', '#spinWin', '#daily', '#modal'].some((id) => !$(id).hidden);
export { equippedIds };
