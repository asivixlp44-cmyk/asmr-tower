// Gear models: the coils, grappling hook, slap glove, magic carpet and jetpack. The same models sit
// spinning on the lobby pads, ride in your hand, lie under your feet (carpet) or on your back
// (jetpack).
import { T, mat } from './engine.js';
import { carpetTex } from './materials.js';

const glossy = (color, o) => new T.MeshPhysicalMaterial({ color, roughness: o && o.rough !== undefined ? o.rough : 0.25, metalness: (o && o.metal) || 0, clearcoat: 0.8, clearcoatRoughness: 0.2, emissive: (o && o.emissive) || 0x000000, emissiveIntensity: (o && o.ei) || 0.3 });
const mats = new Map();
const gm = (key, make) => { if (!mats.has(key)) mats.set(key, make()); return mats.get(key); };

class Helix extends T.Curve {
    constructor(r, h, turns) { super(); this.r = r; this.h = h; this.turns = turns; }
    getPoint(t, out) { const a = t * Math.PI * 2 * this.turns; return (out || new T.Vector3()).set(Math.cos(a) * this.r, t * this.h - this.h / 2, Math.sin(a) * this.r); }
}
const helixGeo = new T.TubeGeometry(new Helix(0.9, 2.6, 5.5), 160, 0.17, 8, false);

function coil(color) {
    const g = new T.Group();
    const m = gm('coil' + color, () => glossy(color, { rough: 0.18, emissive: color, ei: 0.35 }));
    const spring = new T.Mesh(helixGeo, m); spring.castShadow = true; g.add(spring);
    const cap = new T.Mesh(new T.CylinderGeometry(1.05, 1.05, 0.22, 24), gm('coilcap', () => glossy(0xf4f4ff, { rough: 0.3 })));
    cap.position.y = -1.38; g.add(cap);
    const cap2 = cap.clone(); cap2.position.y = 1.38; g.add(cap2);
    return g;
}
function grapple() {
    const g = new T.Group();
    const dark = gm('gdark', () => glossy(0x3a3a48, { rough: 0.35, metal: 0.4 })), steel = gm('gsteel', () => glossy(0xc8ccd8, { rough: 0.2, metal: 0.85 }));
    const body = new T.Mesh(new T.BoxGeometry(0.7, 0.9, 2.4), dark); body.castShadow = true; g.add(body);
    const grip = new T.Mesh(new T.BoxGeometry(0.55, 1.4, 0.6), dark); grip.position.set(0, -0.9, -0.6); grip.rotation.x = 0.25; g.add(grip);
    const barrel = new T.Mesh(new T.CylinderGeometry(0.26, 0.3, 1.2, 14), steel); barrel.rotation.x = Math.PI / 2; barrel.position.z = 1.75; g.add(barrel);
    const hub = new T.Mesh(new T.SphereGeometry(0.3, 12, 10), steel); hub.position.z = 2.45; g.add(hub);
    for (let k = 0; k < 3; k++) {
        const claw = new T.Mesh(new T.TorusGeometry(0.32, 0.07, 6, 12, Math.PI), steel);
        claw.position.z = 2.6; claw.rotation.set(0, Math.PI / 2, k * Math.PI * 2 / 3); g.add(claw);
    }
    const rope = new T.Mesh(new T.TorusGeometry(0.42, 0.12, 8, 20), gm('grope', () => glossy(0xd8b070, { rough: 0.7 })));
    rope.rotation.y = Math.PI / 2; rope.position.set(0.48, 0.1, -0.2); g.add(rope);
    return g;
}
function slapHand() {
    const g = new T.Group();
    const white = gm('glove', () => glossy(0xffffff, { rough: 0.45 }));
    const stick = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 2.6, 10), gm('stick', () => glossy(0x9a6a3a, { rough: 0.6 })));
    stick.position.y = -1.5; g.add(stick);
    const palm = new T.Mesh(new T.SphereGeometry(1, 20, 14), white); palm.scale.set(1.15, 1.25, 0.45); palm.castShadow = true; g.add(palm);
    for (let k = 0; k < 4; k++) {
        const f = new T.Mesh(new T.CapsuleGeometry(0.22, 0.75, 6, 10), white);
        f.position.set(-0.66 + k * 0.44, 1.35 + (k === 1 || k === 2 ? 0.12 : 0), 0); g.add(f);
    }
    const thumb = new T.Mesh(new T.CapsuleGeometry(0.24, 0.6, 6, 10), white); thumb.position.set(1.15, 0.2, 0); thumb.rotation.z = -0.9; g.add(thumb);
    const cuff = new T.Mesh(new T.TorusGeometry(0.62, 0.2, 8, 20), gm('cuff', () => glossy(0xff5a8a, { rough: 0.4 }))); cuff.rotation.x = Math.PI / 2; cuff.position.y = -1.15; g.add(cuff);
    return g;
}
export function carpet(scale) {
    const g = new T.Group();
    const geo = new T.PlaneGeometry(4.2, 6, 12, 16);
    geo.rotateX(-Math.PI / 2);
    const m = gm('carpet', () => new T.MeshStandardMaterial({ map: carpetTex(), side: T.DoubleSide, roughness: 0.7, emissive: 0xff8ad8, emissiveIntensity: 0.12 }));
    const cloth = new T.Mesh(geo, m); cloth.castShadow = true; g.add(cloth);
    g.userData.cloth = cloth;
    g.userData.base = Float32Array.from(geo.attributes.position.array);
    const tassel = gm('tassel', () => glossy(0xffd028, { rough: 0.4 }));
    for (const [x, z] of [[-2.1, -3], [2.1, -3], [-2.1, 3], [2.1, 3]]) {
        const t = new T.Mesh(new T.ConeGeometry(0.22, 0.7, 8), tassel); t.position.set(x * 1.03, 0, z * 1.03); t.rotation.x = z > 0 ? Math.PI / 2 : -Math.PI / 2; g.add(t);
    }
    g.scale.setScalar(scale || 1);
    return g;
}
// Ripple the carpet cloth like it's floating on the wind
export function waveCarpet(g, t, amt) {
    const cloth = g.userData.cloth, base = g.userData.base;
    if (!cloth) return;
    const p = cloth.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
        const x = base[i * 3], z = base[i * 3 + 2];
        p.array[i * 3 + 1] = Math.sin(z * 1.3 + t * 6) * 0.14 * amt + Math.sin(x * 1.8 + t * 4) * 0.06 * amt;
    }
    p.needsUpdate = true;
    cloth.geometry.computeVertexNormals();
}
export function jetpack() {
    const g = new T.Group();
    const red = gm('jred', () => glossy(0xff4a3a, { rough: 0.25 })), steel = gm('jsteel', () => glossy(0xd8dce8, { rough: 0.2, metal: 0.8 }));
    for (const x of [-0.55, 0.55]) {
        const tank = new T.Mesh(new T.CapsuleGeometry(0.48, 1.6, 8, 16), red); tank.position.set(x, 0, 0); tank.castShadow = true; g.add(tank);
        const noz = new T.Mesh(new T.CylinderGeometry(0.28, 0.4, 0.5, 14), steel); noz.position.set(x, -1.35, 0); g.add(noz);
        const band = new T.Mesh(new T.TorusGeometry(0.5, 0.06, 6, 20), steel); band.rotation.x = Math.PI / 2; band.position.set(x, 0.4, 0); g.add(band);
    }
    const plate = new T.Mesh(new T.BoxGeometry(1.7, 1.8, 0.3), steel); plate.position.z = 0.45; g.add(plate);
    g.userData.nozzles = [new T.Vector3(-0.55, -1.7, 0), new T.Vector3(0.55, -1.7, 0)];
    return g;
}

const BUILD = {
    speedCoil: () => coil(0x3ac8ff),
    gravityCoil: () => coil(0xc45aff),
    superCoil: () => coil(0xff3a5a),
    grapple: () => grapple(),
    slap: () => slapHand(),
    carpet: () => carpet(0.75),
    jetpack: () => jetpack(),
};
// A gear model, about 3 studs tall, centred on its own origin
export function gearModel(id) {
    const f = BUILD[id];
    return f ? f() : new T.Group();
}
// A smaller copy to hold in the right hand
export function heldModel(id) {
    if (id === 'carpet' || id === 'jetpack') return null;
    const g = gearModel(id);
    if (id.endsWith('Coil')) { g.scale.setScalar(0.42); g.position.set(0, -0.2, 0.7); }
    else if (id === 'grapple') { g.scale.setScalar(0.62); g.position.set(0, -0.25, 0.9); g.rotation.x = 0.1; }
    else if (id === 'slap') { g.scale.setScalar(0.55); g.position.set(0, 0.3, 1.1); g.rotation.x = Math.PI / 2; }
    const holder = new T.Group(); holder.add(g);
    return holder;
}
export { mat };
