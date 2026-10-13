import { Client } from '@colyseus/sdk';
import {
    T, V3, $, canvas, scene, camera, sun, renderer, solids, triggers, prompts, tickers, accentA, accentB, camFill,
    billboard, buildRig, animRig, airPose, climbPose, holdPose, floatText, updateEffects, lerpAngle, updateSky,
} from './engine.js';
import { S, actions, net } from './state.js';
import { initAudio, resumeAudio, audioDebug, startMusic, sfx, step as asmrStep, popitFlip, setVolume, audioSuspended, loopSound } from './audio.js';
import * as BX from './bloxity.js';
import { createAvatar, loadBase, packAvatar, unpackAvatar, avatarStats } from './avatar.js';
import { pad, pollGamepad, rumble, onGamepadConnection } from './gamepad.js';
import {
    render, updateFx, dust, sparkleColumn, ring, fireworks, setQuality, getQuality, autoQualityAllowed, makeTrail, flame,
    updateAmbient, splash, popSpark, coinBurst, nukeFx,
} from './fx.js';
import {
    buildWorld, SPAWN, SPAWN_YAW, renderBoards, updateWorld, cullZones, setVipDoor, refreshGearPads, lightCheckpoint, coinState,
    pressDome, touchVanish, popAt, jiggle, squishBig, sweepers, sweeperAngle, popits,
} from './world.js';
import { redrawAtlas, keyAt, pressKey, pressAround, updatePressed, KEY } from './keys.js';
import { tickSlime, slimeFeet, jellyHit } from './materials.js';
import { setDecorLow } from './decor.js';
import { heldModel, carpet as carpetModel, waveCarpet, jetpack as jetpackModel } from './gear.js';
import { PetTrain } from './pets.js';
import {
    updateHud, toast, showStageTitle, showWin, showOof, flash, teleportFx, showOops, hideOops, showGearPop, renderHotbar, hotbarGear,
    setFuel, renderProgress, animateCounters, bumpCoins, openDailyOnJoin, refreshModal, refreshDaily, refreshSpin, openModal, notEnough, showStageClear,
    promptEl, promptTxtEl, codeResult, spinTo, showHatch, buy, closeTop, anyPopup,
} from './ui.js';
import { CFG, STAGES, KITS, SKINS, trailById, petById, gearById, passForGear, fmt, clamp } from '../../shared/config.js';
import { CHECKPOINTS, COINS, SUMMIT, checkpointSpot, stageAtY, COURSE_TOP, COURSE, CORNER_Y, cornerXZ, LAND } from '../../shared/course.js';

// =====================================================================================
// Local player
// =====================================================================================
const HW = 1, PH = 5, STEP = 1.25, PIVOT = 2.6;
const P = {
    pos: SPAWN.clone(), vel: new V3(), kv: new V3(), onGround: false, ground: null, facing: SPAWN_YAW, moving: false,
    animPhase: 0, airTime: 0, peakY: 0, climbing: null, climbT: 0, stage: -1, lastStepN: 0, sink: 0, squash: 1, squashV: 0,
    jetFuel: CFG.jetFuel, jetOn: false, flying: false, grapple: null, lastTool: 0, lastSlap: -9, sweepHit: -9, lastClick: 0,
    jumpPress: -9, coyote: 0, slime: 0, slimeAge: 9,
};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let shake = 0;
function addShake(a) { if (!reduceMotion) shake = Math.min(1.2, shake + a); }
let rig = null, headLabel, nameLabelText = '', myPets = null;

// ----- a character: rig (feet, yaw) -> pivot (hips) -> body (blocky or Bloxity) + held tool -----
function buildCharacter(kit, skin) {
    const g = new T.Group();
    const pivot = new T.Group(); pivot.position.y = PIVOT; g.add(pivot);
    const k = KITS[kit % KITS.length];
    const body = buildRig({ ...k, skin: SKINS[skin % SKINS.length], hair: 0x8a3a1a });
    body.position.y = -PIVOT;
    pivot.add(body);
    g.userData = { pivot, body, tool: '', held: null, carpet: null, jet: null, trail: null, trailId: '' };
    return g;
}
// The tool in the right hand; the carpet under the feet; the jetpack on the back
function setTool(g, id) {
    const u = g.userData;
    if (u.tool === (id || '')) return;
    u.tool = id || '';
    for (const k of ['held', 'carpet', 'jet']) if (u[k]) { u[k].parent && u[k].parent.remove(u[k]); u[k] = null; }
    if (!id) return;
    if (id === 'carpet') { u.carpet = carpetModel(0.95); u.carpet.position.y = 0.25; u.carpet.visible = false; g.add(u.carpet); return; }
    if (id === 'jetpack') { u.jet = jetpackModel(); u.jet.scale.setScalar(0.85); u.jet.position.set(0, 3.1, -0.95); u.body.add(u.jet); return; }
    const h = heldModel(id);
    if (h) { h.position.set(1.5, 2.2, 0.3); u.body.add(h); u.held = h; }
}
function setTrail(g, id) {
    const u = g.userData;
    const d = trailById[id] || trailById.starter;
    if (!u.trail) u.trail = makeTrail(d.color);
    if (u.trailId !== d.id) {
        u.trailId = d.id;
        u.trail.setColor(d.color, d.rainbow);
        u.trail.width = d.id === 'starter' ? 0.5 : 0.8;
    }
}

// ----- Bloxity avatars: replace the blocky body's meshes, keep the pivot, tools and labels -----
function dressRig(group, avatar) {
    const u = group.userData, body = u.body;
    body.children.forEach((c) => { if (c !== u.held && c !== u.jet) c.visible = false; });
    body.add(avatar.root);
    u.blox = avatar;
}
let localAvatar = null, localAvatarReq = 0;
async function setupLocalAvatar() {
    const req = ++localAvatarReq;
    const a = await createAvatar(BX.currentAvatar(), BX.getSkinTextureUrl());
    if (!a) return;
    if (req !== localAvatarReq || !rig) { a.dispose(); return; }
    if (localAvatar) localAvatar.dispose();
    localAvatar = a;
    dressRig(rig, a);
}
function syncMyAvatar() {
    const av = BX.currentAvatar();
    if (localAvatar && av) { localAvatar.setProportions(av.proportions); localAvatar.setEquipped(av, BX.getSkinTextureUrl()); }
    net.send('avatar', { av: packAvatar(av) });
}
async function playEmoteOn(avatar, id) {
    if (!avatar) return;
    const cat = await BX.loadEmotes();
    const e = cat.get(id);
    if (e && e.clip) avatar.playEmote(e.clip);
}
function chatBubble(group, text) {
    if (!group) return;
    if (group.userData.bubble) { group.remove(group.userData.bubble); group.userData.bubble.material.map.dispose(); }
    const b = billboard([{ t: '💬 ' + text, c: '#ffffff', s: '#2a1040', px: 44 }], 9, 1024, new V3(0, 10, 0), group);
    group.userData.bubble = b;
    setTimeout(() => { if (group.userData.bubble === b) { group.remove(b); b.material.map.dispose(); group.userData.bubble = null; } }, 5000);
}
const nameLines = (name, vip) => (vip ? [{ t: '[VIP]', c: '#ffd028', s: '#3a2000', px: 44 }, { t: name || ' ', c: '#ffffff', s: '#2a1040', px: 60 }] : [{ t: name || ' ', c: '#ffffff', s: '#2a1040', px: 60 }]);

function buildPlayer(kit, skin) {
    if (rig) { scene.remove(rig); if (rig.userData.trail) rig.userData.trail.dispose(); }
    rig = buildCharacter(kit, skin);
    scene.add(rig);
    nameLabelText = '';
    headLabel = billboard(nameLines(S.name), 6.5, 512, new V3(0, 7.8, 0), rig);
    headLabel.material.depthTest = false; headLabel.renderOrder = 10;
    rig.position.copy(P.pos);
    localAvatar = null;
    setupLocalAvatar();
    if (!myPets) myPets = new PetTrain(scene);
}

// =====================================================================================
// Collision: boxes, plus round shapes (domes, discs) with their own surface tests
// =====================================================================================
let nearBoxes = [], nearRound = [], nearTriggers = triggers, nearPrompts = prompts, nearZoneKey = '';
function refreshNear(stage) {
    const zs = new Set([stage - 1, stage, stage + 1]);
    const key = [...zs].join(',');
    if (key === nearZoneKey) return;
    nearZoneKey = key;
    const ok = (o) => o.zone === undefined || o.zone < 0 || zs.has(o.zone);
    const list = solids.filter(ok);
    nearBoxes = list.filter((s) => !s.shape);
    nearRound = list.filter((s) => s.shape);
    nearTriggers = triggers.filter(ok);
    nearPrompts = prompts.filter(ok);
    cullZones(stage);
}
const overlaps = (c, x, y, z) => !c.off && c.max.x > x - HW && c.min.x < x + HW && c.max.y > y && c.min.y < y + PH && c.max.z > z - HW && c.min.z < z + HW;
function freeAt(x, y, z) {
    for (const c of nearBoxes) if (overlaps(c, x, y, z)) return false;
    return true;
}
function moveAxis(axis, d) {
    if (d === 0) return;
    const p = P.pos;
    p[axis] += d;
    for (const c of nearBoxes) {
        if (!overlaps(c, p.x, p.y, p.z)) continue;
        if (axis === 'y') {
            if (d < 0) { p.y = c.max.y; P.vel.y = Math.max(0, P.vel.y); P.onGround = true; P.ground = c; }
            else { p.y = c.min.y - PH - 1e-4; if (P.vel.y > 0) P.vel.y = 0; }
        } else {
            const rise = c.max.y - p.y;
            if (rise > 0 && rise <= STEP && (P.onGround || P.vel.y <= 0) && !c.climb && freeAt(p.x, c.max.y + 0.01, p.z)) { p.y = c.max.y + 0.001; continue; }
            if (d > 0) p[axis] = c.min[axis] - HW - 1e-4; else p[axis] = c.max[axis] + HW + 1e-4;
        }
    }
}
// Top of a round shape under (x, z), for feet with a little footprint; null if not over it
function surfaceY(s, x, z) {
    const d = Math.hypot(x - s.cx, z - s.cz);
    if (s.shape === 'cyl') return d <= s.r + 0.55 ? s.max.y : null;
    const dd = Math.max(0, d - 0.9);
    if (dd >= s.r) return null;
    return s.y0 + s.h * (1 - 0.2 * (s.squish || 0)) * Math.sqrt(1 - (dd / s.r) ** 2);
}
function resolveRound() {
    const p = P.pos;
    for (const s of nearRound) {
        if (s.off) continue;
        if (p.x + HW < s.min.x || p.x - HW > s.max.x || p.z + HW < s.min.z || p.z - HW > s.max.z) continue;
        if (p.y > s.max.y + 0.01 || p.y + PH < s.min.y) continue;
        const top = surfaceY(s, p.x, p.z);
        if (top === null || p.y >= top - 0.001) continue;
        const pen = top - p.y;
        if (pen <= (s.shape === 'dome' ? 1.6 : STEP) || (P.vel.y <= 0 && pen < 2.2)) {
            p.y = top; P.vel.y = Math.max(0, P.vel.y); P.onGround = true; P.ground = s;
            continue;
        }
        if (P.vel.y > 0 && p.y + PH - P.vel.y * 0.02 <= s.min.y + 0.5) { p.y = s.min.y - PH - 0.01; P.vel.y = 0; continue; }
        // push out sideways
        const dx = p.x - s.cx, dz = p.z - s.cz, d = Math.hypot(dx, dz) || 0.001;
        let R = s.r + HW * 0.8;
        if (s.shape === 'dome') {
            const h = s.h * (1 - 0.2 * (s.squish || 0)), k = clamp((p.y - s.y0) / h, 0, 1);
            R = s.r * Math.sqrt(1 - k * k) + 0.95;
        }
        if (d < R) { p.x = s.cx + dx / d * R; p.z = s.cz + dz / d * R; }
    }
}
// Snap down onto ground just below (walking down domes, off a step, onto a pressed key)
function groundProbe(maxDrop) {
    const p = P.pos;
    let best = -Infinity, bs = null;
    for (const c of nearBoxes) {
        if (c.off || c.climb) continue;
        if (c.max.x <= p.x - HW || c.min.x >= p.x + HW || c.max.z <= p.z - HW || c.min.z >= p.z + HW) continue;
        if (c.max.y <= p.y + 0.01 && c.max.y >= p.y - maxDrop && c.max.y > best) { best = c.max.y; bs = c; }
    }
    for (const s of nearRound) {
        if (s.off) continue;
        const top = surfaceY(s, p.x, p.z);
        if (top !== null && top <= p.y + 0.01 && top >= p.y - maxDrop && top > best) { best = top; bs = s; }
    }
    if (bs) { p.y = best; P.onGround = true; P.ground = bs; P.vel.y = Math.max(0, P.vel.y); }
    return !!bs;
}
// Moving platforms that moved into the player lift them out (or push them aside)
function depenetrate() {
    const p = P.pos;
    for (const c of nearBoxes) {
        if (!c.mover || !overlaps(c, p.x, p.y, p.z)) continue;
        if (p.y >= c.max.y - 1.6) { p.y = c.max.y + 0.001; P.vel.y = Math.max(0, P.vel.y); P.onGround = true; P.ground = c; continue; }
        const dxp = c.max.x - (p.x - HW), dxn = (p.x + HW) - c.min.x, dzp = c.max.z - (p.z - HW), dzn = (p.z + HW) - c.min.z;
        const m = Math.min(dxp, dxn, dzp, dzn);
        if (m === dxp) p.x += dxp; else if (m === dxn) p.x -= dxn; else if (m === dzp) p.z += dzp; else p.z -= dzn;
    }
}
function trussTouching() {
    const p = P.pos, e = 0.4;
    for (const c of nearBoxes) {
        if (!c.climb) continue;
        if (c.max.x > p.x - HW - e && c.min.x < p.x + HW + e && c.max.z > p.z - HW - e && c.min.z < p.z + HW + e && c.max.y > p.y + 0.2 && c.min.y < p.y + PH) return c;
    }
    return null;
}
const overlapsBox = (t, p) => t.max.x > p.x - HW && t.min.x < p.x + HW && t.max.y > p.y && t.min.y < p.y + PH && t.max.z > p.z - HW && t.min.z < p.z + HW;

// ----- gear stats -----
const tool = () => S.tool || '';
function walkSpeed() {
    let w = CFG.walk;
    if (tool() === 'speedCoil') w *= CFG.speedCoil;
    if (tool() === 'superCoil') w *= CFG.superCoil.walk;
    return qaWalk || w;
}
const gravity = () => CFG.grav * (tool() === 'gravityCoil' ? CFG.gravityCoil : 1);
const jumpV = () => CFG.jumpV * (tool() === 'superCoil' ? CFG.superCoil.jump : 1);

function teleport(pos, yaw, fx) {
    P.pos.copy(pos); P.vel.set(0, 0, 0); P.kv.set(0, 0, 0);
    P.facing = yaw || 0; cam.yaw = (yaw || 0) + Math.PI;
    P.grapple = null; P.climbing = null; P.peakY = pos.y; P.airTime = 0;
    if (rig && rig.userData.trail) rig.userData.trail.reset();
    P.stage = stageAtY(pos.y);
    refreshNear(Math.max(-1, P.stage));
    for (const t of nearTriggers) t.inside = overlapsBox(t, pos);
    sendMove(true);
    if (fx) { teleportFx(); sfx('teleport'); }
}
function teleportLobby() { teleport(SPAWN, SPAWN_YAW, true); net.send('lobby'); }
actions.teleportLobby = () => { hideOops(); teleportLobby(); };
actions.teleportCheckpoint = () => {
    const spot = checkpointSpot(S.stage);
    if (!spot) { teleportLobby(); return; }
    hideOops();
    teleport(new V3(spot.x, spot.y, spot.z), spot.yaw, true);
};
actions.teleportTo = (i) => {
    const spot = checkpointSpot(i);
    if (!spot || i >= (S.maxStage || 0) || !S.passes.VIP) return;
    teleport(new V3(spot.x, spot.y, spot.z), spot.yaw, true);
    showStageTitle(i + 1 < STAGES.length ? i + 1 : i);
};

// =====================================================================================
// Checkpoints, floating trophies, the summit, gear pads, doors
// =====================================================================================
actions.checkpoint = (i) => { if (!P.dead) net.send('cp', { i }); };
let summitLock = 0;
actions.summit = () => {
    if (clockT - summitLock < 4) return;
    summitLock = clockT;
    net.send('win');
};
actions.gearPad = (id, fromPrompt) => {
    if (S.gear[id]) { if (fromPrompt) actions.equip(id); else showGearPop(id); return; }
    if (fromPrompt) buy('pass', passForGear(id)); else showGearPop(id);
};
actions.equip = (id) => {
    if (!S.gear[id]) { buy('pass', passForGear(id)); return; }
    const next = S.tool === id ? '' : id;
    S.tool = next;
    net.send('tool', { id: next });
    sfx('equip');
    renderHotbar();
    if (next === 'carpet') toast('🧞 Magic Carpet: Space to rise, Shift to sink', '#ff8ad8');
    else if (next === 'jetpack') toast('🚀 Jetpack: hold Space in the air to fly', '#ffb04a');
    else if (next === 'grapple') toast('🪝 Grappling Hook: click a wall or platform to swing to it', '#d8d8f0');
    else if (next === 'slap') toast('🖐️ Slap Tool: click near a player to slap them', '#ffffff');
};
actions.vipDoor = () => {
    if (!S.passes.VIP) { buy('pass', 'VIP'); return; }
    teleport(new V3(0, 1.5, -76), Math.PI, true);
};
actions.vipChest = () => net.send('vipChest');
let showOther = true;
try { showOther = localStorage.getItem('asmr_pets') !== '0'; } catch (e) { /* default */ }
actions.showOtherPets = () => showOther;
actions.toggleOtherPets = () => { showOther = !showOther; try { localStorage.setItem('asmr_pets', showOther ? '1' : '0'); } catch (e) { /* ignore */ } };

function checkCoins() {
    const p = P.pos;
    for (const c of COINS) {
        if (coinState.collected.has(c.i)) continue;
        const dx = c.x - p.x, dy = c.y - (p.y + 2.5), dz = c.z - p.z;
        if (dx * dx + dy * dy + dz * dz < 4.2 * 4.2) {
            coinState.collected.add(c.i);
            coinBurst(new V3(c.x, c.y, c.z));
            sfx('coin');
            net.send('coin', { i: c.i });
        }
    }
}

// =====================================================================================
// Friend Boost
// =====================================================================================
let friendNames = [], friendsT = 3, friendSyncT = 5;
async function refreshFriends() {
    if (!BX.bloxity.ready || !BX.identity().loggedIn) return;
    const list = await BX.getFriends();
    friendNames = list.map((f) => f.displayName || f.username).filter(Boolean);
    syncFriends();
}
function syncFriends() {
    const room = net.room;
    if (!room || !room.state || !room.state.players || !friendNames.length) return;
    const here = [];
    room.state.players.forEach((p, id) => { if (id !== room.sessionId && friendNames.includes(p.name)) here.push(p.name); });
    net.send('friends', { names: here });
}

// =====================================================================================
// Other players
// =====================================================================================
const remotes = new Map();
let joinSynced = false;
const KIT_COLORS = ['#ff7ad0', '#3ac8ff', '#6aff5a', '#ffd028', '#c45aff', '#ff8a3a'];
class Remote {
    constructor(p) {
        this.rig = buildCharacter(p.kit, p.skin);
        this.rig.position.set(p.x, p.y, p.z);
        this.rig.rotation.y = p.ry;
        scene.add(this.rig);
        this.label = billboard(nameLines(p.name, p.vip), 6, 512, new V3(0, 7.8, 0), this.rig);
        this.labelKey = p.name + '|' + p.vip;
        this.av = null; this.blox = null; this.dead = false; this.phase = 0; this.vel = 0; this.vy = 0;
        this.lastX = p.x; this.lastZ = p.z; this.lastY = p.y; this.stepN = 0; this.swing = 0;
        this.pets = new PetTrain(scene); this.petKey = '';
        this.setAvatar(p.av);
    }
    setAvatar(av) {
        this.av = av;
        const data = av ? unpackAvatar(av) : null;
        if (this.blox) { this.blox.setProportions(data && data.proportions); this.blox.setEquipped(data || {}); return; }
        if (this.loading) return;
        this.loading = true;
        createAvatar(data).then((a) => {
            this.loading = false;
            if (!a) return;
            if (this.dead) { a.dispose(); return; }
            this.blox = a;
            dressRig(this.rig, a);
            if (this.av !== av) this.setAvatar(this.av);
        });
    }
    update(p, dt, t) {
        const r = this.rig, u = r.userData;
        const k = 1 - Math.exp(-dt * 12);
        if ((r.position.x - p.x) ** 2 + (r.position.z - p.z) ** 2 + (r.position.y - p.y) ** 2 > 900) { r.position.set(p.x, p.y, p.z); if (u.trail) u.trail.reset(); }
        else { r.position.x += (p.x - r.position.x) * k; r.position.y += (p.y - r.position.y) * k; r.position.z += (p.z - r.position.z) * k; }
        r.rotation.y = lerpAngle(r.rotation.y, p.ry, k);
        if (p.av !== this.av) this.setAvatar(p.av);
        const moved = Math.hypot(r.position.x - this.lastX, r.position.z - this.lastZ);
        this.vel += ((dt > 0 ? moved / dt : 0) - this.vel) * Math.min(1, dt * 6);
        this.vy = dt > 0 ? (r.position.y - this.lastY) / dt : 0;
        this.lastX = r.position.x; this.lastZ = r.position.z; this.lastY = r.position.y;
        const air = p.anim === 2, climb = p.anim === 3, fly = p.anim === 4;
        if (this.wasAir && !air && !fly) { const g = groundUnder(r.position); if (g && g.mat === 'jelly') jellyHit(r.position.x, r.position.y, r.position.z, 1); }
        this.wasAir = air;
        const moving = p.anim === 1 && this.vel > 1;
        this.phase += dt * (moving ? Math.min(18, 4 + this.vel * 0.3) : climb ? 9 : 0);
        if (climb) climbPose(u.body, this.phase); else if (air) airPose(u.body); else if (moving) animRig(u.body, this.phase, 0.85); else animRig(u.body, 0, 0);
        if (u.tool && u.held && !climb) holdPose(u.body);
        if (this.swing > 0) { this.swing -= dt; u.body.userData.arms[1].rotation.set(-1.4, 0, -1.6 * Math.sin((1 - this.swing / 0.35) * Math.PI)); }
        if (this.blox) this.blox.update(dt, { moving, air: air || fly, speed: this.vel, t });
        // their footsteps make sounds too when close by
        const stepN = Math.floor(this.phase / Math.PI);
        if (moving && stepN !== this.stepN && camera.position.distanceToSquared(r.position) < 900) {
            const s = groundUnder(r.position);
            if (s) asmrStepQuiet(s.mat, s);
        }
        this.stepN = stepN;
        // keys pressed under them
        const onKeys = !air && !fly && pressAround(r.position.x, r.position.y, r.position.z, 0.9);
        this.sink = keySink(this.sink || 0, !air && !fly, onKeys, dt);
        u.pivot.position.y = PIVOT - this.sink + (moving ? Math.abs(Math.sin(this.phase)) * 0.16 : 0);
        this.lean = (this.lean || 0) + ((moving ? 0.13 : fly ? 0.2 : 0) - (this.lean || 0)) * Math.min(1, dt * 8);
        u.pivot.rotation.x = this.lean;
        setTool(r, p.tool); setTrail(r, p.trail);
        if (u.carpet) { u.carpet.visible = fly; if (fly) waveCarpet(u.carpet, t, 1); }
        if (u.jet && (air || fly) && this.vy > 2 && Math.random() < dt * 30) for (const n of [-0.45, 0.45]) flame(r.localToWorld(new V3(n, 1.6, -1)), 0.3, 0.9, new V3(0, -12, 0));
        u.trail.update(trailAt(r), (moving || air || fly) && r.visible, dt, t);
        const key = p.name + '|' + p.vip;
        if (key !== this.labelKey) { this.labelKey = key; this.label.userData.set(nameLines(p.name, p.vip)); }
        if (p.pets !== this.petKey) { this.petKey = p.pets; this.pets.set(String(p.pets || '').split(',').map((id) => petById[id]).filter(Boolean)); }
        this.pets.update(r.position, r.rotation.y, dt, t, showOther && r.visible);
    }
    dispose() {
        this.dead = true;
        if (this.blox) this.blox.dispose();
        if (this.rig.userData.trail) this.rig.userData.trail.dispose();
        this.pets.dispose();
        scene.remove(this.rig);
    }
}
const trailTmp = new V3();
function trailAt(r) { return trailTmp.set(r.position.x - Math.sin(r.rotation.y) * 0.9, r.position.y + 2.4, r.position.z - Math.cos(r.rotation.y) * 0.9); }
// The solid right under a position (for other players' footstep sounds)
function groundUnder(pos) {
    for (const c of nearBoxes) if (!c.off && pos.x > c.min.x && pos.x < c.max.x && pos.z > c.min.z && pos.z < c.max.z && Math.abs(c.max.y - pos.y) < 0.6) return c;
    for (const s of nearRound) { const top = surfaceY(s, pos.x, pos.z); if (top !== null && Math.abs(top - pos.y) < 0.8) return s; }
    return null;
}
let quietT = 0;
function asmrStepQuiet(mat) { if (clockT - quietT < 0.06) return; quietT = clockT; asmrStep(surfaceSound(mat), false); }

function syncRemotes(dt, t) {
    const room = net.room;
    if (!room || !room.state || !room.state.players) return [];
    const seen = new Set(), marks = [];
    room.state.players.forEach((p, id) => {
        if (id === room.sessionId) {
            S.name = p.name; S.friends = p.friends;
            if (!rig || rig.userData.kit !== p.kit) { buildPlayer(p.kit, p.skin); rig.userData.kit = p.kit; }
            return;
        }
        seen.add(id);
        let r = remotes.get(id);
        if (!r) {
            r = new Remote(p); remotes.set(id, r);
            if (joinSynced) BX.playerJoined(p.name); else BX.playerInRoom(p.name);
        }
        r.update(p, dt, t);
        marks.push({ id, name: p.name, k: clamp(p.y / COURSE_TOP, 0, 1), color: KIT_COLORS[p.kit % KIT_COLORS.length] });
    });
    for (const [id, r] of remotes) if (!seen.has(id)) { r.dispose(); remotes.delete(id); }
    joinSynced = true;
    return marks;
}

// =====================================================================================
// Networking
// =====================================================================================
const BLOXITY_GAME_ID = import.meta.env.VITE_BLOXITY_GAME_ID || '';
const ON_BLOXITY_HOST = /\.play\.bloxity\.io$/.test(location.hostname);
const DEV_CHANNEL = /\.dev\.play\.bloxity\.io$/.test(location.hostname);
const SERVER_URL = import.meta.env.VITE_SERVER_URL
    || (ON_BLOXITY_HOST ? `https://${location.hostname.replace(/\.play\.bloxity\.io$/, '.host.bloxity.io')}`
        : BLOXITY_GAME_ID ? `https://${BLOXITY_GAME_ID}.host.bloxity.io`
        : import.meta.env.DEV ? `${location.protocol}//${location.hostname}:2605` : location.origin);
async function serverEndpoint() {
    let url = SERVER_URL;
    if (BLOXITY_GAME_ID) {
        const r = await BX.resolveEndpoint(BLOXITY_GAME_ID, DEV_CHANNEL ? 'preview' : undefined);
        if (r && r.cold) $('#loading').textContent = 'Waking up a server…';
        url = (r && r.endpoint) || SERVER_URL;
    }
    if (!/^https?:/i.test(url)) return url;
    if (!(await serverUp(url))) {
        $('#loading').textContent = 'Waking up a server…';
        const until = Date.now() + 60000;
        while (Date.now() < until) {
            await new Promise((res) => setTimeout(res, 2000));
            if (await serverUp(url)) break;
        }
    }
    return url;
}
async function serverUp(url) {
    try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 4000);
        const r = await fetch(url.replace(/\/$/, '') + '/health', { signal: ctl.signal, cache: 'no-store' });
        clearTimeout(t);
        return r.ok;
    } catch (e) { return false; }
}
let lastMoveSent = 0, lastMoveKey = '';
function sendMove(force) {
    const now = performance.now();
    if (!force && now - lastMoveSent < 66) return;
    const a = P.flying ? 4 : P.climbing ? 3 : !P.onGround ? 2 : P.moving ? 1 : 0;
    const m = { x: +P.pos.x.toFixed(2), y: +P.pos.y.toFixed(2), z: +P.pos.z.toFixed(2), ry: +P.facing.toFixed(3), a };
    const key = m.x + ',' + m.y + ',' + m.z + ',' + m.ry + ',' + a;
    if (!force && key === lastMoveKey && now - lastMoveSent < 500) return;
    lastMoveKey = key; lastMoveSent = now;
    net.send('move', m);
}

function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
function playerUid() {
    let uid = storageGet('asmr_uid');
    if (!uid) {
        uid = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
        storageSet('asmr_uid', uid);
    }
    return uid;
}

let lastCoins = null, lastStage = -2;
async function connect(name) {
    const client = new Client(await serverEndpoint());
    const id = BX.identity();
    const room = await client.joinOrCreate('tower', {
        uid: playerUid(), name: name || id.name, token: id.token, av: packAvatar(BX.currentAvatar()),
        save: storageGet('asmr_save') || '',
    });
    net.room = room;
    joinSynced = false;
    room.onMessage('hello', (m) => { net.offset = m.now - Date.now(); net.bloxity = !!m.bloxity; });
    room.onMessage('authed', () => { net.bloxity = true; });
    room.onMessage('emote', (m) => { const r = remotes.get(m.s); if (r) playEmoteOn(r.blox, m.id); });
    room.onMessage('chat', (m) => {
        toast((m.vip ? '[VIP] ' : '') + m.name + ': ' + m.text, m.vip ? '#ffd028' : '#ffffff');
        chatBubble(m.s === room.sessionId ? rig : remotes.get(m.s) && remotes.get(m.s).rig, m.text);
    });
    BX.updateRoom(room.roomId);
    BX.gameplayStart();
    room.onMessage('profile', (m) => {
        if (m.save) storageSet('asmr_save', m.save);
        delete m.save;
        const first = lastCoins === null;
        Object.assign(S, m);
        S.profileAt = Date.now();
        if (!first && S.wins > lastCoins) bumpCoins();
        lastCoins = S.wins;
        if (S.stage !== lastStage) {
            for (let i = 0; i < CHECKPOINTS.length; i++) lightCheckpoint(i, i <= S.stage);
            if (lastStage === -2 && S.stage >= 0) setTimeout(() => showOops('Continue from Stage ' + (S.stage + 1) + ' for free.', 'Welcome back!'), 2500);
            lastStage = S.stage;
        }
        setVipDoor(S.passes && S.passes.VIP);
        refreshGearPads();
        renderHotbar();
        refreshModal(); refreshDaily(); refreshSpin();
        openDailyOnJoin();
    });
    room.onMessage('toast', (m) => toast(m.text, m.color));
    room.onMessage('announce', (m) => toast(m.text, m.color));
    room.onMessage('earn', (m) => {
        floatText('+' + fmt(m.n) + ' 🏆', '#ffd028', P.pos.clone().add(new V3(0, 6.5, 0)), 4.4);
        if (m.why === 'cp') {
            // Stage clear: a celebration, then the next (harder) stage's title
            showStageClear(m.i, m.n);
            sfx('checkpoint'); rumble(0.4, 180);
            sparkleColumn(P.pos, 0x7dff6b);
            ring(P.pos, 0x7dff6b, 9, 0.7);
            confettiBurst(P.pos);
            setTimeout(() => showStageTitle(Math.min(STAGES.length - 1, m.i + 1)), 1900);
        }
    });
    room.onMessage('broke', (m) => { notEnough(m); sfx('denied'); });
    room.onMessage('won', (m) => {
        showWin(m);
        sfx('win'); rumble(0.8, 600);
        fireworks(P.pos, 12, () => sfx('firework'));
        sparkleColumn(P.pos, 0xffd028);
        coinState.collected.clear();
        setTimeout(() => { if (P.pos.y > SUMMIT.y - 5) teleportLobby(); }, 4200);
    });
    room.onMessage('skipTo', (m) => {
        const spot = checkpointSpot(m.i);
        if (spot) { teleport(new V3(spot.x, spot.y, spot.z), spot.yaw, true); showStageTitle(Math.min(STAGES.length - 1, m.i + 1)); }
    });
    room.onMessage('hatched', (m) => showHatch(m));
    room.onMessage('freeBox', (m) => toast('🎁 Free box! Open it in Boxes', '#ff8ad8'));
    room.onMessage('spinResult', (m) => spinTo(m.i));
    room.onMessage('codeResult', (m) => codeResult(m));
    room.onMessage('boards', renderBoards);
    room.onMessage('fx', (m) => {
        sparkleColumn(P.pos, m.kind === 'unlock' ? 0xff8ad8 : 0xffd028);
        ring(P.pos, 0xffd028, 10, 0.8);
        sfx('buy');
    });
    // Nuked by someone: a blinding flash, flung into the air, then down to the lobby
    room.onMessage('nuke', (m) => {
        flash('#ffffe0', 1400); nukeFx(P.pos); sfx('nuke'); addShake(1.2); rumble(1, 900);
        P.vel.y = 70; P.kv.set((Math.random() - 0.5) * 60, 0, (Math.random() - 0.5) * 60); P.onGround = false; P.grapple = null; P.climbing = null;
        toast('☢️ ' + m.by + ' nuked everyone!', '#c8ff2a');
        setTimeout(() => { teleport(SPAWN, SPAWN_YAW, true); showOops(m.by + ' nuked you! Return to your checkpoint for free.'); }, 1300);
    });
    room.onMessage('nukeSent', () => { flash('#ffffe0', 900); sfx('nuke'); addShake(0.6); });
    room.onMessage('slapped', (m) => {
        P.kv.set(m.dx * CFG.slapForce, 0, m.dz * CFG.slapForce);
        P.vel.y = 34; P.onGround = false; P.climbing = null; P.grapple = null;
        sfx('slapped'); addShake(0.5); rumble(0.7, 250);
        toast('🖐️ ' + m.by + ' slapped you!', '#ffffff');
    });
    room.onMessage('slapFx', (m) => {
        const r = remotes.get(m.s); if (r) r.swing = 0.35;
        const tgt = m.t === room.sessionId ? rig : remotes.get(m.t) && remotes.get(m.t).rig;
        if (tgt && m.s !== room.sessionId) { popSpark(tgt.position.clone().add(new V3(0, 3, 0)), 0xffffff); if (camera.position.distanceTo(tgt.position) < 60) sfx('slap'); }
    });
    room.onLeave((code, reason) => {
        console.warn('[net] left room', code, reason || '');
        net.room = null;
        if (code !== 1000) $('#offline').hidden = false;
    });
    return room;
}

// =====================================================================================
// Camera & input
// =====================================================================================
const cam = { yaw: SPAWN_YAW + Math.PI, pitch: 0.32, dist: 22, target: new V3() };
let camSens = 1;
const keys = {};
const touchMove = { x: 0, y: 0 };
let touchJump = false, touchDown = false, running = false;
const pointer = { x: 0, y: 0, has: false };

function pressJump() { P.jumpPress = clockT; }
addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) { if (e.key === 'Enter') e.target.blur(); return; }
    if (e.code === 'Space' && !e.repeat && running) pressJump();
    keys[e.code] = true;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.code === 'KeyE' && running) { if (activePrompt) usePrompt(); else useTool(true); }
    if (running && /^Digit[1-9]$/.test(e.code)) { const g = hotbarGear()[+e.code.slice(5) - 1]; if (g) actions.equip(g.id); }
    if (e.code === 'Escape') {
        if (closeTop()) return;
        if (running && BX.isEmbedded()) BX.showPortalMenu();
    }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const drags = new Map();
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); drags.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() }); canvas.focus(); });
canvas.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.has = e.pointerType === 'mouse';
    const d = drags.get(e.pointerId);
    if (!d) return;
    const k = (e.pointerType === 'touch' ? 0.008 : 0.005) * camSens;
    cam.yaw -= (e.clientX - d.x) * k;
    cam.pitch = clamp(cam.pitch + (e.clientY - d.y) * k, -0.6, 1.35);
    d.x = e.clientX; d.y = e.clientY;
});
const endDrag = (e) => {
    const d = drags.get(e.pointerId);
    drags.delete(e.pointerId);
    // A tap / click without dragging uses the tool at that spot
    if (d && e.type === 'pointerup' && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 7 && performance.now() - d.t0 < 350 && running) useTool(false, e.clientX, e.clientY);
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist + Math.sign(e.deltaY) * 2.5, 6, 70); e.preventDefault(); }, { passive: false });

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
(function joystick() {
    const stick = $('#stick'), knob = $('#knob');
    let id = null;
    const set = (e) => {
        const r = stick.getBoundingClientRect();
        let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const max = r.width / 2, l = Math.hypot(dx, dy);
        if (l > max) { dx *= max / l; dy *= max / l; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        touchMove.x = dx / max; touchMove.y = dy / max;
    };
    stick.addEventListener('pointerdown', (e) => { id = e.pointerId; stick.setPointerCapture(id); set(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; touchMove.x = touchMove.y = 0; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    const hold = (el, on, off) => {
        el.addEventListener('pointerdown', (e) => { e.preventDefault(); on(); });
        el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
    };
    hold($('#jumpBtn'), () => { touchJump = true; pressJump(); }, () => { touchJump = false; });
    hold($('#downBtn'), () => { touchDown = true; }, () => { touchDown = false; });
    $('#useBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); useTool(true); });
})();

// Ray against the boxes near the player (camera collision, grappling hook aim)
function rayHit(o, d, maxT, opts) {
    let best = maxT;
    const list = opts && opts.all ? nearBoxes : nearBoxes;
    for (const c of list) {
        if (c.off || (!(opts && opts.movers) && c.mover) || c.mat === 'glass' && !(opts && opts.glass)) continue;
        let t0 = 0, t1 = best, hit = true;
        for (const a of ['x', 'y', 'z']) {
            if (Math.abs(d[a]) < 1e-9) { if (o[a] < c.min[a] || o[a] > c.max[a]) { hit = false; break; } continue; }
            let ta = (c.min[a] - o[a]) / d[a], tb = (c.max[a] - o[a]) / d[a];
            if (ta > tb) { const q = ta; ta = tb; tb = q; }
            t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
            if (t0 > t1) { hit = false; break; }
        }
        if (hit && t0 > 0 && t0 < best) best = t0;
    }
    if (opts && opts.round) for (const s of nearRound) {
        // treat round shapes as their bounding boxes for aiming
        let t0 = 0, t1 = best, hit = true;
        for (const a of ['x', 'y', 'z']) {
            if (Math.abs(d[a]) < 1e-9) { if (o[a] < s.min[a] || o[a] > s.max[a]) { hit = false; break; } continue; }
            let ta = (s.min[a] - o[a]) / d[a], tb = (s.max[a] - o[a]) / d[a];
            if (ta > tb) { const q = ta; ta = tb; tb = q; }
            t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
            if (t0 > t1) { hit = false; break; }
        }
        if (hit && t0 > 0 && t0 < best) best = t0;
    }
    return best;
}

// ----- tools: grappling hook and slap -----
const ray = new T.Raycaster(), ndc = new T.Vector2();
let rope = null;
function useTool(center, sx, sy) {
    const id = tool();
    if (id === 'grapple') {
        if (clockT - P.lastTool < 0.25) return;
        P.lastTool = clockT;
        const x = center || sx === undefined ? innerWidth / 2 : sx, y = center || sy === undefined ? innerHeight / 2 : sy;
        ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const o = ray.ray.origin, d = ray.ray.direction;
        // search all stages around the player (the hook reaches far)
        const saveB = nearBoxes, saveR = nearRound;
        const zs = new Set([P.stage - 2, P.stage - 1, P.stage, P.stage + 1, P.stage + 2]);
        nearBoxes = solids.filter((s) => !s.shape && (s.zone < 0 || zs.has(s.zone)));
        nearRound = solids.filter((s) => s.shape && (s.zone < 0 || zs.has(s.zone)));
        const t = rayHit(o, d, 400, { round: true, movers: true });
        nearBoxes = saveB; nearRound = saveR;
        if (t >= 400) { sfx('denied'); return; }
        const pt = o.clone().addScaledVector(d, t);
        if (pt.distanceTo(P.pos) > CFG.grappleRange) { toast('Too far to hook!', '#ff8a9a'); sfx('denied'); return; }
        P.grapple = { pt, t: 0 };
        P.climbing = null;
        sfx('grapple'); setTimeout(() => sfx('hook'), 120);
    } else if (id === 'slap') {
        if (clockT - P.lastSlap < CFG.slapCooldown) return;
        P.lastSlap = clockT;
        P.swing = 0.35;
        sfx('slap');
        let best = null, bd = CFG.slapRange;
        const fx = Math.sin(P.facing), fz = Math.cos(P.facing);
        for (const [rid, r] of remotes) {
            const dx = r.rig.position.x - P.pos.x, dz = r.rig.position.z - P.pos.z, d = Math.hypot(dx, dz);
            if (d < bd && Math.abs(r.rig.position.y - P.pos.y) < 6 && (dx * fx + dz * fz) / (d || 1) > -0.2) { bd = d; best = rid; }
        }
        if (best) { net.send('slap', { t: best }); popSpark(remotes.get(best).rig.position.clone().add(new V3(0, 3, 0)), 0xffffff); }
    }
}
function updateRope() {
    if (P.grapple && rig) {
        if (!rope) {
            rope = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 1, 6, 1, true), new T.MeshBasicMaterial({ color: 0xf0e0b8 }));
            rope.geometry.translate(0, 0.5, 0); rope.geometry.rotateX(Math.PI / 2);
            scene.add(rope);
        }
        const from = rig.localToWorld(new V3(1.5, 2.6, 1.2));
        rope.position.copy(from);
        rope.lookAt(P.grapple.pt);
        rope.scale.set(1, 1, from.distanceTo(P.grapple.pt));
        rope.visible = true;
    } else if (rope) rope.visible = false;
}

const camDir = new V3(), camGoal = new V3(), camPos = new V3(), accTmp = new T.Color();
let baseFov = camera.fov;
function updateCamera(dt) {
    const t = performance.now() / 1000;
    if (!running) {
        camera.position.set(Math.sin(t * 0.07) * 40, 30 + Math.sin(t * 0.1) * 10, Math.cos(t * 0.07) * 40);
        camera.lookAt(0, 60, 0);
        updateSky(camera.position, t);
        return;
    }
    cam.target.lerp(camGoal.set(P.pos.x, P.pos.y + 5, P.pos.z), 1 - Math.exp(-dt * 16));
    const cp = Math.cos(cam.pitch);
    camDir.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
    const dist = Math.max(2.5, rayHit(cam.target, camDir, cam.dist, { glass: true }) - 0.8);
    camPos.copy(cam.target).addScaledVector(camDir, dist);
    camera.position.copy(camPos);
    camera.lookAt(cam.target);
    if (shake > 0.001) {
        const s = shake * shake * 0.9;
        camera.position.x += (Math.random() * 2 - 1) * s;
        camera.position.y += (Math.random() * 2 - 1) * s;
        shake = Math.max(0, shake - dt * 2.2);
    }
    const fovBase = innerWidth < innerHeight ? 85 : 70;
    const want = fovBase + (P.grapple ? 8 : 0) + (P.flying && P.moving ? 4 : 0) + (tool() === 'speedCoil' && P.moving ? 3 : 0);
    baseFov += (want - baseFov) * Math.min(1, dt * 5);
    if (Math.abs(camera.fov - baseFov) > 0.01) { camera.fov = baseFov; camera.updateProjectionMatrix(); }
    sun.position.set(P.pos.x + 40, P.pos.y + 90, P.pos.z - 70);
    sun.target.position.copy(P.pos);
    // the accent lights ride along: one in the stage colour above and in front, one cool cyan behind
    const acc = STAGES[Math.max(0, P.stage)];
    // kept on the tower side of the player, so they light the course rather than the walls
    const tc = Math.hypot(P.pos.x, P.pos.z) || 1, ix = -P.pos.x / tc, iz = -P.pos.z / tc;
    accentA.position.set(P.pos.x + ix * 10 + Math.sin(t * 0.4) * 3, P.pos.y + 10, P.pos.z + iz * 10 + Math.cos(t * 0.4) * 3);
    accentB.position.set(P.pos.x + ix * 4 - iz * 8, P.pos.y + 5, P.pos.z + iz * 4 + ix * 8);
    accentA.color.lerp(accTmp.set(acc ? acc.bar : 0xff4ad8), Math.min(1, dt * 2));
    camFill.position.copy(camera.position).add(camDir.clone().multiplyScalar(4)).setY(camera.position.y + 6);
    camFill.target.position.copy(cam.target);
    updateSky(camera.position, t);
    const st = STAGES[Math.max(0, P.stage)];
    updateAmbient(camera.position, t, st ? st.accent : 0xff8ad8);
}

// Proximity prompts
let activePrompt = null;
const projV = new V3();
function updatePrompt() {
    let best = null, bd = Infinity;
    for (const p of nearPrompts) {
        const d = p.pos.distanceTo(P.pos);
        if (d < p.r && d < bd) { bd = d; best = p; }
    }
    activePrompt = best;
    if (!best) { promptEl.hidden = true; return; }
    projV.copy(best.pos).setY(best.pos.y + 2).project(camera);
    if (projV.z > 1) { promptEl.hidden = true; return; }
    promptEl.hidden = false;
    promptEl.style.left = ((projV.x + 1) / 2 * innerWidth) + 'px';
    promptEl.style.top = ((1 - projV.y) / 2 * innerHeight) + 'px';
    const txt = best.label();
    if (promptTxtEl.textContent !== txt) promptTxtEl.textContent = txt;
}
function usePrompt() { if (activePrompt) activePrompt.act(); }
promptEl.addEventListener('click', usePrompt);

// Controller: popups first, then gameplay
let padJumpWas = false;
function padButtons() {
    if (pad.jump && !padJumpWas && running) pressJump();
    padJumpWas = pad.jump;
    const p = pad.pressed;
    if (!p.size) return;
    if (p.has('B') && closeTop()) return;
    if (!running) return;
    if (p.has('X')) { if (activePrompt) usePrompt(); else useTool(true); }
    if (p.has('Y')) openModal('store');
    if (p.has('LB') || p.has('RB')) {
        const list = hotbarGear();
        if (list.length) {
            const i = list.findIndex((g) => g.id === S.tool);
            const n = list[((i < 0 ? (p.has('RB') ? -1 : 0) : i) + (p.has('RB') ? 1 : -1) + list.length) % list.length];
            actions.equip(n.id);
        }
    }
    if (p.has('BACK')) openModal('pets');
    if (p.has('START')) openModal('config');
    if (p.has('UP')) cam.dist = clamp(cam.dist - 4, 6, 70);
    if (p.has('DOWN')) cam.dist = clamp(cam.dist + 4, 6, 70);
}
onGamepadConnection((g, on) => { if (running) toast(on ? '🎮 Controller connected' : '🎮 Controller disconnected', on ? '#7dff6b' : '#ffb51c'); });

// =====================================================================================
// Main update
// =====================================================================================
const botInput = { f: 0, r: 0, jump: false, down: false };
let qaWalk = 0;
let clockT = 0, hudT = 0, progT = 0;
const tmpF = new V3(), tmpR = new V3(), mv = new V3();
// Sounds per surface (solids carry a material tag)
function surfaceSound(m) {
    return { block: 'block', wall: 'block', floor: 'floor', tile: 'tile', jelly: 'jelly', keys: 'keys', dome: 'dome', slime: 'slime', butter: 'butter', popit: 'popit', wrap: 'wrap', truss: 'truss', mochi: 'mochi', bounce: 'bounce', gold: 'gold', squishy: 'squishy', glass: 'tile' }[m] || 'block';
}
const SPLASH = { slime: 0xb8ff2a, jelly: 0x6aff6a, dome: 0x9aff9a, butter: 0xffe48a, floor: 0x6aff6a, squishy: 0xff9ae0, bounce: 0xb8ff2a, mochi: 0xfff0f6 };
// keys sink: you walk at the pressed level on the keyboard; slime: you sink a little
function keySink(cur, ground, onKeys, dt) {
    const target = ground && onKeys ? KEY.press : 0;
    const rate = !ground ? 5 : target > cur ? 30 : 14;
    return cur + (target - cur) * Math.min(1, dt * rate);
}
let stepRipple = 1;
function footStep(g) {
    const m = g.mat;
    if (m === 'keys') return;       // keys click per key (below)
    if (m === 'popit') return;      // bubbles pop per bubble (below)
    asmrStep(surfaceSound(m), false);
    if (m === 'jelly') jellyHit(P.pos.x, P.pos.y, P.pos.z, 0.35);
    if (m === 'slime' || m === 'floor') {
        const side = (P.lastStepN % 2 ? 0.55 : -0.55);
        const fx = P.pos.x + Math.cos(P.facing) * side, fz = P.pos.z - Math.sin(P.facing) * side;
        slimeFeet[stepRipple].set(fx, fz, 0.9, 0);
        stepRipple = stepRipple % 7 + 1;
        if (m === 'slime' && Math.random() < 0.6) splash(new V3(fx, P.pos.y, fz), 0xb8ff2a, 3, 0.6);
    } else if (m === 'butter' && Math.random() < 0.3) splash(P.pos, 0xffe48a, 2, 0.4);
    else if (m === 'wrap') popSpark(P.pos, 0x9ae8ff);
}
function land(g, hard) {
    const m = g.mat;
    asmrStep(surfaceSound(m), true);
    if (m === 'jelly') jellyHit(P.pos.x, P.pos.y, P.pos.z, hard ? 1.5 : 1);
    if (SPLASH[m]) splash(P.pos, SPLASH[m], hard ? 14 : 7, hard ? 1.2 : 0.8);
    else dust(P.pos, hard ? 10 : 5, hard ? 1.3 : 0.9);
    if (m === 'slime' || m === 'floor') { slimeFeet[stepRipple].set(P.pos.x, P.pos.z, m === 'floor' ? 1.1 : 1.6, 0); stepRipple = stepRipple % 7 + 1; }
    P.squashV -= hard ? 8 : 4;
}

function update(dt) {
    clockT += dt;
    const t = clockT;
    let f = botInput.f, r = botInput.r;
    if (keys.KeyW || keys.ArrowUp) f += 1;
    if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) r += 1;
    if (keys.KeyA || keys.ArrowLeft) r -= 1;
    f -= touchMove.y + pad.ly; r += touchMove.x + pad.lx;
    cam.yaw -= pad.rx * 2.8 * dt;
    cam.pitch = clamp(cam.pitch + pad.ry * 1.8 * dt, -0.6, 1.35);
    tmpF.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
    tmpR.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
    mv.set(0, 0, 0).addScaledVector(tmpF, f).addScaledVector(tmpR, r);
    if (mv.lengthSq() > 1) mv.normalize();
    if (anyPopup() && !isTouch) mv.set(0, 0, 0);
    P.moving = mv.lengthSq() > 0.01;
    const jumpHeld = keys.Space || touchJump || pad.jump || botInput.jump;
    const downHeld = keys.ShiftLeft || keys.ShiftRight || keys.KeyQ || keys.KeyC || touchDown || pad.sprint || botInput.down;

    // The world moves first, so riders are carried and hits line up
    updateWorld(dt, t);
    updatePressed(dt);

    const id = tool();
    P.flying = id === 'carpet';
    const ws = P.flying ? CFG.carpetSpeed : walkSpeed();
    const g = gravity();
    // Carried by moving platforms and spinning mochi
    if (P.onGround && P.ground) {
        if (P.ground.mover) P.pos.add(P.ground.delta);
        if (P.ground.spin) {
            const a = -P.ground.spin * dt, dx = P.pos.x - P.ground.cx, dz = P.pos.z - P.ground.cz;
            const c = Math.cos(a), s = Math.sin(a);
            P.pos.x = P.ground.cx + dx * c + dz * s; P.pos.z = P.ground.cz - dx * s + dz * c;
            P.facing += a; cam.yaw += a;
        }
    }
    depenetrate();

    // ----- vertical: jump, climb, fly, jetpack, grapple -----
    const truss = !P.flying && !P.grapple ? trussTouching() : null;
    if (truss) {
        // pushing toward the truss (or hanging on it already): climb
        const cx = clamp(P.pos.x, truss.min.x, truss.max.x) - P.pos.x, cz = clamp(P.pos.z, truss.min.z, truss.max.z) - P.pos.z;
        const l = Math.hypot(cx, cz) || 1;
        const into = mv.lengthSq() > 0.01 ? (mv.x * cx + mv.z * cz) / l / Math.sqrt(mv.lengthSq()) : 0;
        if (into > 0.25 || (P.climbing && into > -0.4 && !P.onGround)) {
            if (!P.climbing) P.climbT = 0;
            P.climbing = truss;
        } else P.climbing = null;
    } else P.climbing = null;
    const pressed = t - P.jumpPress < 0.2;
    if (P.onGround) P.coyote = 0.1; else P.coyote -= dt;
    if (P.grapple) {
        P.grapple.t += dt;
        const to = new V3().subVectors(P.grapple.pt, P.pos).setY(P.grapple.pt.y - P.pos.y - 1);
        const d = to.length();
        if (d < 3.2 || P.grapple.t > 2.6) { P.grapple = null; P.vel.y = Math.max(P.vel.y, 26); }
        else {
            to.multiplyScalar(CFG.grappleSpeed / d);
            P.vel.y = to.y; P.kv.set(to.x, 0, to.z);
            if (pressed) { P.grapple = null; P.vel.y = jumpV(); P.jumpPress = -9; }
        }
        loopSound('reel', P.grapple ? 1 : 0);
    } else loopSound('reel', 0);
    if (!P.grapple) {
        if (P.flying) {
            const vy = jumpHeld ? CFG.carpetSpeed * 0.75 : downHeld ? -CFG.carpetSpeed * 0.75 : 0;
            P.vel.y += (vy - P.vel.y) * Math.min(1, dt * 6);
        } else if (P.climbing) {
            P.climbT += dt;
            P.vel.y = P.moving ? CFG.climb : 0;
            if (pressed) { P.vel.y = jumpV() * 0.85; P.climbing = null; P.jumpPress = -9; sfx('jump'); }
        } else {
            if (pressed && (P.onGround || P.coyote > 0)) {
                P.vel.y = jumpV(); P.onGround = false; P.coyote = 0; P.jumpPress = -9; P.ground = null;
                sfx('jump'); P.squashV += 5;
            }
            P.vel.y -= g * dt;
            // Jetpack: hold jump in the air
            P.jetOn = false;
            if (id === 'jetpack' && !P.onGround && jumpHeld && P.jetFuel > 0 && t - P.jumpPress > 0.12) {
                P.vel.y = Math.min(32, P.vel.y + (CFG.jetThrust + g) * dt);
                P.jetFuel -= dt; P.jetOn = true;
            }
        }
    }
    if (P.onGround) P.jetFuel = Math.min(CFG.jetFuel, P.jetFuel + dt * 2.2);
    loopSound('jet', P.jetOn ? 1 : 0);
    loopSound('carpet', P.flying ? (P.moving || Math.abs(P.vel.y) > 1 ? 1 : 0.6) : 0);
    setFuel(P.jetFuel / CFG.jetFuel, id === 'jetpack' && P.jetFuel < CFG.jetFuel - 0.01);

    // ----- horizontal: instant on most things, slippery on butter, knockback on top -----
    const tx = mv.x * ws, tz = mv.z * ws;
    const ice = P.ground && P.ground.ice;
    if (!P.hv) P.hv = new V3();
    if (ice || (P.onIce && !P.onGround)) {
        const k = 1 - Math.exp(-dt * (P.onGround ? 3.6 : 2.6));
        P.hv.x += (tx - P.hv.x) * k; P.hv.z += (tz - P.hv.z) * k;
    } else P.hv.set(tx, 0, tz);
    if (P.onGround) P.onIce = !!ice;
    let vx = P.hv.x + P.kv.x, vz = P.hv.z + P.kv.z;
    if (P.grapple) { vx = P.kv.x + tx * 0.25; vz = P.kv.z + tz * 0.25; }
    else P.kv.multiplyScalar(Math.exp(-dt * (P.onGround ? 9 : 1.6)));
    // slime is a little sticky
    if (P.onGround && P.ground && P.ground.slime) { vx *= 0.88; vz *= 0.88; }

    const dist = Math.max(Math.abs(vx), Math.abs(vz), Math.abs(P.vel.y)) * dt;
    const n = Math.max(1, Math.ceil(dist / 0.5));
    const sdt = dt / n;
    const wasGround = P.ground, wasOn = P.onGround;
    P.onGround = false; P.ground = null;
    let vy = P.flying || P.climbing || P.grapple ? P.vel.y : P.vel.y + 0.5 * g * dt;
    for (let i = 0; i < n; i++) {
        moveAxis('x', vx * sdt);
        moveAxis('z', vz * sdt);
        const before = P.vel.y;
        moveAxis('y', vy * sdt);
        if (P.vel.y !== before) vy = P.vel.y;
        resolveRound();
    }
    if (!P.onGround && wasOn && P.vel.y <= 0 && !P.flying && !P.climbing && !(wasGround && wasGround.bounce)) groundProbe(0.7);
    else if (!P.onGround && P.vel.y <= 0 && !P.flying && !P.climbing) groundProbe(0.05);

    // ----- landing, bouncing, surfaces -----
    if (P.onGround) {
        const gr = P.ground;
        if (gr && gr.bounce && !P.flying) {
            P.vel.y = gr.bounce; P.onGround = false; P.ground = null;
            asmrStep(gr.squishy ? 'squishy' : 'bounce', true);
            if (gr.squishy) squishBig(gr); else jiggle(gr);
            splash(P.pos, gr.squishy ? 0xff9ae0 : 0xb8ff2a, 12, 1.2);
            addShake(0.2); P.squashV -= 6; P.airTime = 0.01; P.peakY = P.pos.y;
        } else {
            if (P.airTime > 0.25 && gr) land(gr, P.airTime > 0.8);
            // a long fall: down to the lobby, or well below your checkpoint
            const fell = P.peakY - P.pos.y;
            if (fell > 26 && !P.flying) {
                sfx('oops'); addShake(0.6); rumble(0.6, 250); showOof();
                net.send('fell');
                const cp = CHECKPOINTS[S.stage];
                if (S.stage >= 0 && cp && P.pos.y < cp.y - 8) showOops();
            }
            P.airTime = 0; P.peakY = P.pos.y;
        }
    } else {
        P.airTime += dt;
        P.peakY = Math.max(P.peakY, P.pos.y);
        if (P.flying || P.climbing || P.grapple) P.peakY = P.pos.y;
    }
    if (P.flying || P.climbing) { P.airTime = 0; }
    // dome squish, melting jelly, pop-it bubbles, keys
    const gr = P.onGround ? P.ground : null;
    if (gr && gr.shape === 'dome') pressDome(gr);
    if (gr && gr.vanish) touchVanish(gr);
    if (gr && gr.popit && rig) {
        const fx = Math.cos(P.facing) * 0.5, fz = -Math.sin(P.facing) * 0.5;
        let popped = 0;
        for (const s of [1, -1]) if (popAt(gr.popit, P.pos.x + fx * s, P.pos.z + fz * s)) popped++;
        if (popped && t - P.lastClick > 0.05) { P.lastClick = t; asmrStep('popit', P.airTime > 0.25); popSpark(P.pos, 0xff8ad8); }
    }
    for (const tile of popits) if (tile.flipped) { tile.flipped = false; if (tile.group.position.distanceTo(P.pos) < 30) popitFlip(); }
    // slime under your feet dents
    const onSlime = gr && (gr.slime || gr.mat === 'floor');
    P.slime += ((onSlime ? 1 : 0) - P.slime) * Math.min(1, dt * 8);
    slimeFeet[0].set(P.pos.x, P.pos.z, P.slime * 0.8, 0.1);
    for (let i = 1; i < 8; i++) slimeFeet[i].w += dt;
    tickSlime(t);

    // facing
    if (P.moving && mv.lengthSq() > 0.01 && !P.climbing) P.facing = lerpAngle(P.facing, Math.atan2(mv.x, mv.z), 1 - Math.exp(-dt * 14));
    else if (P.climbing) {
        const c = P.climbing, cx = clamp(P.pos.x, c.min.x, c.max.x) - P.pos.x, cz = clamp(P.pos.z, c.min.z, c.max.z) - P.pos.z;
        if (Math.hypot(cx, cz) > 0.01) P.facing = lerpAngle(P.facing, Math.atan2(cx, cz), 1 - Math.exp(-dt * 10));
    }

    // ----- where you are -----
    const here = stageAtY(P.pos.y);
    if (here !== P.stage) {
        if (here > P.stage && here >= 0 && P.onGround && here > (S.stage ?? -1)) showStageTitle(here);
        P.stage = here;
        refreshNear(Math.max(-1, here));
    }
    // safety net: nothing should be below the lobby floor or outside the tower
    if (P.pos.y < -20 || Math.abs(P.pos.x) > 120 || Math.abs(P.pos.z) > 140) teleport(SPAWN, SPAWN_YAW, true);
    // sweeping jelly bars knock you off
    const st = net.now() / 1000;
    for (const w of sweepers) {
        if (Math.abs(w.zone - P.stage) > 1 || t - P.sweepHit < 0.5) continue;
        if (P.pos.y > w.y + 0.6 || P.pos.y + PH < w.y - 0.6) continue;
        const a = sweeperAngle(w, st), dx = Math.cos(a), dz = Math.sin(a);
        const px = P.pos.x - w.cx, pz = P.pos.z - w.cz;
        const proj = clamp(px * dx + pz * dz, -w.len, w.len);
        const ex = px - dx * proj, ez = pz - dz * proj;
        if (Math.hypot(ex, ez) < 0.6 + HW * 0.9) {
            P.sweepHit = t;
            const sgn = Math.sign(proj * w.speed) || 1;
            P.kv.set(-dz * sgn * 34 + ex * 6, 0, dx * sgn * 34 + ez * 6);
            P.vel.y = 24; P.onGround = false;
            asmrStep('jelly', true); sfx('slapped'); addShake(0.4);
        }
    }
    // triggers (checkpoints, summit, gear pads)
    for (const tr of nearTriggers) {
        const inside = overlapsBox(tr, P.pos);
        if (inside && !tr.inside && tr.enter) tr.enter();
        tr.inside = inside;
    }
    checkCoins();

    if (S.name && headLabel) {
        const key = S.name + '|' + !!S.passes.VIP;
        if (key !== nameLabelText) { nameLabelText = key; headLabel.userData.set(nameLines(S.name, S.passes.VIP)); }
    }
    updateEffects(dt);
    updateFx(dt);
    for (const fn of tickers) fn(dt, t);

    const marks = syncRemotes(dt, t);
    friendsT -= dt; friendSyncT -= dt;
    if (friendsT <= 0) { friendsT = 30; friendSyncT = 5; refreshFriends(); }
    else if (friendSyncT <= 0) { friendSyncT = 5; syncFriends(); }

    // ----- the local character -----
    if (rig) {
        const u = rig.userData;
        rig.position.copy(P.pos);
        rig.rotation.y = P.facing;
        const hs = P.moving ? ws : 0;
        const prevPhase = P.animPhase;
        P.animPhase += dt * (P.onGround ? Math.min(18, 4 + hs * 0.3) : P.climbing && P.vel.y > 0 ? 9 : 0);
        if (P.climbing) climbPose(u.body, P.animPhase);
        else if (P.flying) { animRig(u.body, 0, 0); u.body.userData.legs[0].rotation.set(-0.9, 0, 0); u.body.userData.legs[1].rotation.set(-0.9, 0, 0); }
        else if (!P.onGround) airPose(u.body);
        else if (P.moving) animRig(u.body, P.animPhase, 0.85);
        else animRig(u.body, 0, 0);
        if (u.held && !P.climbing) holdPose(u.body);
        if (P.swing > 0) { P.swing -= dt; u.body.userData.arms[1].rotation.set(-1.4, 0, -1.6 * Math.sin((1 - P.swing / 0.35) * Math.PI)); }
        if (localAvatar) localAvatar.update(dt, { moving: P.moving && P.onGround, air: !P.onGround && !P.climbing, speed: hs, t });
        setTool(rig, id); setTrail(rig, S.trail);
        if (u.carpet) { u.carpet.visible = P.flying; waveCarpet(u.carpet, t, P.moving ? 1.4 : 0.8); }
        if (P.jetOn && Math.random() < dt * 40) for (const nx of [-0.45, 0.45]) flame(rig.localToWorld(new V3(nx, 1.6, -1)), 0.3, 0.9, new V3(0, -12, 0));
        u.trail.update(trailAt(rig), (P.moving || !P.onGround), dt, t);
        // footsteps: every half stride, the surface under you makes its sound
        const stepN = Math.floor(P.animPhase / Math.PI);
        if (P.onGround && P.moving && stepN !== P.lastStepN && P.ground) footStep(P.ground);
        if (P.climbing && stepN !== P.lastStepN && P.vel.y > 0) asmrStep('truss', false);
        P.lastStepN = stepN;
        void prevPhase;
        // Keys under your feet press down; each new key clicks
        const under = P.onGround ? keyAt(P.pos.x, P.pos.y, P.pos.z) : null;
        if (pressKey(under) && t - P.lastClick > 0.07) { P.lastClick = t; asmrStep('keys', P.airTime > 0.25); }
        const onKeys = P.onGround && pressAround(P.pos.x, P.pos.y, P.pos.z, 0.9);
        P.sink = keySink(P.sink || 0, P.onGround, onKeys, dt);
        const slimeSink = P.slime * (gr && gr.mat === 'floor' ? 0.12 : 0.35);
        const runBob = P.onGround && P.moving && !P.climbing ? Math.abs(Math.sin(P.animPhase)) * 0.18 : 0;
        u.pivot.position.y = PIVOT - P.sink - slimeSink + runBob;
        const leanTo = P.climbing ? 0 : P.flying ? (P.moving ? 0.28 : 0) : P.onGround && P.moving ? Math.min(0.17, ws * 0.007) : !P.onGround ? -0.06 : 0;
        P.lean = (P.lean || 0) + (leanTo - (P.lean || 0)) * Math.min(1, dt * 9);
        let turn = P.facing - (P.prevFacing ?? P.facing);
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        P.prevFacing = P.facing;
        const rollTo = clamp(-turn / Math.max(dt, 1e-3) * 0.045, -0.22, 0.22) * (P.moving ? 1 : 0);
        P.roll = (P.roll || 0) + (rollTo - (P.roll || 0)) * Math.min(1, dt * 7);
        u.pivot.rotation.set(P.lean, 0, P.roll);
        P.squashV += (1 - P.squash) * 180 * dt;
        P.squashV *= Math.exp(-12 * dt);
        P.squash = clamp(P.squash + P.squashV * dt, 0.72, 1.28);
        rig.scale.set(1 / Math.sqrt(P.squash), P.squash, 1 / Math.sqrt(P.squash));
        if (myPets) {
            myPets.set(equippedPetDefs());
            myPets.update(P.pos, P.facing, dt, t, true);
        }
    }
    updateRope();
    $('#crosshair').hidden = !(id === 'grapple' && !isTouch && !anyPopup());
    $('#useBtn').hidden = !(isTouch && (id === 'grapple' || id === 'slap'));
    $('#downBtn').hidden = !(isTouch && id === 'carpet');
    if (isTouch) $('#useBtn').textContent = id === 'slap' ? '🖐️' : '🪝';

    sendMove(false);
    updatePrompt();
    animateCounters(dt);
    hudT -= dt;
    if (hudT <= 0) { hudT = 0.1; updateHud(); renderHotbar(); setDecorLow(getQuality() === 'low'); }
    progT -= dt;
    if (progT <= 0) {
        progT = 0.25;
        marks.push({ id: 'me', name: S.name, k: clamp(P.pos.y / COURSE_TOP, 0, 1), me: true, color: '#ffffff' });
        renderProgress(marks);
    }
}
function confettiBurst(pos) {
    for (const c of [0x46ff5a, 0xffd028, 0xff4ad8, 0x3ad8ff, 0xc45aff]) splash(pos.clone().add(new V3(0, 3, 0)), c, 6, 1.5);
}
let petKeyCache = '', petDefsCache = [];
function equippedPetDefs() {
    const key = (S.equippedPets || []).join(',') + '|' + (S.pets || []).length;
    if (key !== petKeyCache) {
        petKeyCache = key;
        petDefsCache = (S.equippedPets || []).map((u) => (S.pets || []).find((p) => p.u === u)).filter(Boolean).map((p) => petById[p.id]).filter(Boolean);
    }
    return petDefsCache;
}

// =====================================================================================
// Boot
// =====================================================================================
let lastFrame = 0, loadingSignaled = false, fpsAcc = 0, fpsFrames = 0, showFps = false;
// Slow PC? After joining, if the game keeps running under ~40 FPS for 3 s (and the tab is visible),
// step the graphics down one level. It never steps back up, and stops once the player picks one.
const fpsWatch = { t: 0, low: 0 };
function watchFps(fps) {
    if (!running || document.hidden || !autoQualityAllowed()) return;
    fpsWatch.t += 0.5;
    if (fpsWatch.t < 4) return;
    fpsWatch.low = fps < 40 ? fpsWatch.low + 0.5 : 0;
    if (fpsWatch.low < 3) return;
    fpsWatch.low = 0;
    const next = { high: 'medium', medium: 'low' }[getQuality()];
    if (!next) return;
    setQuality(next, true);
    toast('⚙️ Graphics set to ' + (next === 'medium' ? 'Medium' : 'Low') + ' for smoother play', '#7de8ff');
}
function frame(now) {
    const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
    fpsAcc += (now - (lastFrame || now)) / 1000; fpsFrames++;
    if (fpsAcc >= 0.5) { if (showFps) $('#fps').textContent = Math.round(fpsFrames / fpsAcc) + ' FPS'; watchFps(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }
    lastFrame = now;
    if (!loadingSignaled) { loadingSignaled = true; BX.triggerAllSettings(); }
    pollGamepad();
    padButtons();
    if (running) update(dt);
    else if (!warming) { for (const fn of tickers) fn(dt, now / 1000); updateWorld(dt, now / 1000); }
    // behind the loading screen nothing needs drawing while the shaders compile
    if (!warming || running) { updateCamera(dt); render(); }
    requestAnimationFrame(frame);
}

// Straight into the game: no menu. Joins with the Bloxity name (or guest name) automatically.
let joining = false;
async function play() {
    if (joining || running) return;
    joining = true;
    const err = $('#connectErr'), retry = $('#playBtn');
    err.hidden = true; retry.hidden = true;
    $('#loading').hidden = false;
    $('#loading').textContent = 'Joining…';
    BX.loadingStep('Joining a server…');
    initAudio();
    try {
        await waitForLogin(1500);
        const saved = (storageGet('asmr_name') || '').slice(0, 20);
        let room = null;
        for (let attempt = 0; !room; attempt++) {
            try { room = await connect(BX.identity().loggedIn ? '' : saved); } catch (e) {
                if (attempt >= 4) throw e;
                console.warn('[join] attempt', attempt + 1, 'failed:', e && e.message);
                $('#loading').textContent = 'Waking up a server…';
                await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
            }
        }
        const me = room.state.players && room.state.players.get(room.sessionId);
        S.name = me ? me.name : S.name;
    } catch (e) {
        console.error(e);
        joining = false;
        $('#loading').hidden = true;
        err.hidden = false;
        err.textContent = 'Could not reach the game server. Check your connection and try again.';
        retry.hidden = false;
        BX.loadingEnd();
        return;
    }
    // every shader compiled and texture uploaded before the player appears (no spawn hitches)
    $('#loading').textContent = 'Getting the tower ready…';
    await Promise.race([prewarmed, new Promise((r) => setTimeout(r, 15000))]);
    joining = false;
    running = true;
    S.joinedAt = Date.now();
    startMusic();
    $('#start').hidden = true;
    $('#hud').hidden = false;
    $('#touch').hidden = !isTouch;
    if (!rig) buildPlayer(0, 0);
    teleport(SPAWN, SPAWN_YAW);
    cam.target.set(P.pos.x, P.pos.y + 5, P.pos.z);
    showTips();
    toast('Climb the ASMR Tower! The jelly stairs start by the WORLDS door ↙', '#7dff6b');
    setTimeout(() => { if (audioSuspended()) toast('🔊 Click or tap anywhere for the satisfying sounds!', '#ff8ad8'); }, 3500);
    canvas.focus();
    BX.loadingEnd();
}
function waitForLogin(ms) {
    if (!BX.bloxity.ready || BX.identity().loggedIn) return Promise.resolve();
    return new Promise((res) => {
        const t0 = performance.now();
        (function check() { if (BX.identity().loggedIn || performance.now() - t0 > ms) res(); else setTimeout(check, 100); })();
    });
}
function showTips() {
    const el = $('#tips');
    const k = (key, what) => `<span><kbd>${key}</kbd>${what}</span>`;
    el.innerHTML = pad.connected
        ? k('L', 'Move') + k('A', 'Jump') + k('X', 'Use / Tool') + k('LB/RB', 'Gear') + k('R', 'Camera')
        : isTouch
            ? '<span>Joystick to move · JUMP · walk into green trusses to climb · drag to look</span>'
            : k('WASD', 'Move') + k('Space', 'Jump') + k('W into truss', 'Climb') + k('1-7', 'Gear') + k('E', 'Use') + k('Drag', 'Camera');
    el.hidden = false; el.style.opacity = 1;
    setTimeout(() => { el.style.opacity = 0; }, 10000);
    setTimeout(() => { el.hidden = true; }, 10900);
}
function unlockAudioOnGesture() {
    const unlock = () => {
        resumeAudio();
        if (!audioSuspended()) for (const ev of ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend', 'click']) removeEventListener(ev, unlock, true);
    };
    for (const ev of ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend', 'click']) addEventListener(ev, unlock, true);
}
function wirePortalSettings() {
    const embedded = (fn) => (v) => { if (BX.isEmbedded()) fn(v); };
    const pct = (v) => { const n = parseFloat(String(v)); if (!isFinite(n)) return undefined; return clamp(n > 1 ? n / 100 : n, 0, 1); };
    BX.listenSetting('master_volume', embedded((v) => { const p = pct(v); if (p !== undefined) setVolume('master', p); }));
    BX.listenSetting('music_volume', embedded((v) => { const p = pct(v); if (p !== undefined) setVolume('music', p); }));
    BX.listenSetting('graphics_quality', embedded((v) => setQuality(v === 'Low' ? 'low' : v === 'Medium' ? 'medium' : 'high', true)));
    BX.listenSetting('camera_sensitivity', embedded((v) => { camSens = clamp(parseFloat(v) || 1, 0.1, 5); }));
    BX.listenSetting('show_fps', (v) => { showFps = v === 'true'; $('#fps').hidden = !showFps; });
}
function wirePortalEvents() {
    BX.onPortalEvent((event, data) => {
        if (event === 'respawn_request') { if (running) actions.teleportCheckpoint(); }
        else if (event === 'chat_message_sent' && data) net.send('chat', { text: String(data) });
        else if (event === 'play_emote' && data) { playEmoteOn(localAvatar, String(data)); net.send('emote', { id: String(data) }); }
    });
    BX.onAvatarChanged(() => syncMyAvatar());
    BX.onProportionsChanged(() => syncMyAvatar());
}
function showIdentity(id) {
    const avail = BX.bloxity.ready;
    $('#acct').hidden = !avail;
    if (!avail) return;
    $('#acctName').textContent = id.name || 'Guest';
    $('#acctBtn').textContent = id.loggedIn ? 'Log out' : 'Log in';
    const pfp = $('#acctPfp');
    pfp.hidden = !id.pfp;
    if (id.pfp) pfp.src = id.pfp;
}
function toggleLogin() { if (BX.identity().loggedIn) BX.logout(); else BX.login(); }

// ----- warm-up while the loading screen is up -----
// On Windows every new shader is compiled (GLSL -> HLSL -> bytecode) the first time it's drawn, and
// every texture is uploaded the first time it's used: both freeze the game for a moment. Doing it all
// here, in parallel with joining the server, means nothing new has to be prepared once you spawn:
// every stage's materials, the pets and gear on display, a player avatar, shadows and post effects.
let prewarmed = Promise.resolve(), warming = false;
async function prewarm() {
    warming = true;
    const t0 = performance.now();
    // a stand-in avatar so the skinned avatar shader is ready too: it downloads while the tower compiles
    const standP = Promise.race([createAvatar(null), new Promise((r) => setTimeout(() => r(null), 6000))]).catch(() => null);
    // everything visible and nothing culled for this one pass
    const hidden = [], culled = [];
    scene.traverse((o) => {
        if (!o.visible && o !== scene) { hidden.push(o); o.visible = true; }
        if ((o.isMesh || o.isSprite || o.isPoints) && o.frustumCulled) { culled.push(o); o.frustumCulled = false; }
    });
    try {
        if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
        else renderer.compile(scene, camera);
    } catch (e) { console.warn('[prewarm] compile', e); }
    // upload every texture now (maps, normal maps, glow maps, and textures inside custom shaders)
    const seen = new Set();
    const upload = (t) => { if (t && t.isTexture && !seen.has(t)) { seen.add(t); try { renderer.initTexture(t); } catch (e) { /* skip */ } } };
    scene.traverse((o) => {
        const list = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of list) {
            for (const k in m) upload(m[k]);
            if (m.uniforms) for (const k in m.uniforms) upload(m.uniforms[k] && m.uniforms[k].value);
        }
    });
    // one full frame with shadows and bloom, hidden behind the loading screen
    try { render(); } catch (e) { console.warn('[prewarm] render', e); }
    for (const o of hidden) o.visible = false;
    for (const o of culled) o.frustumCulled = true;
    const t1 = performance.now();
    const stand = await standP;
    if (stand) {
        try {
            stand.root.position.set(SPAWN.x, SPAWN.y, SPAWN.z + 4);
            scene.add(stand.root);
            if (renderer.compileAsync) await renderer.compileAsync(stand.root, camera, scene);
            stand.root.traverse((o) => { const l = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of l) for (const k in m) upload(m[k]); });
        } catch (e) { console.warn('[prewarm] avatar', e); }
        stand.dispose();
    }
    console.info('[prewarm] tower', Math.round(t1 - t0), 'ms, avatar', Math.round(performance.now() - t1), 'ms');
    nearZoneKey = '';
    refreshNear(Math.max(-1, P.stage));
    warming = false;
    console.info('[prewarm] ready in', Math.round(performance.now() - t0), 'ms,', renderer.info.programs.length, 'shaders,', seen.size, 'textures');
}

async function boot() {
    BX.initBloxity();
    BX.loadingStep('Loading fonts…');
    try { await Promise.race([Promise.all([document.fonts.load('700 40px Fredoka'), document.fonts.load('800 40px Montserrat')]), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* fallback font */ }
    redrawAtlas();
    BX.loadingStep('Building the tower…');
    buildWorld();
    refreshNear(-1);
    loadBase().catch(() => {});
    prewarmed = prewarm();
    wirePortalSettings();
    wirePortalEvents();
    BX.onIdentity((id) => {
        showIdentity(id);
        if (net.room && id.loggedIn && id.token && !net.bloxity) net.send('auth', { token: id.token });
        if (net.room) { setupLocalAvatar(); syncMyAvatar(); }
    });
    $('#acctBtn').addEventListener('click', toggleLogin);
    $('#acctPfp').addEventListener('error', (e) => { e.target.hidden = true; });
    $('#playBtn').addEventListener('click', play);
    $('#reconnectBtn').addEventListener('click', () => location.reload());
    unlockAudioOnGesture();
    requestAnimationFrame(frame);
    play();
}
boot();

// Dev-only hooks for automated QA runs (stripped from production builds)
if (import.meta.env.DEV) {
    window.__qa = {
        audio: () => audioDebug(), input: (o) => Object.assign(botInput, o), jump: () => pressJump(), solids, cam, P, S, scene, camera, net, renderer: () => renderer,
        teleport: (x, y, z, yaw) => teleport(new V3(x, y, z), yaw || 0),
        walk: (n) => { qaWalk = n; }, near: () => nearBoxes.length + nearRound.length,
        // Runs the game at 60 steps a second without rendering: hold forward f, press jump every N steps
        sim: (secs, f, jumpEvery) => { for (let i = 0; i < Math.round(secs * 60); i++) { if (jumpEvery && i % jumpEvery === 0) pressJump(); botInput.f = f || 0; update(1 / 60); } botInput.f = 0; return window.__qa.state(); },
        look: (yaw, pitch, dist) => { cam.yaw = yaw; cam.pitch = pitch; cam.dist = dist; },
        face: (yaw) => { cam.yaw = yaw + Math.PI; P.facing = yaw; },
        state: () => ({ x: +P.pos.x.toFixed(2), y: +P.pos.y.toFixed(2), z: +P.pos.z.toFixed(2), onGround: P.onGround, ground: P.ground && P.ground.mat, stage: P.stage, cp: S.stage, wins: S.wins, climbs: S.climbs, climbing: !!P.climbing, tool: S.tool }),
        tool: (id) => { S.gear[id] = true; actions.equip(id); },
        course: { COURSE, CORNER_Y, cornerXZ, LAND },
    };
}
