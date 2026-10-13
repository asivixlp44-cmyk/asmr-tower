# ASMR Tower

A multiplayer ASMR tower obby for the browser, built with **Three.js** and **Colyseus** for Bloxity. Climb up the inside of a giant tower over jelly, keyboards, slime, butter, pop-its and bubble wrap, where every surface has its own satisfying ASMR sound. It clones the Roblox game *[ASMR Tower](https://www.roblox.com/games/111363135577981/ASMR-Tower)* (see `reference/Gameplay.mp4`).

**There are no in-app purchases.** Everything is bought with **Wins**, earned by climbing.

It shares its engine with the other Legion games (server, Bloxity login and avatars, profiles, Bux webhook, effects). The tower, course, physics shapes, ASMR sounds, pets, gear and HUD are new.

## Project layout

| Folder | What it is |
|---|---|
| `client/` | Vite + Three.js client: `main.js` (player, physics, gear, network, camera), `world.js` (tower, lobby, every obstacle), `decor.js` (neon rings, light beams, bubbles, floating squishies, stage signs), `materials.js` (checker walls, jelly, slime shader, butter, bubble wrap…), `audio.js` (lo-fi music and ASMR sounds), `ui.js` (HUD and panels), `pets.js`, `gear.js`, `keys.js` (clicky keycaps), `fx.js` (bloom, grade, particles) |
| `server/` | Colyseus 0.18 server: the `tower` room (`TowerRoom.js`), profiles, leaderboards, play stats |
| `shared/` | `config.js` (stages and difficulty, Wins economy, pets, trails, gear, the Wins shop) and `course.js` (the obby layout as data, used by both sides) |

## Run it locally

Needs Node 20 or newer. Double-click `start-local.bat`, or:

```sh
npm install          # installs client and server too
npm run build        # builds the client into client/dist
npm start            # server + game on http://localhost:2605
```

For development run `npm run dev:server` and `npm run dev:client`, then open http://localhost:5185 (the client talks to the server on port 2605; `VITE_SERVER_URL` overrides that).

## Gameplay (from the reference)

- **Lobby** at the bottom of the tower: lilac tiled walkways over a glossy green floor, purple checker walls with a hazard-stripe band, the round dais spawn, the **VIP** door (gold stripes, crown, red carpet), the **WORLDS** portal, the **Total Playtime / Wins / Top Climbers** leaderboards, statues of the top three climbers and the **WIN SHOP** board, and the gear pads along the east wall (Speed Coil, Gravity Coil, Super Coil, Grappling Hook, Slap Tool, Magic Carpet, Jetpack).
- **The tower**: green checker walls with windows on a purple night sky. The course runs around the inside walls, one wall per half-stage, rising to the **Rainbow Summit** floating in the middle. 12 stages, each ending on a checkpoint landing, and **every stage is harder than the one before**: the difficulty badge goes EASY → MEDIUM → HARD → EXTREME → INSANE, platforms get smaller and gaps longer, moving parts get faster (x1 up to x1.75) and melting jelly lasts 0.75 s, then 0.5 s, then 0.42 s:
  | # | Stage | Difficulty | Checkpoint pays |
  |---|---|---|---|
  | 1 | **Jelly Stairs**: translucent jelly steps up from the lobby | EASY | 2 Wins |
  | 2 | **Clicky Keys**: boards of big A/B/C keycaps that press down and click | EASY | 3 |
  | 3 | **Squishy Domes**: wobbly jelly domes that squish under you | MEDIUM | 4 |
  | 4 | **Slime Pools**: climb green trusses, squelch across lime slime pools | MEDIUM | 6 |
  | 5 | **Butter Bridge**: slippery "SALTED BUTTER" slabs and a narrow butter beam | MEDIUM | 8 |
  | 6 | **Pop-It Path**: small pop-its with diagonal hops, some sliding away | HARD | 11 |
  | 7 | **Slime Bounce**: tiny trampolines over big gaps | HARD | 15 |
  | 8 | **Bubble Wrap**: small blocks and fast sliding / rising bubble wrap | HARD | 20 |
  | 9 | **Typing Keys**: small keys typing up and down, fast space bars | EXTREME | 27 |
  | 10 | **Jelly Drops**: 4x4 jelly that melts half a second after you touch it | EXTREME | 36 |
  | 11 | **Mochi Spinners**: small fast spinning mochi, then narrow walkways with two sweeping bars each | INSANE | 48 |
  | 12 | **Rainbow Summit**: everything at once, narrow rainbow stairs, then the WIN pad | INSANE | +100 at the top |

  Every jump between static platforms is checked by a bot running the real physics (a run-up and a jump), and the sweeper walkways by a bot that hops through them.
- **Falling** drops you to the lobby (nothing kills you); the **"Oops! You fell?"** card teleports you back to your last checkpoint for free.
- **Wins**: every new checkpoint of a climb pays its stage's Wins (table above), floating trophy coins +1, the summit +100 and a climb on your record (then you're sent back to the lobby and the next climb pays again). A full climb is about 300 Wins. A climb must take at least 45 s to count. Wins are multiplied by pets, x2 Wins, the x2 boost, VIP (+25%) and Friend Boost (+10% per Bloxity friend in the server, up to +50%). Each checkpoint shows a **STAGE N CLEAR!** banner with the next stage's difficulty.
- **The Wins shop**: Speed Coil 150, Gravity Coil 600, Slap Tool 800, Super Coil 1.5K, VIP 3K, Grappling Hook 5K, x2 Wins 8K, Jetpack 12K, Magic Carpet 30K; Starter Pack 99 (first 30 minutes), x2 Wins Boost 250, +5 Spins 120, Nuke All 500, Skip Stage (5x what the next checkpoint pays). The server checks every price.
- **Pets** (Boxes, paid in Wins): Slime Box (25), Squishy Box (150), Keycap Box (900), 20 pets from Common to Mythic (x1.1 to x15). Equip 3 (VIP 4); equipped pets add up. They float after you.
- **Trails** (Wins, 40 to 15K): Bubble, Bubblegum, Mint Slime, Butter Glow, Ocean Jelly, Sunset Swirl, Galaxy Dust, Rainbow Squish; VIP Gold comes with VIP.
- **Gear** (hotbar, keys 1-7): Speed Coil (run 55% faster), Gravity Coil (low gravity), Super Coil (higher jump + faster), Grappling Hook (click a surface to zip to it), Slap Tool (slap nearby players off the tower), Magic Carpet (fly: Space up, Shift down), Jetpack (hold Space in the air, fuel refills on the ground). Gear pads in the lobby and on three landings in the tower (the Magic Carpet on Stage 3, like the reference) show the gear when you step on them.
- **HUD** (as in the reference): Starter Pack offer (30-minute timer), Wins with **+** (boosts), Store / Pets / Worlds / Trails / Config / Boxes; Spin, Invite, Gift (playtime timer), Day (daily reward) top right; Nuke All; the rainbow progress bar on the right with every player's height and **Skip**; Friend Boost bottom left. The Bloxity overlay corner (top left) is kept free.
- **Lucky Spin** (free spin every 15 minutes, up to 5 banked), **Daily rewards** (7 days), **playtime gifts** (2 min to 1 h), **codes** (`ASMR`, `SQUISHY`, `CLICKCLACK`, `LEGION`, `RELEASE`), the VIP lounge with a Wins chest every 15 minutes and a stage teleporter.

## Sound

- **Music**, "Squishy Clouds": an original code-generated 80 BPM lo-fi track (Rhodes chords Fmaj9 - Em7 - Dm9 - Cmaj9, swung brushed drums, sub bass, kalimba melody, vinyl crackle).
- **ASMR footsteps**, all synthesized: wet slime squelches with little bubbles (and the slime surface dents and ripples under your feet), gummy jelly bloops, rubbery dome squishes, butter pats with wrapper crinkle, pop-it pops, bubble-wrap cracks, mechanical keycap thocks, plastic truss ticks. Separate Music / ASMR / Effects volumes in Config.

## Graphics and performance

- A dark neon look: deep violet lobby and emerald tower with bevelled tiles, neon rings in each stage's colour, rainbow corner pillars, light beams through the windows, a moon, violet haze, iridescent soap bubbles drifting up the shaft and giant squishies floating in it.
- Reflections come from a neon room (pink, cyan, violet, mint) baked into the environment map; two stage-coloured lights travel with the player.
- Jelly breathes and jiggles where you land; the lobby floor and slime are rippling gels that dent under your feet; checkpoint flags wave; every block has rounded, bevelled edges.
- The bloom only picks up bright saturated colours (the neon), so sun glints never blow out into a white haze.
- Textures and materials are generated in code; static geometry is merged per stage and material; domes, keys, pistons, bubbles and coins are instanced. Quality steps down automatically (High → Medium → Low) on slow devices; Low turns off the beams and bubbles.

## Controls

| Action | Keyboard / mouse | Controller | Touch |
|---|---|---|---|
| Move | WASD / arrows | Left stick | Joystick |
| Jump / fly up | Space | A | JUMP |
| Climb a truss | Walk into it | Push into it | Push into it |
| Fly down (carpet) | Shift / Q / C | LT/RT | ⬇ |
| Use tool / interact | Click or E | X | Tool button |
| Gear | 1-7 | LB / RB | Hotbar |
| Camera | Drag, wheel to zoom | Right stick, D-pad | Drag |

## Multiplayer and saves

- One shared `tower` room (up to 24 players). Movement is client-side; Wins, climbs, checkpoints and trophy pickups (position-checked), pets, trails, gear and purchases are decided by the server.
- Progress is saved per browser or per Bloxity account: MongoDB on Legion (`MONGODB_URI`), `server/data/profiles.json` locally.
- Play stats: `GET /api/stats?key=<stats key>&days=7` (the key is in `server/STATS_KEY.local.txt`, not in the repo; locally the stats are open).

## Deploy (Bloxity hosting)

Pushing `main` (prod) or `dev` runs `.github/workflows/deploy.yml`: server image `ghcr.io/asivixlp44-cmyk/asmr-tower-server`, Legion rollout, client upload. Play at https://asmr-tower.play.bloxity.io.

One-time setup: create the app `asmr-tower` on hosting.bloxity.io, add the repo secret `LEGION_DEPLOY_TOKEN`, and create the game with the same slug in Manage Games (no IAPs; `bloxity-setup.html` has every field with copy buttons).
