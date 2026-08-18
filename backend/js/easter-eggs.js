let easterActive = localStorage.getItem("nova_easter") === "true";
  const easterBtn = document.createElement("button");
  easterBtn.className = "icon-btn"; easterBtn.title = "Toggle background"; easterBtn.innerHTML = '<i class="fa-solid fa-image"></i>'; easterBtn.style.display = easterActive ? "block" : "none";
  headerBtns.prepend(easterBtn);
  
  function applyEaster() {
    if (easterActive) {
      document.body.style.setProperty('background', "url('https://images.pexels.com/photos/31265958/pexels-photo-31265958.jpeg') center/cover fixed", "important");
    } else {
      document.body.style.removeProperty('background');
    }
  }
  
  function toggleEaster() { easterActive = !easterActive; localStorage.setItem("nova_easter", easterActive); applyEaster(); easterBtn.style.display = "block"; }
  applyEaster();
  easterBtn.addEventListener("click", toggleEaster);

// Easter egg — star cursor
let starCursorActive = localStorage.getItem("nova_star") === "true";
let starDiscovered = localStorage.getItem("nova_star_discovered") === "true";
let starClicks = 0;

// Standard 32x32 Star SVG
const starSVG = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 576 512'><path fill='#FFD700' d='M316.9 18C311.6 7 300.4 0 288 0s-23.6 7-28.9 18L182.7 170 10.5 195.1c-12.4 1.8-22.3 10.7-25.2 22.8s1.4 24.7 11 33.1L121 371.1 91.7 502.3c-2.1 12.3 2.9 24.7 12.9 31.8s23 7.3 33.5 1.7L288 458.1l150 78.8c10.5 5.5 23.5 5.4 33.5-.7s15-19.5 12.9-31.8L455 371.1l124.7-120.2c9.6-8.4 13.9-21 11-33.1s-12.8-21-25.2-22.8L393.3 170 316.9 18z'/></svg>`;

// Half-size 16x16 Star SVG (For interactive elements)
const starHoverSVG = `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 576 512'><path fill='#FFD700' d='M316.9 18C311.6 7 300.4 0 288 0s-23.6 7-28.9 18L182.7 170 10.5 195.1c-12.4 1.8-22.3 10.7-25.2 22.8s1.4 24.7 11 33.1L121 371.1 91.7 502.3c-2.1 12.3 2.9 24.7 12.9 31.8s23 7.3 33.5 1.7L288 458.1l150 78.8c10.5 5.5 23.5 5.4 33.5-.7s15-19.5 12.9-31.8L455 371.1l124.7-120.2c9.6-8.4 13.9-21 11-33.1s-12.8-21-25.2-22.8L393.3 170 316.9 18z'/></svg>`;

const starCursorURL = `url("data:image/svg+xml,${encodeURIComponent(starSVG)}") 16 16, auto`;
const starCursorHoverURL = `url("data:image/svg+xml,${encodeURIComponent(starHoverSVG)}") 8 8, pointer`;

// Dynamic stylesheet to manage cursor state globally
const starStyle = document.createElement("style");
starStyle.id = "star-cursor-styles";
document.head.appendChild(starStyle);

// Check if the device is a touchscreen / mobile device
const isMobileDevice = window.matchMedia("(pointer: coarse)").matches;

// Create Star Toggle Button
const starBtn = document.createElement("button");
starBtn.className = "icon-btn"; 
starBtn.title = "Toggle star cursor"; 
starBtn.innerHTML = '<i class="fa-solid fa-star"></i>'; 

// Only display on desktop AND if the star cursor has ever been discovered
starBtn.style.display = (starDiscovered && !isMobileDevice) ? "block" : "none";

// SAFELY attach button to header container if present
if (typeof headerBtns !== "undefined" && headerBtns) {
  headerBtns.prepend(starBtn);
}

function applyStarCursor() { 
  if (starCursorActive) {
    starStyle.innerHTML = `
      /* Only target desktop pointer devices */
      @media (pointer: fine) {
        /* Base cursor for everything */
        body, body * { 
          cursor: ${starCursorURL} !important; 
        }
        /* Hover cursor for clickable elements AND all their inner child tags */
        body a, body a *,
        body button, body button *,
        body input, body select, body textarea,
        body [role="button"], body [role="button"] *,
        body .icon-btn, body .icon-btn * { 
          cursor: ${starCursorHoverURL} !important; 
        }
      }
    `;
  } else {
    starStyle.innerHTML = "";
  }
}

function toggleStarCursor() { 
  starCursorActive = !starCursorActive; 
  localStorage.setItem("nova_star", starCursorActive); 
  applyStarCursor(); 

  // First time it's toggled, mark it as discovered so the button never hides again
  if (!starDiscovered) {
    starDiscovered = true;
    localStorage.setItem("nova_star_discovered", "true");
  }

  // Once discovered, the button stays visible on desktop regardless of on/off state
  starBtn.style.display = !isMobileDevice ? "block" : "none"; 
  
  showToast(
    starCursorActive 
      ? '<span class="toast-star"><i class="fa-solid fa-star"></i> Star cursor enabled!</span>' 
      : '<span class="toast-star"><i class="fa-solid fa-star"></i> Star cursor disabled!</span>'
  ); 
}

applyStarCursor();
starBtn.addEventListener("click", toggleStarCursor);

// SAFELY attach click listener to header title if present
if (typeof headerTitle !== "undefined" && headerTitle) {
  headerTitle.addEventListener("click", () => { 
    starClicks++; 
    if (starClicks >= 8) { 
      starClicks = 0; 
      toggleStarCursor(); 
    } else {
      showToast(`${8 - starClicks} more click${8 - starClicks !== 1 ? "s" : ""}...`);
    }
  });
}

  // Easter egg — dino game
  let dinoUnlocked = localStorage.getItem("nova_dino") === "true";
  const dinoBtn = document.createElement("button");
  dinoBtn.className = "icon-btn"; dinoBtn.title = "Play Dino Game"; dinoBtn.innerHTML = '<img src="images/dino.png" alt="Dino game">'; dinoBtn.style.display = dinoUnlocked ? "block" : "none";
  headerBtns.prepend(dinoBtn);
  function toggleDino() { window.open("/trex/index.html", "_blank"); }
  dinoBtn.addEventListener("click", toggleDino);

  // Easter egg — PAC-MAN GAME (NEW)
  let pacmanUnlocked = localStorage.getItem("nova_pacman") === "true";
  const pacmanBtn = document.createElement("button");
  pacmanBtn.className = "icon-btn"; pacmanBtn.title = "Play Pac-Man Game"; pacmanBtn.innerHTML = '<img src="images/pacman.png" alt="Pac-Man game">'; pacmanBtn.style.display = pacmanUnlocked ? "block" : "none";
  headerBtns.prepend(pacmanBtn);
  function togglePacman() { window.open("/pacman/index.html", "_blank"); }
  pacmanBtn.addEventListener("click", togglePacman);

  // Input easter egg detection
 input.addEventListener("input", () => {
  const val = input.value.trim().toLowerCase();

  if (val === "jymer1102") { 
    input.value = ""; 
    toggleEaster(); 
    showToast(easterActive ? 'Easter egg unlocked! <i class="fa-solid fa-lock-open"></i>' : "Background off!"); 
  }

  if (val === "dinosaur" || val === "trex" || val === "t-rex") { 
    input.value = ""; 
    if (!dinoUnlocked) { 
      dinoUnlocked = true; 
      localStorage.setItem("nova_dino","true"); 
      dinoBtn.style.display = "block"; 
      showToast("🦖 Dino game unlocked! Click the T-Rex button anytime to play!"); 
    } 
  }

  if (val === "pac-man" || val === "pacman") { 
    input.value = ""; 
    if (!pacmanUnlocked) { 
      pacmanUnlocked = true; 
      localStorage.setItem("nova_pacman","true"); 
      pacmanBtn.style.display = "block"; 
      showToast('<i class="fa-solid fa-ghost"></i> Pac-Man game unlocked! Click the Pac-Man button anytime to play!'); 
    } 
  }

  if (val === "allahu akbar") { 
    input.value = ""; 
    triggerBackpackEgg(); 
  }
});

  // Easter egg — spinning backpack that bursts into stars
  function triggerBackpackEgg() {
    const overlay = document.getElementById("backpack-egg-overlay");
    const wrap = document.getElementById("backpack-egg-wrap");
    const label = document.getElementById("backpack-egg-label");
    overlay.classList.add("active");
    wrap.classList.remove("spinning");
    void wrap.offsetWidth;
    wrap.classList.add("spinning");
    setTimeout(() => label.classList.add("visible"), 600);
    setTimeout(() => {
      overlay.classList.remove("active");
      wrap.classList.remove("spinning");
      label.classList.remove("visible");
      burstBackpackStars();
    }, 1900);
  }

  let backpackParticles = [];
  let backpackAnimId = null;
  const backpackCanvas = document.getElementById("backpack-egg-canvas");
  const backpackCtx = backpackCanvas.getContext("2d");
  backpackCanvas.width = window.innerWidth;
  backpackCanvas.height = window.innerHeight;
  window.addEventListener("resize", () => {
    backpackCanvas.width = window.innerWidth;
    backpackCanvas.height = window.innerHeight;
  });

  function burstBackpackStars() {
    backpackParticles = [];
    cancelAnimationFrame(backpackAnimId);
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    for (let i = 0; i < 80; i++) {
      const angle = (Math.PI * 2 / 80) * i + (Math.random() - 0.5) * 0.4;
      const speed = 4 + Math.random() * 14;
      backpackParticles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - Math.random() * 6,
        size: 14 + Math.random() * 28,
        alpha: 1,
        gravity: 0.25 + Math.random() * 0.2,
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.3,
        color: Math.random() < 0.5 ? "#FFD700" : "#FFA500",
      });
    }
    animateBackpackStars();
  }

  function animateBackpackStars() {
    backpackCtx.clearRect(0, 0, backpackCanvas.width, backpackCanvas.height);
    backpackParticles = backpackParticles.filter(p => p.alpha > 0.02);
    for (const p of backpackParticles) {
      p.x += p.vx; p.y += p.vy;
      p.vy += p.gravity; p.vx *= 0.98;
      p.alpha -= 0.018; p.rot += p.rotV;
      backpackCtx.save();
      backpackCtx.globalAlpha = Math.max(0, p.alpha);
      backpackCtx.translate(p.x, p.y);
      backpackCtx.rotate(p.rot);
      backpackCtx.font = `900 ${p.size}px "Font Awesome 6 Free"`;
      backpackCtx.textAlign = "center";
      backpackCtx.textBaseline = "middle";
      backpackCtx.fillStyle = p.color;
      backpackCtx.fillText("\ue4dc", 0, 0);
      backpackCtx.restore();
    }
    if (backpackParticles.length > 0) backpackAnimId = requestAnimationFrame(animateBackpackStars);
    else backpackCtx.clearRect(0, 0, backpackCanvas.width, backpackCanvas.height);
  }
