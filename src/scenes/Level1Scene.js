import { RES } from '../constants.js';

const DEBUG_VERSION = '1.1';

// Every player animation renders at this on-screen height (world px), regardless
// of its sheet's resolution (run is baked at 192px, idle/melee are 64px). The
// physics body is expressed as fractions of the current frame so it stays a
// constant world-space size across those different-resolution sheets. Fractions
// are taken from the original 64px tuning: setSize(25,55) / setOffset(22,6).
const PLAYER_DISPLAY_HEIGHT = 96;
const PLAYER_BODY = { w: 25 / 64, h: 55 / 64, ox: 22 / 64, oy: 6 / 64 };

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
        this.player.play('playeridle');
        this.player.on('animationstart', () => this.syncPlayerSize());
        this.syncPlayerSize();
        // Camera can only follow the player once it exists.
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

        this.player.attackCooldown = 0;
        this.player.rangedAttackCooldown = 0;
        this.player.isAttacking = false;
        this.player.direction = 'right';
        this.player.meleeActive = false;
        this.player.health = 3;
        this.player.setCollideWorldBounds(true);

        this.player.on('animationupdate', (anim, frame) => {
            if (anim.key !== 'playermelee') return;
            this.player.meleeActive = frame.index === 2 || frame.index === 4;
        });

        this.playermeleeattackhitbox = this.add.zone(this.player.x, this.player.y, 32, 50);
        this.physics.add.existing(this.playermeleeattackhitbox);
        this.playermeleeattackhitbox.body.setAllowGravity(false);
        this.physics.add.collider(this.player, groundLayer);

        // --- Enemy Setup ---
        this.enemy = this.physics.add.sprite(750, 150, 'enemyidle');
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
        this.debugVersionText = this.add.text(10, 10, `v${DEBUG_VERSION}`, {
            fontSize: '16px',
            fill: '#00ff00',
            fontFamily: 'monospace'
        });
        this.debugVersionText.setScrollFactor(0);
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

        // --- Player Movement (velocity + facing only) ---
        let moving = false;
        if (this.wasd.right.isDown) {
            this.player.direction = 'right';
            this.player.setVelocityX(200);
            if (!this.player.isAttacking) this.player.flipX = true;
            moving = true;
        } else if (this.wasd.left.isDown) {
            this.player.direction = 'left';
            this.player.setVelocityX(-200);
            if (!this.player.isAttacking) this.player.flipX = false;
            moving = true;
        } else {
            this.player.setVelocityX(0);
        }

        // --- Jumping ---
        if (this.wasd.up.isDown && onGround) {
            this.player.setVelocityY(-500);
        }

        // --- Animation: melee > fall > run > idle ---
        if (!this.player.isAttacking) {
            if (!onGround && this.player.body.velocity.y > 0) {
                this.player.play('playerfall', true);
            } else if (onGround && moving) {
                this.player.play('playerrun', true);
            } else if (onGround && !moving) {
                this.player.play('playeridle', true);
            }
        }

        // --- Melee Hitbox Positioning ---
        const meleeOffset = this.player.direction === 'right' ? 30 : -30;
        this.playermeleeattackhitbox.x = this.player.x + meleeOffset;
        this.playermeleeattackhitbox.y = this.player.y;

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
        bullet.setScale(0.3);
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
        // The Sword.png sheet faces the opposite default direction from the
        // run/idle sheets, so the flip is intentionally inverted relative to
        // movement: facing right needs flipX = false here (it's true in update()).
        if (this.player.direction === 'right') {
            this.player.flipX = false;
        } else {
            this.player.flipX = true;
        }
        this.player.play('playermelee');
        this.player.once('animationcomplete-playermelee', () => {
            this.player.isAttacking = false;
            this.player.meleeActive = false;
            this.player.flipX = this.player.direction === 'right';
        });
    }

    syncPlayerSize() {
        const frame = this.player.frame;
        if (!frame) return;
        const fw = frame.realWidth;
        const fh = frame.realHeight;
        this.player.setScale(PLAYER_DISPLAY_HEIGHT / fh);
        this.player.body.setSize(fw * PLAYER_BODY.w, fh * PLAYER_BODY.h, false);
        this.player.body.setOffset(fw * PLAYER_BODY.ox, fh * PLAYER_BODY.oy);
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
