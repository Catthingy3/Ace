import { RES } from '../constants.js';

/**
 * MenuScene
 * Simple title screen. Press SPACE (or click) to start Level 1.
 */
export class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'Menu' });
    }

    create() {
        const { width, height } = this.scale;
        // Canvas is RES x oversized (see constants.js); scale fonts by RES so the
        // text keeps the same apparent size while rendering at full sharpness.
        this.add.text(width / 2, height / 2 - 60 * RES, 'ACE', {
            fontFamily: 'Arial',
            fontSize: `${72 * RES}px`,
            color: '#ffffff'
        }).setOrigin(0.5);

        this.add.text(width / 2, height / 2 + 30 * RES, 'Press SPACE to start', {
            fontFamily: 'Arial',
            fontSize: `${24 * RES}px`,
            color: '#aaaaaa'
        }).setOrigin(0.5);
        
        
        this.titlemusic = this.sound.add('Titletheme', { loop: true });
        this.titlemusic.play();
        this.titlemusic.setVolume(1.0);
        // Stop the title theme on shutdown so it doesn't overlap the level's music.
        this.events.once('shutdown', () => this.titlemusic.stop());
        const start = () => this.scene.start('Level1');
        this.input.keyboard.once('keydown-SPACE', start);
        this.input.once( 'pointerdown', start);
    }
}
