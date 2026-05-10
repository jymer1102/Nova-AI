(function() {
    'use strict';
    // --- CORE RUNNER ---
    function Runner(containerSelector) {
        this.outerContainerEl = document.querySelector(containerSelector);
        this.config = { SPEED: 6, GRAVITY: 0.6, SPAWN_RATE: 0.02 };
        this.dimensions = { WIDTH: 600, HEIGHT: 150 };
        this.canvas = null;
        this.ctx = null;
        this.tRex = { x: 50, y: 100, v: 0, jumping: false };
        this.obstacles = [];
        this.playing = false;
        this.score = 0;
        this.sprite = document.getElementById('offline-resources-1x');
        this.init();
    }

    Runner.prototype.init = function() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.dimensions.WIDTH;
        this.canvas.height = this.dimensions.HEIGHT;
        this.outerContainerEl.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                if (!this.playing) this.playing = true;
                if (!this.tRex.jumping) {
                    this.tRex.v = -10;
                    this.tRex.jumping = true;
                }
            }
        });
        this.update();
    };

    Runner.prototype.update = function() {
        this.ctx.clearRect(0, 0, this.dimensions.WIDTH, this.dimensions.HEIGHT);
        
        if (this.playing) {
            // Physics
            this.tRex.y += this.tRex.v;
            this.tRex.v += this.config.GRAVITY;
            if (this.tRex.y > 100) {
                this.tRex.y = 100;
                this.tRex.jumping = false;
            }

            // Spawn Obstacles
            if (Math.random() < this.config.SPAWN_RATE) {
                this.obstacles.push({ x: 600, w: 20, h: 40 });
            }

            // Move Obstacles
            for (let i = this.obstacles.length - 1; i >= 0; i--) {
                this.obstacles[i].x -= this.config.SPEED;
                // Collision check
                if (this.obstacles[i].x < this.tRex.x + 20 && this.obstacles[i].x + 20 > this.tRex.x && this.tRex.y > 80) {
                   this.playing = false; // Game Over
                }
                if (this.obstacles[i].x < -20) this.obstacles.splice(i, 1);
            }
            this.score++;
        }

        // DRAWING
        this.ctx.fillStyle = '#535353';
        // Draw T-Rex (Using sprite if loaded, else a box)
        if (this.sprite.complete) {
            this.ctx.drawImage(this.sprite, 848, 2, 44, 47, this.tRex.x, this.tRex.y, 44, 47);
        } else {
            this.ctx.fillRect(this.tRex.x, this.tRex.y, 40, 40);
        }
        
        // Draw Obstacles
        for (let obs of this.obstacles) {
            this.ctx.fillRect(obs.x, 110, 20, 30);
        }

        this.ctx.fillText("Score: " + this.score, 500, 20);
        if (!this.playing) this.ctx.fillText("PRESS SPACE TO START", 250, 75);

        window.requestAnimationFrame(this.update.bind(this));
    };

    document.addEventListener('DOMContentLoaded', () => new Runner('.interstitial-wrapper'));
})();
