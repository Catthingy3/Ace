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
            debug: false
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
