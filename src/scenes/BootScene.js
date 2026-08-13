/**
 * BootScene
 * Loads every asset once for the whole game, registers all animations
 * (animations live on the global AnimationManager, so any scene can play them),
 * then hands off to the menu.
 */
export class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'Boot' });
    }

    preload() {
        // --- Player Spritesheets ---
        // Run and idle are high-res grid sheets. We keep the originals but never
        // draw them directly: create() bakes each down to a crisp gameplay-size
        // spritesheet (see bakeSheet). Loaded as plain images so we can composite.
        // Every one of these is a grid of 720x720 cells; the character art sits
        // padded inside the cell, so the CELL size is what bakeSheet needs (not
        // the art's bounding box).
        //   run:  2880x2160 = 4x3 grid (12 frames)
        //   idle: 2880x3600 = 4x5 grid (18 frames used; slots 18-19 are empty)
        //   fall: 2880x1440 = 4x2 grid (8 frames)
        //   rise: 2880x1440 = 4x2 grid (8 frames)
        this.load.image('playerfall_src', 'assets/fallinganimation.png');
        this.load.image('playerrun_src', 'assets/runninganimation.png');
        this.load.image('playeridle_src', 'assets/idleanimation.png');
        this.load.image('playerrise_src', 'assets/risinganimation.png');
        this.load.spritesheet('playermelee', 'assets/Sword.png', {
            frameWidth: 64,
            frameHeight: 64
        });
        

        // --- Enemy Spritesheets ---
        this.load.spritesheet('enemyidle', 'assets/Enemy3-Idle.png', {
            frameWidth: 64,
            frameHeight: 64
        });
        this.load.spritesheet('enemyhit', 'assets/Enemy3-Hit.png', {
            frameWidth: 64,
            frameHeight: 64
        });
        this.load.spritesheet('enemydeath', 'assets/Enemy3-Die.png', {
            frameWidth: 64,
            frameHeight: 64
        });
        this.load.spritesheet('enemyattackstart', 'assets/Enemysmashattackstart.png', {
            frameWidth: 64,
            frameHeight: 64
        });
        this.load.spritesheet('enemyattackloop', 'assets/Enemysmashloop.png', {
            frameWidth: 64,
            frameHeight: 64
        });
        this.load.spritesheet('enemyattackend', 'assets/Enemysmashattackend.png', {
            frameWidth: 64,
            frameHeight: 64
        });

        // --- VFX / Projectiles ---
        this.load.image('playerrangedattack', 'assets/15.png');
        this.load.spritesheet('playerrangedattackexplosion', 'assets/Laserexplosion_recolored.png', {
            frameWidth: 225,
            frameHeight: 400
        });

        // --- Level / Tilemap ---
        this.load.image('dungeon_tiles', 'assets/dungeon_.png');
        this.load.tilemapTiledJSON('level1map', 'assets/07.tmj');

        // --- Audio: Music ---
        this.load.audio('introtheme', 'assets/Boss_battle_music_1.mp3');
        this.load.audio('Titletheme', 'assets/Ace_Title_Theme.mp3');

        // --- Audio: SFX ---
        this.load.audio('playerrangedattacksound', 'assets/freesound_community-laser-45816.mp3');
    }

    create() {
        // Bake the high-res player sheets down to crisp gameplay-size spritesheets.
        // The browser's canvas resampler (imageSmoothingQuality 'high') reads every
        // source pixel when shrinking, so the result is crisp -- unlike letting the
        // GPU shrink the huge frames live every frame, which undersamples and looks
        // grainy. Done once at load; the master PNGs on disk are never modified.
        // All bake to a square 192x192 cell so they render ~1:1 at gameplay size on
        // a 2x display. srcW/srcH must be the source CELL size -- using the art's
        // bounding box instead makes bakeSheet stride across the sheet by the wrong
        // amount, cropping each frame and pulling in slices of its neighbours.
        this.bakeSheet('playerrun_src', 'playerrun', {
            cols: 4, rows: 3, srcW: 720, srcH: 720, dstW: 192, dstH: 192
        });
        this.bakeSheet('playeridle_src', 'playeridle', {
            cols: 4, rows: 5, srcW: 720, srcH: 720, dstW: 192, dstH: 192, count: 18
        });
        this.bakeSheet('playerfall_src', 'playerfall', {
            cols: 4, rows: 2, srcW: 720, srcH: 720, dstW: 192, dstH: 192
        });
        this.bakeSheet('playerrise_src', 'playerrise', {
            cols: 4, rows: 2, srcW: 720, srcH: 720, dstW: 192, dstH: 192
        });

        // --- Player Animations ---
        this.anims.create({
            key: 'playerrun',
            frames: this.anims.generateFrameNumbers('playerrun', { start: 0, end: 11 }),
            frameRate: 30,
            repeat: -1
        });
        this.anims.create({
            key: 'playeridle',
            frames: this.anims.generateFrameNumbers('playeridle', { start: 0, end: 17 }),
            frameRate: 24,
            repeat: -1
        });
        this.anims.create({
            key: 'playermelee',
            frames: this.anims.generateFrameNumbers('playermelee', { start: 0, end: 4 }),
            frameRate: 10,
            repeat: 0
        });
        this.anims.create({
            key: 'playerfall',
            frames: this.anims.generateFrameNumbers('playerfall', { start: 0, end: 7 }),
            frameRate: 15,
            repeat: -1
        });
        this.anims.create({
            key: 'playerrise',
            frames: this.anims.generateFrameNumbers('playerrise', { start: 0, end: 7 }),
            frameRate: 15,
            repeat: -1
        });

        // --- Enemy Animations ---
        this.anims.create({
            key: 'enemyidle',
            frames: this.anims.generateFrameNumbers('enemyidle', { start: 0, end: 7 }),
            frameRate: 10,
            repeat: -1
        });
        this.anims.create({
            key: 'enemyhit',
            frames: this.anims.generateFrameNumbers('enemyhit', { start: 0, end: 3 }),
            frameRate: 10,
            repeat: 0
        });
        this.anims.create({
            key: 'enemydeath',
            frames: this.anims.generateFrameNumbers('enemydeath', { start: 0, end: 15 }),
            frameRate: 14,
            repeat: 0
        });
        this.anims.create({
            key: 'enemyattackstart',
            frames: this.anims.generateFrameNumbers('enemyattackstart', { start: 0, end: 3 }),
            frameRate: 10,
            repeat: 0
        });
        this.anims.create({
            key: 'enemyattackloop',
            frames: this.anims.generateFrameNumbers('enemyattackloop', { start: 0, end: 2 }),
            frameRate: 10,
            repeat: 4
        });
        this.anims.create({
            key: 'enemyattackend',
            frames: this.anims.generateFrameNumbers('enemyattackend', { start: 0, end: 3 }),
            frameRate: 10,
            repeat: 0
        });

        // --- VFX Animations ---
        this.anims.create({
            key: 'playerrangedattackexplosion',
            frames: this.anims.generateFrameNumbers('playerrangedattackexplosion', { start: 0, end: 25 }),
            frameRate: 40,
            repeat: 0
        });

        // Hand off to the menu.
        this.scene.start('Menu');
    }

    /**
     * Downscale a high-res grid spritesheet (loaded under srcKey) into a crisp,
     * gameplay-size spritesheet registered under destKey. The browser's canvas
     * resampler shrinks every source pixel cleanly, avoiding the grain the GPU
     * produces when shrinking huge frames live. Runs once at load; the source
     * art on disk is never modified.
     *
     * @param {string} srcKey  texture key of the loaded high-res source image
     * @param {string} destKey texture key to register the baked spritesheet under
     * @param {object} o  grid spec: { cols, rows, srcW, srcH, dstW, dstH, count? }
     *   srcW/srcH = source cell size, dstW/dstH = baked cell size,
     *   count = number of frames (defaults to cols*rows).
     */
    bakeSheet(srcKey, destKey, o) {
        const { cols, rows, srcW, srcH, dstW, dstH } = o;
        const count = o.count ?? cols * rows;

        const src = this.textures.get(srcKey).getSourceImage();

        // Offscreen canvas sized to the full baked grid.
        const tex = this.textures.createCanvas(destKey, cols * dstW, rows * dstH);
        const ctx = tex.context;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // High-quality shrink of each source cell into its baked slot.
        for (let i = 0; i < count; i++) {
            const col = i % cols, row = Math.floor(i / cols);
            ctx.drawImage(
                src,
                col * srcW, row * srcH, srcW, srcH,   // source cell
                col * dstW, row * dstH, dstW, dstH    // baked slot
            );
        }
        tex.refresh(); // upload the finished canvas to the GPU

        // Register the frames (0..count-1) so generateFrameNumbers can find them.
        for (let i = 0; i < count; i++) {
            const col = i % cols, row = Math.floor(i / cols);
            tex.add(i, 0, col * dstW, row * dstH, dstW, dstH);
        }
    }
}
