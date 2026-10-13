# ASMR Tower

A relaxing multiplayer tower obby for the browser, built with **Three.js** and **Colyseus** for Bloxity. Climb up the inside of a giant tower over jelly, keyboards, slime, butter, pop-its and bubble wrap, where every surface has its own satisfying ASMR sound. It clones the Roblox game *[ASMR Tower](https://www.roblox.com/games/111363135577981/ASMR-Tower)* (see `reference/Gameplay.mp4`).

It shares its engine with the other Legion games (server, Bloxity login and avatars, profiles, Bux webhook, effects). The tower, course, physics shapes, ASMR sounds, pets, gear and HUD are new.

## Project layout

| Folder | What it is |
|---|---|
| `client/` | Vite + Three.js client: `main.js` (player, physics, gear, network, camera), `world.js` (tower, lobby, every obstacle), `materials.js` (checker walls, jelly, slime shader, butter, bubble wrap…), `audio.js` (lo-fi music and ASMR sounds), `ui.js` (HUD and panels), `pets.js`, `gear.js`, `keys.js` (clicky keycaps), `fx.js` (bloom, grade, particles) |
| `server/` | Colyseus 0.18 server: the `tower` room (`TowerRoom.js`), profiles, leaderboards, Bux webhook, play stats |
| `shared/` | `config.js` (economy, pets, trails, gear, Bux catalog) and `course.js` (the obby layout as data, used by both sides) |

## Run it locally

Needs Node 20 or newer. Double-click `start-local.bat`, or:

```sh
npm install          # installs client and server too
npm run build        # builds the client into client/dist
npm start            # server + game on http://localhost:2605
```

For development run `npm run dev:server` and `npm run dev:client`, then open http://localhost:5185 (the client talks to the server on port 2605; `VITE_SERVER_URL` overrides that).

## Gameplay (from the reference)

- **Lobby** at the bottom of the tower: lilac tiled walkways over a glossy green floor, purple checker walls with a hazard-stripe band, the round dais spawn, the **VIP** door (gold stripes, crown, red carpet), the **WORLDS** portal, the **Total Playtime / Wins / Donations** leaderboards, statues of the top three donors and the **DONATE** board, and the gear pads along the east wall (Speed Coil, Gravity Coil, Super Coil, Grappling Hook, Slap Tool, Magic Carpet, Jetpack).
- **The tower**: green checker walls with windows on a purple night sky. The course runs around the inside walls, one wall per half-stage, rising to the **Rainbow Summit** floating in the middle. 12 stages, each ending on a checkpoint landing:
  1. **Jelly Stairs**: translucent jelly steps up from the lobby
  2. **Clicky Keys**: boards of big A/B/C keycaps (magenta, green, lilac) that press down and click
  3. **Squishy Domes**: wobbly jelly domes that squish under you, and the big squishy blob
  4. **Slime Pools**: walk into green trusses to climb them, squelch across lime slime pools
  5. **Butter Bridge**: slippery "SALTED BUTTER" blocks and a narrow butter beam
  6. **Pop-It Path**: rainbow pop-its whose bubbles pop as you step (they flip back once all are popped); some slide sideways
  7. **Slime Bounce**: slime trampolines up and across the gaps
  8. **Bubble Wrap**: sliding and rising bubble-wrap platforms
  9. **Typing Keys**: keys pistoning up and down in a typing wave, space bars sliding
  10. **Jelly Drops**: jelly cubes that shake and melt away a moment after you touch them
  11. **Mochi Spinners**: spinning mochi discs, then walkways with sweeping jelly bars that knock you off
  12. **Rainbow Summit**: everything at once, rainbow stairs, then stepping stones to the WIN pad
- **Falling** drops you to the lobby (nothing kills you); the **"Oops! You fell?"** card teleports you back to your last checkpoint for free.
- **Coins**: +5 for every new checkpoint of a climb, floating coins along the course, +50 and a **Win** at the summit (then you're sent back to the lobby and the next climb pays again). A climb must take at least 45 s to count. Coins are multiplied by pets, x2 Coins, VIP (+25%) and Friend Boost (+10% per Bloxity friend in the server, up to +50%).
- **Pets** (Boxes, paid in Coins): Slime Box (60), Squishy Box (300), Keycap Box (1.5K), 20 pets from Common to Mythic (x1.1 to x15). Equip 3 (VIP 4); equipped pets add up. They float after you.
- **Trails** (Coins): Bubble, Bubblegum, Mint Slime, Butter Glow, Ocean Jelly, Sunset Swirl, Galaxy Dust, Rainbow Squish; VIP Gold comes with VIP.
- **Gear** (hotbar, keys 1-7): Speed Coil (run 55% faster), Gravity Coil (low gravity), Super Coil (higher jump + faster), Grappling Hook (click a surface to zip to it), Slap Tool (slap nearby players off the tower), Magic Carpet (fly: Space up, Shift down), Jetpack (hold Space in the air, fuel refills on the ground). Gear pads in the lobby and on three landings in the tower (the Magic Carpet on Stage 3, like the reference) show the gear when you step on them.
- **HUD** (as in the reference): Starter Pack offer (30-minute timer), Coins with **+**, Store / Pets / Worlds / Trails / Config / Boxes; Spin, Invite, Gift (playtime timer), Day (daily reward) top right; Nuke All; the rainbow progress bar on the right with every player's height and **Skip**; Friend Boost bottom left. The Bloxity overlay corner (top left) is kept free.
- **Lucky Spin** (free spin every 15 minutes, up to 5 banked), **Daily rewards** (7 days), **playtime gifts** (2 min to 1 h), **codes** (`ASMR`, `SQUISHY`, `CLICKCLACK`, `LEGION`, `RELEASE`), the VIP lounge with a Coin chest every 15 minutes and a stage teleporter.

## Bux (in-app purchases)

Gear, VIP, x2 Coins, the Starter Pack, Skip Stage, Nuke All, Coin packs, spins and donations are Bux purchases (`SKUS` in `shared/config.js`, 22 items). Bloxity shows its own purchase dialog and calls `POST /api/legion-webhook`; the server grants the item (on any pod, even offline). With `LEGION_WEBHOOK_SECRET` unset the server is in demo mode and the "Buy" button grants for free. `bloxity-setup.html` lists every Create New Game field and every IAP with copy buttons.

## Sound

- **Music**, "Squishy Clouds": an original code-generated 80 BPM lo-fi track (Rhodes chords Fmaj9 - Em7 - Dm9 - Cmaj9, swung brushed drums, sub bass, kalimba melody, vinyl crackle).
- **ASMR footsteps**, all synthesized: wet slime squelches with little bubbles (and the slime surface dents and ripples under your feet), gummy jelly bloops, rubbery dome squishes, butter pats with wrapper crinkle, pop-it pops, bubble-wrap cracks, mechanical keycap thocks, plastic truss ticks. Separate Music / ASMR / Effects volumes in Config.

## Graphics and performance

- Checker textures, jelly (clear-coat, fresnel rim, translucent), the slime shader, butter, bubble wrap, pop-its and keycaps are all generated in code; static geometry is merged per stage and material; domes, keys, pistons, bubbles and coins are instanced.
- A bright pass clamp before the bloom keeps sun glints from blooming; quality steps down automatically (High → Medium → Low) on slow devices.

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

- One shared `tower` room (up to 24 players). Movement is client-side; Coins, Wins, checkpoints (position-checked), coins, pets, trails, gear and purchases are decided by the server.
- Progress is saved per browser or per Bloxity account: MongoDB on Legion (`MONGODB_URI`), `server/data/profiles.json` locally.
- Play stats: `GET /api/stats?key=<stats key>&days=7` (the key is in `server/STATS_KEY.local.txt`, not in the repo; locally the stats are open).

## Deploy (Bloxity hosting)

Pushing `main` (prod) or `dev` runs `.github/workflows/deploy.yml`: server image `ghcr.io/asivixlp44-cmyk/asmr-tower-server`, Legion rollout, client upload. Play at https://asmr-tower.play.bloxity.io.

One-time setup: create the app `asmr-tower` on hosting.bloxity.io, add the repo secret `LEGION_DEPLOY_TOKEN`, create the game with the same slug in Manage Games with the IAPs from `bloxity-setup.html`, and set `LEGION_WEBHOOK_SECRET` for real Bux.
