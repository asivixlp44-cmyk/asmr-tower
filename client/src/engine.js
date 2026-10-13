import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const T = THREE;
export const V3 = THREE.Vector3;
export const $ = (s) => document.querySelector(s);
export const hexCss = (h) => '#' + h.toString(16).padStart(6, '0');

// ----- renderer, scene, camera, lights -----
export const canvas = $('#view');
export const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;

export const scene = new T.Scene();
export const FOG = 0xb070ff;
// a soft violet haze, so looking up or down the tall tower fades into depth
scene.fog = new T.Fog(0xa678e8, 140, 760);
scene.background = new T.Color(0x3a1a7a);

// ----- sky: the reference's dreamy purple night -----
// Deep violet overhead melting into hot magenta at the horizon, soft dark-purple clouds drifting
// along it with pink rims, and stars that twinkle. A dome that follows the camera.
const skyMat = new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec3 vDir;
        void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform float uTime; varying vec3 vDir;
        float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n2(p); p *= 2.03; a *= 0.5; } return s; }
        void main() {
            vec3 d = normalize(vDir);
            float h = d.y;
            vec3 zen = vec3(0.13, 0.05, 0.36), mid = vec3(0.42, 0.14, 0.78), hor = vec3(1.0, 0.42, 0.86), low = vec3(0.62, 0.2, 0.9);
            vec3 col = h > 0.0 ? mix(mix(hor, mid, smoothstep(0.0, 0.25, h)), zen, smoothstep(0.2, 0.85, h)) : mix(hor, low, 1.0 - smoothstep(-0.35, 0.0, h));
            // glow band right at the horizon
            col += vec3(0.35, 0.08, 0.25) * exp(-abs(h) * 18.0);
            // clouds: a belt of soft dark-purple puffs around the horizon with pink lit rims
            float az = atan(d.z, d.x);
            vec2 cp = vec2(az * 3.2 + uTime * 0.006, h * 9.0);
            float c = fbm(cp * vec2(1.0, 1.4) + vec2(0.0, uTime * 0.002));
            float band = smoothstep(-0.12, 0.05, h) * (1.0 - smoothstep(0.08, 0.42, h));
            float cloud = smoothstep(0.52, 0.72, c) * band;
            float rim = smoothstep(0.5, 0.56, c) * (1.0 - smoothstep(0.56, 0.66, c)) * band;
            col = mix(col, vec3(0.24, 0.1, 0.45), cloud * 0.92);
            col += vec3(1.0, 0.55, 0.95) * rim * 0.35;
            // stars
            vec3 q = floor(d * 420.0);
            float st = step(0.9966, hash(q)) * smoothstep(0.08, 0.4, h) * (1.0 - cloud);
            col += vec3(1.0, 0.92, 1.0) * st * (0.55 + 0.45 * sin(uTime * 2.3 + hash(q + 3.1) * 40.0));
            // a big soft moon with a glowing halo and faint craters
            vec3 md = normalize(vec3(-0.55, 0.38, 0.74));
            float mc = dot(d, md);
            float disc = smoothstep(0.99905, 0.99935, mc);
            vec3 tang = normalize(cross(md, vec3(0.0, 1.0, 0.0))), bit = cross(tang, md);
            vec2 mp = vec2(dot(d, tang), dot(d, bit)) * 30.0;
            float crater = 0.88 + 0.12 * n2(mp * 3.0 + 4.0) - 0.1 * smoothstep(0.55, 0.7, n2(mp * 1.6));
            col = mix(col, vec3(1.0, 0.95, 1.0) * crater * 1.25, disc * (1.0 - cloud * 0.7));
            col += vec3(0.95, 0.7, 1.0) * (pow(max(mc, 0.0), 900.0) * 0.6 + pow(max(mc, 0.0), 40.0) * 0.18) * (1.0 - cloud * 0.5);
            gl_FragColor = vec4(col, 1.0);
        }`,
});
const skyDome = new T.Mesh(new T.SphereGeometry(3000, 40, 20), skyMat);
skyDome.renderOrder = -10;
skyDome.frustumCulled = false;
scene.add(skyDome);
export function updateSky(pos, t) {
    skyMat.uniforms.uTime.value = t;
    skyDome.position.copy(pos);
}

export const camera = new T.PerspectiveCamera(70, 1, 0.3, 2600);
function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 85 : 70;
    camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// Soft studio reflections for the glossy jelly, slime and keys; a bright Roblox-like fill so the
// inside of the tower reads clearly; the sun adds direction and soft shadows
{
    const pm = new T.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.7;
    pm.dispose();
}
export const hemi = new T.HemisphereLight(0xfff0ff, 0x8a5ad0, 0.75);
scene.add(hemi);
export const sun = new T.DirectionalLight(0xfff0e8, 2.15);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 300 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.05;
sun.shadow.radius = 3;
scene.add(sun, sun.target);

// ----- materials -----
export const UNIT = new T.BoxGeometry(1, 1, 1);
// Neon is pushed above 1.0 so only it crosses the bloom threshold (fx.js)
export const NEON_BOOST = 2.6;
const matCache = new Map();
export function mat(color, o) {
    o = o || {};
    const key = color + '|' + (o.neon ? 1 : 0) + '|' + (o.opacity || 1) + '|' + (o.rough ?? '') + '|' + (o.side || 0) + '|' + (o.metal || 0) + '|' + (o.emissive || 0);
    let m = matCache.get(key);
    if (!m) {
        m = o.neon ? new T.MeshBasicMaterial({ color }) : new T.MeshStandardMaterial({ color, roughness: o.rough ?? 0.55, metalness: o.metal || 0 });
        if (o.neon) m.color.multiplyScalar(NEON_BOOST * (o.boost || 1));
        if (o.emissive) { m.emissive = new T.Color(o.emissive); m.emissiveIntensity = o.ei ?? 0.6; }
        if (o.opacity && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
        if (o.side) m.side = T.DoubleSide;
        matCache.set(key, m);
    }
    return m;
}
export function texFrom(cv, repeat) {
    const t = new T.CanvasTexture(cv);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
    return t;
}
export const maxAniso = () => renderer.capabilities.getMaxAnisotropy();

// ----- world collections -----
// solids: { min, max, shape?, mat, zone, ... } — boxes, plus round shapes (dome / cyl) with their
// own surface tests (see main.js). kills are unused here (nothing kills in a relaxing obby).
export const solids = [];
export const triggers = []; // { min, max, enter, inside, zone }
export const prompts = [];  // { pos, r, label(), act(), zone }
export const tickers = [];  // per-frame callbacks (dt, t)

export function aabb(x, y, z, sx, sy, sz) {
    return { min: new V3(x - sx / 2, y - sy / 2, z - sz / 2), max: new V3(x + sx / 2, y + sy / 2, z + sz / 2) };
}
export function solidBox(x, y, z, sx, sy, sz, o) {
    const c = aabb(x, y, z, sx, sy, sz);
    Object.assign(c, { zone: -1, mat: 'block' }, o || {});
    solids.push(c);
    return c;
}

// ----- static batching -----
// Boxes with world-space UVs (a texture tile every `tile` studs on every face), merged per
// material and zone into a few big meshes. Non-box geometry can be added with addGeo().
const batches = new Map();
function bucket(material, zone, cast) {
    const k = material.uuid + '|' + zone + '|' + (cast ? 1 : 0);
    let b = batches.get(k);
    if (!b) { b = { material, zone, cast, pos: [], nrm: [], uv: [], idx: [], geos: [] }; batches.set(k, b); }
    return b;
}
const FACES = [
    // normal, u axis, v axis (unit vectors in xyz index form)
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] }, { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] }, { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];
// o: { tile (studs per texture repeat, default 8), zone, cast, faces (skip mask: array of face indices to drop), uvOff }
export function batchBox(material, x, y, z, sx, sy, sz, o) {
    o = o || {};
    const b = bucket(material, o.zone ?? -1, o.cast);
    const tile = o.tile || 8, half = [sx / 2, sy / 2, sz / 2], c = [x, y, z];
    FACES.forEach((f, fi) => {
        if (o.skip && o.skip.includes(fi)) return;
        const base = b.pos.length / 3;
        for (const [a, bb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            const p = [0, 0, 0];
            for (let k = 0; k < 3; k++) p[k] = c[k] + f.n[k] * half[k] + f.u[k] * a * half[k] + f.v[k] * bb * half[k];
            b.pos.push(p[0], p[1], p[2]);
            b.nrm.push(f.n[0], f.n[1], f.n[2]);
            // world-space UV: project the corner on the face's u / v axes
            const U = p[0] * f.u[0] + p[1] * f.u[1] + p[2] * f.u[2], Vv = p[0] * f.v[0] + p[1] * f.v[1] + p[2] * f.v[2];
            b.uv.push(U / tile + (o.uvOff || 0), Vv / tile);
        }
        b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
}
// Any geometry (already positioned in world space, with uv)
export function batchGeo(material, geo, zone, cast) {
    const b = bucket(material, zone ?? -1, cast);
    const g = geo.index ? geo : geo;
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    b.geos.push(g);
}
export function flushBatches(parentFor) {
    for (const b of batches.values()) {
        const parts = [];
        if (b.pos.length) {
            const g = new T.BufferGeometry();
            g.setAttribute('position', new T.Float32BufferAttribute(b.pos, 3));
            g.setAttribute('normal', new T.Float32BufferAttribute(b.nrm, 3));
            g.setAttribute('uv', new T.Float32BufferAttribute(b.uv, 2));
            g.setIndex(b.idx);
            parts.push(g);
        }
        for (const g of b.geos) parts.push(g.index ? g : g);
        if (!parts.length) continue;
        // mergeGeometries needs all indexed or all non-indexed, and the same attributes
        const norm = parts.map((g) => (g.index ? g.toNonIndexed() : g));
        const hasColor = norm.some((g) => g.attributes.color);
        for (const g of norm) if (hasColor && !g.attributes.color) g.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
        const merged = mergeGeometries(norm);
        merged.computeBoundingSphere();
        const mesh = new T.Mesh(merged, b.material);
        mesh.receiveShadow = true;
        mesh.castShadow = !!b.cast;
        mesh.matrixAutoUpdate = false;
        (parentFor ? parentFor(b.zone) : scene).add(mesh);
    }
    batches.clear();
}

// ----- text -----
export function textCanvas(lines, W) {
    const pad = 10;
    let H = pad * 2;
    for (const l of lines) H += l.px * 1.2;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = Math.ceil(H);
    const x = cv.getContext('2d');
    let y = pad;
    for (const l of lines) {
        let px = l.px;
        const font = (p) => `${l.w || 700} ${p}px Fredoka, "Arial Rounded MT Bold", sans-serif`;
        x.font = font(px);
        while (x.measureText(l.t).width > W - 24 && px > 8) { px -= 2; x.font = font(px); }
        x.textAlign = 'center'; x.textBaseline = 'middle';
        const cy = y + l.px * 0.62;
        if (l.s) { x.lineJoin = 'round'; x.lineWidth = Math.max(4, px * 0.22); x.strokeStyle = l.s; x.strokeText(l.t, W / 2, cy); }
        if (l.g) {
            const g = x.createLinearGradient(0, cy - px / 2, 0, cy + px / 2);
            g.addColorStop(0, l.g[0]); g.addColorStop(1, l.g[1]);
            x.fillStyle = g;
        } else x.fillStyle = l.c || '#fff';
        x.fillText(l.t, W / 2, cy);
        y += l.px * 1.2;
    }
    return cv;
}
export function billboard(lines, worldW, W, pos, parent) {
    W = W || 512;
    const cv = textCanvas(lines, W);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: texFrom(cv), transparent: true, depthWrite: false, toneMapped: false }));
    sp.scale.set(worldW, worldW * cv.height / cv.width, 1);
    if (pos) sp.position.copy(pos);
    sp.userData.set = (nl) => {
        const c2 = textCanvas(nl, W);
        sp.material.map.dispose();
        sp.material.map = texFrom(c2);
        sp.material.needsUpdate = true;
        sp.scale.set(worldW, worldW * c2.height / c2.width, 1);
    };
    (parent || scene).add(sp);
    return sp;
}
export function textPlane(lines, worldW, W, pos, look, parent) {
    const cv = textCanvas(lines, W || 512);
    const h = worldW * cv.height / cv.width;
    const m = new T.Mesh(new T.PlaneGeometry(worldW, h), new T.MeshBasicMaterial({ map: texFrom(cv), transparent: true, depthWrite: false, toneMapped: false }));
    m.position.copy(pos);
    if (look) m.lookAt(look);
    (parent || scene).add(m);
    return m;
}

// ----- blocky fallback body (used until / unless the Bloxity avatar loads) -----
function buildHair(part, c) {
    part(1.3, 0.35, 1.3, 0, 5.33, -0.02, c);
    part(1.3, 0.75, 0.3, 0, 4.95, -0.5, c);
    part(1.3, 0.16, 0.2, 0, 5.16, 0.56, c);
}
export function buildRig(d) {
    const g = new T.Group();
    const part = (sx, sy, sz, x, y, z, c, parent) => {
        const m = new T.Mesh(UNIT, mat(c)); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true; (parent || g).add(m); return m;
    };
    part(2, 2, 1, 0, 3, 0, d.shirt);
    part(2.02, 0.12, 1.02, 0, 2.06, 0, d.shorts);
    const head = new T.Group(); g.add(head);
    part(1.2, 1.2, 1.2, 0, 4.6, 0, d.skin, head);
    for (const sx of [-0.26, 0.26]) {
        part(0.26, 0.24, 0.04, sx, 4.72, 0.605, 0xffffff, head);
        part(0.13, 0.18, 0.04, sx + (sx > 0 ? -0.04 : 0.04), 4.71, 0.625, 0x1a1420, head);
    }
    part(0.36, 0.07, 0.04, 0, 4.34, 0.64, 0x6b2a2a, head);
    buildHair((sx, sy, sz, x, y, z, c) => part(sx, sy, sz, x, y, z, c, head), d.hair);
    const legs = [], arms = [];
    for (const side of [-0.5, 0.5]) {
        const p = new T.Group(); p.position.set(side, 2, 0); g.add(p);
        part(1, 0.9, 1, 0, -0.45, 0, d.shorts, p);
        part(0.98, 1.1, 0.98, 0, -1.45, 0, d.socks, p);
        part(1.05, 0.42, 1.34, 0, -1.84, 0.12, 0x141418, p);
        legs.push(p);
    }
    for (const side of [-1.5, 1.5]) {
        const p = new T.Group(); p.position.set(side, 3.9, 0); g.add(p);
        part(1, 0.8, 1, 0, -0.4, 0, d.shirt, p);
        part(0.98, 1.2, 0.98, 0, -1.4, 0, d.skin, p);
        arms.push(p);
    }
    g.userData.legs = legs; g.userData.arms = arms; g.userData.head = head;
    return g;
}
export function animRig(g, phase, amt) {
    const s = Math.sin(phase) * amt;
    const u = g.userData;
    u.legs[0].rotation.set(s, 0, 0); u.legs[1].rotation.set(-s, 0, 0);
    u.arms[0].rotation.set(-s * 0.9, 0, 0); u.arms[1].rotation.set(s * 0.9, 0, 0);
}
export function airPose(g) {
    const u = g.userData;
    u.legs[0].rotation.set(0.5, 0, 0); u.legs[1].rotation.set(-0.3, 0, 0);
    u.arms[0].rotation.set(-2.6, 0, 0); u.arms[1].rotation.set(-2.6, 0, 0);
}
// Hands up on the truss, alternating as you climb
export function climbPose(g, phase) {
    const u = g.userData, s = Math.sin(phase);
    u.arms[0].rotation.set(-2.7 + s * 0.4, 0, 0); u.arms[1].rotation.set(-2.7 - s * 0.4, 0, 0);
    u.legs[0].rotation.set(-0.5 - s * 0.4, 0, 0); u.legs[1].rotation.set(-0.5 + s * 0.4, 0, 0);
}
// Holding a tool out in front (right arm)
export function holdPose(g) { g.userData.arms[1].rotation.set(-1.45, 0, 0); }

// ----- floating text -----
const floaters = [];
export function floatText(text, color, pos, size) {
    const sp = billboard([{ t: text, c: color, s: '#2a1040', px: 70 }], size || 5, 512, pos);
    sp.material.depthTest = false; sp.renderOrder = 12;
    floaters.push({ sp, t: 1.2 });
}
export function updateEffects(dt) {
    for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i];
        f.t -= dt; f.sp.position.y += dt * 4; f.sp.material.opacity = Math.min(1, f.t * 2);
        if (f.t <= 0) { scene.remove(f.sp); f.sp.material.map.dispose(); f.sp.material.dispose(); floaters.splice(i, 1); }
    }
}

export function lerpAngle(a, b, k) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * k;
}

// Merges every mesh under root into one mesh per material (static props): many draw calls become few
export function mergeChildren(root) {
    root.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(root.matrixWorld).invert(), m4 = new T.Matrix4();
    const buckets = new Map(), done = [];
    root.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.userData.keep) return;
        const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        if (!g.attributes.uv) g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        g.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
        if (!buckets.has(o.material)) buckets.set(o.material, { list: [], shadow: false });
        const b = buckets.get(o.material);
        b.list.push(g); b.shadow = b.shadow || o.castShadow;
        done.push(o);
    });
    for (const o of done) o.parent.remove(o);
    for (const [material, b] of buckets) {
        const mesh = new T.Mesh(mergeGeometries(b.list), material);
        mesh.castShadow = b.shadow;
        mesh.receiveShadow = true;
        root.add(mesh);
        for (const g of b.list) g.dispose();
    }
}
