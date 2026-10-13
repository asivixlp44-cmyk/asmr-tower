// Every texture and special material of ASMR Tower, drawn in code (no image files):
// checker walls and lilac floor tiles like the reference, glossy jelly with a fresnel rim, wobbling
// lime slime that dents and ripples under your feet, truss lattice, salted-butter wrappers,
// pop-it silicone, bubble wrap, checkpoint pads and coins.
import { T, texFrom, maxAniso } from './engine.js';

const cache = new Map();
const once = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; };
const css = (h) => '#' + (h >>> 0).toString(16).padStart(6, '0');
function seeded(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
function shade(hex, k) {
    const r = Math.min(255, Math.max(0, ((hex >> 16) & 255) * k)), g = Math.min(255, Math.max(0, ((hex >> 8) & 255) * k)), b = Math.min(255, Math.max(0, (hex & 255) * k));
    return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// ----- checker walls (the tower's green, the lobby's purple) -----
// One texture = 2 x 2 big checker squares, each split into 4 x 4 small tiles by fine grout lines
function checker(c1, c2, grout, seed) {
    const N = 512, c = canvas(N), x = c.getContext('2d'), rnd = seeded(seed || 7);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const col = (i + j) % 2 ? c2 : c1;
        for (let tj = 0; tj < 4; tj++) for (let ti = 0; ti < 4; ti++) {
            x.fillStyle = shade(col, 0.97 + rnd() * 0.06);
            x.fillRect(i * 256 + ti * 64, j * 256 + tj * 64, 64, 64);
        }
    }
    x.strokeStyle = grout; x.lineWidth = 2;
    for (let k = 0; k <= 8; k++) {
        x.globalAlpha = k % 4 === 0 ? 0.5 : 0.28;
        x.beginPath(); x.moveTo(k * 64, 0); x.lineTo(k * 64, N); x.stroke();
        x.beginPath(); x.moveTo(0, k * 64); x.lineTo(N, k * 64); x.stroke();
    }
    x.globalAlpha = 1;
    // a soft sheen on each small tile
    const g = x.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(0.5, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    for (let tj = 0; tj < 8; tj++) for (let ti = 0; ti < 8; ti++) { x.save(); x.translate(ti * 64, tj * 64); x.fillRect(2, 2, 60, 20); x.restore(); }
    return texFrom(c, true);
}
export const greenWallTex = () => once('gw', () => checker(0x1cbf4e, 0x12a03e, 'rgba(0,38,12,0.95)', 3));
export const purpleWallTex = () => once('pw', () => checker(0x6a34c0, 0x5526a6, 'rgba(22,4,52,0.95)', 5));
export const greenFloorTex = () => once('gf', () => checker(0x16b84a, 0x0e9a3a, 'rgba(0,40,14,0.9)', 9));

// Bevelled tiles as a normal map: every tile is a slightly raised square with soft rounded edges,
// so walls and floors catch the light like real glazed tiles instead of flat colour
function bevelNormal(N, cell, bevel, depth) {
    const h = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const lx = (x % cell) + 0.5, ly = (y % cell) + 0.5;
        const d = Math.min(lx, cell - lx, ly, cell - ly);
        h[y * N + x] = d >= bevel ? 1 : Math.pow(Math.max(0, d) / bevel, 0.65);
    }
    const c = canvas(N), x = c.getContext('2d'), img = x.createImageData(N, N);
    const at = (px, py) => h[((py + N) % N) * N + ((px + N) % N)];
    for (let y = 0; y < N; y++) for (let x2 = 0; x2 < N; x2++) {
        const dx = (at(x2 + 1, y) - at(x2 - 1, y)) * depth, dy = (at(x2, y + 1) - at(x2, y - 1)) * depth;
        const l = Math.hypot(dx, dy, 1), i = (y * N + x2) * 4;
        img.data[i] = (-dx / l * 0.5 + 0.5) * 255;
        img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
        img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.NoColorSpace;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = Math.min(8, maxAniso());
    return t;
}
export const tileNormal64 = () => once('tn64', () => bevelNormal(512, 64, 7, 1.6));
export const tileNormal128 = () => once('tn128', () => bevelNormal(512, 128, 9, 1.6));

// Lobby floor: big pale lilac tiles with soft grout and a little variation
export const lilacFloorTex = () => once('lf', () => {
    const N = 512, c = canvas(N), x = c.getContext('2d'), rnd = seeded(11);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        x.fillStyle = shade(0x9c7ad6, 0.95 + rnd() * 0.08);
        x.fillRect(i * 128, j * 128, 128, 128);
    }
    x.strokeStyle = 'rgba(40,14,80,0.85)'; x.lineWidth = 3;
    for (let k = 0; k <= 4; k++) {
        x.beginPath(); x.moveTo(k * 128, 0); x.lineTo(k * 128, N); x.stroke();
        x.beginPath(); x.moveTo(0, k * 128); x.lineTo(N, k * 128); x.stroke();
    }
    x.strokeStyle = 'rgba(255,255,255,0.6)'; x.lineWidth = 1.5;
    for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(k * 128 + 3, 3); x.lineTo(k * 128 + 3, N); x.stroke(); }
    return texFrom(c, true);
});
// Round dais in the middle of the lobby: lilac with a big flower-star inlay (as in the reference)
export const daisTex = (glow) => once('dais' + (glow ? 'g' : ''), () => {
    const N = 1024, c = canvas(N), x = c.getContext('2d');
    if (glow) { x.fillStyle = '#000'; x.fillRect(0, 0, N, N); } else {
        const g = x.createRadialGradient(N / 2, N / 2, 40, N / 2, N / 2, N / 2);
        g.addColorStop(0, '#5a2a9a'); g.addColorStop(1, '#3a1870');
        x.fillStyle = g; x.fillRect(0, 0, N, N);
    }
    x.translate(N / 2, N / 2);
    x.strokeStyle = glow ? '#fff' : 'rgba(255,160,240,0.9)'; x.lineWidth = 6;
    for (let r = 120; r < 520; r += 130) { x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.stroke(); }
    x.lineWidth = 10; x.strokeStyle = glow ? '#fff' : 'rgba(255,180,245,1)';
    for (let k = 0; k < 8; k++) {
        x.save(); x.rotate(k * Math.PI / 4);
        x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(140, 120, 0, 500); x.quadraticCurveTo(-140, 120, 0, 0); x.stroke();
        x.restore();
    }
    for (let k = 0; k < 24; k++) { x.save(); x.rotate(k * Math.PI / 12); x.beginPath(); x.moveTo(0, 380); x.lineTo(0, 512); x.stroke(); x.restore(); }
    return texFrom(c);
});

// Yellow / black hazard stripes (the band along the top of the lobby walls)
export const hazardTex = () => once('hz', () => {
    const N = 128, c = canvas(N), x = c.getContext('2d');
    x.fillStyle = '#ffcf1a'; x.fillRect(0, 0, N, N);
    x.fillStyle = '#3a2410';
    for (let k = -2; k < 4; k++) { x.beginPath(); x.moveTo(k * 64, N); x.lineTo(k * 64 + 32, N); x.lineTo(k * 64 + 32 + N, 0); x.lineTo(k * 64 + N, 0); x.fill(); }
    return texFrom(c, true);
});

// Truss lattice: square frames with an X in each cell, transparent between the bars
export const trussTex = () => once('truss', () => {
    const N = 128, c = canvas(N), x = c.getContext('2d');
    x.clearRect(0, 0, N, N);
    x.strokeStyle = '#1fc050'; x.lineCap = 'square';
    x.lineWidth = 12; x.strokeRect(6, 6, N - 12, N - 12);
    x.lineWidth = 9;
    x.beginPath(); x.moveTo(10, 10); x.lineTo(N - 10, N - 10); x.moveTo(N - 10, 10); x.lineTo(10, N - 10); x.stroke();
    // highlights on the bars
    x.strokeStyle = 'rgba(190,255,180,0.6)'; x.lineWidth = 2;
    x.strokeRect(2, 2, N - 4, N - 4);
    const t = texFrom(c, true);
    return t;
});

// Butter: the creamy top, and the "SALTED BUTTER" wrapper on the sides (both tile)
export const butterTopTex = () => once('buttertop', () => {
    const N = 512, c = canvas(N), x = c.getContext('2d'), rnd = seeded(21);
    const g = x.createLinearGradient(0, 0, N, N);
    g.addColorStop(0, '#fff3b8'); g.addColorStop(1, '#ffe48a');
    x.fillStyle = g; x.fillRect(0, 0, N, N);
    for (let i = 0; i < 160; i++) { x.fillStyle = 'rgba(255,255,255,' + (0.05 + rnd() * 0.1) + ')'; x.beginPath(); x.ellipse(rnd() * N, rnd() * N, 6 + rnd() * 30, 3 + rnd() * 10, rnd() * 3, 0, Math.PI * 2); x.fill(); }
    x.strokeStyle = 'rgba(230,190,90,0.35)'; x.lineWidth = 4;
    for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(rnd() * N, rnd() * N, 40 + rnd() * 80, rnd() * 3, rnd() * 3 + 2); x.stroke(); }
    return texFrom(c, true);
});
export const wrapperTex = () => once('wrapper', () => {
    const N = 512, c = canvas(N), x = c.getContext('2d');
    x.fillStyle = '#fffaf0'; x.fillRect(0, 0, N, N);
    x.fillStyle = '#2a7ae8'; x.fillRect(0, 34, N, 34); x.fillRect(0, 444, N, 34);
    x.fillStyle = '#ffd84a'; x.fillRect(0, 74, N, 12); x.fillRect(0, 426, N, 12);
    x.save(); x.translate(N / 2, N / 2);
    x.font = '800 92px Montserrat, "Arial Black", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#c8283a'; x.fillText('SALTED', 0, -62);
    x.fillStyle = '#2a1a10'; x.fillText('BUTTER', 0, 52);
    x.font = '700 30px Fredoka, sans-serif'; x.fillStyle = '#7a5a3a'; x.fillText('★ ASMR CREAMERY ★', 0, 126);
    x.restore();
    return texFrom(c, true);
});

// Bubble wrap: clear plastic with round bubbles (alpha) and white highlights
export const bubbleWrapTex = () => once('wrap', () => {
    const N = 256, c = canvas(N), x = c.getContext('2d');
    x.fillStyle = 'rgba(220,240,255,0.55)'; x.fillRect(0, 0, N, N);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        const cx = i * 64 + 32 + (j % 2) * 0, cy = j * 64 + 32;
        const g = x.createRadialGradient(cx - 8, cy - 9, 2, cx, cy, 27);
        g.addColorStop(0, 'rgba(255,255,255,0.98)'); g.addColorStop(0.35, 'rgba(235,248,255,0.7)'); g.addColorStop(1, 'rgba(160,210,255,0.55)');
        x.fillStyle = g; x.beginPath(); x.arc(cx, cy, 26, 0, Math.PI * 2); x.fill();
        x.strokeStyle = 'rgba(120,180,240,0.7)'; x.lineWidth = 2; x.stroke();
    }
    return texFrom(c, true);
});

// Checkpoint pad top: a glossy green square with a star-flower line pattern
export const cpPadTex = (on) => once('cp' + (on ? 1 : 0), () => {
    const N = 512, c = canvas(N), x = c.getContext('2d');
    const g = x.createRadialGradient(N / 2, N / 2, 40, N / 2, N / 2, N * 0.72);
    g.addColorStop(0, on ? '#9aff7a' : '#4ae84a'); g.addColorStop(1, on ? '#3ad84a' : '#1fae2a');
    x.fillStyle = g; x.fillRect(0, 0, N, N);
    x.translate(N / 2, N / 2);
    x.strokeStyle = on ? 'rgba(255,255,210,0.9)' : 'rgba(10,80,20,0.75)'; x.lineWidth = 10; x.lineJoin = 'round';
    x.beginPath();
    for (let k = 0; k <= 12; k++) { const a = k * Math.PI / 6 - Math.PI / 2, r = k % 2 ? 90 : 210; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    x.stroke();
    x.beginPath(); x.arc(0, 0, 60, 0, Math.PI * 2); x.stroke();
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 - Math.PI / 2; x.beginPath(); x.moveTo(Math.cos(a) * 60, Math.sin(a) * 60); x.lineTo(Math.cos(a) * 210, Math.sin(a) * 210); x.stroke(); }
    return texFrom(c);
});

// Coin face: a gold coin with a raised rim and a star
export const coinTex = () => once('coin', () => {
    const N = 256, c = canvas(N), x = c.getContext('2d');
    const g = x.createRadialGradient(100, 90, 10, 128, 128, 128);
    g.addColorStop(0, '#fff6b0'); g.addColorStop(0.6, '#ffcc2a'); g.addColorStop(1, '#e89a10');
    x.fillStyle = g; x.beginPath(); x.arc(128, 128, 126, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#c87a08'; x.lineWidth = 10; x.beginPath(); x.arc(128, 128, 100, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#ffe680'; x.strokeStyle = '#c87a08'; x.lineWidth = 6; x.beginPath();
    for (let k = 0; k <= 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, r = k % 2 ? 30 : 66; x.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); }
    x.fill(); x.stroke();
    return texFrom(c);
});

// Rainbow (magic carpet, rainbow trail swatches, the summit)
export const rainbowTex = () => once('rainbow', () => {
    const W = 256, H = 64, c = canvas(W, H), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, W, 0);
    ['#ff3c5a', '#ff9a1c', '#ffe83a', '#46ec50', '#28c8ff', '#8a5aff', '#ff4ad8'].forEach((col, i, a) => g.addColorStop(i / (a.length - 1), col));
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    return texFrom(c, true);
});
// Tie-dye swirl for the magic carpet
export const carpetTex = () => once('carpet', () => {
    const N = 256, c = canvas(N), x = c.getContext('2d'), img = x.createImageData(N, N), d = img.data;
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
        const u = px / N - 0.5, v = py / N - 0.5, r = Math.hypot(u, v), a = Math.atan2(v, u);
        const h = (a / (Math.PI * 2) + r * 1.6 + 0.5) % 1;
        const col = new T.Color().setHSL(h, 0.85, 0.66);
        const i = (py * N + px) * 4;
        d[i] = col.r * 255; d[i + 1] = col.g * 255; d[i + 2] = col.b * 255; d[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    x.strokeStyle = '#ffffff'; x.lineWidth = 10; x.strokeRect(8, 8, N - 16, N - 16);
    return texFrom(c);
});

// Soft round sprite (glows, sparkles, clouds)
export const softTex = () => once('soft', () => {
    const c = canvas(64), x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    return t;
});

// ======================================================================================
// Materials
// ======================================================================================
export function wallMaterial(kind) {
    return once('wallmat|' + kind, () => {
        const map = kind === 'purple' ? purpleWallTex() : kind === 'floor' ? greenFloorTex() : greenWallTex();
        return new T.MeshStandardMaterial({
            map, normalMap: tileNormal64(), normalScale: new T.Vector2(0.85, 0.85),
            roughness: kind === 'floor' ? 0.5 : 0.55, metalness: 0, envMapIntensity: kind === 'floor' ? 0.9 : 0.7,
        });
    });
}
export const lilacMaterial = () => once('lilacmat', () => new T.MeshStandardMaterial({ map: lilacFloorTex(), normalMap: tileNormal128(), normalScale: new T.Vector2(0.8, 0.8), roughness: 0.42, metalness: 0, envMapIntensity: 0.95 }));

// One clock for every animated material (jelly wobble, bubbles, slime)
export const matTime = { value: 0 };
export const hazardMaterial = () => once('hzmat', () => new T.MeshStandardMaterial({ map: hazardTex(), roughness: 0.5 }));
export const trussMaterial = () => once('trussmat', () => new T.MeshStandardMaterial({ map: trussTex(), alphaTest: 0.45, side: T.DoubleSide, roughness: 0.45 }));
export const butterMaterial = () => once('buttermat', () => new T.MeshPhysicalMaterial({ map: butterTopTex(), roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.25, sheen: 0.5, sheenColor: new T.Color(0xfff4c8), envMapIntensity: 1.2 }));
export const wrapperMaterial = () => once('wrapmat2', () => new T.MeshStandardMaterial({ map: wrapperTex(), roughness: 0.55 }));
export const bubbleWrapMaterial = () => once('wrapmat', () => {
    const map = bubbleWrapTex();
    return new T.MeshPhysicalMaterial({ map, transparent: true, opacity: 0.92, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: true, envMapIntensity: 1.6 });
});

// Glossy jelly: translucent, clear-coated, brighter at grazing angles (fresnel rim) so the shapes
// read like wobbly gummy glass. Vertex colours tint each piece (green by default, rainbow on top).
function addRim(m, rim, power, strength) {
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uRim = { value: new T.Color(rim) };
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
                float fres = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), ${power.toFixed(1)});
                totalEmissiveRadiance += uRim * fres * ${strength.toFixed(2)} * diffuseColor.rgb;
                diffuseColor.a = mix(diffuseColor.a, 1.0, fres * 0.6);`);
    };
    m.customProgramCacheKey = () => 'rim' + power + strength;
}
// Jelly wobbles: it breathes gently all the time, and every landing / footstep on it sends a
// jiggle through the surface around the impact (up to 8 at once, shared by every jelly piece).
export const jellyHits = Array.from({ length: 8 }, () => new T.Vector4(0, -9999, 0, -99));
const jellyHitK = { value: new Float32Array(8) };
let jellyHitN = 0;
export function jellyHit(x, y, z, k) {
    jellyHits[jellyHitN].set(x, y, z, matTime.value);
    jellyHitK.value[jellyHitN] = k ?? 1;
    jellyHitN = (jellyHitN + 1) % 8;
}
const JIGGLE = `
    {
        vec3 jw = (modelMatrix * vec4(position, 1.0)).xyz;
        float top = smoothstep(-0.3, 0.9, normal.y);
        float jig = 0.0; vec2 bulge = vec2(0.0);
        for (int i = 0; i < 8; i++) {
            vec4 h = uHits[i];
            float age = uTime - h.w;
            if (age < 0.0 || age > 2.2) continue;
            vec3 dd = jw - h.xyz;
            float fall = uHitK[i] * exp(-dot(dd.xz, dd.xz) * 0.05 - dd.y * dd.y * 0.06) * exp(-age * 3.2);
            float s = sin(age * 25.0);
            jig += fall * s;
            bulge += normalize(dd.xz + vec2(0.0001)) * fall * s;
        }
        transformed.y += jig * 0.42 * top - jig * 0.08;
        transformed.xz -= bulge * 0.2 * (1.0 - abs(normal.y));
        transformed.y += sin(uTime * 2.1 + jw.x * 0.33 + jw.z * 0.27) * 0.05 * max(normal.y, 0.0);
    }`;
export const jellyMaterial = () => once('jellymat', () => {
    const m = new T.MeshPhysicalMaterial({
        color: 0xffffff, vertexColors: true, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04,
        transparent: true, opacity: 0.86, envMapIntensity: 1.45, emissive: 0x000000,
        sheen: 0.4, sheenColor: new T.Color(0xeaffea),
    });
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uRim = { value: new T.Color(0xffffff) };
        sh.uniforms.uTime = matTime;
        sh.uniforms.uHits = { value: jellyHits };
        sh.uniforms.uHitK = jellyHitK;
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec4 uHits[8]; uniform float uHitK[8];')
            .replace('#include <begin_vertex>', '#include <begin_vertex>' + JIGGLE);
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
                float fres = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 2.4);
                totalEmissiveRadiance += uRim * fres * 0.6 * diffuseColor.rgb + diffuseColor.rgb * 0.16;
                diffuseColor.a = mix(diffuseColor.a, 1.0, fres * 0.6);`);
    };
    m.customProgramCacheKey = () => 'jelly-jiggle';
    return m;
});

// Soap bubbles: clear, iridescent, brightest at the rim
export const bubbleMaterial = () => once('bubblemat', () => {
    const m = new T.MeshPhysicalMaterial({
        color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.35, depthWrite: false,
        iridescence: 1, iridescenceIOR: 1.33, iridescenceThicknessRange: [250, 900], clearcoat: 1, envMapIntensity: 2.6,
    });
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = matTime;
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nuniform float uTime; attribute vec4 aB;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
                float spd = 1.6 + fract(aB.z * 7.31) * 2.6;
                float yy = mod(aB.z * 337.0 + uTime * spd, 345.0) - 5.0;
                vec3 off = vec3(aB.x + sin(uTime * 0.55 + aB.z * 20.0) * 2.4, yy, aB.y + cos(uTime * 0.47 + aB.z * 13.0) * 2.4);
                float wob = 1.0 + sin(uTime * 3.0 + aB.z * 9.0) * 0.06;
                transformed = transformed * aB.w * vec3(wob, 2.0 - wob, wob) + off;`)
            .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>');
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
                float bf = pow(1.0 - clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0), 2.0);
                diffuseColor.a = mix(0.05, 0.8, bf);
                totalEmissiveRadiance += vec3(0.25, 0.22, 0.32) * bf;`);
    };
    m.customProgramCacheKey = () => 'bubble';
    return m;
});
export const domeMaterial = () => once('domemat', () => {
    const m = new T.MeshPhysicalMaterial({
        color: 0x6aff6a, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04,
        transparent: true, opacity: 0.55, envMapIntensity: 2, depthWrite: false,
    });
    addRim(m, 0xe8ffe0, 2.2, 0.55);
    return m;
});
export const vanishMaterial = (color) => {
    const m = new T.MeshPhysicalMaterial({ color, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.82, envMapIntensity: 1.6 });
    addRim(m, 0xffffff, 2.2, 0.9);
    return m;
};
export const popitMaterial = () => once('popitmat', () => new T.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.34, clearcoat: 0.5, clearcoatRoughness: 0.4, sheen: 0.5, sheenColor: new T.Color(0xffffff) }));
// the bubbles take their colour per instance (no vertex colours, or they'd render black)
export const popitBubbleMaterial = () => once('popitbub', () => new T.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.3, sheen: 0.5, sheenColor: new T.Color(0xffffff) }));
export const mochiMaterial = () => once('mochimat', () => new T.MeshPhysicalMaterial({ color: 0xfff0f6, roughness: 0.6, sheen: 1, sheenRoughness: 0.5, sheenColor: new T.Color(0xffc8e0), emissive: 0xff9ac8, emissiveIntensity: 0.06 }));
export const coinMaterial = () => once('coinmat', () => new T.MeshStandardMaterial({ map: coinTex(), color: 0xffffff, metalness: 0.55, roughness: 0.25, emissive: 0x6a4800, emissiveIntensity: 0.45 }));
export const coinRimMaterial = () => once('coinrim', () => new T.MeshStandardMaterial({ color: 0xffbf1a, metalness: 0.8, roughness: 0.25, emissive: 0x5a3800, emissiveIntensity: 0.4 }));

// ----- slime: wobbling lime surface that dents and ripples under feet -----
// Up to 8 "feet" (x, z, strength, age) are shared by every slime pool; main.js feeds in the
// players standing on slime. Heights are computed in the vertex shader, normals by finite
// differences, so the light glints off the moving bumps.
export const slimeFeet = Array.from({ length: 8 }, () => new T.Vector4(0, 0, 0, 99));
const slimeTime = matTime;
export function tickSlime(t) { matTime.value = t; }
export const slimeMaterial = () => gelMaterial('slime', {
    color: 0x9cf21a, emissive: 0x3a7a00, emissiveIntensity: 0.32, amp: 1, hi: '0.86, 1.0, 0.45',
});
// The lobby's green floor: a glossy gel with the green checker showing through, softly rippling
// and denting under your feet (same shader as the slime, calmer waves)
export const floorGelMaterial = () => gelMaterial('floorgel', {
    color: 0xffffff, map: greenFloorTex(), repeat: 8, emissive: 0x06300c, emissiveIntensity: 0.2, amp: 0.2, hi: '0.55, 0.95, 0.6', rough: 0.24, mix: 0.18,
});
function gelMaterial(key, o) {
    return once('gel|' + key, () => {
        let map = null;
        if (o.map) { map = o.map.clone(); map.repeat.set(o.repeat || 1, o.repeat || 1); map.needsUpdate = true; }
        const m = new T.MeshPhysicalMaterial({
            color: o.color, map, roughness: o.rough ?? 0.14, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08,
            emissive: o.emissive, emissiveIntensity: o.emissiveIntensity, envMapIntensity: 1.5, sheen: 0.6, sheenColor: new T.Color(0xeaff9a),
        });
        m.onBeforeCompile = (sh) => gelShader(sh, o);
        m.customProgramCacheKey = () => 'gel-' + key;
        return m;
    });
}
function gelShader(sh, o) {
    {
        sh.uniforms.uTime = slimeTime;
        sh.uniforms.uFeet = { value: slimeFeet };
        const H = `uniform float uTime; uniform vec4 uFeet[8]; varying float vSlimeH;
            float slimeH(vec2 p) {
                float h = (0.16 * sin(p.x * 0.55 + uTime * 1.1) * sin(p.y * 0.48 - uTime * 0.9)
                        + 0.1 * sin(p.x * 1.3 - p.y * 0.9 + uTime * 1.7) + 0.06 * sin(p.y * 2.1 + uTime * 2.3 + p.x * 0.4)) * ${(o.amp ?? 1).toFixed(2)};
                for (int i = 0; i < 8; i++) {
                    vec4 f = uFeet[i];
                    if (f.z <= 0.0) continue;
                    float d = distance(p, f.xy);
                    h -= f.z * 0.55 * exp(-d * d * 0.35) * clamp(1.0 - f.w * 0.8, 0.0, 1.0);
                    h += f.z * 0.16 * sin(d * 2.6 - f.w * 9.0) * exp(-d * 0.35) * exp(-f.w * 1.6);
                }
                return h;
            }`;
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\n' + H)
            .replace('#include <beginnormal_vertex>', `
                vec4 sw = modelMatrix * vec4(position, 1.0);
                float sh0 = slimeH(sw.xz), sx1 = slimeH(sw.xz + vec2(0.25, 0.0)), sz1 = slimeH(sw.xz + vec2(0.0, 0.25));
                vec3 objectNormal = normalize(vec3(-(sx1 - sh0) / 0.25, 1.0, -(sz1 - sh0) / 0.25));
                vSlimeH = sh0;
                #ifdef USE_TANGENT
                vec3 objectTangent = vec3(tangent.xyz);
                #endif`)
            .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += sh0;');
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying float vSlimeH;')
            .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb * 0.82, vec3(' + o.hi + '), smoothstep(-0.1, 0.32, vSlimeH) * ' + (o.mix ?? 0.55).toFixed(2) + ');');
    }
}

// Glowing neon (above 1.0, so the bloom picks it up); cached per colour and strength
export const neon = (color, boost) => once('neon|' + color + '|' + (boost || 2.2), () => { const m = new T.MeshBasicMaterial({ color }); m.color.multiplyScalar(boost || 2.2); return m; });
// Neon with per-vertex colours (rings, strips, pillars), boosted in the shader
export const neonVC = (boost) => once('neonvc|' + boost, () => {
    const m = new T.MeshBasicMaterial({ vertexColors: true });
    m.color.setScalar(boost || 2.2);
    return m;
});

export function anisoAll(tex) { tex.anisotropy = Math.min(8, maxAniso()); return tex; }
