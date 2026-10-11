# EduCraft

A blocky top-down adventure game for a 7-year-old. Explore four worlds, defeat
enemies and bosses, and earn credits for better swords and armor by solving
maths problems (Cambridge Primary Stage 2 / Grade 2 level).

Plain HTML, CSS and JavaScript. No build step, no dependencies, no accounts.
All artwork is drawn in code.

## Play it on the iPad

The game needs to be served over HTTP (Safari won't run it from a file).
On the Mac, in Terminal:

```bash
cd ~/Documents/EduCraft
python3 -m http.server 8080
```

Then on the iPad (same Wi-Fi), open Safari and go to
`http://<your-mac-name>.local:8080` — for example `http://hotmaclaw.local:8080`.
Find the name in System Settings → General → Sharing (Local hostname).

Tap **Share → Add to Home Screen**. It then launches fullscreen like an app,
landscape, and saves progress on the iPad.

Stop the server with `Ctrl-C`. (Later options: run it permanently on the
Mac Mini, or push the folder to GitHub Pages so it works anywhere.)

## Controls

| iPad / phone | Keyboard (for testing on the Mac) |
|---|---|
| Touch and drag anywhere on the **left half** → move | WASD / arrow keys |
| Tap anywhere on the **right half** → attack (auto-aims at the nearest enemy) | Space or J |
| Stand next to the Trader, tap **TRADE** → shop | Space / E |
| 📚 button → earn credits any time | — |
| ⏸ → pause, shop, eat Golden Apple, quit | Esc or P |

## How the game loop works

1. **Stages.** Each world has 3 stages and a boss. Defeat every enemy, the
   portal opens, walk into it. Beating a boss unlocks the next world.
2. **Credits come from maths.** The Trader (or the 📚 button) gives a
   question; a correct answer pays credits, three in a row pays a bonus.
   A wrong answer shows a worked solution and pays nothing — no punishment.
3. **Gear ladder.** Wooden → Stone → Iron → Golden → Diamond → Enchanted.
   Armor blocks a percentage of damage and adds hearts. Golden Apples
   auto-revive when hearts run out.
4. **Fainting** just restarts the stage with full hearts.

## Maths progression

| World | Operations | Numbers |
|---|---|---|
| 1 Green Meadows | + and − | Within 20, then within 100, no regrouping |
| 2 Deep Caves | + and − | Within 100 with regrouping, missing-number, two-step stories |
| 3 Lava Realm | ×, ÷ (and + −) | Tables 2, 5, 10 as groups and sharing |
| 4 Sky Fortress | Everything | Mixed stories where he must choose the operation; 3 and 4 tables as stretch |

Each operation has a hidden difficulty level 1–3 that moves up after ~85%
accuracy over the last several answers, and down after ~45%.

## Files

```
index.html           page, screens and modals
css/style.css        layout, big touch targets, safe areas
js/data.js           ← tune here: worlds, stages, enemies, gear, prices, credit payouts
js/mathgen.js        ← tune here: problem generators, number ranges, story templates
js/sprites.js        pixel-art tiles and mobs (16×16 string art)
js/input.js          touch joystick, attack zone, keyboard
js/engine.js         map generation, movement, combat, enemy AI, bosses, rendering
js/ui.js             title, world map, HUD, pause, shop, maths modal, save/load
manifest.webmanifest Add-to-Home-Screen metadata
icon.png             home screen icon
```

Progress is saved in the browser's localStorage under `educraft.save.v1`.
"New adventure" on the title screen erases it.

## Tuning tips

- Too hard / too easy? In `data.js`, change `worldScale` (enemy HP and
  damage per world) or the prices in `WEAPONS` / `ARMORS`.
- Want more or fewer questions per sword? Change `CREDITS.perCorrect`.
- Add a stage: add an object to a world's `stages` array. Add an enemy:
  add it to `ENEMIES` and a 16×16 sprite to `sprites.js`.
- Change the maths: `mathgen.js` → `WORLD_MIX` picks the operations per
  world; `addPair`/`subPair`/`mulPair`/`divPair` set number ranges.
- In the browser console `__game` is the live game object for debugging.

## Roadmap ideas

- Sound effects and music (currently silent — add when he's seen it run)
- Bahasa Indonesia toggle for word problems
- A parent dashboard: accuracy by operation, time played
- Bow and arrows, potions, pets
- More worlds and stage layouts
