// Essential T-Rex Engine Logic
(function() {
  'use strict';
  function Runner(containerSelector, opt_config) {
    if (Runner.instance_) { return Runner.instance_; }
    Runner.instance_ = this;
    this.outerContainerEl = document.querySelector(containerSelector);
    this.containerEl = null;
    this.config = opt_config || Runner.config;
    this.dimensions = Runner.defaultDimensions;
    this.canvas = null;
    this.ctx = null;
    this.tRex = null;
    this.distanceMeter = null;
    this.distanceRan = 0;
    this.accumulatedDistance = 0;
    this.highestScore = 0;
    this.time = 0;
    this.runningTime = 0;
    this.msPerFrame = 1000 / 60;
    this.currentSpeed = this.config.SPEED;
    this.obstacles = [];
    this.activated = false;
    this.playing = false;
    this.crashed = false;
    this.paused = false;
    this.images = {};
    this.imagesLoaded = 0;
    this.loadImages();
  }
  window['Runner'] = Runner;

  Runner.config = {
    ACCELERATION: 0.001,
    BG_CLOUD_SPEED: 0.2,
    BOTTOM_PAD: 10,
    CLEAR_TIME: 3000,
    CLOUD_FREQUENCY: 0.5,
    GAMEOVER_CLEAR_TIME: 750,
    GAP_COEFFICIENT: 0.6,
    GRAVITY: 0.6,
    INITIAL_JUMP_VELOCITY: 12,
    MAX_CLOUDS: 6,
    MAX_OBSTACLE_LENGTH: 3,
    MAX_SPEED: 13,
    MIN_JUMP_HEIGHT: 35,
    MOBILE_SPEED_COEFFICIENT: 1.2,
    RESOURCE_TEMPLATE_ID: 'offline-resources',
    SPEED: 6,
    SPEED_DROP_COEFFICIENT: 3
  };

  Runner.defaultDimensions = { WIDTH: 600, HEIGHT: 150 };

  Runner.prototype = {
    loadImages: function() {
      this.images.sprite = document.getElementById('offline-resources-1x');
      this.init();
    },
    init: function() {
      this.containerEl = document.createElement('div');
      this.containerEl.className = 'runner-container';
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'runner-canvas';
      this.canvas.width = this.dimensions.WIDTH;
      this.canvas.height = this.dimensions.HEIGHT;
      this.containerEl.appendChild(this.canvas);
      this.outerContainerEl.appendChild(this.containerEl);
      this.ctx = this.canvas.getContext('2d');
      this.update();
      this.addEventListeners();
    },
    addEventListeners: function() {
      window.addEventListener('keydown', this.onKeyDown.bind(this));
    },
    onKeyDown: function(e) {
      if (!this.playing && (e.code === 'Space' || e.code === 'ArrowUp')) {
        this.playing = true;
        this.update();
      }
    },
    update: function() {
      this.ctx.clearRect(0, 0, this.dimensions.WIDTH, this.dimensions.HEIGHT);
      if (this.playing) {
        // Draw T-Rex (Simple version)
        this.ctx.drawImage(this.images.sprite, 76, 2, 44, 47, 20, 100, 44, 47);
        this.distanceRan += 1;
        this.ctx.fillText("Score: " + Math.floor(this.distanceRan / 10), 530, 20);
        window.requestAnimationFrame(this.update.bind(this));
      } else {
        this.ctx.fillText("PRESS SPACE TO PLAY", 240, 75);
      }
    }
  };
})();
