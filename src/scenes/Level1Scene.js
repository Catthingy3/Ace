import { RES } from '../constants.js';

const DEBUG_VERSION = '1.1';

// Every player animation renders at this on-screen height (world px), regardless
// of its sheet's resolution (run is baked at 192px, idle/melee are 64px). The
// physics body is expressed as fractions of the current frame so it stays a
// constant world-space size across those different-resolution sheets. Fractions
// are taken from the original 64px tuning: setSize(25,55) / setOffset(22,6).
const PLAYER_DISPLAY_HEIGHT = 96;
const PLAYER_BODY = { w: 25 / 62, h: 57 / 64, ox: 22 / 64, oy: 6 / 64 };
const PLAYER_HITBOX = {
    playeridle: { w: 25 / 64, h: 63 / 64, ox: 0, oy: 0 },
    playerrun: { w: 23 / 64, h: 61 / 64, ox: 0, oy: 0 },
    playerfall: { w: 23 / 64, h: 57 / 64, ox: 0, oy: 0 },
    playermelee: { w: 25 / 64, h: 57 / 64, ox: 0, oy: 0 },
    playerrise: { w: 25 / 64, h: 57 / 64, ox: 0, oy: 0 }
};
const COYOTE_MS = 120;
// How far in front of the player the melee zone -- and the slash VFX drawn over it -- sits.
const MELEE_REACH = 30;
// Slash sheets bake to a 192px cell; the player renders at PLAYER_DISPLAY_HEIGHT (96).
const SLASH_SCALE = 0.6;
// 1-based frame index at which the blade is extended enough to deal damage. The first
// four frames of both slash sheets are a short wind-up (art grows from ~172px to ~462px).
const MELEE_ACTIVE_FROM = 5;
// Swings alternate down -> up -> down. The two sheets were authored facing OPPOSITE
// directions -- downslash sweeps upper-right to lower-left (a left-facing attack) while
// upslash sweeps lower-left to upper-right (right-facing) -- so each carries its own
// facesRight flag rather than sharing one flip rule. If a swing looks mirrored, flip
// that sheet's flag; nothing else needs to change.
const SLASH = {
    down: { texture: 'playermelee',  anim: 'playermelee1', facesRight: false, next: 'up' },
    up:   { texture: 'playermelee2', anim: 'playermelee2', facesRight: false,  next: 'down' }
};
// Render order. Higher draws on top; objects sharing a depth fall back to creation
// order. Gaps of 10 leave room to slot new bands in without renumbering.
// The swing is its own sprite (see playermeleeattack) rather than a player animation,
// so the body keeps running/idling independently of it. At SLASH < PLAYER the blade
// sweeps BEHIND the player; raise it above PLAYER to draw the swing in front.
const DEPTH = {
    BACKGROUND: 0,
    TILES: 10,
    ENEMY: 20,
    PLAYER: 30,
    SLASH: 35,
    VFX: 21,
    HUD: 1000
};

// Only switch to the fall animation once descending faster than this (px/s). Tiny
// tile-edge bounces keep vy small; a real fall blows past it. Prevents the fall/run
// flicker (and the hitbox-resize feedback loop it caused) at platform edges.
const FALL_VELOCITY = 100;
/**
 * Level1Scene
 * The actual gameplay. Assets and animations are loaded/registered in BootScene,
 * so this scene only builds the world and runs the game loop.
 */
export class Level1Scene extends Phaser.Scene {
    constructor() {
        super({ key: 'Level1' });
    }

    create() {
        const { width, height } = this.scale;

        // --- World & Tilemap ---
        const map = this.make.tilemap({ key: 'level1map' });
        const tileset = map.addTilesetImage('dungeon_', 'dungeon_tiles');
        const groundLayer = map.createLayer('Tile Layer 1', tileset, 0, 130);
        groundLayer.setDepth(DEPTH.TILES);
        groundLayer.setCollisionByExclusion([-1]);
        this.map = map;
        this.groundLayer = groundLayer;

        this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
        this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
        this.cameras.main.setZoom(RES);
        this.physics.world.gravity.y = 800;

        // --- Player Setup ---
        this.player = this.physics.add.sprite(48, 203, 'playerrun');
        this.player.setOrigin(0.5, 0.5);
        this.player.setDepth(DEPTH.PLAYER);
        this.player.play('playeridle');
        this.player.on('animationstart', () => this.syncPlayerSize());
        this.syncPlayerSize();
        // Camera can only follow the player once it exists.
        // roundPixels MUST stay false: Phaser's preRender floors the lerped scroll and
        // writes the floored value back, so with a lerp this small the per-frame advance
        // (gap * 0.1) is < 1px and gets discarded entirely. The camera then stalls and
        // ratchets in integer jumps instead of tracking, which reads as a ghosted second
        // copy of the player during fast vertical motion (jumping at 500px/s).
        this.cameras.main.startFollow(this.player, false, 0.1, 0.1);

        this.player.attackCooldown = 0;
        this.player.rangedAttackCooldown = 0;
        this.player.isAttacking = false;
        this.player.direction = 'right';
        this.player.meleeActive = false;
        this.player.health = 3;
        this.player.setCollideWorldBounds(true);
        this.player.lastgroundedtime = 0;
        this.player.slashdirection = 'down';
        // Reset here, not just on the sprite's own teardown: the scene restarts on retry,
        // and a swing in flight when the player died would leave a destroyed sprite here.
        this.activeSlash = null;

        // The melee damage window is driven by the spawned slash sprite, not the player
        // (see playermeleeattack) -- Phaser fires animation events on whichever object is
        // playing the animation, and the player never plays a melee anim.

        this.playermeleeattackhitbox = this.add.zone(this.player.x, this.player.y, 40, 50);
        this.physics.add.existing(this.playermeleeattackhitbox);
        this.playermeleeattackhitbox.body.setAllowGravity(false);
        this.physics.add.collider(this.player, groundLayer);
        
        // --- Enemy Setup ---
        this.enemy = this.physics.add.sprite(750, 150, 'enemyidle');
        this.enemy.setDepth(DEPTH.ENEMY);
        this.enemy.isAttacking = false;
        this.enemy.attackCooldown = 0;
        this.enemy.health = 31;
        this.enemy.setCollideWorldBounds(true);
        this.enemy.setScale(2);
        this.enemy.setBodySize(44, 50);
        this.enemy.body.allowGravity = false;
        this.enemy.play('enemyidle');

        const smashHeight = this.getDistanceToGround(this.enemy) + 10;
        const smashYOffset = (this.enemy.displayHeight / 2) + (smashHeight / 2);
        this.enemyAttackHitbox = this.add.zone(this.enemy.x, this.enemy.y + smashYOffset, 80, smashHeight);
        this.physics.add.existing(this.enemyAttackHitbox);
        this.enemyAttackHitbox.body.setAllowGravity(false);

        this.physics.add.collider(this.enemy, groundLayer);

        // --- Combat Setup ---
        this.bullets = this.physics.add.group();
        this.physics.add.collider(this.bullets, this.groundLayer, this.destroyBulletOnPlatform, null, this);
        this.physics.add.overlap(this.playermeleeattackhitbox, this.enemy, this.meleeHitEnemy, null, this);
        this.physics.add.overlap(this.player, this.enemyAttackHitbox, this.onPlayerInHitbox, null, this);
        this.physics.add.overlap(this.bullets, this.enemy, this.hitEnemy, null, this);

        // --- Input Setup ---
        this.wasd = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.SPACE,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D,
        });
        this.input.mouse.disableContextMenu();
        this.input.on('pointerdown', (pointer) => this.playermeleeattack(pointer));
        this.input.on('pointerdown', (pointer) => this.fireBullet(pointer));

        // --- Audio ---
        this.backgroundMusic = this.sound.add('introtheme', { loop: true, volume: 0.3 });
        this.backgroundMusic.play();
        
        // Sounds live on the global manager and don't auto-stop when the scene
        // ends, so kill the track on shutdown to prevent it overlapping the next scene.
        this.events.once('shutdown', () => this.backgroundMusic.stop());

        // --- Debug Tools ---
        this.physics.world.createDebugGraphic();
        this.physics.world.debugGraphic.visible = false;
        // A scrollFactor(0) HUD element is still scaled by the camera zoom (setZoom(RES)),
        // which pushes text placed at (10,10) off-screen. Position + scale it so it lands
        // at the top-left at readable size regardless of RES.
        const cam = this.cameras.main;
        const uiX = cam.width / 2 + (10 - cam.width / 2) / cam.zoom;
        const uiY = cam.height / 2 + (10 - cam.height / 2) / cam.zoom;
        this.debugVersionText = this.add.text(uiX, uiY, `v${DEBUG_VERSION}`, {
            fontSize: '16px',
            fill: '#00ff00',
            fontFamily: 'monospace'
        });
        this.debugVersionText.setDepth(DEPTH.HUD);
        this.debugVersionText.setScrollFactor(0);
        this.debugVersionText.setScale(1 / cam.zoom);
        this.debugVersionText.setVisible(false);
        this.input.keyboard.on('keydown-BACKTICK', () => {
            this.physics.world.debugGraphic.visible = !this.physics.world.debugGraphic.visible;
            this.debugVersionText.setVisible(this.physics.world.debugGraphic.visible);
            console.log('Debug toggled:', this.physics.world.debugGraphic.visible, 'Version:', DEBUG_VERSION);
        });
    }

    // --- Update Loop ---
    update() {
        const body = this.player.body;
        const onGround = body && (body.touching?.down || body.blocked?.down || body.onFloor && body.onFloor());
        if (onGround) {
            this.player.lastgroundedtime = this.time.now;
        }
        const groundedRecently = this.time.now - this.player.lastgroundedtime < COYOTE_MS;

        // --- Player Movement (velocity + facing only) ---
        let moving = false;
        if (this.wasd.right.isDown) {
            this.player.direction = 'right';
            this.player.setVelocityX(200);
            this.player.flipX = true;
            moving = true;
        } else if (this.wasd.left.isDown) {
            this.player.direction = 'left';
            this.player.setVelocityX(-200);
            this.player.flipX = false;
            moving = true;
        } else {
            this.player.setVelocityX(0);
        }

        // --- Jumping ---
        if (this.wasd.up.isDown && (onGround || groundedRecently)) {
            this.player.setVelocityY(-500);
        }

        // --- Animation: rise/fall > run > idle ---
        // Air states are checked FIRST and gated on onGround, not groundedRecently.
        // Coyote time extends jump *permission* only -- using it here meant that for the
        // first COYOTE_MS of every jump the grounded branches still won, so run/idle
        // played while ascending and rise only kicked in 120ms late.
        // Attacking no longer suppresses this: the slash is a separate sprite layered
        // over the player, so the body keeps running/idling/jumping underneath it.
        const vy = this.player.body.velocity.y;
        if (!onGround && vy < -FALL_VELOCITY) {
            this.player.play('playerrise', true);
        } else if (!onGround && vy > FALL_VELOCITY) {
            this.player.play('playerfall', true);
        } else if (groundedRecently && moving) {
            this.player.play('playerrun', true);
        } else if (groundedRecently && !moving) {
            this.player.play('playeridle', true);
        }

        // --- Debug readout (toggle with backtick) ---
        if (this.debugVersionText.visible) {
            const anim = this.player.anims.currentAnim?.key ?? 'none';
            this.debugVersionText.setText(
                `v${DEBUG_VERSION}\nanim: ${anim}\nonGround: ${!!onGround}\nvy: ${Math.round(this.player.body.velocity.y)}`
            );
        }

        // --- Melee Hitbox Positioning ---
        const meleeOffset = this.player.direction === 'right' ? MELEE_REACH : -MELEE_REACH;
        this.playermeleeattackhitbox.x = this.player.x + meleeOffset;
        this.playermeleeattackhitbox.y = this.player.y;

        // Keep the in-flight slash on the player. Its facing is locked at spawn, so a
        // mid-swing turn moves the player without whipping the slash to the other side.
        if (this.activeSlash) {
            this.activeSlash.x = this.player.x + this.activeSlash.reachOffset;
            this.activeSlash.y = this.player.y;
        }

        // --- Bullet Cleanup ---
        this.bullets.getChildren().forEach(bullet => {
            if (!this.cameras.main.worldView.contains(bullet.x, bullet.y)) {
                bullet.destroy();
            }
        });
    }

    // --- Player Actions ---
    fireBullet(pointer) {
        if (!pointer.leftButtonDown()) return;
        if (this.time.now < this.player.rangedAttackCooldown) return;
        this.player.rangedAttackCooldown = this.time.now + 250;
        let bullet = this.bullets.create(this.player.x, this.player.y, 'playerrangedattack');
        // Groups carry no render order of their own, so each bullet sets its own depth.
        bullet.setDepth(DEPTH.VFX);
        bullet.flipX = true
        bullet.play('playerrangedattack', true);
        bullet.setScale(0.9);
        bullet.setBodySize(10, 10);
        bullet.body.allowGravity = false;

        const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, pointer.worldX, pointer.worldY);
        bullet.setRotation(angle);
        bullet.fireAngle = angle;
        this.sound.play('playerrangedattacksound', { volume: 0.5 });
        this.physics.moveTo(bullet, pointer.worldX, pointer.worldY, 600);
    }

    playermeleeattack(pointer) {
        if (!pointer.rightButtonDown()) return;
        if (this.player.isAttacking) return;
        if (this.time.now < this.player.attackCooldown) return;
        this.player.attackCooldown = this.time.now + 350;
        this.player.isAttacking = true;
        this.player.meleeHasHit = false;
        this.player.meleeActive = false;

        // The slash is its own sprite layered over the player rather than a player
        // animation, so the player keeps running/idling underneath.
        const cfg = SLASH[this.player.slashdirection];
        this.player.slashdirection = cfg.next;

        const facingRight = this.player.direction === 'right';
        // Line the slash up with the damage zone, which update() parks at player.x +- 30.
        const offset = facingRight ? MELEE_REACH : -MELEE_REACH;
        const slash = this.add.sprite(this.player.x + offset, this.player.y, cfg.texture);
        // Flip only when the player's facing disagrees with how the sheet was drawn.
        slash.setFlipX(facingRight !== cfg.facesRight);
        slash.setDepth(DEPTH.SLASH);
        // Slashes bake to a 192px cell while the player renders ~96px tall.
        slash.setScale(SLASH_SCALE);
        slash.play(cfg.anim);

        // Damage window + attack teardown both hang off the slash: Phaser fires animation
        // events on whichever object is playing, and that object is this sprite.
        slash.on('animationupdate', (anim, frame) => {
            // frame.index is 1-based; the blade only extends from 0-based frame 4 on.
            this.player.meleeActive = frame.index >= MELEE_ACTIVE_FROM;
        });
        slash.once('animationcomplete', () => {
            this.player.isAttacking = false;
            this.player.meleeActive = false;
            slash.destroy();
            this.activeSlash = null;
        });

        // update() keeps it pinned to the player, who can still move mid-swing. Store the
        // side explicitly -- flipX no longer implies facing, since the two sheets were
        // drawn facing opposite ways.
        slash.reachOffset = offset;
        this.activeSlash = slash;
    }

    syncPlayerSize() {
        const frame = this.player.frame;
        if (!frame) return;
        const fw = frame.realWidth;
        const fh = frame.realHeight;
        this.player.setScale(PLAYER_DISPLAY_HEIGHT / fh);
        // Size the body from the frame HEIGHT (not width) so the world-space hitbox is
        // identical for every sheet -- fh cancels against the DISPLAY/fh scale. Using
        // width made narrower sheets' boxes thinner and offset vs the 192px ones, so
        // the box jumped sideways on each anim swap and shoved the player off edges.
        const animKey = this.player.anims.currentAnim?.key || 'playeridle';
        const config = PLAYER_HITBOX[animKey] || PLAYER_BODY;
        const bw = fh * config.w;
        const bh = fh * config.h;
        this.player.body.setSize(bw, bh, false);
        // Center horizontally in the frame, add per-animation offset.
        const xOffset = (fw - bw) / 2 + (fh * config.ox);
        const yOffset = fh * config.oy;
        this.player.body.setOffset(xOffset, yOffset);
    }

    // --- Enemy Actions ---
    onPlayerInHitbox(player, hitbox) {
        if (this.enemy.health <= 0) return;
        if (this.enemy.isAttacking) return;
        if (this.time.now < this.enemy.attackCooldown) return;
        this.enemy.attackCooldown = this.time.now + 2000;
        this.enemy.isAttacking = true;
        this.enemy.play('enemyattackstart');
        this.enemy.once('animationcomplete-enemyattackstart', () => {
            this.enemy.isAttacking = false;
            this.enemy.play('enemyattackloop');
            const drop = this.getDistanceToGround(this.enemy);
            this.tweens.add({
                targets: this.enemy,
                y: this.enemy.y + drop,
                duration: 250,
                yoyo: true,
                ease: 'Quad.easeIn',
                onComplete: () => {
                    this.enemy.play('enemyattackend');
                    this.enemy.once('animationcomplete-enemyattackend', () => {
                        this.enemy.play('enemyidle');
                    });
                }
            });
        });
    }

    // --- Combat & Damage ---
    hitEnemy(objA, objB) {
        const bullet = objA.texture.key === 'playerrangedattack' ? objA : objB;
        const enemy  = objA.texture.key === 'playerrangedattack' ? objB : objA;
        bullet.body.enable = false;
        bullet.setVelocity(0, 0);
        bullet.setRotation(bullet.fireAngle + Math.PI / 2);
        bullet.play('playerrangedattackexplosion');

        bullet.once('animationcomplete-playerrangedattackexplosion', () => {
            bullet.destroy();
        });

        this.damageEnemy(enemy, 5);
    }

    meleeHitEnemy(hitbox, enemy) {
        if (!this.player.meleeActive) return;
        if (this.player.meleeHasHit) return;
        this.player.meleeHasHit = true;
        this.damageEnemy(enemy, 10);
    }

    damageEnemy(enemy, amount) {
        if (enemy.health <= 0) return;
        enemy.health -= amount;
        if (enemy.health <= 0) {
            enemy.body.enable = false;
            enemy.play('enemydeath');
            enemy.once('animationcomplete-enemydeath', () => {
                enemy.destroy();
                this.scene.start('GameOver', { result: 'win' });
            });
        } else {
            enemy.setVelocity(0, 0);
            enemy.play('enemyhit');
            enemy.chain('enemyidle');
        }
    }

    damagePlayer(player, amount) {
        if (player.health <= 0) return;
        player.health -= amount;
        if (player.health <= 0) {
            player.body.enable = false;
            this.scene.start('GameOver', { result: 'lose' });
        } else {
            player.setVelocity(0, 0);
        }
    }

    destroyBulletOnPlatform(bullet) {
        if (bullet && bullet.active) {
            bullet.body.enable = false;
            bullet.setVelocity(0, 0);
            bullet.setRotation(bullet.fireAngle + Math.PI / 2);
            bullet.play('playerrangedattackexplosion');
            bullet.once('animationcomplete-playerrangedattackexplosion', () => {
                bullet.destroy();
            });
        }
    }

    // --- Utilities ---
    getDistanceToGround(sprite) {
        const layer = this.groundLayer;
        const tileH = this.map.tileHeight;
        const feetY = sprite.body.bottom;
        const x = sprite.x;

        for (let y = feetY; y < this.map.heightInPixels; y += tileH) {
            const tile = layer.getTileAtWorldXY(x, y);
            if (tile && tile.collides) {
                const groundTopY = layer.tileToWorldXY(tile.x, tile.y).y;
                return Math.max(0, groundTopY - feetY);
            }
        }
        return this.map.heightInPixels - feetY;
    }
}
