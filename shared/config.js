// Game data shared by the client and the Colyseus server.
// ASMR Tower: a relaxing tower obby full of satisfying slime, squishies and keyboard clicks.
// Climb the jelly, keyboard, slime and butter sections spiralling up the inside of a giant tower;
// every checkpoint pays Coins, the summit pays a Win. Coins open pet Boxes and buy Trails.
// Gear (coils, grappling hook, slap tool, magic carpet, jetpack), VIP, Skip and Nuke All are Bux.

export const CFG = {
    // Roblox defaults: jump power 50, gravity 196.2 (a jump rises about 6.4 studs)
    grav: 196.2,
    jumpV: 50,
    walk: 18,
    climb: 13,                // truss climbing speed
    bounceV: 92,              // slime trampolines
    maxPlayers: 24,
    // Coins: every new checkpoint of a climb pays this, the summit pays SUMMIT_COINS and a Win
    cpCoins: 5,
    summitCoins: 50,
    coinPickup: 1,
    // A climb must take at least this long for the summit to pay (and a Win can't repeat faster)
    minClimbSecs: 45,
    // Free spin every this many minutes played (banked up to spinsMax)
    spinMinutes: 15,
    spinsMax: 5,
    coinBoostMinutes: 10,
    starterPackMinutes: 30,
    // Friend Boost: +10% Coins per Bloxity friend in the same server, up to 5
    friendBoost: 0.1,
    friendMax: 5,
    maxPets: 60,
    petSlots: 3,
    vipPetSlots: 4,
    vipCoinMult: 1.25,
    vipChestMinutes: 15,
    vipChestCoins: 40,
    // Gear
    speedCoil: 1.55,          // walk speed x
    gravityCoil: 0.38,        // gravity x (floaty high jumps)
    superCoil: { jump: 1.42, walk: 1.25 },
    carpetSpeed: 26,
    jetFuel: 5,               // seconds of thrust, refills on the ground
    jetThrust: 150,
    grappleRange: 120,
    grappleSpeed: 85,
    slapRange: 9,
    slapForce: 70,
    slapCooldown: 1.2,
};

// ----- the tower -----
// Interior half-size; the lobby floor is y = 0. The course spirals up the inside walls (course.js).
export const TOWER = { half: 64, wall: 4, lobbyWall: 34, top: 470 };
export const LOBBY = { spawn: { x: 0, y: 1.5, z: -6 }, yaw: Math.PI };

// Twelve sections, each two sides of the tower ending in a checkpoint. bar: the colour of the
// section on the right-hand progress bar (purple at the bottom up to white at the top)
export const STAGES = [
    { name: 'Jelly Stairs', sub: 'Squishy jelly steps up from the lobby', bar: 0x9a5cff, accent: 0x46ff5a },
    { name: 'Clicky Keys', sub: 'Every key clicks under your feet', bar: 0x6a7cff, accent: 0xff3fd8 },
    { name: 'Squishy Domes', sub: 'Hop across the wobbly jelly domes', bar: 0x3aa8ff, accent: 0x5aff7a },
    { name: 'Slime Pools', sub: 'Climb the trusses, squelch through the slime', bar: 0x2ad8e8, accent: 0xb8ff2a },
    { name: 'Butter Bridge', sub: 'Waxed salted butter: soft and slippery', bar: 0x2ae8a0, accent: 0xffe08a },
    { name: 'Pop-It Path', sub: 'Pop every bubble on the way', bar: 0x5aff4a, accent: 0xff7ad8 },
    { name: 'Slime Bounce', sub: 'Slime trampolines over the gaps', bar: 0xc8ff2a, accent: 0x9aff2a },
    { name: 'Bubble Wrap', sub: 'Ride the sliding bubble wrap', bar: 0xffe82a, accent: 0x9ae8ff },
    { name: 'Typing Keys', sub: 'The keys are typing: time your steps', bar: 0xffb02a, accent: 0xff3fd8 },
    { name: 'Jelly Drops', sub: 'The jelly melts when you touch it', bar: 0xff7a4a, accent: 0xff5a8a },
    { name: 'Mochi Spinners', sub: 'Spinning mochi and sweeping jelly bars', bar: 0xff5aa8, accent: 0xffb8e0 },
    { name: 'Rainbow Summit', sub: 'Everything at once, then the top!', bar: 0xffd8f4, accent: 0xff8ad8 },
];

// ----- pets (from Boxes, paid in Coins) -----
// mult: Coin multiplier while equipped (equipped pets add up: 1 + sum of (mult - 1))
export const RARITY = {
    common: { name: 'Common', color: '#b8c4d8', order: 0 },
    rare: { name: 'Rare', color: '#3aa8ff', order: 1 },
    epic: { name: 'Epic', color: '#c45aff', order: 2 },
    legendary: { name: 'Legendary', color: '#ffb81c', order: 3 },
    mythic: { name: 'Mythic', color: '#ff3f7a', order: 4 },
};
export const PETS = [
    { id: 'blueSlime', name: 'Blue Slime', rarity: 'common', mult: 1.1, kind: 'slime', color: 0x4ac8ff },
    { id: 'greenSlime', name: 'Green Slime', rarity: 'common', mult: 1.15, kind: 'slime', color: 0x6aff5a },
    { id: 'pinkSlime', name: 'Pink Slime', rarity: 'rare', mult: 1.25, kind: 'slime', color: 0xff7ad0 },
    { id: 'purpleSlime', name: 'Grape Slime', rarity: 'rare', mult: 1.35, kind: 'slime', color: 0xa86aff },
    { id: 'goldSlime', name: 'Gold Slime', rarity: 'epic', mult: 1.7, kind: 'slime', color: 0xffcc2a, shiny: true },
    { id: 'rainbowSlime', name: 'Rainbow Slime', rarity: 'legendary', mult: 2.5, kind: 'slime', color: 0xffffff, rainbow: true },

    { id: 'mochi', name: 'Mochi Bun', rarity: 'common', mult: 1.4, kind: 'bun', color: 0xfff0f4 },
    { id: 'jellyBear', name: 'Jelly Bear', rarity: 'common', mult: 1.5, kind: 'bear', color: 0xff6a6a, clear: true },
    { id: 'peach', name: 'Peach Squish', rarity: 'rare', mult: 1.8, kind: 'peach', color: 0xffa88a },
    { id: 'cloud', name: 'Cloud Squish', rarity: 'rare', mult: 2.0, kind: 'cloud', color: 0xf4f8ff },
    { id: 'star', name: 'Star Squish', rarity: 'epic', mult: 2.7, kind: 'star', color: 0xffe04a },
    { id: 'galaxy', name: 'Galaxy Squish', rarity: 'legendary', mult: 4, kind: 'bun', color: 0x6a3aff, galaxy: true },

    { id: 'keyCat', name: 'Keycap Cat', rarity: 'common', mult: 3, kind: 'keycat', color: 0xffb8e8 },
    { id: 'keyBunny', name: 'Keycap Bunny', rarity: 'common', mult: 3.4, kind: 'keybunny', color: 0xc8f0ff },
    { id: 'clickFrog', name: 'Clicky Frog', rarity: 'rare', mult: 4.2, kind: 'frog', color: 0x7aff6a },
    { id: 'spaceDog', name: 'Space Bar Dog', rarity: 'epic', mult: 5.6, kind: 'dog', color: 0xffe0b0 },
    { id: 'rgbDragon', name: 'RGB Dragon', rarity: 'legendary', mult: 8, kind: 'dragon', color: 0xff3fd8, rainbow: true },
    { id: 'goldenKey', name: 'Golden Keycap', rarity: 'mythic', mult: 15, kind: 'keycat', color: 0xffc828, shiny: true },

    { id: 'butterPup', name: 'Butter Pup', rarity: 'epic', mult: 3.2, kind: 'dog', color: 0xffe48a },
    { id: 'vipSlime', name: 'Royal Slime', rarity: 'legendary', mult: 3, kind: 'slime', color: 0xffd028, shiny: true, crown: true },
];
export const petById = Object.fromEntries(PETS.map((d) => [d.id, d]));

// weight = chance out of the box's total
export const BOXES = [
    { id: 'slime', name: 'Slime Box', price: 60, color: 0x6aff5a, ic: '🟢',
        drops: [['blueSlime', 40], ['greenSlime', 32], ['pinkSlime', 14], ['purpleSlime', 9], ['goldSlime', 4], ['rainbowSlime', 1]] },
    { id: 'squishy', name: 'Squishy Box', price: 300, color: 0xffa8d8, ic: '🍡',
        drops: [['mochi', 38], ['jellyBear', 30], ['peach', 15], ['cloud', 10], ['star', 5.5], ['galaxy', 1.5]] },
    { id: 'keycap', name: 'Keycap Box', price: 1500, color: 0xc8a8ff, ic: '⌨️',
        drops: [['keyCat', 38], ['keyBunny', 30], ['clickFrog', 17], ['spaceDog', 10], ['rgbDragon', 4.6], ['goldenKey', 0.4]] },
];
export const boxById = Object.fromEntries(BOXES.map((d) => [d.id, d]));
export function rollBox(box, rnd) {
    const total = box.drops.reduce((a, d) => a + d[1], 0);
    let r = rnd() * total;
    for (const [id, w] of box.drops) { r -= w; if (r <= 0) return id; }
    return box.drops[0][0];
}
// Equipped pets add up: 1 + sum of (mult - 1)
export function petMult(list) {
    let m = 1;
    for (const id of list || []) { const d = petById[id]; if (d) m += d.mult - 1; }
    return m;
}

// ----- trails (Coins) -----
export const TRAILS = [
    { id: 'starter', name: 'Bubble Trail', price: 0, color: 0xbfe6ff },
    { id: 'bubblegum', name: 'Bubblegum', price: 50, color: 0xff7ad0 },
    { id: 'mint', name: 'Mint Slime', price: 150, color: 0x6affb0 },
    { id: 'butter', name: 'Butter Glow', price: 400, color: 0xffd86a },
    { id: 'ocean', name: 'Ocean Jelly', price: 900, color: 0x3ab8ff },
    { id: 'sunset', name: 'Sunset Swirl', price: 2000, color: 0xff7a3a },
    { id: 'galaxy', name: 'Galaxy Dust', price: 5000, color: 0x8a5aff },
    { id: 'rainbow', name: 'Rainbow Squish', price: 12000, color: 0xff5ad8, rainbow: true },
    { id: 'vip', name: 'VIP Gold', vip: true, color: 0xffc828 },
];
export const trailById = Object.fromEntries(TRAILS.map((d) => [d.id, d]));

// ----- gear (Bux game passes); tools sit in the hotbar -----
export const GEAR = [
    { id: 'speedCoil', name: 'Speed Coil', desc: 'Run 55% faster', ic: '🌀', color: 0x3ac8ff },
    { id: 'gravityCoil', name: 'Gravity Coil', desc: 'Low gravity: huge floaty jumps', ic: '🪐', color: 0xc45aff },
    { id: 'superCoil', name: 'Super Coil', desc: 'Jump higher and run faster', ic: '⚡', color: 0xff3a5a },
    { id: 'grapple', name: 'Grappling Hook', desc: 'Hook, swing, and fly across obstacles', ic: '🪝', color: 0x5a5a6a },
    { id: 'slap', name: 'Slap Tool', desc: 'Slap other players off the tower', ic: '🖐️', color: 0xffffff },
    { id: 'carpet', name: 'Magic Carpet', desc: 'Fly freely', ic: '🧞', color: 0xff8ad8 },
    { id: 'jetpack', name: 'Jetpack', desc: 'Fly anywhere while your fuel lasts', ic: '🚀', color: 0xff5a3a },
];
export const gearById = Object.fromEntries(GEAR.map((d) => [d.id, d]));

// ----- Bux catalog (prices are defaults; the live price comes from the Bloxity IAP catalog) -----
export const PASSES = {
    VIP: { name: 'VIP', price: 299, ic: '👑', desc: 'VIP trail, VIP title, VIP room, teleport to any stage, +25% Coins' },
    DoubleCoins: { name: 'x2 Coins', price: 199, ic: '🪙', desc: 'Double Coins forever' },
    SpeedCoil: { name: 'Speed Coil', price: 99, ic: '🌀', desc: 'Run 55% faster', gear: 'speedCoil' },
    GravityCoil: { name: 'Gravity Coil', price: 99, ic: '🪐', desc: 'Low gravity: huge floaty jumps', gear: 'gravityCoil' },
    SuperCoil: { name: 'Super Coil', price: 199, ic: '⚡', desc: 'Jump higher and run faster', gear: 'superCoil' },
    GrappleHook: { name: 'Grappling Hook', price: 249, ic: '🪝', desc: 'Hook, swing, and fly across obstacles', gear: 'grapple' },
    SlapTool: { name: 'Slap Tool', price: 299, ic: '🖐️', desc: 'Slap other players off the tower', gear: 'slap' },
    MagicCarpet: { name: 'Magic Carpet', price: 599, ic: '🧞', desc: 'Fly freely', gear: 'carpet' },
    Jetpack: { name: 'Jetpack', price: 299, ic: '🚀', desc: 'Fly anywhere while your fuel lasts', gear: 'jetpack' },
};
export const PRODUCTS = {
    StarterPack: { name: 'Starter Pack', price: 99, was: 299, ic: '🎁', desc: 'Speed Coil, 500 Coins, 3 Spins and a Pink Slime pet' },
    Skip: { name: 'Skip Stage', price: 25, ic: '⏩', desc: 'Teleport to the next checkpoint' },
    NukeAll: { name: 'Nuke All', price: 49, ic: '☢️', desc: 'Nuke everyone else back to the lobby' },
    Coins1K: { name: '1,000 Coins', price: 49, ic: '🪙', coins: 1000 },
    Coins6K: { name: '6,000 Coins', price: 199, ic: '💰', coins: 6000 },
    Coins40K: { name: '40,000 Coins', price: 799, ic: '🏦', coins: 40000 },
    Spins5: { name: '+5 Spins', price: 49, ic: '🎡', spins: 5 },
    Donate10: { name: 'Donate 10', price: 10, ic: '💖', donate: 10 },
    Donate100: { name: 'Donate 100', price: 100, ic: '💖', donate: 100 },
    Donate500: { name: 'Donate 500', price: 500, ic: '💖', donate: 500 },
    Donate1000: { name: 'Donate 1,000', price: 1000, ic: '💖', donate: 1000 },
    Donate5000: { name: 'Donate 5,000', price: 5000, ic: '💖', donate: 5000 },
    Donate10000: { name: 'Donate 10,000', price: 10000, ic: '💖', donate: 10000 },
};
export const DONATIONS = ['Donate10', 'Donate100', 'Donate500', 'Donate1000', 'Donate5000', 'Donate10000'];
// Bloxity Bux SKUs: create these in the game's IAP catalog on bloxity.io (prices live there)
export const SKUS = {
    product: {
        StarterPack: 'starter_pack', Skip: 'skip_stage', NukeAll: 'nuke_all',
        Coins1K: 'coins_1k', Coins6K: 'coins_6k', Coins40K: 'coins_40k', Spins5: 'spins_5',
        Donate10: 'donate_10', Donate100: 'donate_100', Donate500: 'donate_500',
        Donate1000: 'donate_1000', Donate5000: 'donate_5000', Donate10000: 'donate_10000',
    },
    pass: {
        VIP: 'pass_vip', DoubleCoins: 'pass_double_coins',
        SpeedCoil: 'pass_speed_coil', GravityCoil: 'pass_gravity_coil', SuperCoil: 'pass_super_coil',
        GrappleHook: 'pass_grappling_hook', SlapTool: 'pass_slap_tool', MagicCarpet: 'pass_magic_carpet', Jetpack: 'pass_jetpack',
    },
};
export function skuLookup(sku) {
    for (const kind of ['product', 'pass']) for (const [key, s] of Object.entries(SKUS[kind])) if (s === sku) return { kind, key };
    return null;
}
export const passForGear = (gearId) => Object.keys(PASSES).find((k) => PASSES[k].gear === gearId);

// ----- Lucky Spin -----
export const SPIN = [
    { label: '15', ic: '🪙', coins: 15, w: 26, color: '#ffd028' },
    { label: '40', ic: '🪙', coins: 40, w: 20, color: '#ff8ad8' },
    { label: 'Slime Box', ic: '🟢', box: 'slime', w: 12, color: '#6aff5a' },
    { label: '100', ic: '🪙', coins: 100, w: 13, color: '#3ac8ff' },
    { label: 'x2 Coins', ic: '⏱️', boost: true, w: 10, color: '#c45aff' },
    { label: '250', ic: '💰', coins: 250, w: 7, color: '#ff7a3a' },
    { label: 'Squishy Box', ic: '🍡', box: 'squishy', w: 7, color: '#ffa8d8' },
    { label: '+1 Spin', ic: '🎡', spins: 1, w: 5, color: '#7affd8' },
];
export function rollSpin(rnd) {
    const total = SPIN.reduce((a, s) => a + s.w, 0);
    let r = rnd() * total;
    for (let i = 0; i < SPIN.length; i++) { r -= SPIN[i].w; if (r <= 0) return i; }
    return 0;
}

// ----- playtime gifts (the "4m" gift button): minutes played this session -----
export const GIFTS = [
    { min: 2, coins: 20 }, { min: 5, spins: 1 }, { min: 10, coins: 60 }, { min: 15, box: 'slime' },
    { min: 20, coins: 120 }, { min: 30, spins: 2 }, { min: 45, coins: 300 }, { min: 60, box: 'squishy' },
];
// ----- daily rewards (7-day streak) -----
export const DAILY = [
    { coins: 30 }, { spins: 1 }, { coins: 80 }, { box: 'slime' }, { coins: 150, spins: 2 }, { box: 'squishy' }, { coins: 500, spins: 3 },
];
export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
export function dailyStatus(d, now) {
    const today = dayKey(now), yest = dayKey(now - 86400000);
    if (!d || !d.last) return { can: true, day: 0, streak: 0 };
    if (d.last === today) return { can: false, day: d.streak % 7, streak: d.streak };
    const streak = d.last === yest ? d.streak : 0;
    return { can: true, day: streak % 7, streak };
}
export const rewardText = (r) => [
    r.coins ? '+' + fmt(r.coins) + ' Coins' : '',
    r.spins ? '+' + r.spins + (r.spins === 1 ? ' Spin' : ' Spins') : '',
    r.box ? 'a free ' + boxById[r.box].name : '',
].filter(Boolean).join(' + ');

export const CODES = {
    ASMR: { coins: 100 },
    SQUISHY: { coins: 150 },
    CLICKCLACK: { spins: 2 },
    LEGION: { coins: 250 },
    RELEASE: { box: 'slime' },
};

// Owned pets are { u: unique id, id: pet id }; equippedPets lists unique ids
export function equippedIds(p) {
    const out = [];
    for (const u of p.equippedPets || []) { const x = (p.pets || []).find((q) => q.u === u); if (x) out.push(x.id); }
    return out;
}
export const petSlots = (p) => (p.passes && p.passes.VIP ? CFG.vipPetSlots : CFG.petSlots);
// Coin multiplier: pets, x2 Coins pass, x2 boost, VIP, Friend Boost
export function coinMult(p, now, friends) {
    let m = petMult(equippedIds(p));
    if (p.passes && p.passes.DoubleCoins) m *= 2;
    if ((p.coinBoostUntil || 0) > now) m *= 2;
    if (p.passes && p.passes.VIP) m *= CFG.vipCoinMult;
    m *= 1 + CFG.friendBoost * Math.min(CFG.friendMax, friends || 0);
    return m;
}

export const KITS = [
    { shirt: 0x1c1c22, shorts: 0x24242c, socks: 0x1c1c22 },
    { shirt: 0xff7ad0, shorts: 0x3a3a5a, socks: 0xffffff },
    { shirt: 0x3ac8ff, shorts: 0x2a2a4a, socks: 0xffffff },
    { shirt: 0x6aff5a, shorts: 0x2a3a2a, socks: 0xffffff },
    { shirt: 0xffd028, shorts: 0x3a2a1a, socks: 0xffffff },
    { shirt: 0xc45aff, shorts: 0x2a1a3a, socks: 0xffffff },
];
export const SKINS = [0xffcfe8, 0xe1af87, 0xc88c5f, 0x8c5a3c, 0xf0c8a0];

// ----- formatting -----
export function fmt(v) {
    v = Math.floor(v || 0);
    if (v < 1000) return String(v);
    const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];
    let i = 0, x = v;
    while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
    return (x >= 100 ? Math.floor(x) : Math.floor(x * 10) / 10) + u[i];
}
export const fmtComma = (v) => Math.floor(v || 0).toLocaleString('en-US');
export function clock(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
}
export function playtimeText(s) {
    s = Math.floor(s || 0);
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
    return Math.floor(s / 86400) + 'd ' + Math.floor((s % 86400) / 3600) + 'h';
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function rngFrom(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
