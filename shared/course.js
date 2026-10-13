// The ASMR Tower obby, as plain data shared by the client (which builds meshes and colliders from
// it) and the server (which checks checkpoints, coins and the summit against it).
//
// The course runs around the inside of the square tower, one wall at a time, rising as it goes:
// corner landings at (±50, ±50), 14 x 14 studs; between two corners lies a "side" 100 studs long
// (u = 0 at the first corner, 100 at the next; v = sideways, positive toward the middle of the
// tower, the wall face is at v = -14). Two sides make a stage; every stage ends in a checkpoint on
// its last corner. The last stage ends at the summit platform floating in the middle of the tower.
//
// Coordinates are studs; y is the top of whatever you stand on.
import { STAGES } from './config.js';

const K = [[-50, -50], [-50, 50], [50, 50], [50, -50]];
// Top of each corner landing; corner 0 is the lobby floor (the stairs start from it)
export const CORNER_Y = [0, 22, 36, 48, 58, 66, 76, 96, 104, 114, 124, 132, 142, 160, 172, 180, 190, 198, 208, 216, 226, 234, 244, 256, 270];
export const LAND = 14;               // corner landing size
export const cornerXZ = (c) => K[c % 4];

export const COURSE = [];             // every element: { t, zone, ... } (see the builders below)
export const CHECKPOINTS = [];        // { i, x, y, z, yaw }: y = top of the pad
export const COINS = [];              // { i, x, y, z, zone }
let coinN = 0;

function side(s, fn) {
    const a = K[s % 4], b = K[(s + 1) % 4];
    const dx = Math.sign(b[0] - a[0]), dz = Math.sign(b[1] - a[1]);
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const nx = mx === 0 ? 0 : -Math.sign(mx), nz = mz === 0 ? 0 : -Math.sign(mz);
    const alongX = dx !== 0;
    const zone = s >> 1;
    const X = (u, v) => a[0] + dx * u + nx * v, Z = (u, v) => a[1] + dz * u + nz * v;
    const SX = (lu, lv) => (alongX ? lu : lv), SZ = (lu, lv) => (alongX ? lv : lu);
    // a world-space offset for a local (du, dv) move
    const OX = (du, dv) => dx * du + nx * dv, OZ = (du, dv) => dz * du + nz * dv;
    const push = (o) => { o.zone = zone; COURSE.push(o); return o; };
    const box = (t, u, v, lu, lv, top, h, extra) => push({ t, x: X(u, v), y: top - h / 2, z: Z(u, v), sx: SX(lu, lv), sy: h, sz: SZ(lu, lv), ...extra });
    const c = {
        s, zone, y0: CORNER_Y[s], y1: CORNER_Y[s + 1], alongX,
        // translucent green jelly slab (squishes a little when you land on it)
        jelly: (u, v, lu, lv, top, h, color) => box('jelly', u, v, lu, lv, top, h || 1.6, color ? { color } : {}),
        block: (u, v, lu, lv, top, h) => box('block', u, v, lu, lv, top, h || 3),
        // a board of chunky keyboard keys on a green base (pal: magenta / green / lilac)
        keys: (u, v, lu, lv, top, pal) => push({ t: 'keys', x: X(u, v), top, z: Z(u, v), sx: SX(lu, lv), sz: SZ(lu, lv), pal }),
        dome: (u, v, r, top, h) => push({ t: 'dome', x: X(u, v), z: Z(u, v), r, h: h || 3, y0: top - (h || 3) }),
        truss: (u, v, lu, lv, bottom, top) => push({ t: 'truss', x: X(u, v), y: (bottom + top) / 2, z: Z(u, v), sx: SX(lu, lv), sy: top - bottom, sz: SZ(lu, lv) }),
        slime: (u, v, lu, lv, top, h) => push({ t: 'slime', x: X(u, v), top, z: Z(u, v), sx: SX(lu, lv), sz: SZ(lu, lv), h: h || 4 }),
        butter: (u, v, lu, lv, top, h) => box('butter', u, v, lu, lv, top, h || 3, { alongX }),
        popit: (u, v, lu, lv, top, hue) => push({ t: 'popit', x: X(u, v), top, z: Z(u, v), sx: SX(lu, lv), sz: SZ(lu, lv), hue }),
        bounce: (u, v, lu, lv, top, r) => {
            box('block', u, v, lu, lv, top, 2.5);
            push({ t: 'bounce', x: X(u, v), z: Z(u, v), top: top + 0.5, r: r || 2.4 });
        },
        // moving platform: du/dv/dy = how far it swings each way, period in seconds
        mover: (u, v, lu, lv, top, h, du, dv, dy, period, phase, look) => push({
            t: 'mover', x: X(u, v), y: top - h / 2, z: Z(u, v), sx: SX(lu, lv), sy: h, sz: SZ(lu, lv),
            ax: OX(du, dv), ay: dy, az: OZ(du, dv), period, phase: phase || 0, look: look || 'wrap',
        }),
        // a key typing up and down: top goes from `top` down by amp
        piston: (u, v, lu, lv, top, amp, period, phase) => push({ t: 'piston', x: X(u, v), top, z: Z(u, v), sx: SX(lu, lv), sz: SZ(lu, lv), amp, period, phase }),
        vanish: (u, v, lu, lv, top) => box('vanish', u, v, lu, lv, top, 2),
        spinner: (u, v, r, top, speed) => push({ t: 'spinner', x: X(u, v), z: Z(u, v), top, r, speed }),
        sweeper: (u, v, len, y, speed, phase) => push({ t: 'sweeper', x: X(u, v), z: Z(u, v), y, len, speed, phase: phase || 0 }),
        coin: (u, v, y) => { const o = { i: coinN++, x: X(u, v), y, z: Z(u, v), zone }; COINS.push(o); push({ t: 'coin', ...o }); },
    };
    fn(c);
}

// ===================== Stage 1: Jelly Stairs =====================
side(0, (c) => {
    // From the lobby floor, glass-green jelly steps climb along the west wall
    for (let i = 0; i < 10; i++) {
        c.jelly(10 + i * 8.6, i % 2 ? 1.5 : -1.5, 7, 10, 2.2 + i * 2.1, 1.4);
        if (i === 3 || i === 7) c.coin(10 + i * 8.6, i % 2 ? 1.5 : -1.5, 2.2 + i * 2.1 + 2.6);
    }
});
side(1, (c) => {
    const us = [13, 25, 37, 49, 61, 73, 86], tops = [23.5, 25, 26.5, 28.5, 30.5, 32.5, 34.5], vs = [0, 3, -2, 2, -3, 1, 0];
    us.forEach((u, i) => {
        c.jelly(u, vs[i], 6, 6, tops[i], 2);
        if (i === 2 || i === 5) c.coin(u, vs[i], tops[i] + 2.6);
    });
});
// ===================== Stage 2: Clicky Keys =====================
side(2, (c) => {
    const us = [15, 32, 49, 66, 83], tops = [37.5, 39.5, 41.5, 44, 46.5], pals = ['magenta', 'green', 'lilac', 'magenta', 'green'];
    us.forEach((u, i) => {
        c.keys(u, 0, 12, 12, tops[i], pals[i]);
        if (i === 1 || i === 3) c.coin(u, 0, tops[i] + 2.6);
    });
});
side(3, (c) => {
    const us = [16, 34, 52, 70, 87], lus = [14, 14, 14, 14, 10], lvs = [8, 8, 4, 8, 8], vs = [-3, 4, -2, 3, 0];
    const tops = [49.5, 51.5, 53, 55, 56.5], pals = ['lilac', 'magenta', 'lilac', 'green', 'magenta'];
    us.forEach((u, i) => {
        c.keys(u, vs[i], lus[i], lvs[i], tops[i], pals[i]);
        if (i === 2) c.coin(u, vs[i], tops[i] + 2.6);
    });
});
// ===================== Stage 3: Squishy Domes =====================
side(4, (c) => {
    const us = [13, 22.5, 32, 41.5, 52.5, 63.5, 73, 82.5, 90], vs = [0, 2, -2, 1, 0, -1, 2, -1, 0];
    const tops = [60, 60.5, 61, 61.5, 63, 63, 63.5, 64, 64.5];
    us.forEach((u, i) => {
        if (i === 4) c.dome(u, vs[i], 6.5, tops[i], 4.2);          // the big squishy blob
        else c.dome(u, vs[i], 4.5, tops[i], 3);
    });
    c.coin(52.5, 0, 66);
});
side(5, (c) => {
    const items = [
        ['cube', 12, 0, 67.5], ['dome', 21, 2, 69], ['cube', 30, -1, 70], ['dome', 39, 1, 71], ['cube', 48, -2, 72],
        ['dome', 57, 1, 73], ['cube', 66, 0, 73.5], ['dome', 75, -1, 74], ['cube', 83, 1, 75], ['cube', 89, 0, 75],
    ];
    for (const [k, u, v, top] of items) {
        if (k === 'cube') c.jelly(u, v, 4, 4, top, 2.5); else c.dome(u, v, 3.5, top, 2.5);
    }
    c.coin(48, -2, 74.6);
    c.coin(75, -1, 76.6);
});
// ===================== Stage 4: Slime Pools =====================
side(6, (c) => {
    c.slime(20, 0, 22, 12, 77);
    c.truss(32.5, 0, 3, 10, 77, 87);
    c.slime(47, 0, 26, 12, 87);
    c.truss(61.5, 0, 3, 10, 87, 96);
    c.slime(77.5, 0, 29, 12, 96);
    c.coin(47, 0, 89.6);
    c.coin(80, 3, 98.6);
});
side(7, (c) => {
    c.slime(17, 0, 14, 10, 97);
    c.slime(35, 0, 12, 10, 98.5);
    c.truss(42.5, 0, 3, 8, 98.5, 106);
    c.slime(50, 0, 12, 10, 106);
    c.slime(68, 0, 14, 10, 103);
    c.slime(86, 0, 12, 10, 103.5);
    c.coin(50, 0, 108.6);
});
// ===================== Stage 5: Butter Bridge =====================
side(8, (c) => {
    const us = [15, 32, 49, 66, 83], vs = [-3, 3, -3, 3, 0], tops = [105, 107, 109, 111, 112.5];
    us.forEach((u, i) => c.butter(u, vs[i], 14, 4, tops[i], 3));
    c.butter(49, -3, 4, 4, 111, 2);                                // a pat of butter to hop over
    c.coin(32, 3, 109.6);
    c.coin(83, 0, 115.1);
});
side(9, (c) => {
    [12, 20, 28, 36].forEach((u, i) => c.butter(u, i % 2 ? 2 : -2, 5, 5, 115 + i * 1.5, 4));
    c.butter(52, 0, 22, 2, 120, 2.5);                              // the narrow butter beam
    [70, 78, 86].forEach((u, i) => c.butter(u, i % 2 ? -2 : 2, 5, 5, 121 + i, 4));
    c.coin(52, 0, 122.6);
});
// ===================== Stage 6: Pop-It Path =====================
side(10, (c) => {
    const us = [13, 25, 37, 49, 61, 73, 85], vs = [0, 4, -4, 3, -3, 4, 0];
    us.forEach((u, i) => c.popit(u, vs[i], 8, 8, 125 + i, i));
    c.coin(37, -4, 129.6);
    c.coin(73, 4, 132.6);
});
side(11, (c) => {
    c.popit(12, 0, 8, 8, 133, 0);
    c.mover(26, 0, 8, 8, 134, 1.5, 0, 6, 0, 4, 0, 'popit');
    c.popit(40, 0, 8, 8, 135, 2);
    c.mover(54, 0, 8, 8, 137, 1.5, 3, 0, 0, 3.5, 0.3, 'popit');
    c.popit(68, 0, 8, 8, 138.5, 4);
    c.mover(78, 0, 8, 8, 140, 1.5, 0, 7, 0, 4.5, 0.6, 'popit');
    c.popit(88, 0, 6, 6, 141, 6);
    c.coin(40, 0, 137.6);
});
// ===================== Stage 7: Slime Bounce =====================
side(12, (c) => {
    c.bounce(15, 0, 12, 10, 143);
    c.bounce(33, 0, 12, 10, 151);
    c.block(52, 0, 12, 10, 157, 3);
    c.jelly(68, 0, 8, 8, 158.5, 2);
    c.jelly(84, 0, 12, 10, 159.5, 2);
    c.coin(24, 0, 158);
    c.coin(52, 0, 159.6);
});
side(13, (c) => {
    [13, 28, 43, 58, 73].forEach((u, i) => c.bounce(u, i % 2 ? 2 : -2, 5, 5, 161 + i * 2, 1.9));
    c.jelly(88, 0, 8, 10, 171, 2);
    c.coin(35.5, 0, 176);
    c.coin(65.5, 0, 180);
});
// ===================== Stage 8: Bubble Wrap =====================
side(14, (c) => {
    c.block(13, 0, 8, 8, 173, 2);
    c.mover(26, 0, 8, 8, 174, 1.5, 6, 0, 0, 4, 0);
    c.block(42, 0, 8, 8, 175, 2);
    c.mover(55, 0, 8, 8, 176.5, 1.5, 0, 7, 0, 3.6, 0.25);
    c.block(68, 0, 8, 8, 177.5, 2);
    c.mover(81, 0, 8, 8, 179, 1.5, 5, 0, 0, 3, 0.5);
    c.coin(42, 0, 177.6);
});
side(15, (c) => {
    c.mover(16, 0, 8, 8, 184, 1.5, 0, 0, 3, 4, 0);
    c.block(29, 0, 8, 8, 186, 2);
    c.mover(42, 0, 8, 8, 187, 1.5, 0, 0, 3, 4.5, 0.5);
    c.block(55, 0, 8, 8, 189, 2);
    c.mover(70, 0, 8, 8, 189, 1.5, 0, 6, 0, 3.8, 0.2);
    c.block(85, 0, 10, 8, 189.5, 2);
    c.coin(55, 0, 191.6);
});
// ===================== Stage 9: Typing Keys =====================
side(16, (c) => {
    for (let i = 0; i < 12; i++) c.piston(11 + i * 7, 0, 4, 4, 191 + i * 0.55, 2.6, 2.4, i * 0.12);
    c.coin(46, 0, 196);
});
side(17, (c) => {
    c.keys(13, 0, 8, 8, 199, 'lilac');
    c.mover(27, 0, 4, 16, 200.5, 1, 4, 0, 0, 3, 0, 'space');
    c.keys(41, 0, 8, 8, 202, 'magenta');
    c.piston(51, 0, 4, 4, 203.5, 2.4, 2.2, 0);
    c.piston(57, 0, 4, 4, 204, 2.4, 2.2, 0.5);
    c.keys(67, 0, 8, 8, 204.5, 'green');
    c.mover(79, 0, 4, 12, 206, 1, 0, 6, 0, 3.4, 0.3, 'space');
    c.keys(89, 0, 6, 8, 207, 'lilac');
    c.coin(41, 0, 204.6);
});
// ===================== Stage 10: Jelly Drops =====================
side(18, (c) => {
    for (let i = 0; i < 11; i++) c.vanish(12 + i * 7.8, i % 2 ? 3 : -3, 5, 5, 209 + i * 0.65);
    c.coin(43.2, 3, 213.6);
});
side(19, (c) => {
    c.dome(13, 0, 3.5, 217.5, 2.5);
    c.vanish(21, 2, 5, 5, 218.5);
    c.dome(29, 0, 3.5, 219.5, 2.5);
    c.vanish(37, -2, 5, 5, 220.5);
    c.vanish(44, 1, 3, 3, 221);
    c.dome(52, 0, 3.5, 222, 2.5);
    c.vanish(60, 2, 4, 4, 222.8);
    c.vanish(67, -1, 3, 3, 223.4);
    c.dome(75, 0, 3.5, 224, 2.5);
    c.vanish(83, 1, 5, 5, 224.8);
    c.vanish(90, 0, 4, 4, 225.3);
    c.coin(52, 0, 225.6);
});
// ===================== Stage 11: Mochi Spinners =====================
side(20, (c) => {
    [14, 28, 42, 56, 70, 84].forEach((u, i) => c.spinner(u, 0, 5.5, [227, 228.5, 230, 231, 232, 233][i], i % 2 ? -0.9 : 0.9));
    c.coin(42, 0, 232.6);
});
side(21, (c) => {
    c.jelly(22, 0, 26, 8, 235, 2);
    c.jelly(48.5, 0, 27, 8, 238, 2);
    c.jelly(77, 0, 30, 8, 241, 2);
    c.sweeper(22, 0, 7.5, 235, 1.6, 0);
    c.sweeper(48.5, 0, 7.5, 238, -1.8, 1);
    c.sweeper(77, 0, 7.5, 241, 2.0, 2);
    c.coin(35, 0, 237.6);
    c.coin(62, 0, 240.6);
});
// ===================== Stage 12: Rainbow Summit =====================
side(22, (c) => {
    c.keys(15, 0, 12, 12, 245, 'magenta');
    c.truss(22.5, 0, 3, 8, 245, 252);
    c.slime(33, 0, 18, 10, 252);
    c.dome(49, 1, 4, 253, 3);
    c.dome(58, -1, 4, 253.5, 3);
    c.vanish(66, 0, 4, 4, 254);
    c.vanish(73, 2, 4, 4, 254.5);
    c.keys(86, 0, 12, 12, 255, 'green');
    c.coin(33, 0, 254.6);
});
side(23, (c) => {
    for (let i = 0; i < 11; i++) c.jelly(11 + i * 8, i % 2 ? 1.5 : -1.5, 6, 8, 257.2 + i * 1.2, 1.4, 'rainbow:' + i);
    c.coin(51, 1.5, 264.6);
});

// ===================== corners, checkpoints, the summit =====================
// Corner landings 1..24; even corners 2..22 are the checkpoints of stages 1..11
for (let cn = 1; cn < CORNER_Y.length; cn++) {
    const [x, z] = K[cn % 4], y = CORNER_Y[cn];
    const zone = Math.min(STAGES.length - 1, (cn - 1) >> 1);
    COURSE.push({ t: 'land', x, z, top: y, s: LAND, zone, rainbow: cn === CORNER_Y.length - 1 });
    if (cn % 2 === 0 && cn < CORNER_Y.length - 1) {
        // Face along the next side
        const b = K[(cn + 1) % 4];
        const yaw = Math.atan2(b[0] - x, b[1] - z);
        const cp = { i: cn / 2 - 1, x, y, z, yaw };
        CHECKPOINTS.push(cp);
        COURSE.push({ t: 'cp', ...cp, zone: cp.i });
    }
}
// Diagonal rainbow stepping stones from the last corner out to the summit in the middle
const SUM_STONES = [[-42, 270.5], [-35, 271], [-28, 271.5], [-21, 272], [-14, 272.5]];
SUM_STONES.forEach(([p, top], i) => COURSE.push({ t: 'jelly', x: p, y: top - 0.8, z: p, sx: 5, sy: 1.6, sz: 5, zone: STAGES.length - 1, color: 'rainbow:' + (i * 2) }));
export const SUMMIT = { x: 0, y: 273, z: 0, r: 12, pad: 4.5 };
COURSE.push({ t: 'summit', ...SUMMIT, zone: STAGES.length - 1 });

// Gear pads on three landings (step on one to see the gear); like the Magic Carpet in the reference
export const TOWER_GEAR = [
    { gear: 'carpet', corner: 6 }, { gear: 'jetpack', corner: 12 }, { gear: 'grapple', corner: 18 },
].map((g) => {
    const [x, z] = K[g.corner % 4];
    // on a small platform between the landing and the east / west wall
    return { gear: g.gear, x: x + Math.sign(x) * 10.5, y: CORNER_Y[g.corner], z, zone: (g.corner >> 1) - 1 };
});

// Where you stand when teleported to checkpoint i (0-based; -1 = lobby)
export function checkpointSpot(i) {
    const cp = CHECKPOINTS[i];
    return cp ? { x: cp.x, y: cp.y + 0.6, z: cp.z, yaw: cp.yaw } : null;
}
// Stage (0-based) a height belongs to, from the corner heights; -1 below the first stage
export function stageAtY(y) {
    if (y < 1.5) return -1;
    for (let k = 0; k < STAGES.length; k++) if (y < CORNER_Y[2 * k + 2] + 8) return k;
    return STAGES.length - 1;
}
export const COURSE_TOP = SUMMIT.y;
