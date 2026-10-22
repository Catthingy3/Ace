

# Ace

A 2D side-scrolling action game built with **Phaser 3** (v3.88.2). The player fights
through a dungeon level against a smashing boss enemy, using both ranged and melee attacks.

## Working conventions

- **Confirm before bulk edits.** Do not run scripted find-and-replace (`perl -pi`, `sed -i`, etc.)
  across source files without asking first. Use the Edit tool for changes so each one is reviewable.
  Bulk Bash rewrites bypass the per-edit approval prompt and were used once by mistake (renaming
  `enemy` to `flyer`); that change was kept after the user reviewed it.

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

`RES` is only ever a clean `1` or `2` on the Macs this was developed on. It is **not** clean
elsewhere — see Packaging for why that becomes a problem the moment this leaves a browser.

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
  - **The bake quality is browser-dependent.** `imageSmoothingQuality = 'high'` is the whole point
    of the function, and **Firefox has never implemented it** — the assignment is a silent no-op,
    so Firefox falls back to plain bilinear. At a 3.75x reduction (720 -> 192) bilinear samples
    ~2x2 source pixels and discards the rest, which is exactly the undersampling grain this
    function exists to remove. Chrome/Edge/Safari honour it. If a portable fix is ever needed,
    bake in halving steps (720 -> 360 -> 192) instead of one jump: successive 2x reductions
    approximate a box filter and look the same in every engine. Moot once we ship on Electron
    (see Packaging), which bundles one Chromium.
  - **The `_src` images stay resident after baking and nothing draws them again.** The eight
    sources total ~34 MP, so ~135 MB of decoded RGBA plus a GPU copy each. `this.textures.remove(srcKey)`
    at the end of `bakeSheet` reclaims both. Harmless on desktop, matters on low-RAM devices.
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
  `render: { roundPixels: true }` is the same trap — `CameraManager` pushes it onto every camera,
  and `pixelArt: true` sets `roundPixels` implicitly, so it's the same bug one step removed.
- **The player's physics body must stay BOTTOM-anchored in the frame** — this produces the *same
  ghosting symptom* as the `roundPixels` trap above and is easily mistaken for it. `config.h` in
  `PLAYER_HITBOX` differs per animation (idle 63/64, run 61/64, fall/rise 57/64) while every sheet
  bakes to the same 192px cell, so `fh` and the 0.5 scale are constant and **only the body height
  changes on an anim swap**. With `yOffset = fh * config.oy` (i.e. `0`) the body's top was pinned
  and its bottom moved: landing (`playerfall` -> `playerrun`) grew the box 6 world px *downward*
  into the floor tile, and Arcade resolved the penetration by shoving the player up in one frame —
  12-18 screen px at `setZoom(RES)`. Hence `yOffset = fh * (1 - config.h) + (fh * config.oy)`.
  - **Telling the two apart:** the camera bug ghosts *everything* (tilemap and enemy included); this
    one is **player-only**, because only the player's body is being resized. It also fires on
    landings rather than continuously during fast motion, and is intermittent — a mid-air swap
    resizes into empty space and separates nothing, so only swaps that overlap a tile pop.
  - This is the vertical twin of the horizontal bug already fixed in `syncPlayerSize` (sizing the
    body from frame *width* made boxes jump sideways). Deriving from `fh` fixed X; Y needed the
    anchor change.
- **Coyote time (`groundedRecently`) must gate jump *permission* only, never animation state.**
  `lastgroundedtime` is refreshed on the same frame a jump fires, so `groundedRecently` stays true
  for `COYOTE_MS` while the player is already ascending. Air animations therefore test the raw
  `onGround`, and are checked *before* the run/idle branches — otherwise the grounded branches win
  and run/idle plays in mid-air until coyote time expires, with `playerrise` starting ~120ms late.
  The `FALL_VELOCITY` dead zone (no branch matches between -100 and +100 px/s) is deliberate: it
  lets rise carry through the jump apex instead of flickering into fall.
- **`onGround` must test `blocked.down`, NEVER `touching.down`.** Arcade stamps the contact faces
  in `separateY`/`separateX` *before* the `overlapOnly` early-return, so a plain `overlap()` — which
  separates nothing and moves nothing — still sets `touching.down`/`touching.up` on both bodies.
  The player carries `overlap(player, enemyAttackHitbox)`, and that zone is a tall column spanning
  from just under the enemy all the way to the floor (`smashHeight` = distance to ground), so
  descending anywhere beneath the boss set `touching.down` and the old `onGround` believed it.
  - **Coyote time turns one bogus frame into a real exploit.** A single spurious contact refreshes
    `lastgroundedtime`, which grants `groundedRecently` for the full `COYOTE_MS` — so the jump gate
    hands out a free mid-air jump for 120ms, repeatedly, anywhere inside that column.
  - **Symptom signature:** SPACE produces a y-gain mid-air but the player does **not** visibly
    switch to run/idle. That combination is diagnostic, and it looks like a collision-group mistake
    when it isn't. It happens because the two gates read different things on purpose (see the coyote
    entry above): the animation branches test raw `onGround`, which is true for a single ~16ms frame
    and invisible, while the jump gate tests `groundedRecently`, which stays true for 120ms.
  - Tile and world-bounds collisions set `blocked`, not `touching`, so `blocked.down` covers every
    real ground contact here. `body.onFloor()` just returns `blocked.down` internally.
  - **If a solid moving platform is ever added as a physics body** (rather than a tile), body-vs-body
    collision sets `touching`, not `blocked`, so it would not register as ground under this test.
    Track that contact explicitly in the platform's collider callback — do **not** reinstate
    `touching.down`, or this bug comes straight back.
- **`fixedStep: false` in the arcade config (`main.js`) is load-bearing — do not remove it.**
  Arcade's default is a fixed-step accumulator: it banks each frame's delta and steps physics in
  fixed 16.67ms chunks. A scene restart spends **~100ms** inside `create()` rebuilding the tilemap,
  sprites and colliders, and that whole spike gets banked as ~6 pending steps, leaving the
  accumulator parked exactly on the step boundary. From then on sub-millisecond frame jitter tips
  it either side every frame — one frame banks 0 steps, the next banks 2 — and it never re-centres.
  `fixedStep: false` zeroes the accumulator every frame and always steps exactly once with the real
  delta (see `phaser.js` ~149177), so render and physics are phase-locked by construction. The
  trade-off is frame-rate-dependent, non-deterministic physics, which is fine for a single-player
  game and is the standard fix.
  - **Zeroing `world._elapsed` at the end of `create()` does NOT work** — it was tried first. The
    Arcade plugin runs `world.update()` on the scene's UPDATE event, i.e. *after* `create()` has
    returned, so the ~100ms delta for the frame containing `create()` is banked *after* the reset
    and the accumulator ends up parked anyway. Any accumulator reset has to happen on the first
    `update()` tick, not in `create()`.
  - **Symptom:** the player stutters/shakes during *any* animation, but **only after a retry**,
    never on a fresh page load. Reported alongside the mouse cursor flickering.
  - **Why it misleads:** every health metric looks perfect. `fps` is a flat 60, `getScenes(true)`
    shows a single `Level1`, and display-list and body counts are stable. Nothing looks wrong
    because nothing *is* wrong except the physics/render phase.
  - **How to confirm in 30s** — log `player.body.velocity.y` each `update()` and diff it. A healthy
    run steps a repeating **13/13/14** (= gravity 800 / 60fps = 13.33). A desynced run alternates
    **0 and 26** — repeated values interleaved with double steps. Clean on first load, broken after
    a restart, is the whole diagnosis.
  - `_elapsed` is a private field. The supported alternative is `fixedStep: false` in the arcade
    config in `main.js`, which makes physics use the real frame delta and always match the render,
    at the cost of frame-rate-dependent (non-deterministic) physics.

## Packaging (planned: Electron -> Steam, PC only)

The intended destination is a **Windows-only Electron build on Steam**. Nothing is set up yet —
there is no `package.json` in the project, and it still deploys as a static folder. These are the
conclusions from scoping it, recorded so they don't get re-derived.

- **The game code itself needs no porting.** All four scenes were grepped for `window`, `document`,
  `localStorage`, `navigator`, and `fetch`: zero hits. Everything goes through Phaser (`this.sound`,
  `this.input`, `this.scale`, `this.textures`). The only direct browser API in the project is
  `window.devicePixelRatio` in `constants.js`. Electron runs Chromium and the game already runs in
  Chromium, so pointing it at `index.html` is genuinely the whole port.
- **`file://` will black-screen the first build.** Electron loads from `file://` by default, which
  breaks two things at once: the `07.tmj` tilemap load is XHR and gets blocked by `webSecurity`, and
  the player sheets taint the canvas so `bakeSheet`'s `tex.refresh()` throws a `SecurityError` trying
  to upload a tainted canvas to WebGL. Fix by registering a custom `app://` protocol as standard +
  secure in the main process. Do **not** reach for `webSecurity: false`. This is the first thing to
  solve — everything else is downstream of the app actually rendering.
- **`RES` must stop deriving from `devicePixelRatio` once packaged.** Windows display scaling is
  routinely 125% / 150% / 175% and is the factory default on most laptops, so `RES` lands on `1.25`
  or `1.5` and the gameplay camera gets `setZoom(1.5)`. A fractional zoom over a tilemap is the
  standard recipe for seams and shimmer between tiles, and it interacts with the deliberately-`false`
  `roundPixels` above. **This has never been seen in testing** — development has only ever hit
  `RES` 1 or 2. In a packaged app we own the window, so the fix is to pin the render resolution to a
  fixed value and let `Scale.FIT` do the rest, which also kills the related multi-monitor bug (`RES`
  is computed once at module load, so dragging between mixed-DPI displays never updates it).
- **Two things get better for free.** `titlemusic.play()` in `MenuScene.create()` currently runs with
  no user gesture, so browsers suspend it until first click; Electron's
  `autoplayPolicy: 'no-user-gesture-required'` makes it just play. And official Electron builds ship
  proprietary codecs, so the MP3s load — which matters given the black-screen-on-failed-`sound.add()`
  gotcha above.

### Steam specifics

- **No code signing needed.** Steam ships through its own client, so Windows builds face no
  SmartScreen wall — no certificate, no reputation period. (The signing/notarization cost is a macOS
  concern, which PC-only avoids entirely.)
- **The Steam Overlay is the real risk.** The overlay hooks the render pipeline, Chromium renders in
  a separate GPU process via ANGLE, and the two often don't cooperate — the overlay silently fails to
  appear in Electron apps, taking Shift+Tab, screenshots, and achievement toasts with it. Usually
  fixable with launch flags (`--in-process-gpu` first, sometimes `--disable-gpu-sandbox` or a forced
  `--use-angle=d3d11`), but the working combination varies by machine. **Test on real Windows
  hardware early**, not near launch.
- **Use `steamworks.js`, not `greenworks`.** Most tutorials point at greenworks; it's unmaintained.
  Either way it's a native module, so it rebuilds per Electron ABI version.
- **Logistics:** $100 Steam Direct per app (recoupable at $1k revenue), and Valve requires a **30-day
  minimum** between the store page going live and release. Builds upload via `steamcmd`/SteamPipe.
- **Shippable-vs-runs gap** is the options menu, fullscreen toggle, volume control, and key rebinding
  — not the packaging.

## Known issues (unfixed)

- **`rangedattackexplosion` bakes with the wrong cell height.** `BootScene` passes `srcH: 200`, but
  `rangedattackexplosion.png` is 960x480 — a 4x2 grid of **240x240**, not 240x200. Row 1 is read from
  y=200 instead of y=240, so the bottom row is cropped and offset. Same class of mistake as the
  `srcW`/`srcH` warning above.
- **The explosion animation asks for frames that don't exist.** `playerrangedattackexplosion` uses
  `generateFrameNumbers({ start: 0, end: 25 })`, but that bake only registers `cols*rows` = 8 frames.
- **`rangedattackexplosion_src` is loaded twice** in `preload()` (Player VFX block and again under
  VFX / Projectiles). Harmless, but Phaser warns.

Every other sheet's `cols*srcW x rows*srcH` was verified against the real PNG dimensions — the
explosion is the only mismatch.
