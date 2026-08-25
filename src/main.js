import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { Level1Scene } from './scenes/Level1Scene.js';
import { GameOverScene } from './scenes/GameOverScene.js';
import { BASE_WIDTH, BASE_HEIGHT, RES } from './constants.js';

const config = {
    type: Phaser.AUTO,
    // Render at RES x the logical size for a crisp image on high-density displays.
    // Scale.FIT then shrinks this back down to fit the window (see constants.js).
    width: BASE_WIDTH * RES,
    height: BASE_HEIGHT * RES,
    physics: {
        default: 'arcade',
        arcade: {
            debug: false,
            // Step physics once per rendered frame using the real frame delta, instead of
            // Arcade's default fixed-step accumulator. The accumulator banks each frame's
            // delta and steps in fixed 16.67ms chunks; a scene restart spends ~100ms inside
            // create(), which gets banked and leaves the accumulator sitting on the step
            // boundary. Frame jitter then flips it between 0 and 2 steps per frame for the
            // rest of the run, so the player visibly stutters while fps stays at 60.
            // fixedStep:false zeroes the accumulator every frame (see phaser.js ~149177),
            // which makes render and physics phase-locked by construction. Trade-off:
            // physics becomes frame-rate dependent / non-deterministic. See CLAUDE.md.
            fixedStep: false
        }
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.Center.BOTH
    },
    // Scene order matters: the first scene (Boot) starts automatically.
    scene: [BootScene, MenuScene, Level1Scene, GameOverScene]
};

const game = new Phaser.Game(config);
// main.js is a module, so `game` is module-scoped and invisible to the devtools
// console. Exposing it makes scene/sound/physics state inspectable at runtime --
// e.g. game.scene.getScenes(true) or game.sound.sounds.length. Debug aid only;
// nothing in the game reads it.
window.game = game;
