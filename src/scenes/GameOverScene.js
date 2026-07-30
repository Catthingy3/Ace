import { RES } from '../constants.js';

/**
 * GameOverScene
 * Shown when a level ends. Receives { result: 'win' | 'lose' } from the level.
 * Press SPACE to replay the level, or M to return to the menu.
 */
export class GameOverScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameOver' });
    }

    create(data) {
        const { width, height } = this.scale;
        const won = data?.result === 'win';
        // Canvas is RES x oversized (see constants.js); scale fonts by RES so the
        // text keeps the same apparent size while rendering at full sharpness.
        this.add.text(width / 2, height / 2 - 50 * RES, won ? 'LEVEL CLEAR' : 'GAME OVER', {
            fontFamily: 'Arial',
            fontSize: `${64 * RES}px`,
            color: won ? '#7CFC00' : '#ff4444'
        }).setOrigin(0.5);

        this.add.text(width / 2, height / 2 + 30 * RES, 'SPACE to retry   •   M for menu', {
            fontFamily: 'Arial',
            fontSize: `${22 * RES}px`,
            color: '#aaaaaa'
        }).setOrigin(0.5);

        this.input.keyboard.once('keydown-SPACE', () => this.scene.start('Level1'));
        this.input.keyboard.once('keydown-M', () => this.scene.start('Menu'));
    }
}
