// Premium set dressing for the tower: neon rings in each stage's colour, rainbow neon pillars in
// the corners, soft light beams through the windows, soap bubbles drifting up the shaft, giant
// squishies, keycaps and pop-its floating in the middle, neon stage signs and lobby balloons.
// Nothing here collides; it all just makes the tower glow and move.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { T, V3, scene, tickers, texFrom } from './engine.js';
import { neonVC, bubbleMaterial, matTime } from './materials.js';
import { petModel } from './pets.js';
import { KEYCAP_TALL, keyMaterial, letterIndex } from './keys.js';
import { STAGES, petById, rngFrom } from '../../shared/config.js';
import { CORNER_Y, cornerXZ } from '../../shared/course.js';

const hex = (h) => '#' + h.toString(16).padStart(6, '0');
function colorize(g, c) {
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new T.BufferAttribute(a, 3));
    return g;
}
function strip(list) {
    const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
    for (const g of parts) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    return mergeGeometries(parts);
}
// Quality: on Low the light beams and bubbles are off
let low = false;
const lowOnly = [];
export function setDecorLow(on) { low = !!on; for (const o of lowOnly) o.visible = !low; }

export function buildDecor({ zoneGroup, windows, H, TOP }) {
    // ----- neon rings at the start of every stage, around all four walls (split around windows) -----
    const ringGeos = [], mouldGeos = [];
    const inner = H - 0.35;
    for (let k = 1; k < STAGES.length; k++) {
        const y = CORNER_Y[2 * k] - 5;
        const col = new T.Color(STAGES[k].bar);
        for (let wall = 0; wall < 4; wall++) {
            // pieces along the wall, skipping windows that cross this height
            const cuts = windows.filter((w) => w.wall === wall && y > w.y0 - 1 && y < w.y1 + 1).map((w) => [w.a0 - 0.8, w.a1 + 0.8]).sort((a, b) => a[0] - b[0]);
            let a = -H;
            const pieces = [];
            for (const [c0, c1] of cuts) { if (c0 > a) pieces.push([a, c0]); a = Math.max(a, c1); }
            if (a < H) pieces.push([a, H]);
            for (const [p0, p1] of pieces) {
                const len = p1 - p0, mid = (p0 + p1) / 2;
                const n = [[0, 1], [0, -1], [1, 0], [-1, 0]][wall];
                for (const dy of [0.75, -0.75]) {
                    const g = new T.BoxGeometry(wall < 2 ? len : 0.3, 0.42, wall < 2 ? 0.3 : len);
                    g.translate(wall < 2 ? mid : n[0] * (inner - 0.3), y + dy, wall < 2 ? n[1] * (inner - 0.3) : mid);
                    ringGeos.push(colorize(g, col));
                }
                const mg = new T.BoxGeometry(wall < 2 ? len : 0.5, 3.2, wall < 2 ? 0.5 : len);
                mg.translate(wall < 2 ? mid : n[0] * (inner + 0.05), y, wall < 2 ? n[1] * (inner + 0.05) : mid);
                mouldGeos.push(mg);
            }
        }
    }
    const rings = new T.Mesh(strip(ringGeos), neonVC(2.8));
    rings.frustumCulled = false;
    zoneGroup(-2).add(rings);
    const mould = new T.Mesh(mergeGeometries(mouldGeos.map((g) => { g.deleteAttribute('uv'); return g; })), new T.MeshPhysicalMaterial({ color: 0x4a1e8a, roughness: 0.25, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.2 }));
    mould.receiveShadow = true;
    mould.frustumCulled = false;
    zoneGroup(-2).add(mould);

    // ----- rainbow neon pillars up the four inner corners -----
    const pil = [];
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const g = new T.CylinderGeometry(0.75, 0.75, TOP, 12, 80, true);
        g.translate(sx * (H - 0.5), TOP / 2, sz * (H - 0.5));
        const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new T.Color();
        for (let i = 0; i < p.count; i++) { c.setHSL((p.getY(i) / 120) % 1, 0.9, 0.62); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
        g.setAttribute('color', new T.BufferAttribute(col, 3));
        pil.push(g);
    }
    const pillars = new T.Mesh(strip(pil), neonVC(1.7));
    pillars.frustumCulled = false;
    zoneGroup(-2).add(pillars);

    // ----- light beams pouring in through every window (one mesh, soft additive) -----
    {
        const pos = [], nrm = [], along = [];
        const quad = (a, b, c, d, n, ua, ub, uc, ud) => {
            for (const [p, u] of [[a, ua], [b, ub], [c, uc], [a, ua], [c, uc], [d, ud]]) { pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z); along.push(u); }
        };
        for (const w of windows) {
            const n = new V3(-w.n[0], 0, -w.n[1]);                 // into the tower
            const dir = n.clone().multiplyScalar(1).add(new V3(0, -0.62, 0)).normalize();
            const L = 58, grow = 1.35;
            const side = w.wall < 2 ? new V3(1, 0, 0) : new V3(0, 0, 1);
            const c0 = new V3(w.wall < 2 ? (w.a0 + w.a1) / 2 : w.n[0] * (H - 0.2), (w.y0 + w.y1) / 2, w.wall < 2 ? w.n[1] * (H - 0.2) : (w.a0 + w.a1) / 2);
            const hw = (w.a1 - w.a0) / 2, hh = (w.y1 - w.y0) / 2;
            const c1 = c0.clone().addScaledVector(dir, L);
            const P = (c, s, h, k) => c.clone().addScaledVector(side, s * k).add(new V3(0, h * k, 0));
            const n0 = [P(c0, -hw, -hh, 1), P(c0, hw, -hh, 1), P(c0, hw, hh, 1), P(c0, -hw, hh, 1)];
            const n1 = [P(c1, -hw, -hh, grow), P(c1, hw, -hh, grow), P(c1, hw, hh, grow), P(c1, -hw, hh, grow)];
            for (let e = 0; e < 4; e++) {
                const a = n0[e], b = n0[(e + 1) % 4], c = n1[(e + 1) % 4], d = n1[e];
                const fn = new V3().subVectors(b, a).cross(new V3().subVectors(d, a)).normalize();
                quad(a, b, c, d, fn, 0, 0, 1, 1);
            }
            // a centre sheet so the beam reads from every angle
            const m0 = [P(c0, -hw, 0, 1), P(c0, hw, 0, 1)], m1 = [P(c1, -hw, 0, grow), P(c1, hw, 0, grow)];
            quad(m0[0], m0[1], m1[1], m1[0], new V3(0, 1, 0), 0, 0, 1, 1);
        }
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
        g.setAttribute('aAlong', new T.Float32BufferAttribute(along, 1));
        const beams = new T.Mesh(g, new T.ShaderMaterial({
            transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false,
            uniforms: { uTime: matTime, uColor: { value: new T.Color(0xffc8f4) } },
            vertexShader: `attribute float aAlong; varying float vA; varying vec3 vN; varying vec3 vV; varying vec3 vW;
                void main() { vA = aAlong; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
                    vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
            fragmentShader: `uniform float uTime; uniform vec3 uColor; varying float vA; varying vec3 vN; varying vec3 vV; varying vec3 vW;
                void main() {
                    float edge = pow(abs(dot(vN, vV)), 1.4);
                    float a = pow(1.0 - vA, 1.8) * edge * 0.075;
                    a *= 0.72 + 0.28 * sin(uTime * 0.6 + vW.y * 0.09 + vW.x * 0.05 + vW.z * 0.04);
                    gl_FragColor = vec4(uColor, a);
                }`,
        }));
        beams.frustumCulled = false;
        beams.renderOrder = 4;
        zoneGroup(-2).add(beams);
        lowOnly.push(beams);
    }

    // ----- soap bubbles drifting up the whole tower -----
    {
        const N = 220, rnd = rngFrom(99);
        const geo = new T.SphereGeometry(1, 14, 9);
        const aB = new Float32Array(N * 4);
        for (let i = 0; i < N; i++) {
            const r = 8 + rnd() * 34, a = rnd() * Math.PI * 2;
            aB[i * 4] = Math.cos(a) * r; aB[i * 4 + 1] = Math.sin(a) * r; aB[i * 4 + 2] = rnd(); aB[i * 4 + 3] = 0.35 + rnd() * rnd() * 1.4;
        }
        geo.setAttribute('aB', new T.InstancedBufferAttribute(aB, 4));
        const inst = new T.InstancedMesh(geo, bubbleMaterial(), N);
        inst.frustumCulled = false;
        inst.renderOrder = 6;
        scene.add(inst);
        lowOnly.push(inst);
    }

    // ----- giant floating things in the middle of the shaft -----
    const FLOAT = [
        ['pet', 'mochi', 47, 0.4, 21, 5.6], ['key', 'A', 72, 2.2, 22, 0xff2bd6], ['pet', 'star', 94, 4.0, 19, 5],
        ['pet', 'jellyBear', 117, 0.9, 21, 4.6], ['popit', 0, 139, 3.1, 20, 1], ['pet', 'cloud', 160, 5.3, 18, 5.6],
        ['key', 'B', 183, 1.5, 21, 0x46ff3a], ['pet', 'galaxy', 206, 3.6, 18, 5.4], ['pet', 'rgbDragon', 229, 0.5, 20, 4.8],
        ['key', 'C', 251, 2.8, 19, 0xc8a8ff], ['pet', 'peach', 300, 4.4, 15, 5], ['pet', 'keyCat', 312, 1.2, 23, 4.4],
        ['pet', 'goldSlime', 22, 2.5, 32, 3.2], ['pet', 'pinkSlime', 18, 4.2, 31, 3], ['pet', 'blueSlime', 24, 0.9, 30, 3.2],
    ];
    const floaters = [];
    FLOAT.forEach(([kind, id, y, ang, r, s], i) => {
        let obj;
        if (kind === 'pet') { obj = petModel(petById[id]); obj.scale.setScalar(s); }
        else if (kind === 'key') obj = giantKey(id, s);
        else obj = giantPopit();
        obj.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
        const zone = y < 30 ? -1 : Math.max(0, STAGES.findIndex((_, k) => y < CORNER_Y[2 * k + 2] + 8));
        obj.position.set(Math.cos(ang) * r, y, Math.sin(ang) * r);
        obj.rotation.y = -ang + Math.PI / 2;
        zoneGroup(zone < 0 ? -1 : zone).add(obj);
        floaters.push({ obj, y, i, spin: (i % 2 ? 1 : -1) * (0.15 + (i % 3) * 0.06) });
    });
    tickers.push((dt, t) => {
        for (const f of floaters) {
            if (!f.obj.parent.visible) continue;
            f.obj.position.y = f.y + Math.sin(t * 0.55 + f.i * 1.7) * 2.2;
            f.obj.rotation.y += f.spin * dt;
            f.obj.rotation.z = Math.sin(t * 0.4 + f.i) * 0.12;
            f.obj.rotation.x = Math.cos(t * 0.33 + f.i * 2) * 0.08;
        }
    });

    // ----- neon stage signs on the wall at the start of every stage -----
    STAGES.forEach((st, k) => {
        const s = 2 * k, a = cornerXZ(s), b = cornerXZ(s + 1);
        const dx = Math.sign(b[0] - a[0]), dz = Math.sign(b[1] - a[1]);
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        const nx = mx === 0 ? 0 : -Math.sign(mx), nz = mz === 0 ? 0 : -Math.sign(mz);
        const u = 5, v = -13.55;
        const x = a[0] + dx * u + nx * v, z = a[1] + dz * u + nz * v;
        const y = CORNER_Y[s] + (k === 0 ? 14 : 11);
        const sign = stageSign(k, st);
        sign.position.set(x, y, z);
        sign.lookAt(x + nx, y, z + nz);
        zoneGroup(k === 0 ? -1 : k).add(sign);
        const glow = sign.userData.frame;
        tickers.push((dt, t) => { if (sign.parent.visible) glow.material.color.copy(sign.userData.base).multiplyScalar(1.7 + Math.sin(t * 2 + k) * 0.5); });
    });
}

function giantKey(letter, color) {
    const geo = KEYCAP_TALL.clone();
    geo.setAttribute('aLetter', new T.InstancedBufferAttribute(new Float32Array([letterIndex(letter)]), 1));
    const m = new T.InstancedMesh(geo, keyMaterial(0x2a1030, false, false), 1);
    m.setMatrixAt(0, new T.Matrix4());
    m.setColorAt(0, new T.Color(color));
    m.instanceColor.needsUpdate = true;
    m.frustumCulled = false;
    const g = new T.Group();
    m.position.y = 1.7;
    g.add(m);
    g.scale.setScalar(2.6);
    return g;
}
function giantPopit() {
    const g = new T.Group();
    const base = new T.CylinderGeometry(6, 6, 1.2, 48);
    const p = base.attributes.position, col = new Float32Array(p.count * 3), c = new T.Color();
    for (let i = 0; i < p.count; i++) { c.setHSL(((p.getX(i) + 6) / 12) * 0.85, 0.85, 0.64); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    base.setAttribute('color', new T.BufferAttribute(col, 3));
    const mat = new T.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, clearcoat: 0.5, sheen: 0.5 });
    g.add(new T.Mesh(base, mat));
    const bub = new T.SphereGeometry(0.95, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    for (let r = 0; r < 3; r++) {
        const n = r === 0 ? 1 : r * 6;
        for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2, rr = r * 2.1;
            const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
            const bc = new T.Color().setHSL(((x + 6) / 12) * 0.85, 0.9, 0.7);
            const m = new T.Mesh(bub, new T.MeshPhysicalMaterial({ color: bc, roughness: 0.3, clearcoat: 0.6 }));
            m.position.set(x, 0.6, z);
            g.add(m);
        }
    }
    g.rotation.x = 0.5;
    return g;
}
function stageSign(k, st) {
    const W = 1024, Hh = 384, c = document.createElement('canvas'); c.width = W; c.height = Hh;
    const x = c.getContext('2d');
    const col = hex(st.bar);
    x.fillStyle = 'rgba(30, 10, 50, 0.82)';
    roundRect(x, 18, 18, W - 36, Hh - 36, 60); x.fill();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = col; x.shadowBlur = 30;
    x.font = '800 150px Montserrat, "Arial Black", sans-serif';
    x.fillStyle = '#ffffff'; x.fillText('STAGE ' + (k + 1), W / 2, 150);
    x.shadowBlur = 18;
    x.font = '700 72px Fredoka, sans-serif';
    x.fillStyle = col; x.fillText(st.name, W / 2, 285);
    const plane = new T.Mesh(new T.PlaneGeometry(12, 4.5), new T.MeshBasicMaterial({ map: texFrom(c), transparent: true, toneMapped: false }));
    plane.material.color.setScalar(1.15);
    const g = new T.Group();
    g.add(plane);
    // neon frame
    const shape = new T.Shape();
    roundShape(shape, -6.2, -2.4, 12.4, 4.8, 0.9);
    const hole = new T.Path();
    roundShape(hole, -5.95, -2.15, 11.9, 4.3, 0.75);
    shape.holes.push(hole);
    const frame = new T.Mesh(new T.ShapeGeometry(shape, 8), new T.MeshBasicMaterial({ color: st.bar, toneMapped: false }));
    frame.position.z = 0.02;
    g.add(frame);
    g.userData.frame = frame;
    g.userData.base = new T.Color(st.bar);
    return g;
}
function roundRect(x, l, t, w, h, r) {
    x.beginPath(); x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r); x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath();
}
function roundShape(s, l, b, w, h, r) {
    s.moveTo(l + r, b); s.lineTo(l + w - r, b); s.quadraticCurveTo(l + w, b, l + w, b + r); s.lineTo(l + w, b + h - r);
    s.quadraticCurveTo(l + w, b + h, l + w - r, b + h); s.lineTo(l + r, b + h); s.quadraticCurveTo(l, b + h, l, b + h - r); s.lineTo(l, b + r); s.quadraticCurveTo(l, b, l + r, b);
}
