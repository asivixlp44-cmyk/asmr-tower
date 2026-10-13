// The world: the tower (purple lobby walls with hazard stripes, green checker walls with windows on
// the night sky), the lobby (dais, VIP door and lounge, WORLDS portal, leaderboards, donor
// statues, donate board, gear pads) and every course element from shared/course.js with its
// collider and animation.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildDecor } from './decor.js';
import {
    T, V3, scene, mat, solids, triggers, prompts, tickers, solidBox, batchBox, batchGeo, flushBatches,
    billboard, textPlane, textCanvas, texFrom, buildRig, mergeChildren,
} from './engine.js';
import {
    wallMaterial, lilacMaterial, hazardMaterial, trussMaterial, butterMaterial, wrapperMaterial, jellyMaterial, domeMaterial,
    vanishMaterial, popitMaterial, popitBubbleMaterial, mochiMaterial, coinMaterial, coinRimMaterial, slimeMaterial, cpPadTex, daisTex, rainbowTex,
    bubbleWrapMaterial, softTex, neon, floorGelMaterial,
} from './materials.js';
import { keyGrid, flushKeys, dynamicKeys, letterIndex } from './keys.js';
import { gearModel } from './gear.js';
import { petModel } from './pets.js';
import { S, actions, net } from './state.js';
import { CFG, STAGES, TOWER, LOBBY, GEAR, PASSES, passForGear, petById, fmt, playtimeText, rngFrom } from '../../shared/config.js';
import { COURSE, CHECKPOINTS, COINS, SUMMIT, TOWER_GEAR } from '../../shared/course.js';

export const SPAWN = new V3(LOBBY.spawn.x, LOBBY.spawn.y, LOBBY.spawn.z);
export const SPAWN_YAW = LOBBY.yaw;
const H = TOWER.half, WT = TOWER.wall, TOP = 330;
const GREEN = () => wallMaterial('green');

// ----- zone groups (lobby = -1, stages 0..11) -----
const zoneGroups = new Map();
export function zoneGroup(z) {
    let g = zoneGroups.get(z);
    if (!g) { g = new T.Group(); g.name = 'zone' + z; scene.add(g); zoneGroups.set(z, g); }
    return g;
}

// ----- helpers -----
function colorize(g, color) {
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = color.r; a[i * 3 + 1] = color.g; a[i * 3 + 2] = color.b; }
    g.setAttribute('color', new T.BufferAttribute(a, 3));
    return g;
}
const JELLY_GREEN = new T.Color(0x0fd26a);
function jellyColor(c) {
    if (!c) return JELLY_GREEN;
    if (typeof c === 'string' && c.startsWith('rainbow:')) return new T.Color().setHSL((+c.slice(8) * 0.085) % 1, 0.9, 0.6);
    return new T.Color(c);
}
function roundGeo(sx, sy, sz, r) {
    return new RoundedBoxGeometry(sx, sy, sz, 3, Math.min(r ?? 0.7, sy * 0.45, sx * 0.3, sz * 0.3));
}
function jellyBox(x, y, z, sx, sy, sz, color, zone) {
    const g = roundGeo(sx, sy, sz);
    g.translate(x, y, z);
    batchGeo(jellyMaterial(), colorize(g, jellyColor(color)), zone);
}
// Faces of a box as a geometry with custom UVs: faces = indices (0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z)
const FACE = [
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] }, { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] }, { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];
function faceGeo(x, y, z, sx, sy, sz, faces, uvFn) {
    const pos = [], nrm = [], uv = [], idx = [], c = [x, y, z], half = [sx / 2, sy / 2, sz / 2];
    for (const fi of faces) {
        const f = FACE[fi], base = pos.length / 3;
        for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            const p = [0, 0, 0];
            for (let k = 0; k < 3; k++) p[k] = c[k] + f.n[k] * half[k] + f.u[k] * a * half[k] + f.v[k] * b * half[k];
            pos.push(...p); nrm.push(...f.n);
            uv.push(...uvFn(fi, p, a, b));
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
}
// A rounded, bevelled block (soft edges catch the light like moulded plastic), with UVs projected
// in world space per face so the checker tiles keep their size on any block
function roundBatch(material, x, y, z, sx, sy, sz, o) {
    o = o || {};
    const r = Math.min(o.r ?? 0.5, sx * 0.3, sy * 0.3, sz * 0.3);
    const g = new RoundedBoxGeometry(sx, sy, sz, 2, r);
    g.translate(x, y, z);
    const p = g.attributes.position, nn = g.attributes.normal, uv = g.attributes.uv, tile = o.tile || 16;
    for (let i = 0; i < p.count; i++) {
        const ax = Math.abs(nn.getX(i)), ay = Math.abs(nn.getY(i)), az = Math.abs(nn.getZ(i));
        if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i) / tile, -p.getZ(i) / tile);
        else if (ax >= az) uv.setXY(i, -p.getZ(i) / tile, p.getY(i) / tile);
        else uv.setXY(i, p.getX(i) / tile, p.getY(i) / tile);
    }
    batchGeo(material, g, o.zone, o.cast);
}
const serverT = () => net.now() / 1000;

// =====================================================================================
// The tower shell
// =====================================================================================
function buildShell() {
    const purple = wallMaterial('purple'), green = GREEN(), floor = wallMaterial('floor');
    // Lobby floor: glossy green, the lilac walkways sit on it
    batchBox(floor, 0, -2.2, 0, H * 2, 3.6, H * 2, { tile: 16, zone: -2, skip: [2] });
    {
        // the visible floor is a rippling gel surface (the collider stays flat at y = 0)
        const g = new T.PlaneGeometry(H * 2, H * 2, 110, 110);
        g.rotateX(-Math.PI / 2);
        const gel = new T.Mesh(g, floorGelMaterial());
        gel.position.y = -0.12;
        gel.receiveShadow = true;
        zoneGroup(-2).add(gel);
    }
    solidBox(0, -2, 0, H * 2, 4, H * 2, { mat: 'floor' });
    // Lobby walls (purple) and the tower above (green), 4 sides
    const LW = TOWER.lobbyWall;
    for (const [sx, sz, x, z] of [[H * 2 + WT * 2, WT, 0, H + WT / 2], [H * 2 + WT * 2, WT, 0, -H - WT / 2], [WT, H * 2, H + WT / 2, 0], [WT, H * 2, -H - WT / 2, 0]]) {
        const south = z < -H;
        if (south) {
            // The VIP door opening in the middle of the south wall
            const pw = H + WT - 8, pc = 8 + pw / 2;
            batchBox(purple, -pc, LW / 2, z, pw, LW, sz, { tile: 16, zone: -2 });
            batchBox(purple, pc, LW / 2, z, pw, LW, sz, { tile: 16, zone: -2 });
            batchBox(purple, 0, (LW + 16) / 2, z, 16, LW - 16, sz, { tile: 16, zone: -2 });
            solidBox(-pc, LW / 2, z, pw, LW, sz, { mat: 'wall' });
            solidBox(pc, LW / 2, z, pw, LW, sz, { mat: 'wall' });
            solidBox(0, (LW + 16) / 2, z, 16, LW - 16, sz, { mat: 'wall' });
        } else {
            batchBox(purple, x, LW / 2, z, sx, LW, sz, { tile: 16, zone: -2 });
            solidBox(x, LW / 2, z, sx, LW, sz, { mat: 'wall' });
        }
        // hazard stripe band on top of the purple
        const inX = sx > sz;
        batchBox(hazardMaterial(), x - (inX ? 0 : Math.sign(x) * 0.4), LW + 1.2, z - (inX ? Math.sign(z) * 0.4 : 0), inX ? sx : sx + 0.8, 2.4, inX ? sz + 0.8 : sz, { tile: 4, zone: -2 });
    }
    // Tower walls with windows on the sky, 30-stud bands
    const rnd = rngFrom(77);
    for (let wall = 0; wall < 4; wall++) {
        for (let y0 = TOWER.lobbyWall + 2.4; y0 < TOP; y0 += 30) {
            const h = Math.min(30, TOP - y0);
            const win = h >= 24 && rnd() < 0.6 ? { c: (rnd() * 2 - 1) * 24, w: 24 + rnd() * 6, h: 15 } : null;
            towerBand(wall, y0, h, win, green);
        }
    }
    // Roof
    batchBox(green, 0, TOP + 2, 0, H * 2 + WT * 2, 4, H * 2 + WT * 2, { tile: 16, zone: -2 });
    // Butter blocks and slime drips hanging from the roof (the reference shows butter up there)
    const butterM = [wrapperMaterial(), wrapperMaterial(), butterMaterial(), butterMaterial(), wrapperMaterial(), wrapperMaterial()];
    for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2, r = 22 + (i % 3) * 9;
        const m = new T.Mesh(new T.BoxGeometry(10, 5, 5), butterM);
        m.position.set(Math.cos(a) * r, TOP - 6 - (i % 4) * 4, Math.sin(a) * r);
        m.rotation.set(0.4 * Math.sin(i), a, 0.6 * Math.cos(i * 1.7));
        zoneGroup(11).add(m);
    }
}
// One band of one wall: a solid band, or four pieces around a window (with a frame and an
// invisible pane so nobody falls out of the tower)
const windows = [];   // every window opening, for the light beams and neon rings (decor.js)
function towerBand(wall, y0, h, win, material) {
    // wall 0: north (+z), 1: south (-z), 2: east (+x), 3: west (-x); along = the axis the wall runs on
    const n = [[0, 1], [0, -1], [1, 0], [-1, 0]][wall];
    const along = n[0] === 0 ? 'x' : 'z';
    const off = H + WT / 2, L = H * 2 + WT * 2;
    const put = (a0, a1, b0, b1, invisible) => {
        const ac = (a0 + a1) / 2, al = a1 - a0, yc = (b0 + b1) / 2, yl = b1 - b0;
        if (al <= 0.01 || yl <= 0.01) return;
        const x = along === 'x' ? ac : n[0] * off, z = along === 'x' ? n[1] * off : ac;
        const sx = along === 'x' ? al : WT, sz = along === 'x' ? WT : al;
        if (!invisible) batchBox(material, x, yc, z, sx, yl, sz, { tile: 16, zone: -2 });
        solidBox(x, yc, z, sx, yl, sz, { mat: invisible ? 'glass' : 'wall' });
    };
    if (!win) { put(-L / 2, L / 2, y0, y0 + h); return; }
    const wy0 = y0 + (h - win.h) / 2, wy1 = wy0 + win.h, w0 = win.c - win.w / 2, w1 = win.c + win.w / 2;
    windows.push({ wall, n, a0: w0, a1: w1, y0: wy0, y1: wy1 });
    put(-L / 2, w0, y0, y0 + h);
    put(w1, L / 2, y0, y0 + h);
    put(w0, w1, y0, wy0);
    put(w0, w1, wy1, y0 + h);
    put(w0, w1, wy0, wy1, true);
    // lilac frame around the window, sticking out a little into the tower
    const lil = lilacMaterial(), inner = H - 0.4;
    const fx = (a, b, yc, yl) => {
        const ac = (a + b) / 2, al = b - a;
        if (along === 'x') batchBox(lil, ac, yc, n[1] * inner, al, yl, 1.2, { tile: 8, zone: -2 });
        else batchBox(lil, n[0] * inner, yc, ac, 1.2, yl, al, { tile: 8, zone: -2 });
    };
    fx(w0 - 1, w1 + 1, wy0 - 0.6, 1.2); fx(w0 - 1, w1 + 1, wy1 + 0.6, 1.2);
    fx(w0 - 1, w0, (wy0 + wy1) / 2, win.h); fx(w1, w1 + 1, (wy0 + wy1) / 2, win.h);
}

// =====================================================================================
// The lobby
// =====================================================================================
const boardCanvases = {};
let statues = [];
export const vipDoor = { solid: null, mesh: null };
function buildLobby() {
    const lil = lilacMaterial();
    // Lilac walkways over the green floor (top y = 1)
    const plaza = (x0, x1, z0, z1) => {
        batchBox(lil, (x0 + x1) / 2, 0.5, (z0 + z1) / 2, x1 - x0, 1, z1 - z0, { tile: 8 });
        solidBox((x0 + x1) / 2, 0.5, (z0 + z1) / 2, x1 - x0, 1, z1 - z0, { mat: 'tile' });
    };
    plaza(-H, H, 40, H);           // north: leaderboards, statues, donate board
    plaza(38, H, -H, 40);          // east: the gear pads
    plaza(-H, 38, -H, -40);        // south: VIP door, WORLDS portal, the stairs start
    plaza(-7, 7, -40, 40);         // the cross through the middle
    plaza(-38, 38, -7, 7);
    // The round dais in the middle
    {
        const top = new T.Mesh(new T.CircleGeometry(17, 64), new T.MeshPhysicalMaterial({ map: daisTex(), emissiveMap: daisTex(true), emissive: 0xff4ad8, emissiveIntensity: 2.4, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 1 }));
        top.rotation.x = -Math.PI / 2; top.position.set(0, 1.5, 0); top.receiveShadow = true;
        zoneGroup(-1).add(top);
        const side = new T.Mesh(new T.CylinderGeometry(17, 17.6, 1.5, 64, 1, true), new T.MeshPhysicalMaterial({ color: 0x4a2088, roughness: 0.3, clearcoat: 1 }));
        side.position.set(0, 0.75, 0); zoneGroup(-1).add(side);
        // a glowing ring around the dais that slowly shifts colour
        const ringMat = new T.MeshBasicMaterial({ color: 0xff7ad8, toneMapped: false });
        const dr = new T.Mesh(new T.TorusGeometry(17.35, 0.22, 8, 96), ringMat);
        dr.rotation.x = Math.PI / 2; dr.position.y = 1.5;
        zoneGroup(-1).add(dr);
        tickers.push((dt, t) => { if (dr.parent.visible) ringMat.color.setHSL((0.88 + t * 0.03) % 1, 0.9, 0.62).multiplyScalar(2.2); });
        solids.push({ shape: 'cyl', cx: 0, cz: 0, r: 17, min: new V3(-17, 0, -17), max: new V3(17, 1.5, 17), zone: -1, mat: 'tile' });
    }
    // Red carpet to the VIP door
    batchBox(mat(0xe8283a, { rough: 0.85 }), 0, 1.04, -40, 10, 0.08, 46, { tile: 8 });
    buildVip();
    buildWorldsPortal();
    buildBoards();
    buildStatues();
    buildDonateBoard();
    // Gear pads along the east wall
    GEAR.forEach((g, i) => gearPad(g.id, 52, 1, -36 + i * 11.5, -1, 1));
    // Title on the east wall above the gear pads
    const title = textPlane([{ t: 'ASMR TOWER', g: ['#ffffff', '#ffd8f8'], s: '#7a2ad8', px: 120, w: 700 }], 54, 1024, new V3(H - 0.3, 26, -2), new V3(0, 26, -2), zoneGroup(-1));
    title.renderOrder = 2;
    // the title glows and slowly shifts colour, like a neon sign
    const titleTint = new T.Color();
    tickers.push((dt, t) => {
        if (!title.parent.visible) return;
        titleTint.setHSL((0.85 + Math.sin(t * 0.25) * 0.08) % 1, 0.55, 0.85).multiplyScalar(1.75 + Math.sin(t * 2.2) * 0.25);
        title.material.color.copy(titleTint);
    });
    // pink neon skirting along the bottom of the lobby walls (gap at the VIP door)
    const skirt = neon(0xff7ad8, 2.2);
    for (const [x, z, sx, sz] of [[0, H - 0.35, H * 2, 0.3], [H - 0.35, 0, 0.3, H * 2], [-H + 0.35, 0, 0.3, H * 2], [-(H / 2 + 4), -H + 0.35, H - 8, 0.3], [H / 2 + 4, -H + 0.35, H - 8, 0.3]]) batchBox(skirt, x, 1.35, z, sx, 0.3, sz, { zone: -1, tile: 4 });
    textPlane([{ t: 'satisfying slime · squishies · keyboard clicks', c: '#ffffff', s: '#7a2ad8', px: 46 }], 46, 1024, new V3(H - 0.3, 19.5, -2), new V3(0, 19.5, -2), zoneGroup(-1));
    // START sign by the first jelly step
    const start = billboard([{ t: 'START ▶', g: ['#ffffff', '#c8ffb8'], s: '#1a7a2a', px: 76 }, { t: 'climb the jelly stairs!', c: '#ffffff', s: '#1a7a2a', px: 36 }], 12, 512, new V3(-44, 8.5, -50), zoneGroup(-1));
    start.material.depthWrite = false;
    // A giant rainbow squishy to bounce on (lobby landmark, like the game icon)
    const sq = giantSquishy(6);
    sq.position.set(-30, 0, 24); sq.rotation.y = 0.9;
    zoneGroup(-1).add(sq);
    solids.push({ shape: 'cyl', cx: -30, cz: 24, r: 5.6, min: new V3(-35.6, 0, 18.4), max: new V3(-24.4, 8.2, 29.6), zone: -1, mat: 'squishy', bounce: 74, squishy: sq });
}

function buildVip() {
    // Door panel: gold and black stripes with a crown on top; VIPs walk straight through
    const c = document.createElement('canvas'); c.width = 256; c.height = 320;
    const x = c.getContext('2d');
    x.fillStyle = '#ffd21a'; x.fillRect(0, 0, 256, 320);
    x.fillStyle = '#2a1a10';
    for (let k = -4; k < 8; k++) { x.beginPath(); x.moveTo(k * 64, 320); x.lineTo(k * 64 + 32, 320); x.lineTo(k * 64 + 32 + 320, 0); x.lineTo(k * 64 + 320, 0); x.fill(); }
    x.fillStyle = 'rgba(255,255,255,0.15)'; x.fillRect(0, 0, 256, 320);
    x.font = '800 96px Montserrat, Arial Black, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 14; x.strokeStyle = '#2a1a10'; x.strokeText('VIP', 128, 170); x.fillStyle = '#ffffff'; x.fillText('VIP', 128, 170);
    const door = new T.Mesh(new T.BoxGeometry(16, 15, 1), new T.MeshStandardMaterial({ map: texFrom(c), roughness: 0.35, transparent: true }));
    door.position.set(0, 8.5, -H - 1.5);
    zoneGroup(-1).add(door);
    vipDoor.mesh = door;
    vipDoor.solid = solidBox(0, 8, -H - 2, 16, 16, 4, { mat: 'wall' });
    // Crown over the door
    const crown = crownModel(); crown.position.set(0, 19.5, -H + 0.5); crown.scale.setScalar(2.2);
    zoneGroup(-1).add(crown);
    tickers.push((dt, t) => { crown.rotation.y = Math.sin(t * 0.8) * 0.4; crown.position.y = 19.5 + Math.sin(t * 1.6) * 0.4; });
    // Golden ring on the floor in front of it
    const ring = new T.Mesh(new T.TorusGeometry(5, 0.35, 10, 48), neon(0xffc828, 1.6));
    ring.rotation.x = Math.PI / 2; ring.position.set(0, 1.12, -H + 7); zoneGroup(-1).add(ring);
    prompts.push({ pos: new V3(0, 1, -H + 4), r: 7, zone: -1, label: () => (S.passes.VIP ? 'Enter the VIP Lounge' : '👑 Buy VIP'), act: () => actions.vipDoor() });
    // The VIP lounge behind the wall
    const gold = mat(0xffd04a, { rough: 0.3, metal: 0.55 }), wallG = mat(0xf4d27a, { rough: 0.5 });
    const z0 = -H - WT, z1 = z0 - 26;
    batchBox(gold, 0, 0.5, (z0 + z1) / 2, 30, 1, 26, { tile: 8 });
    solidBox(0, 0.5, (z0 + z1) / 2, 30, 1, 26, { mat: 'gold' });
    for (const [x0, z, sx, sz] of [[0, z1 - 1, 32, 2], [-15.5, (z0 + z1) / 2, 2, 26], [15.5, (z0 + z1) / 2, 2, 26]]) {
        batchBox(wallG, x0, 9, z, sx, 18, sz, { tile: 8 });
        solidBox(x0, 9, z, sx, 18, sz, { mat: 'wall' });
    }
    batchBox(wallG, 0, 18.5, (z0 + z1) / 2, 32, 1, 28, { tile: 8 });
    textPlane([{ t: '👑 VIP LOUNGE 👑', g: ['#fff6b0', '#ffc828'], s: '#5a3a00', px: 80 }], 22, 1024, new V3(0, 13, z1 + 0.1), new V3(0, 13, 0), zoneGroup(-1));
    // VIP chest
    const chest = new T.Group();
    const body = new T.Mesh(new RoundedBoxGeometry(4, 2.6, 2.8, 2, 0.3), mat(0xff5aa8, { rough: 0.35 })); body.position.y = 1.3; chest.add(body);
    const lid = new T.Mesh(new RoundedBoxGeometry(4.2, 1, 3, 2, 0.35), gold); lid.position.y = 3; chest.add(lid);
    const lock = new T.Mesh(new T.BoxGeometry(0.8, 1, 0.3), gold); lock.position.set(0, 2.2, 1.5); chest.add(lock);
    chest.position.set(-7, 1, z1 + 5);
    zoneGroup(-1).add(chest);
    billboard([{ t: 'VIP CHEST', c: '#ffd028', s: '#3a2000', px: 60 }, { t: '+Coins every 15 min', c: '#ffffff', s: '#3a2000', px: 34 }], 7, 512, new V3(-7, 6.4, z1 + 5), zoneGroup(-1));
    prompts.push({ pos: new V3(-7, 1, z1 + 5), r: 6, zone: -1, label: () => 'Open the VIP Chest', act: () => actions.vipChest() });
    // Stage teleporter pad
    const pad = new T.Mesh(new T.CylinderGeometry(3, 3.2, 0.5, 40), neon(0xff8ad8, 1.4)); pad.position.set(7, 1.25, z1 + 5); zoneGroup(-1).add(pad);
    billboard([{ t: 'TELEPORT', c: '#ff8ad8', s: '#3a0a2a', px: 60 }, { t: 'to any stage', c: '#ffffff', s: '#3a0a2a', px: 34 }], 7, 512, new V3(7, 5.4, z1 + 5), zoneGroup(-1));
    prompts.push({ pos: new V3(7, 1, z1 + 5), r: 5, zone: -1, label: () => 'Teleport to a stage', act: () => actions.openTeleport() });
    // golden squishies
    for (const sx of [-11, 11]) {
        const p = petModel(petById.vipSlime); p.scale.setScalar(1.8); p.position.set(sx, 1, z1 + 3); p.rotation.y = 0; zoneGroup(-1).add(p);
    }
}
export function setVipDoor(vip) {
    if (!vipDoor.solid) return;
    vipDoor.solid.off = !!vip;
    vipDoor.mesh.material.opacity = vip ? 0.45 : 1;
}
function crownModel() {
    const g = new T.Group();
    const gold = mat(0xffc828, { rough: 0.25, metal: 0.7 });
    const band = new T.Mesh(new T.CylinderGeometry(1.2, 1.05, 1, 20, 1, true), gold); g.add(band);
    for (let k = 0; k < 5; k++) {
        const a = k / 5 * Math.PI * 2;
        const sp = new T.Mesh(new T.ConeGeometry(0.32, 1, 8), gold); sp.position.set(Math.cos(a) * 1.1, 0.95, Math.sin(a) * 1.1); g.add(sp);
        const gem = new T.Mesh(new T.SphereGeometry(0.2, 10, 8), mat(k % 2 ? 0xff3a6a : 0x3ac8ff, { rough: 0.1 })); gem.position.set(Math.cos(a) * 1.18, 0.05, Math.sin(a) * 1.18); g.add(gem);
    }
    return g;
}

function buildWorldsPortal() {
    const x = -34, z = -H + 0.6;
    const c = document.createElement('canvas'); c.width = 256; c.height = 320;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 170, 10, 128, 170, 200);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#f0e4ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 320);
    ctx.font = '800 170px Montserrat, Arial Black, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#5a5a6a'; ctx.fillText('?', 128, 178);
    const shape = new T.Shape();
    shape.moveTo(-6, 0); shape.lineTo(-6, 11); shape.lineTo(-3.5, 15); shape.lineTo(3.5, 15); shape.lineTo(6, 11); shape.lineTo(6, 0); shape.lineTo(-6, 0);
    const panelGeo = new T.ShapeGeometry(shape);
    const uv = panelGeo.attributes.uv, p = panelGeo.attributes.position;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + 6) / 12, p.getY(i) / 15);
    const panel = new T.Mesh(panelGeo, new T.MeshBasicMaterial({ map: texFrom(c), toneMapped: false }));
    panel.material.color.multiplyScalar(1.15);
    panel.position.set(x, 1, z + 0.2);
    zoneGroup(-1).add(panel);
    const frame = new T.Mesh(new T.ShapeGeometry(shape.clone()), neon(0xffffff, 1.3));
    frame.scale.set(1.12, 1.07, 1); frame.position.set(x, 0.6, z + 0.1);
    zoneGroup(-1).add(frame);
    const sign = textPlane([{ t: 'WORLDS', g: ['#ffffff', '#f4dcff'], s: '#8a4ad8', px: 110, w: 700 }], 22, 1024, new V3(x, 22, z + 0.3), new V3(x, 22, 10), zoneGroup(-1));
    sign.renderOrder = 2;
    prompts.push({ pos: new V3(x, 1, z + 4), r: 7, zone: -1, label: () => 'Worlds', act: () => actions.openWorlds() });
}

// Leaderboards on the north wall: Total Playtime, Wins, Donations
const BOARDS = [['playtime', 'Total Playtime', 36], ['wins', 'Wins', 14], ['donated', 'Donations Leaderboard', -8]];
function buildBoards() {
    for (const [key, title, x] of BOARDS) {
        const frame = new T.Mesh(new RoundedBoxGeometry(19, 24, 1.4, 3, 0.8), mat(0x6a6a7e, { rough: 0.45 }));
        frame.position.set(x, 14, H - 0.4);
        zoneGroup(-1).add(frame);
        const cv = document.createElement('canvas'); cv.width = 512; cv.height = 640;
        const tex = texFrom(cv);
        const screen = new T.Mesh(new T.PlaneGeometry(17.4, 21.75), new T.MeshBasicMaterial({ map: tex, toneMapped: false }));
        screen.position.set(x, 14, H - 1.15); screen.rotation.y = Math.PI;
        zoneGroup(-1).add(screen);
        boardCanvases[key] = { cv, tex, title };
        drawBoard(key, []);
    }
}
function drawBoard(key, rows) {
    const b = boardCanvases[key];
    if (!b) return;
    const x = b.cv.getContext('2d'), W = 512, Hh = 640;
    const g = x.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, '#3a3a4e'); g.addColorStop(1, '#2a2a38');
    x.fillStyle = g; x.fillRect(0, 0, W, Hh);
    x.fillStyle = '#ffffff'; x.font = '700 46px Fredoka, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(b.title, W / 2, 46);
    for (let i = 0; i < 10; i++) {
        const y = 100 + i * 53, r = rows[i];
        x.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)'; x.fillRect(16, y - 23, W - 32, 48);
        x.textAlign = 'left'; x.font = '700 30px Fredoka, sans-serif';
        x.fillStyle = i === 0 ? '#ffd028' : i === 1 ? '#e0e8ff' : i === 2 ? '#ffb07a' : '#ffffff';
        x.fillText('#' + (i + 1), 28, y);
        if (!r) continue;
        x.fillStyle = '#ffffff'; x.font = '600 27px Fredoka, sans-serif';
        let n = r.n; while (x.measureText(n).width > 250 && n.length > 3) n = n.slice(0, -1);
        x.fillText(n, 96, y);
        x.textAlign = 'right'; x.fillStyle = '#9affb0';
        x.fillText(key === 'playtime' ? playtimeText(r.v) : key === 'donated' ? fmt(r.v) + ' B' : fmt(r.v), W - 30, y);
    }
    b.tex.needsUpdate = true;
}
export function renderBoards(m) {
    for (const [key] of BOARDS) drawBoard(key, (m && m[key]) || []);
    const top = (m && m.donated) || [];
    statues.forEach((st, i) => {
        const name = top[i] ? top[i].n : '—';
        if (st.name !== name) { st.name = name; st.label.userData.set([{ t: '#' + (i + 1) + ' ' + name, c: '#ffffff', s: '#7a2a6a', px: 50 }]); }
    });
}
function buildStatues() {
    const pink = { shirt: 0xffb8e6, shorts: 0xffa0dc, socks: 0xffc8ec, skin: 0xffd6f0, hair: 0xff9ad8 };
    [[-34, 4.2, 0], [-26, 3, 1], [-42, 2.2, 2]].forEach(([x, h, rank]) => {
        const ped = new T.Mesh(new T.CylinderGeometry(2.6, 3, h, 6), mat(0x4a4a5e, { rough: 0.4 }));
        ped.position.set(x, 1 + h / 2, 55); zoneGroup(-1).add(ped);
        const ring = new T.Mesh(new T.TorusGeometry(2.7, 0.15, 6, 24), neon([0xffd028, 0xd8e4ff, 0xffa86a][rank], 1.5));
        ring.rotation.x = Math.PI / 2; ring.position.set(x, 1 + h - 0.6, 55); zoneGroup(-1).add(ring);
        const rig = buildRig(pink);
        rig.position.set(x, 1 + h, 55); rig.rotation.y = Math.PI;
        rig.userData.arms[1].rotation.set(-2.8, 0, 0.2);
        rig.traverse((o) => { if (o.isMesh) o.material = mat(0xffc4ec, { rough: 0.25, emissive: 0x5a1a4a, ei: 0.25 }); });
        zoneGroup(-1).add(rig);
        const label = billboard([{ t: '#' + (rank + 1) + ' —', c: '#ffffff', s: '#7a2a6a', px: 50 }], 7, 512, new V3(x, 1 + h + 7.8, 55), zoneGroup(-1));
        statues[rank] = { label, name: '' };
        solids.push({ shape: 'cyl', cx: x, cz: 55, r: 2.8, min: new V3(x - 3, 0, 52), max: new V3(x + 3, 1 + h, 58), zone: -1, mat: 'block' });
    });
}
function buildDonateBoard() {
    const cv = document.createElement('canvas'); cv.width = 384; cv.height = 512;
    const x = cv.getContext('2d');
    x.fillStyle = '#ffe23a'; x.fillRect(0, 0, 384, 512);
    x.strokeStyle = '#2a2a3a'; x.lineWidth = 14; x.strokeRect(7, 7, 370, 498);
    x.fillStyle = '#2a2a3a'; x.font = '800 54px Montserrat, Arial Black, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('DONATE', 192, 58);
    ['10 Bux', '100 Bux', '500 Bux', '1000 Bux', '5000 Bux', '10000 Bux'].forEach((t, i) => {
        x.fillStyle = '#ffffff'; x.fillRect(36, 104 + i * 66, 312, 52);
        x.strokeStyle = '#2a2a3a'; x.lineWidth = 4; x.strokeRect(36, 104 + i * 66, 312, 52);
        x.fillStyle = '#2a2a3a'; x.font = '700 32px Fredoka, sans-serif'; x.fillText(t, 192, 131 + i * 66);
    });
    const board = new T.Mesh(new T.BoxGeometry(12, 16, 0.8), [mat(0x2a2a3a), mat(0x2a2a3a), mat(0x2a2a3a), mat(0x2a2a3a), mat(0x2a2a3a), new T.MeshBasicMaterial({ map: texFrom(cv), toneMapped: false })]);
    board.position.set(-53, 11, H - 0.6);
    zoneGroup(-1).add(board);
    prompts.push({ pos: new V3(-53, 1, H - 6), r: 7, zone: -1, label: () => '💖 Donate', act: () => actions.openDonate() });
}

// A gear pad: pedestal, neon ring, the gear spinning above it and its name and price
const gearPads = [];
function gearPad(id, x, y, z, zone, scale) {
    const def = GEAR.find((g) => g.id === id);
    const grp = new T.Group(); grp.position.set(x, y, z); zoneGroup(zone).add(grp);
    const ped = new T.Mesh(new T.CylinderGeometry(3, 3.3, 0.7, 40), mat(0xf4ecff, { rough: 0.35 }));
    ped.position.y = 0.35; grp.add(ped);
    const ring = new T.Mesh(new T.TorusGeometry(3.1, 0.22, 8, 48), neon(def.color === 0xffffff ? 0xff8ad8 : def.color, 1.6));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.72; grp.add(ring);
    const glow = new T.Sprite(new T.SpriteMaterial({ map: softTex(), color: def.color === 0xffffff ? 0xff8ad8 : def.color, transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending }));
    glow.scale.set(9, 9, 1); glow.position.y = 3.6; grp.add(glow);
    const model = gearModel(id); model.position.y = 3.8; model.scale.multiplyScalar(scale || 1); grp.add(model);
    const pass = passForGear(id);
    const label = billboard([{ t: def.name, c: '#ffffff', s: '#3a1a5a', px: 56 }, { t: '🅑 ' + PASSES[pass].price, c: '#7dff6b', s: '#1a3a1a', px: 46 }], 6.5, 512, new V3(0, 7.6, 0), grp);
    const pad = { id, grp, model, label, owned: null, zone, x, y, z };
    gearPads.push(pad);
    triggers.push({ min: new V3(x - 2.6, y, z - 2.6), max: new V3(x + 2.6, y + 5, z + 2.6), zone, enter: () => actions.gearPad(id) });
    prompts.push({ pos: new V3(x, y, z), r: 5, zone, label: () => (S.gear[id] ? (S.tool === id ? 'Unequip ' : 'Equip ') + def.name : 'Buy ' + def.name), act: () => actions.gearPad(id, true) });
    solids.push({ shape: 'cyl', cx: x, cz: z, r: 3, min: new V3(x - 3, y, z - 3), max: new V3(x + 3, y + 0.7, z + 3), zone, mat: 'tile' });
    tickers.push((dt, t) => {
        model.rotation.y = t * 1.2 + x;
        model.position.y = 3.8 + Math.sin(t * 2 + z) * 0.35;
    });
}
// Prices on the pads follow the live catalog; owned gear says so
export function refreshGearPads() {
    for (const p of gearPads) {
        const owned = !!S.gear[p.id];
        const key = owned + '|' + PASSES[passForGear(p.id)].price;
        if (p.owned === key) continue;
        p.owned = key;
        const def = GEAR.find((g) => g.id === p.id);
        p.label.userData.set([{ t: def.name, c: '#ffffff', s: '#3a1a5a', px: 56 }, owned ? { t: '✔ OWNED', c: '#7dff6b', s: '#1a3a1a', px: 46 } : { t: '🅑 ' + PASSES[passForGear(p.id)].price, c: '#7dff6b', s: '#1a3a1a', px: 46 }]);
    }
}

// The rainbow squishy bun from the game's icon: a soft glossy dome with a cute face
export function giantSquishy(r) {
    const g = new T.Group();
    const geo = new T.SphereGeometry(r, 48, 32);
    geo.scale(1.08, 0.76, 1);
    geo.translate(0, r * 0.7, 0);
    const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new T.Color();
    for (let i = 0; i < p.count; i++) {
        const y = p.getY(i) / (r * 1.45), a = Math.atan2(p.getZ(i), p.getX(i));
        c.setHSL((y * 0.9 + a * 0.05 + 0.9) % 1, 0.85, 0.68);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    const body = new T.Mesh(geo, new T.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.15, sheen: 0.8, sheenColor: new T.Color(0xffffff), emissive: 0x2a1a2a, emissiveIntensity: 0.25 }));
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    const eyeM = new T.MeshStandardMaterial({ color: 0x1a1420, roughness: 0.1 }), white = new T.MeshBasicMaterial({ color: 0xffffff }), blush = new T.MeshBasicMaterial({ color: 0xff6aa0, transparent: true, opacity: 0.7 });
    for (const sx of [-1, 1]) {
        const e = new T.Mesh(new T.SphereGeometry(r * 0.12, 16, 12), eyeM); e.scale.set(1, 1.3, 0.5); e.position.set(sx * r * 0.32, r * 0.86, r * 0.93); g.add(e);
        const s = new T.Mesh(new T.SphereGeometry(r * 0.04, 8, 6), white); s.position.set(sx * r * 0.32 - r * 0.03, r * 0.93, r * 0.99); g.add(s);
        const b = new T.Mesh(new T.CircleGeometry(r * 0.1, 16), blush); b.position.set(sx * r * 0.55, r * 0.7, r * 0.87); b.rotation.y = sx * 0.55; g.add(b);
    }
    const mouth = new T.Mesh(new T.TorusGeometry(r * 0.08, r * 0.02, 6, 14, Math.PI), eyeM); mouth.position.set(0, r * 0.74, r * 0.98); mouth.rotation.z = Math.PI; g.add(mouth);
    g.userData.body = body;
    return g;
}

// =====================================================================================
// The course
// =====================================================================================
const PAL = {
    magenta: [0xe8129e, 0xf020b0, 0xd80a90],
    green: [0x18c84c, 0x12b844, 0x22d456],
    lilac: [0xa078e8, 0x9068dc, 0xb08af0],
};
const KEY_LOOK = (pal) => ({ ink: 0x2a1030, keys: PAL[pal] || PAL.lilac });

export const domes = [];      // dome solids (with instance refs, squish state)
export const movers = [];     // moving solids
export const vanishers = [];
export const spinners = [];
export const sweepers = [];
export const bouncers = [];
export const popits = [];
const underglows = [];
export const cpPads = [];
let coinMesh = null;
export const coinState = { collected: new Set() };
let summitGroup = null;

function buildCourse() {
    const rnd = rngFrom(4242);
    const domeLists = new Map();
    const pistonLists = new Map();
    for (const e of COURSE) {
        const zone = e.zone;
        switch (e.t) {
            case 'land': {
                roundBatch(GREEN(), e.x, e.top - 1.5, e.z, e.s, 3, e.s, { zone, tile: 16 });
                roundBatch(GREEN(), e.x, e.top - 4, e.z, e.s - 5, 2, e.s - 5, { zone, tile: 16 });
                solidBox(e.x, e.top - 1.5, e.z, e.s, 3, e.s, { zone, mat: 'block' });
                if (e.rainbow) jellyBox(e.x, e.top + 0.3, e.z, e.s - 1, 0.6, e.s - 1, 'rainbow:3', zone);
                // glowing trim around the top edge, in the stage's colour
                const nm = neon(STAGES[zone].bar, 2.3), hs = e.s / 2;
                for (const [dx, dz, sx, sz] of [[0, -hs, e.s + 0.3, 0.3], [0, hs, e.s + 0.3, 0.3], [-hs, 0, 0.3, e.s], [hs, 0, 0.3, e.s]]) batchBox(nm, e.x + dx, e.top - 0.12, e.z + dz, sx, 0.3, sz, { zone, tile: 4 });
                for (const [dx, dz, sx, sz] of [[0, -hs + 2.5, e.s - 5.2, 0.25], [0, hs - 2.5, e.s - 5.2, 0.25], [-hs + 2.5, 0, 0.25, e.s - 5.2], [hs - 2.5, 0, 0.25, e.s - 5.2]]) batchBox(nm, e.x + dx, e.top - 3.05, e.z + dz, sx, 0.25, sz, { zone, tile: 4 });
                break;
            }
            case 'jelly': {
                jellyBox(e.x, e.y, e.z, e.sx, e.sy, e.sz, e.color, zone);
                solidBox(e.x, e.y, e.z, e.sx, e.sy, e.sz, { zone, mat: 'jelly' });
                break;
            }
            case 'block': {
                roundBatch(GREEN(), e.x, e.y, e.z, e.sx, e.sy, e.sz, { zone, tile: 16 });
                solidBox(e.x, e.y, e.z, e.sx, e.sy, e.sz, { zone, mat: e.sy <= 2.01 && zone >= 7 && zone <= 7 ? 'wrap' : 'block' });
                if (zone === 7) {
                    // Bubble-wrap stage: the fixed blocks get a bubble-wrap sheet on top
                    const sheet = new T.Mesh(new RoundedBoxGeometry(e.sx + 0.2, 0.5, e.sz + 0.2, 2, 0.2), bubbleWrapMaterial());
                    sheet.position.set(e.x, e.y + e.sy / 2 + 0.05, e.z); zoneGroup(zone).add(sheet);
                }
                break;
            }
            case 'keys': {
                keyGrid(zone, KEY_LOOK(e.pal), e.x, e.z, e.sx, e.sz, e.top, rnd, null, { letters: 'ABC' });
                roundBatch(GREEN(), e.x, e.top - 2.4, e.z, e.sx + 0.8, 1.6, e.sz + 0.8, { zone, tile: 16 });
                solidBox(e.x, e.top - 1.6, e.z, e.sx, 3.2, e.sz, { zone, mat: 'keys', keys: true });
                // RGB-keyboard underglow around the base
                underglows.push({ x: e.x, y: e.top - 3.3, z: e.z, sx: e.sx + 1.1, sz: e.sz + 1.1, zone });
                break;
            }
            case 'dome': {
                if (!domeLists.has(zone)) domeLists.set(zone, []);
                const s = { shape: 'dome', cx: e.x, cz: e.z, y0: e.y0, r: e.r, h: e.h, min: new V3(e.x - e.r, e.y0 - 0.6, e.z - e.r), max: new V3(e.x + e.r, e.y0 + e.h, e.z + e.r), zone, mat: 'dome', squish: 0, sqv: 0, press: 0 };
                solids.push(s); domes.push(s);
                domeLists.get(zone).push(s);
                // a darker jelly base disc under it
                const base = new T.CylinderGeometry(e.r * 0.98, e.r * 0.9, 0.6, 32);
                base.translate(e.x, e.y0 - 0.3, e.z);
                batchGeo(jellyMaterial(), colorize(base, new T.Color(0x1fa82a)), zone);
                break;
            }
            case 'truss': {
                batchBox(trussMaterial(), e.x, e.y, e.z, e.sx, e.sy, e.sz, { zone, tile: 4 });
                solidBox(e.x, e.y, e.z, e.sx, e.sy, e.sz, { zone, mat: 'truss', climb: true });
                break;
            }
            case 'slime': buildSlime(e); break;
            case 'butter': buildButter(e); break;
            case 'popit': buildPopit(e, null); break;
            case 'bounce': buildBounce(e); break;
            case 'mover': buildMover(e); break;
            case 'piston': {
                if (!pistonLists.has(zone)) pistonLists.set(zone, []);
                pistonLists.get(zone).push(e);
                break;
            }
            case 'vanish': buildVanish(e); break;
            case 'spinner': buildSpinner(e); break;
            case 'sweeper': buildSweeper(e); break;
            case 'cp': buildCheckpoint(e); break;
            case 'summit': buildSummit(e); break;
            default: break;
        }
    }
    // Domes: one instanced mesh per stage
    const domeGeo = new T.SphereGeometry(1, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2);
    for (const [zone, list] of domeLists) {
        const inst = new T.InstancedMesh(domeGeo, domeMaterial(), list.length);
        list.forEach((s, i) => { s.inst = inst; s.idx = i; setDomeMatrix(s); });
        inst.instanceMatrix.setUsage(T.DynamicDrawUsage);
        inst.castShadow = true;
        inst.computeBoundingSphere();
        inst.frustumCulled = false;
        zoneGroup(zone).add(inst);
    }
    // Typing pistons: dynamic keys per stage + the green housings they sink into
    for (const [zone, list] of pistonLists) {
        const keys = dynamicKeys(KEY_LOOK('magenta'), list.length, zoneGroup(zone));
        list.forEach((e, i) => {
            const pal = ['magenta', 'green', 'lilac'][i % 3];
            keys.color(i, PAL[pal][0]);
            keys.letter(i, letterIndex('ABC'[Math.floor(rnd() * 3)]));
            roundBatch(GREEN(), e.x, e.top - e.amp - 2.2, e.z, e.sx + 0.8, 2, e.sz + 0.8, { zone, tile: 16 });
            const s = solidBox(e.x, e.top - 1.5, e.z, e.sx, 3, e.sz, { zone, mat: 'keys', mover: true, piston: e, delta: new V3(), keys: true });
            s.keyMesh = keys; s.keyIdx = i;
            movers.push(s);
        });
        keys.done();
    }
    // Keyboard underglow: one mesh for every keyboard, cycling through the rainbow like an RGB board
    if (underglows.length) {
        const geos = [];
        for (const u of underglows) {
            for (const [dx, dz, sx, sz] of [[0, -u.sz / 2, u.sx, 0.3], [0, u.sz / 2, u.sx, 0.3], [-u.sx / 2, 0, 0.3, u.sz], [u.sx / 2, 0, 0.3, u.sz]]) {
                const g = new T.BoxGeometry(sx, 0.32, sz);
                g.translate(u.x + dx, u.y, u.z + dz);
                g.deleteAttribute('uv');
                geos.push(g);
            }
        }
        const rgb = new T.MeshBasicMaterial({ color: 0xff3fd8, toneMapped: false });
        const glow = new T.Mesh(mergeGeometries(geos), rgb);
        glow.frustumCulled = false;
        zoneGroup(-2).add(glow);
        tickers.push((dt, t) => rgb.color.setHSL((t * 0.08) % 1, 1, 0.6).multiplyScalar(2.3));
    }
    // Coins: one instanced mesh, spinning
    const cg = new T.CylinderGeometry(1.1, 1.1, 0.3, 28);
    cg.rotateX(Math.PI / 2);
    coinMesh = new T.InstancedMesh(cg, [coinRimMaterial(), coinMaterial(), coinMaterial()], COINS.length);
    coinMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    coinMesh.frustumCulled = false;
    coinMesh.castShadow = true;
    scene.add(coinMesh);
    // Gear pads up in the tower (the Magic Carpet on Stage 3, like the reference)
    for (const g of TOWER_GEAR) {
        // each sits on its own little platform against the wall, next to a checkpoint landing
        roundBatch(GREEN(), g.x, g.y - 1.5, g.z, 7, 3, 9, { zone: g.zone, tile: 16 });
        solidBox(g.x, g.y - 1.5, g.z, 7, 3, 9, { zone: g.zone, mat: 'block' });
        gearPad(g.gear, g.x, g.y, g.z, g.zone, 0.9);
    }
}

function setDomeMatrix(s) {
    const k = s.squish;
    m4.compose(v0.set(s.cx, s.y0, s.cz), q0, s0.set(s.r * (1 + 0.07 * k), s.h * (1 - 0.2 * k), s.r * (1 + 0.07 * k)));
    s.inst.setMatrixAt(s.idx, m4);
    s.inst.instanceMatrix.needsUpdate = true;
}
const m4 = new T.Matrix4(), q0 = new T.Quaternion(), v0 = new V3(), s0 = new V3();
// Called each frame for the dome someone stands on (main.js)
export function pressDome(s) { s.press = 0.12; }

function buildSlime(e) {
    const zone = e.zone, green = GREEN();
    roundBatch(green, e.x, e.top - e.h / 2 - 0.3, e.z, e.sx, e.h - 0.6, e.sz, { zone, tile: 16 });
    // rims
    const rimH = 0.9, rt = 0.7, y = e.top - 0.05;
    roundBatch(green, e.x, y, e.z - e.sz / 2 + rt / 2, e.sx, rimH, rt, { zone, tile: 16 });
    roundBatch(green, e.x, y, e.z + e.sz / 2 - rt / 2, e.sx, rimH, rt, { zone, tile: 16 });
    roundBatch(green, e.x - e.sx / 2 + rt / 2, y, e.z, rt, rimH, e.sz - rt * 2, { zone, tile: 16 });
    roundBatch(green, e.x + e.sx / 2 - rt / 2, y, e.z, rt, rimH, e.sz - rt * 2, { zone, tile: 16 });
    const geo = new T.PlaneGeometry(e.sx - rt * 2 + 0.2, e.sz - rt * 2 + 0.2, Math.ceil(e.sx * 1.4), Math.ceil(e.sz * 1.4));
    geo.rotateX(-Math.PI / 2);
    const m = new T.Mesh(geo, slimeMaterial());
    m.position.set(e.x, e.top - 0.12, e.z);
    m.receiveShadow = true;
    zoneGroup(zone).add(m);
    solidBox(e.x, e.top - e.h / 2, e.z, e.sx, e.h, e.sz, { zone, mat: 'slime', slime: true });
}
function buildButter(e) {
    const zone = e.zone;
    const top = faceGeo(e.x, e.y, e.z, e.sx, e.sy, e.sz, [2, 3], (fi, p) => [p[0] / 6, p[2] / 6]);
    batchGeo(butterMaterial(), top, zone);
    const side = faceGeo(e.x, e.y, e.z, e.sx, e.sy, e.sz, [0, 1, 4, 5], (fi, p, a, b) => {
        const f = FACE[fi], along = p[0] * f.u[0] + p[1] * f.u[1] + p[2] * f.u[2];
        return [along / (e.sy * 1.15), (b + 1) / 2];
    });
    batchGeo(wrapperMaterial(), side, zone);
    solidBox(e.x, e.y, e.z, e.sx, e.sy, e.sz, { zone, mat: 'butter', ice: true });
}
// A pop-it: rounded silicone tile striped like a rainbow, with a grid of bubbles that pop down
// when stepped on and flip back once they're all popped
const bubbleGeo = (() => { const g = new T.SphereGeometry(0.78, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); return g; })();
function buildPopit(e, moverGroup) {
    const group = moverGroup || new T.Group();
    if (!moverGroup) { group.position.set(e.x, e.top, e.z); zoneGroup(e.zone).add(group); }
    const base = roundGeo(e.sx, 1.2, e.sz, 0.5);
    base.translate(0, -0.6, 0);
    const p = base.attributes.position, col = new Float32Array(p.count * 3), c = new T.Color();
    const hue0 = ((e.hue || 0) * 0.11) % 1, alongX = e.sx >= e.sz;
    for (let i = 0; i < p.count; i++) {
        const t = ((alongX ? p.getZ(i) / e.sz : p.getX(i) / e.sx) + 0.5);
        c.setHSL((hue0 + Math.floor(t * 4) * 0.16) % 1, 0.85, 0.64);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    base.setAttribute('color', new T.BufferAttribute(col, 3));
    const baseMesh = new T.Mesh(base, popitMaterial());
    baseMesh.receiveShadow = true; baseMesh.castShadow = true;
    group.add(baseMesh);
    const nx = Math.max(1, Math.round(e.sx / 2)), nz = Math.max(1, Math.round(e.sz / 2));
    const inst = new T.InstancedMesh(bubbleGeo, popitBubbleMaterial(), nx * nz);
    const bubbles = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const lx = -e.sx / 2 + (i + 0.5) * (e.sx / nx), lz = -e.sz / 2 + (j + 0.5) * (e.sz / nz);
        const t = (alongX ? (lz / e.sz) : (lx / e.sx)) + 0.5;
        c.setHSL((hue0 + Math.floor(t * 4) * 0.16) % 1, 0.9, 0.7);
        const k = bubbles.length;
        inst.setColorAt(k, c);
        bubbles.push({ lx, lz, popped: false, s: 1 });
    }
    const tile = { group, inst, bubbles, sx: e.sx, sz: e.sz, top: e.top, left: nx * nz, resetT: 0, zone: e.zone };
    popits.push(tile);
    for (let k = 0; k < bubbles.length; k++) setBubble(tile, k);
    inst.instanceColor.needsUpdate = true;
    group.add(inst);
    if (!moverGroup) solidBox(e.x, e.top - 0.6, e.z, e.sx, 1.2, e.sz, { zone: e.zone, mat: 'popit', popit: tile });
    return tile;
}
function setBubble(tile, k) {
    const b = tile.bubbles[k];
    m4.compose(v0.set(b.lx, 0, b.lz), q0, s0.set(1, b.s, 1));
    tile.inst.setMatrixAt(k, m4);
    tile.inst.instanceMatrix.needsUpdate = true;
}
// Pops the bubble under a foot (world x, z on tile); returns true if one popped, 'flip' if the tile reset
export function popAt(tile, x, z) {
    const lx = x - tile.group.position.x, lz = z - tile.group.position.z;
    let hit = false;
    tile.bubbles.forEach((b, k) => {
        if (b.popped) return;
        if (Math.abs(lx - b.lx) < 1.05 && Math.abs(lz - b.lz) < 1.05) { b.popped = true; tile.left--; hit = true; }
    });
    if (hit && tile.left <= 0) tile.resetT = 1.2;
    return hit;
}
function buildBounce(e) {
    const g = new T.Group(); g.position.set(e.x, e.top, e.z); zoneGroup(e.zone).add(g);
    const disc = new T.Mesh(new T.CylinderGeometry(e.r, e.r, 0.5, 40), new T.MeshPhysicalMaterial({ color: 0xa8ff2a, roughness: 0.12, clearcoat: 1, emissive: 0x4a9a00, emissiveIntensity: 0.45 }));
    disc.position.y = -0.25; g.add(disc);
    const ring = new T.Mesh(new T.TorusGeometry(e.r, 0.32, 10, 40), mat(0xffffff, { rough: 0.3 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = -0.05; g.add(ring);
    const arrow = billboard([{ t: '⬆', c: '#d8ff8a', s: '#2a6a00', px: 90 }], 2.4, 128, new V3(0, 2.2, 0), g);
    arrow.material.opacity = 0.9;
    const s = { shape: 'cyl', cx: e.x, cz: e.z, r: e.r, min: new V3(e.x - e.r, e.top - 0.5, e.z - e.r), max: new V3(e.x + e.r, e.top, e.z + e.r), zone: e.zone, mat: 'bounce', bounce: CFG.bounceV, disc, jig: 0 };
    solids.push(s); bouncers.push(s);
    tickers.push((dt, t) => {
        s.jig *= Math.exp(-dt * 5);
        const k = Math.sin(t * 30) * s.jig;
        disc.scale.set(1 + k * 0.08, 1 - k * 0.5, 1 + k * 0.08);
        arrow.position.y = 2.2 + Math.sin(t * 3 + e.x) * 0.4;
    });
}
export function jiggle(s) { s.jig = 1; }
function buildMover(e) {
    const zone = e.zone;
    let mesh, tile = null;
    if (e.look === 'popit') {
        mesh = new T.Group();
        tile = buildPopit({ ...e, top: 0, sx: e.sx, sz: e.sz, hue: Math.round(e.x + e.z) }, mesh);
        mesh.position.set(e.x, e.y + e.sy / 2, e.z);
    } else if (e.look === 'space') {
        mesh = new T.Mesh(roundGeo(e.sx, e.sy, e.sz, 0.45), mat(0xf0dcf8, { rough: 0.32 }));
        mesh.position.set(e.x, e.y, e.z);
    } else {
        mesh = new T.Mesh(roundGeo(e.sx, e.sy, e.sz, 0.35), bubbleWrapMaterial());
        mesh.position.set(e.x, e.y, e.z);
    }
    mesh.castShadow = true;
    zoneGroup(zone).add(mesh);
    const s = solidBox(e.x, e.y, e.z, e.sx, e.sy, e.sz, { zone, mat: e.look === 'popit' ? 'popit' : e.look === 'space' ? 'keys' : 'wrap', mover: true, delta: new V3(), e, mesh, popit: tile });
    movers.push(s);
}
function buildVanish(e) {
    const color = [0xff4a8a, 0xff7a5a, 0xffa84a, 0xff5ad8][Math.floor(Math.abs(e.x + e.z)) % 4];
    const m = new T.Mesh(roundGeo(e.sx, e.sy, e.sz, 0.5), vanishMaterial(color));
    m.position.set(e.x, e.y, e.z); m.castShadow = true;
    zoneGroup(e.zone).add(m);
    const s = solidBox(e.x, e.y, e.z, e.sx, e.sy, e.sz, { zone: e.zone, mat: 'jelly', vanish: true, state: 0, t: 0, mesh: m, home: m.position.clone() });
    vanishers.push(s);
}
// Called while someone stands on a vanishing jelly (main.js)
export function touchVanish(s) { if (s.state === 0) { s.state = 1; s.t = 0.75; } }
function buildSpinner(e) {
    const g = new T.Group(); g.position.set(e.x, e.top, e.z); zoneGroup(e.zone).add(g);
    const disc = new T.Mesh(new T.CylinderGeometry(e.r, e.r * 0.94, 1.6, 48), mochiMaterial());
    disc.position.y = -0.8; disc.castShadow = true; disc.receiveShadow = true; g.add(disc);
    // sprinkles and a swirl on top so the spin is easy to see
    const cols = [0xff6ab0, 0x6ad8ff, 0xffd84a, 0x8aff6a, 0xc88aff];
    const rnd = rngFrom(Math.round(e.x * 7 + e.z));
    for (let i = 0; i < 22; i++) {
        const a = rnd() * Math.PI * 2, r = 0.8 + rnd() * (e.r - 1.4);
        const sp = new T.Mesh(new T.CapsuleGeometry(0.12, 0.45, 4, 6), mat(cols[i % cols.length], { rough: 0.4 }));
        sp.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r); sp.rotation.set(Math.PI / 2, 0, rnd() * 3); g.add(sp);
    }
    const swirl = new T.Mesh(new T.TorusGeometry(e.r * 0.45, 0.12, 6, 40, Math.PI * 1.6), mat(0xffa8d0, { rough: 0.4 }));
    swirl.rotation.x = -Math.PI / 2; swirl.position.y = 0.04; g.add(swirl);
    const s = { shape: 'cyl', cx: e.x, cz: e.z, r: e.r, min: new V3(e.x - e.r, e.top - 1.6, e.z - e.r), max: new V3(e.x + e.r, e.top, e.z + e.r), zone: e.zone, mat: 'mochi', spin: e.speed, g };
    solids.push(s); spinners.push(s);
}
function buildSweeper(e) {
    const g = new T.Group(); g.position.set(e.x, e.y, e.z); zoneGroup(e.zone).add(g);
    const post = new T.Mesh(new T.CylinderGeometry(0.7, 0.9, 2.4, 20), mat(0xff8ac8, { rough: 0.35 }));
    post.position.y = 1.2; g.add(post);
    const bar = new T.Mesh(roundGeo(e.len * 2, 1.1, 1.1, 0.5), vanishMaterial(0xff5aa8));
    bar.position.y = 1.6; bar.castShadow = true; g.add(bar);
    sweepers.push({ cx: e.x, cz: e.z, y: e.y + 1.6, len: e.len, speed: e.speed, phase: e.phase, zone: e.zone, bar, g });
    solids.push({ shape: 'cyl', cx: e.x, cz: e.z, r: 0.9, min: new V3(e.x - 0.9, e.y, e.z - 0.9), max: new V3(e.x + 0.9, e.y + 2.4, e.z + 0.9), zone: e.zone, mat: 'jelly' });
}
// Where a sweeper bar is, for the knock test in main.js: angle now
export const sweeperAngle = (w, t) => w.speed * t + w.phase;

function buildCheckpoint(e) {
    const zone = e.zone;
    const pad = new T.Mesh(new RoundedBoxGeometry(7, 0.6, 7, 2, 0.24), new T.MeshPhysicalMaterial({ map: cpPadTex(false), roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.4 }));
    pad.position.set(e.x, e.y + 0.1, e.z); pad.receiveShadow = true;
    zoneGroup(zone).add(pad);
    const red = mat(0xff2a3a, { rough: 0.35, emissive: 0xff1a2a, ei: 0.45 });
    for (const [dx, dz, sx, sz] of [[0, -4.1, 9, 1.2], [0, 4.1, 9, 1.2], [-4.1, 0, 1.2, 7], [4.1, 0, 1.2, 7]]) batchBox(red, e.x + dx, e.y + 0.12, e.z + dz, sx, 0.25, sz, { zone, tile: 4 });
    solidBox(e.x, e.y + 0.1, e.z, 7, 0.6, 7, { zone, mat: 'jelly' });
    const label = billboard([{ t: 'Stage ' + (e.i + 1), c: '#ffffff', s: '#1a5a1a', px: 60 }], 6, 512, new V3(e.x, e.y + 10.5, e.z), zoneGroup(zone));
    label.material.opacity = 0.9;
    // a pulsing neon ring around the pad
    const ringMat = new T.MeshBasicMaterial({ color: 0xff3a4a, toneMapped: false });
    const ring = new T.Mesh(new T.TorusGeometry(5.3, 0.16, 8, 64), ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.set(e.x, e.y + 0.35, e.z);
    zoneGroup(zone).add(ring);
    // a flag on a pole that waves in the wind: red until you reach it, then green
    const flagGeo = new T.PlaneGeometry(3.2, 2, 14, 6);
    flagGeo.translate(1.6, 0, 0);
    const flagMat = new T.MeshStandardMaterial({ color: 0xff3a4a, side: T.DoubleSide, roughness: 0.6, emissive: 0x7a0a14, emissiveIntensity: 0.4 });
    const flag = new T.Mesh(flagGeo, flagMat);
    flag.castShadow = true;
    const fx = e.x - 2.9 * Math.sign(e.x), fz = e.z - 2.9 * Math.sign(e.z);
    const pole = new T.Mesh(new T.CylinderGeometry(0.12, 0.14, 8, 10), mat(0xf4f4ff, { rough: 0.3, metal: 0.4 }));
    pole.position.set(fx, e.y + 4.4, fz); zoneGroup(zone).add(pole);
    const knob = new T.Mesh(new T.SphereGeometry(0.28, 12, 10), mat(0xffd028, { rough: 0.3, metal: 0.6 }));
    knob.position.set(fx, e.y + 8.5, fz); zoneGroup(zone).add(knob);
    flag.position.set(fx, e.y + 7.1, fz);
    flag.rotation.y = Math.atan2(-Math.sign(e.z), Math.sign(e.x)) + Math.PI;
    zoneGroup(zone).add(flag);
    const base = Float32Array.from(flagGeo.attributes.position.array);
    cpPads[e.i] = { pad, lit: false, label, ring, flag, flagMat };
    tickers.push((dt, t) => {
        if (!flag.parent.visible) return;
        const p = flagGeo.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const x = base[i * 3], k = x / 3.2;
            p.array[i * 3 + 2] = Math.sin(x * 1.9 - t * 5 + e.i) * 0.32 * k + Math.sin(base[i * 3 + 1] * 2 + t * 3) * 0.06 * k;
        }
        p.needsUpdate = true;
        flagGeo.computeVertexNormals();
        const pulse = 1.6 + Math.sin(t * 3 + e.i) * 0.6;
        ringMat.color.set(cpPads[e.i].lit ? 0x46ff5a : 0xff3a4a).multiplyScalar(pulse);
        ring.scale.setScalar(1 + Math.sin(t * 3 + e.i) * 0.03);
    });
    triggers.push({ min: new V3(e.x - 3.6, e.y, e.z - 3.6), max: new V3(e.x + 3.6, e.y + 6, e.z + 3.6), zone, enter: () => actions.checkpoint(e.i) });
}
export function lightCheckpoint(i, on) {
    const c = cpPads[i];
    if (!c || c.lit === on) return;
    c.lit = on;
    c.pad.material.map = cpPadTex(on);
    c.pad.material.emissive = new T.Color(on ? 0x2aa83a : 0x000000);
    c.pad.material.emissiveIntensity = on ? 0.35 : 0;
    c.pad.material.needsUpdate = true;
    c.flagMat.color.set(on ? 0x46e85a : 0xff3a4a);
    c.flagMat.emissive.set(on ? 0x0a6a1a : 0x7a0a14);
}

function buildSummit(e) {
    const g = new T.Group(); g.position.set(e.x, e.y, e.z); zoneGroup(e.zone).add(g);
    summitGroup = g;
    const top = new T.Mesh(new T.CircleGeometry(e.r, 64), new T.MeshPhysicalMaterial({ map: daisTex(), emissiveMap: daisTex(true), emissive: 0xffc83a, emissiveIntensity: 2.2, roughness: 0.25, clearcoat: 1 }));
    top.rotation.x = -Math.PI / 2; top.position.y = 0.01; top.receiveShadow = true; g.add(top);
    const rt = rainbowTex().clone(); rt.wrapS = T.RepeatWrapping; rt.repeat.set(3, 1); rt.needsUpdate = true;
    const side = new T.Mesh(new T.CylinderGeometry(e.r, e.r * 0.86, 3, 64, 1, true), new T.MeshStandardMaterial({ map: rt, roughness: 0.35, emissive: 0x2a0a2a, emissiveIntensity: 0.2 }));
    side.position.y = -1.5; g.add(side);
    const under = new T.Mesh(new T.CircleGeometry(e.r * 0.86, 48), mat(0x3a1870));
    under.rotation.x = Math.PI / 2; under.position.y = -3; g.add(under);
    solids.push({ shape: 'cyl', cx: e.x, cz: e.z, r: e.r, min: new V3(e.x - e.r, e.y - 3, e.z - e.r), max: new V3(e.x + e.r, e.y, e.z + e.r), zone: e.zone, mat: 'tile' });
    // The WIN pad: a glowing rainbow disc with a beam of light
    const padTex = rainbowTex().clone(); padTex.wrapS = T.RepeatWrapping; padTex.needsUpdate = true;
    const pad = new T.Mesh(new T.CircleGeometry(e.pad, 48), new T.MeshBasicMaterial({ map: padTex, toneMapped: false }));
    pad.material.color.multiplyScalar(1.5);
    pad.rotation.x = -Math.PI / 2; pad.position.y = 0.06; g.add(pad);
    const beamGeo = new T.CylinderGeometry(e.pad, e.pad, 40, 32, 1, true);
    const beam = new T.Mesh(beamGeo, new T.ShaderMaterial({
        transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
        uniforms: { uTime: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform float uTime; varying vec2 vUv;
            vec3 hue(float h){ return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0); }
            void main(){ float a = (1.0 - vUv.y) * 0.55 * (0.7 + 0.3 * sin(vUv.y * 20.0 - uTime * 4.0)); gl_FragColor = vec4(hue(vUv.x + uTime * 0.1) * 1.3, a); }`,
    }));
    beam.position.y = 20; g.add(beam);
    const win = billboard([{ t: '🏆 WIN! 🏆', g: ['#fff6b0', '#ffc828'], s: '#7a3a00', px: 90 }, { t: 'Top of ASMR Tower', c: '#ffffff', s: '#7a2ad8', px: 44 }], 12, 512, new V3(0, 8, 0), g);
    triggers.push({ min: new V3(e.x - e.pad + 0.6, e.y, e.z - e.pad + 0.6), max: new V3(e.x + e.pad - 0.6, e.y + 6, e.z + e.pad - 0.6), zone: e.zone, enter: () => actions.summit() });
    // The giant rainbow squishy watching over the top
    const sq = giantSquishy(6.5);
    sq.position.set(e.x + 6.5, e.y, e.z + 6.5); sq.rotation.y = Math.atan2(-1, -1);
    g.parent.add(sq);
    solids.push({ shape: 'cyl', cx: e.x + 6.5, cz: e.z + 6.5, r: 6, min: new V3(e.x + 0.5, e.y, e.z + 0.5), max: new V3(e.x + 12.5, e.y + 9, e.z + 12.5), zone: e.zone, mat: 'squishy', bounce: 70, squishy: sq });
    tickers.push((dt, t) => {
        padTex.offset.x = (t * 0.25) % 1;
        beam.material.uniforms.uTime.value = t;
        win.position.y = 8 + Math.sin(t * 1.5) * 0.5;
    });
}

// =====================================================================================
// Per-frame world animation (before the player moves)
// =====================================================================================
const prevPos = new V3();
export function updateWorld(dt, t) {
    const st = serverT();
    // Movers: positions from the shared server clock so every player sees the same thing
    for (const s of movers) {
        prevPos.copy(s.min);
        if (s.piston) {
            const e = s.piston;
            const k = 0.5 - 0.5 * Math.cos((st / e.period + e.phase) * Math.PI * 2);
            const top = e.top - e.amp * k;
            s.min.y = top - 3; s.max.y = top;
            s.keyMesh.set(s.keyIdx, e.x, top, e.z, e.sx / 3.6, e.sz / 3.6, 1);
        } else {
            const e = s.e, k = Math.sin((st / e.period + e.phase) * Math.PI * 2);
            const x = e.x + e.ax * k, y = e.y + e.ay * k, z = e.z + e.az * k;
            s.min.set(x - e.sx / 2, y - e.sy / 2, z - e.sz / 2);
            s.max.set(x + e.sx / 2, y + e.sy / 2, z + e.sz / 2);
            s.mesh.position.set(x, e.look === 'popit' ? y + e.sy / 2 : y, z);
        }
        s.delta.subVectors(s.min, prevPos);
    }
    for (const z of pistonMeshes()) z.done();
    // Vanishing jelly: shake, fade, gone for a while, then back
    for (const s of vanishers) {
        if (s.state === 1) {
            s.t -= dt;
            s.mesh.position.set(s.home.x + (Math.random() - 0.5) * 0.25, s.home.y, s.home.z + (Math.random() - 0.5) * 0.25);
            s.mesh.material.opacity = 0.35 + 0.45 * Math.max(0, s.t / 0.75);
            if (s.t <= 0) { s.state = 2; s.t = 3; s.off = true; s.mesh.visible = false; }
        } else if (s.state === 2) {
            s.t -= dt;
            if (s.t <= 0) { s.state = 3; s.t = 0.35; s.off = false; s.mesh.visible = true; s.mesh.position.copy(s.home); }
        } else if (s.state === 3) {
            s.t -= dt;
            const k = 1 - Math.max(0, s.t / 0.35);
            s.mesh.material.opacity = 0.82 * k; s.mesh.scale.setScalar(0.6 + 0.4 * k);
            if (s.t <= 0) { s.state = 0; s.mesh.scale.setScalar(1); s.mesh.material.opacity = 0.82; }
        }
    }
    for (const s of spinners) s.g.rotation.y = -s.spin * st;
    for (const w of sweepers) w.g.rotation.y = -sweeperAngle(w, st);
    // Domes squish while pressed and wobble back
    for (const s of domes) {
        const target = s.press > 0 ? 1 : 0;
        s.press -= dt;
        s.sqv += (target - s.squish) * 260 * dt;
        s.sqv *= Math.exp(-11 * dt);
        s.squish += s.sqv * dt;
        if (Math.abs(s.squish) > 0.002 || Math.abs(s.sqv) > 0.01 || target) setDomeMatrix(s);
    }
    // Pop-it bubbles ease in / out; a fully popped tile flips back
    for (const tile of popits) {
        if (tile.resetT > 0) {
            tile.resetT -= dt;
            if (tile.resetT <= 0) { tile.bubbles.forEach((b) => { b.popped = false; }); tile.left = tile.bubbles.length; tile.flipped = true; }
        }
        let dirty = false;
        tile.bubbles.forEach((b, k) => {
            const want = b.popped ? -0.45 : 1;
            if (Math.abs(b.s - want) > 0.005) { b.s += (want - b.s) * Math.min(1, dt * 22); setBubble(tile, k); dirty = true; }
        });
        if (dirty) tile.inst.instanceMatrix.needsUpdate = true;
    }
    // Coins
    if (coinMesh) {
        COINS.forEach((c, i) => {
            const hide = coinState.collected.has(c.i);
            q0.setFromAxisAngle(UP, t * 2.4 + i);
            m4.compose(v0.set(c.x, c.y + Math.sin(t * 2 + i) * 0.3, c.z), q0, s0.setScalar(hide ? 0.0001 : 1));
            coinMesh.setMatrixAt(i, m4);
        });
        coinMesh.instanceMatrix.needsUpdate = true;
        q0.identity();
    }
    // squishy statues settle
    for (const s of solids) if (s.squishy && s.sq) {
        s.sq *= Math.exp(-dt * 6);
        const k = Math.sin(t * 22) * s.sq;
        s.squishy.scale.set(1 + k * 0.08, 1 - k * 0.14, 1 + k * 0.08);
    }
}
const UP = new V3(0, 1, 0);
const pistonSet = new Set();
function pistonMeshes() {
    if (!pistonSet.size) for (const s of movers) if (s.keyMesh) pistonSet.add(s.keyMesh);
    return pistonSet;
}
export function squishBig(s) { s.sq = 1; }

// =====================================================================================
export function buildWorld() {
    buildShell();
    buildLobby();
    buildCourse();
    buildDecor({ zoneGroup, windows, H, TOP });
    flushKeys((z) => zoneGroup(z));
    flushBatches((z) => zoneGroup(z));
}

// Only the stages near the camera are drawn: the tower is tall and you see far up and down,
// so this keeps the ones more than three stages away hidden
export function cullZones(stage) {
    for (const [z, g] of zoneGroups) {
        if (z === -2) continue;
        if (z < 0) { g.visible = stage <= 3; continue; }
        g.visible = Math.abs(z - Math.max(0, stage)) <= 3 || (stage < 0 && z <= 2);
    }
}
