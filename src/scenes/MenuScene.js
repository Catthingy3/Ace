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
        
        
        this.titlemusic = this.sound.add('Titletheme', { loop: true, volume: 1.0 });
        // Stop the title theme on shutdown so it doesn't overlap the level's music.
        this.events.once('shutdown', () => this.titlemusic.stop());

        const start = () => this.scene.start('Level1');
        const armStart = () => {
            this.input.keyboard.once('keydown-SPACE', start);
            this.input.once('pointerdown', start);
        };

        // Browsers start the WebAudio context suspended until a user gesture.
        // Phaser's global unlock listener (on document.body) resumes it, but
        // resume() is async -- if the SAME gesture is also wired to start()
        // here, scene.start('Level1') fires (and stops titlemusic via the
        // shutdown handler above) before the resume promise ever resolves, so
        // the music is killed before it's audible. Make the first gesture
        // unlock-and-play only; wire up the level-start handlers afterward so
        // it takes a second press/click to actually leave the menu.
        if (this.sound.locked) {
            this.sound.once('unlocked', () => {
                this.titlemusic.play();
                armStart();
            });
        } else {
            this.titlemusic.play();
            armStart();
        }
    }
}
