

# Ace

A 2D side-scrolling action game built with **Phaser 3** (v3.88.2). The player fights
through a dungeon level against a smashing boss enemy, using both ranged and melee attacks.

## Tech & Structure

- **Vanilla JS, ES modules, no build step.** `phaser.js` is loaded via a plain `<script>`
  tag in `index.html`; `src/main.js` loads as `type="module"`. There is nothing to compile
  or bundle — just serve the folder statically and open `index.html`.
- Asset paths are relative to `index.html`, so everything is loaded as `assets/...`.

```
index.html            Entry point; loads phaser.js then src/main.js
src/
  main.js             Phaser.Game config; registers the scene list
  constants.js        Render constants (see "Rendering" below)
  scenes/
    BootScene.js      Loads ALL assets + registers ALL animations globally, then -> Menu
    MenuScene.js      Title screen; SPACE or click -> Level1
    Level1Scene.js    The actual gameplay (world, player, enemy, combat loop)
    GameOverScene.js  Win/lose screen; SPACE retries, M returns to menu
assets/               Spritesheets, tilemap (07.tmj + dungeon_ tileset), audio
```

**Scene flow:** `Boot -> Menu -> Level1 -> GameOver -> (Level1 | Menu)`. The scene list order
in `main.js` matters — the first scene (Boot) starts automatically.

## Rendering (important)

The game is authored at a logical **800x600** but the canvas renders at `RES` times that
many real pixels for sharpness on high-density displays, then `Scale.FIT` shrinks it to the
window. `RES = min(devicePixelRatio, 2)` (see `constants.js`). To keep the on-screen layout
identical regardless of `RES`:

- The gameplay camera **zooms by `RES`**.
- Screen-space text **scales its font size by `RES`**.

## Assets & Animations

- **All loading and animation registration happens once in `BootScene`.** Animations live on
  the global AnimationManager, so any scene can `play()` them by key. Add new assets/anims here,
  grouped by category (Player / Enemy / VFX / Tilemap / Audio: Music / Audio: SFX).
- **`bakeSheet()`** downscales the high-res player sheets (run / idle / fall / rise) into crisp
  gameplay-size spritesheets at load time (the browser's canvas resampler avoids the grain the
  GPU produces when shrinking huge frames live). The source PNGs on disk are never modified.
  All four sources are 720x720-cell grids that bake to 192x192.
  - **`srcW`/`srcH` must be the source CELL size, not the artwork's bounding box.** The art sits
    padded inside its cell (idle's character is only 317x690 within a 720x720 cell). Passing the
    bounding box makes `bakeSheet` stride across the sheet by the wrong amount, so every frame is
    cropped *and* pulls in slices of its neighbours. If a baked animation looks zoomed-in with
    bits of other frames intruding, check these numbers against `cols*srcW x rows*srcH` — it must
    equal the PNG's real dimensions.
- The player renders every animation at a constant on-screen height via `syncPlayerSize()`,
  which recomputes scale + physics body from the current frame on each animation change (the
  sheets have different native resolutions).

## Controls (Level1)

- **A / D** — move left / right
- **SPACE** — jump (only when on the ground)
- **Left-click** — ranged attack (fires a bullet toward the cursor; 250ms cooldown)
- **Right-click** — melee sword swing (500ms cooldown; only lands on mid-swing frames)
- **`** (backtick) — toggle physics-body debug outlines + version text

## Combat notes

- The player has 3 HP; the boss has 31 HP. Ranged hits deal 5, melee deals 10.
- The boss performs a downward **smash** attack when the player enters its hitbox zone, gated
  by a 2s cooldown. It tweens down to the ground and back (`getDistanceToGround` finds the drop).
- `damagePlayer()` exists but is not currently wired to the enemy's smash (player takes no
  damage from the boss yet — intentional for now).
- **Melee flip is intentionally inverted vs. movement**: `Sword.png` faces the opposite default
  direction from the run/idle sheets, so facing right uses `flipX = false` during a swing.

## Gotchas

- **Audio keys must be loaded before use.** `this.sound.add('key')` on a key that failed to
  load (e.g. a missing/misplaced file) **throws** and halts the scene's `create()` — which
  shows up as a **black screen**, not an obvious audio error. If the game goes black, check the
  console for a missing-asset error first, and confirm the file is actually under `assets/`.
- Sounds live on the global sound manager and do **not** auto-stop on scene change; each scene
  stops its own music via an `events.once('shutdown', ...)` handler so tracks don't overlap.
- **Never set `roundPixels: true` on the followed camera.** `startFollow(target, roundPixels, …)`
  takes it as the *second* arg, and Phaser's `Camera.preRender()` floors the lerped scroll then
  writes the floored value **back** into `scrollX/scrollY`. With our `lerp` of `0.1` the per-frame
  advance (`gap * 0.1`) is under 1px whenever the camera is within 10 world px of the player, so
  `Math.floor` discards it entirely — the camera stalls, then ratchets forward in integer jumps
  instead of tracking. At `setZoom(RES)` each stalled world pixel is `RES` screen px of apparent
  player displacement, which shows up as a **ghosted second copy of the player during fast motion**
  (most visible on jumps at 500px/s; ordinary running at 200px/s hides it). The game-config
  `render: { roundPixels: true }` is the same trap — `CameraManager` pushes it onto every camera.
- **Coyote time (`groundedRecently`) must gate jump *permission* only, never animation state.**
  `lastgroundedtime` is refreshed on the same frame a jump fires, so `groundedRecently` stays true
  for `COYOTE_MS` while the player is already ascending. Air animations therefore test the raw
  `onGround`, and are checked *before* the run/idle branches — otherwise the grounded branches win
  and run/idle plays in mid-air until coyote time expires, with `playerrise` starting ~120ms late.
  The `FALL_VELOCITY` dead zone (no branch matches between -100 and +100 px/s) is deliberate: it
  lets rise carry through the jump apex instead of flickering into fall.
