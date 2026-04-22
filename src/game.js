import { LEVELS, TOTAL_GLIMMERS } from "./levels.js";

const GAME_WIDTH = 960;
const GAME_HEIGHT = 540;

const PHYSICS = {
  gravity: 1950,
  maxRun: 305,
  groundAccel: 2900,
  airAccel: 1900,
  groundDrag: 3200,
  airDrag: 720,
  jumpSpeed: 690,
  doubleJumpSpeed: 650,
  coyoteTime: 0.12,
  jumpBuffer: 0.14,
  maxFall: 930,
  stompBounce: 420,
};

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const dom = {
  startButton: document.getElementById("start-button"),
  pauseButton: document.getElementById("pause-button"),
  muteButton: document.getElementById("mute-button"),
  statusBanner: document.getElementById("status-banner"),
  levelName: document.getElementById("level-name"),
  score: document.getElementById("score"),
  glimmers: document.getElementById("glimmers"),
  hearts: document.getElementById("hearts"),
  timer: document.getElementById("timer"),
  touchButtons: document.querySelectorAll("[data-control]"),
  touchJoystick: document.getElementById("touch-joystick"),
  touchStickBase: document.getElementById("touch-stick-base"),
  touchStickKnob: document.getElementById("touch-stick-knob"),
};

const spritePaths = {
  playerIdle: "assets/sprites/pip-idle.svg",
  playerRunA: "assets/sprites/pip-run-a.svg",
  playerRunB: "assets/sprites/pip-run-b.svg",
  playerJump: "assets/sprites/pip-jump.svg",
  beetleA: "assets/sprites/beetle-a.svg",
  beetleB: "assets/sprites/beetle-b.svg",
  glimmer: "assets/sprites/glimmer.svg",
  goal: "assets/sprites/beacon-banner.svg",
};

const soundManifest = {
  menuSelect: { src: "assets/audio/menu-select.ogg", volume: 0.44 },
  start: { src: "assets/audio/start.ogg", volume: 0.6 },
  coin: { src: "assets/audio/coin.ogg", volume: 0.5 },
  jump: { src: "assets/audio/jump.ogg", volume: 0.55 },
  stomp: { src: "assets/audio/stomp.ogg", volume: 0.62 },
  land: { src: "assets/audio/land.ogg", volume: 0.42 },
  hurt: { src: "assets/audio/hurt.ogg", volume: 0.6 },
  win: { src: "assets/audio/win.ogg", volume: 0.64 },
};

const images = {};
const sounds = {};

const input = {
  left: false,
  right: false,
  jumpHeld: false,
  moveAxis: 0,
};

const triggers = {
  jumpPressed: false,
  start: false,
  pause: false,
  restart: false,
};

const state = {
  phase: "title",
  currentLevelIndex: 0,
  level: null,
  player: null,
  score: 0,
  totalCollected: 0,
  hearts: 3,
  timer: LEVELS[0].timeLimit,
  cameraX: 0,
  particles: [],
  ambientTime: 0,
  audioReady: false,
  mute: false,
  levelEntryScore: 0,
  levelEntryGlimmers: 0,
  respawnTimer: 0,
  activeStickPointerId: null,
};

preloadAssets();
bindEvents();
showTitleState();
updateHud();
updateButtons();
requestAnimationFrame(loop);

function preloadAssets() {
  for (const [key, src] of Object.entries(spritePaths)) {
    const image = new Image();
    image.src = src;
    images[key] = image;
  }

  for (const [key, def] of Object.entries(soundManifest)) {
    const audio = new Audio(def.src);
    audio.preload = "auto";
    audio.volume = def.volume;
    sounds[key] = audio;
  }
}

function bindEvents() {
  window.addEventListener("keydown", (event) => {
    registerInteraction();
    const key = event.key.toLowerCase();

    if (key === "arrowleft" || key === "a") input.left = true;
    if (key === "arrowright" || key === "d") input.right = true;
    if (key === " " || key === "arrowup" || key === "w") {
      if (!input.jumpHeld) triggers.jumpPressed = true;
      input.jumpHeld = true;
      event.preventDefault();
    }
    if ((key === "enter" || key === "return") && !event.repeat) {
      triggers.start = true;
      event.preventDefault();
    }
    if ((key === "escape" || key === "p") && !event.repeat) {
      triggers.pause = true;
      event.preventDefault();
    }
    if (key === "r" && !event.repeat) triggers.restart = true;
    if (key === "m" && !event.repeat) toggleMute();
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "arrowleft" || key === "a") input.left = false;
    if (key === "arrowright" || key === "d") input.right = false;
    if (key === " " || key === "arrowup" || key === "w") input.jumpHeld = false;
  });

  window.addEventListener("blur", () => {
    resetTouchState();
    if (state.phase === "playing") {
      state.phase = "paused";
      setStatus("Paused while the window is unfocused.");
      updateButtons();
    }
  });

  dom.startButton.addEventListener("click", () => {
    registerInteraction();
    handleStartOrContinue();
  });

  dom.pauseButton.addEventListener("click", () => {
    registerInteraction();
    togglePause();
  });

  dom.muteButton.addEventListener("click", () => {
    registerInteraction();
    toggleMute();
  });

  canvas.addEventListener("pointerdown", () => {
    registerInteraction();
    if (
      state.phase === "title" ||
      state.phase === "intermission" ||
      state.phase === "gameOver" ||
      state.phase === "victory"
    ) {
      handleStartOrContinue();
    }
    canvas.focus();
  });

  dom.touchButtons.forEach((button) => {
    const control = button.dataset.control;
    const press = (event) => {
      event.preventDefault();
      registerInteraction();
      if (control === "jump") {
        if (!input.jumpHeld) triggers.jumpPressed = true;
        input.jumpHeld = true;
      }
      if (control === "pause") togglePause();
    };

    const release = (event) => {
      event.preventDefault();
      if (control === "jump") input.jumpHeld = false;
    };

    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
  });

  if (dom.touchJoystick) {
    dom.touchJoystick.addEventListener("pointerdown", handleJoystickPointerDown);
    dom.touchJoystick.addEventListener("pointermove", handleJoystickPointerMove);
    dom.touchJoystick.addEventListener("pointerup", handleJoystickPointerEnd);
    dom.touchJoystick.addEventListener("pointercancel", handleJoystickPointerEnd);
    dom.touchJoystick.addEventListener("lostpointercapture", handleJoystickPointerEnd);
  }
}

function registerInteraction() {
  state.audioReady = true;
  canvas.focus();
}

function resetTouchState() {
  input.left = false;
  input.right = false;
  input.jumpHeld = false;
  input.moveAxis = 0;
  state.activeStickPointerId = null;
  updateJoystickVisual(0, 0);
}

function handleJoystickPointerDown(event) {
  event.preventDefault();
  registerInteraction();
  state.activeStickPointerId = event.pointerId;
  dom.touchJoystick.setPointerCapture(event.pointerId);
  updateJoystickFromPointer(event);
}

function handleJoystickPointerMove(event) {
  if (state.activeStickPointerId !== event.pointerId) return;
  event.preventDefault();
  updateJoystickFromPointer(event);
}

function handleJoystickPointerEnd(event) {
  if (state.activeStickPointerId !== event.pointerId) return;
  event.preventDefault();
  state.activeStickPointerId = null;
  input.moveAxis = 0;
  updateJoystickVisual(0, 0);
}

function updateJoystickFromPointer(event) {
  const bounds = dom.touchStickBase.getBoundingClientRect();
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const maxRadius = Math.max(22, Math.min(bounds.width, bounds.height) * 0.28);
  const rawX = event.clientX - centerX;
  const rawY = event.clientY - centerY;
  const distance = Math.hypot(rawX, rawY);
  const scale = distance > maxRadius ? maxRadius / distance : 1;
  const stickX = rawX * scale;
  const stickY = rawY * scale;

  input.moveAxis = clamp(stickX / maxRadius, -1, 1);
  updateJoystickVisual(stickX, stickY);
}

function updateJoystickVisual(x, y) {
  if (!dom.touchStickKnob) return;
  dom.touchStickKnob.style.transform = `translate(calc(-50% + ${Math.round(x)}px), calc(-50% + ${Math.round(y)}px))`;
}

function setStatus(message) {
  dom.statusBanner.textContent = message;
}

function updateButtons() {
  if (state.phase === "title") {
    dom.startButton.textContent = "Start Adventure";
  } else if (state.phase === "intermission") {
    dom.startButton.textContent = "Continue";
  } else if (state.phase === "paused") {
    dom.startButton.textContent = "Resume Adventure";
  } else if (state.phase === "victory" || state.phase === "gameOver") {
    dom.startButton.textContent = "Play Again";
  } else {
    dom.startButton.textContent = "Restart Adventure";
  }

  dom.pauseButton.textContent = state.phase === "paused" ? "Resume" : "Pause";
  dom.pauseButton.disabled = state.phase === "title" || state.phase === "intermission" || state.phase === "gameOver" || state.phase === "victory";
  dom.muteButton.textContent = state.mute ? "Sound: Off" : "Sound: On";
}

function updateHud() {
  const level = state.level ?? LEVELS[state.currentLevelIndex];
  dom.levelName.textContent = level.name;
  dom.score.textContent = formatScore(state.score);
  dom.glimmers.textContent = `${state.totalCollected} / ${TOTAL_GLIMMERS}`;
  dom.hearts.textContent = state.hearts > 0 ? "*".repeat(state.hearts) : "0";
  dom.timer.textContent = String(Math.max(0, Math.ceil(state.timer)));
}

function formatScore(value) {
  return String(Math.max(0, Math.floor(value))).padStart(6, "0");
}

function cloneLevel(def) {
  return {
    ...def,
    goal: { ...def.goal },
    platforms: def.platforms.map((platform) => ({
      ...platform,
      deltaX: 0,
      deltaY: 0,
    })),
    movingPlatforms: def.movingPlatforms.map((platform) => ({
      ...platform,
      baseX: platform.x,
      baseY: platform.y,
      deltaX: 0,
      deltaY: 0,
    })),
    collectibles: def.collectibles.map((collectible, index) => ({
      ...collectible,
      collected: false,
      hidden: Boolean(collectible.hidden),
      revealed: !collectible.hidden,
      phase: index * 0.8,
      value: collectible.value ?? 100,
    })),
    enemies: def.enemies.map((enemy, index) => ({
      ...enemy,
      dir: index % 2 === 0 ? 1 : -1,
      deadTimer: 0,
      removed: false,
      phase: index * 0.7,
    })),
    hazards: def.hazards.map((hazard) => ({ ...hazard })),
  };
}

function createPlayer(start) {
  return {
    x: start.x,
    y: start.y,
    w: 36,
    h: 44,
    vx: 0,
    vy: 0,
    prevX: start.x,
    prevY: start.y,
    facing: 1,
    grounded: false,
    onPlatform: null,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    airJumpsLeft: 1,
    invulnTimer: 0,
    animationTime: 0,
    landCooldown: 0,
  };
}

function showTitleState() {
  state.phase = "title";
  state.currentLevelIndex = 0;
  state.level = cloneLevel(LEVELS[0]);
  state.player = createPlayer(LEVELS[0].playerStart);
  state.timer = LEVELS[0].timeLimit;
  state.cameraX = 0;
  state.score = 0;
  state.totalCollected = 0;
  state.hearts = 3;
  state.particles = [];
  setStatus("Title screen ready. Press Start Adventure or hit Enter, then try the new double jump.");
  updateHud();
  updateButtons();
}

function startCampaign() {
  state.score = 0;
  state.totalCollected = 0;
  state.hearts = 3;
  loadLevel(0, {
    playCue: true,
    announce: "Sunpetal Path begins. Double-jump high and watch for hidden glimmer caches.",
  });
}

function loadLevel(index, { playCue = false, announce } = {}) {
  state.currentLevelIndex = index;
  const definition = LEVELS[index];
  state.level = cloneLevel(definition);
  state.player = createPlayer(definition.playerStart);
  state.timer = definition.timeLimit;
  state.cameraX = 0;
  state.particles = [];
  state.phase = "playing";
  state.levelEntryScore = state.score;
  state.levelEntryGlimmers = state.totalCollected;
  setStatus(announce ?? `Stage ${index + 1}: ${definition.name}`);
  updateHud();
  updateButtons();
  if (playCue) playSound("start");
}

function restartCurrentLevel(manual = false) {
  if (!state.level) return;
  state.score = state.levelEntryScore;
  state.totalCollected = state.levelEntryGlimmers;
  loadLevel(state.currentLevelIndex, {
    playCue: false,
    announce: manual
      ? `Stage restarted: ${LEVELS[state.currentLevelIndex].name}`
      : `Try again: ${LEVELS[state.currentLevelIndex].name}`,
  });
  if (manual) playSound("menuSelect", { volume: 0.85 });
}

function advanceLevel() {
  if (state.currentLevelIndex < LEVELS.length - 1) {
    loadLevel(state.currentLevelIndex + 1, {
      playCue: true,
      announce: `Stage ${state.currentLevelIndex + 2} begins. Chase the next beacon.`,
    });
    return;
  }

  state.phase = "victory";
  setStatus("All three beacons are burning. Press Play Again to run it back.");
  updateButtons();
  playSound("win");
}

function handleStartOrContinue() {
  if (state.phase === "title") {
    startCampaign();
    return;
  }

  if (state.phase === "paused") {
    state.phase = "playing";
    setStatus(`Back on the trail: ${state.level.name}`);
    updateButtons();
    playSound("menuSelect", { volume: 0.75 });
    return;
  }

  if (state.phase === "intermission") {
    advanceLevel();
    return;
  }

  if (state.phase === "gameOver" || state.phase === "victory") {
    startCampaign();
    return;
  }

  if (state.phase === "playing") {
    startCampaign();
  }
}

function togglePause() {
  if (state.phase === "playing") {
    state.phase = "paused";
    setStatus("Paused. Press Esc, P, or Resume when you're ready.");
    updateButtons();
    playSound("menuSelect", { volume: 0.75 });
    return;
  }

  if (state.phase === "paused") {
    state.phase = "playing";
    setStatus(`Back on the trail: ${state.level.name}`);
    updateButtons();
    playSound("menuSelect", { volume: 0.75 });
  }
}

function toggleMute() {
  state.mute = !state.mute;
  updateButtons();
  setStatus(state.mute ? "Sound muted." : "Sound unmuted.");
  if (!state.mute) playSound("menuSelect", { volume: 0.7 });
}

function playSound(name, options = {}) {
  if (state.mute || !state.audioReady) return;

  const base = sounds[name];
  if (!base) return;

  const node = base.cloneNode();
  const defaultVolume = soundManifest[name]?.volume ?? 1;
  node.volume = Math.min(1, defaultVolume * (options.volume ?? 1));
  node.playbackRate = options.rate ?? 1;
  node.play().catch(() => {});
}

function loop(now) {
  const dt = Math.min(0.033, (now - (loop.lastTime ?? now)) / 1000 || 0.016);
  loop.lastTime = now;

  update(dt);
  render();
  requestAnimationFrame(loop);
}

function update(dt) {
  state.ambientTime += dt;
  handleTriggers();

  if (state.phase === "playing") {
    updatePlaying(dt);
  } else if (state.phase === "respawning") {
    state.respawnTimer -= dt;
    if (state.respawnTimer <= 0) restartCurrentLevel(false);
  } else if (state.phase === "title") {
    updateAttractMode(dt);
  }

  updateParticles(dt);
  clearTriggers();
  updateHud();
}

function handleTriggers() {
  if (triggers.start) handleStartOrContinue();
  if (triggers.pause) togglePause();
  if (triggers.restart && (state.phase === "playing" || state.phase === "paused" || state.phase === "respawning")) {
    restartCurrentLevel(true);
  }
}

function clearTriggers() {
  triggers.jumpPressed = false;
  triggers.start = false;
  triggers.pause = false;
  triggers.restart = false;
}

function updateAttractMode(dt) {
  updateMovingPlatforms(dt);
  updateEnemies(dt, false);
  const width = Math.max(0, state.level.width - GAME_WIDTH);
  state.cameraX = width * (0.5 + 0.5 * Math.sin(state.ambientTime * 0.18));
  state.player.animationTime += dt * 2;
}

function updatePlaying(dt) {
  state.timer = Math.max(0, state.timer - dt);
  if (state.timer === 0) {
    damagePlayer("The beacon flames faded with the timer.");
    return;
  }

  updateMovingPlatforms(dt);
  updatePlayer(dt);
  if (state.phase !== "playing") return;

  updateEnemies(dt, true);
  if (state.phase !== "playing") return;

  updateCollectibles();
  updateGoal();
  updateCamera(dt);
}

function updateMovingPlatforms() {
  if (!state.level) return;

  for (const platform of state.level.movingPlatforms) {
    const previousX = platform.x;
    const previousY = platform.y;
    const wave = Math.sin(state.ambientTime * platform.speed + platform.phase) * platform.range;

    platform.x = platform.baseX + (platform.axis === "x" ? wave : 0);
    platform.y = platform.baseY + (platform.axis === "y" ? wave : 0);
    platform.deltaX = platform.x - previousX;
    platform.deltaY = platform.y - previousY;
  }
}

function updatePlayer(dt) {
  const player = state.player;
  const solids = getSolids();
  const wasGrounded = player.grounded;

  if (player.landCooldown > 0) player.landCooldown -= dt;
  if (player.invulnTimer > 0) player.invulnTimer -= dt;

  if (wasGrounded && player.onPlatform) {
    player.x += player.onPlatform.deltaX ?? 0;
    player.y += player.onPlatform.deltaY ?? 0;
  }

  if (triggers.jumpPressed) player.jumpBufferTimer = PHYSICS.jumpBuffer;
  else player.jumpBufferTimer = Math.max(0, player.jumpBufferTimer - dt);

  player.coyoteTimer = wasGrounded
    ? PHYSICS.coyoteTime
    : Math.max(0, player.coyoteTimer - dt);

  const buttonDirection = Number(input.right) - Number(input.left);
  const direction = buttonDirection !== 0 ? buttonDirection : input.moveAxis;
  if (direction !== 0) {
    player.facing = direction > 0 ? 1 : -1;
    const acceleration = wasGrounded ? PHYSICS.groundAccel : PHYSICS.airAccel;
    player.vx = moveTowards(player.vx, direction * PHYSICS.maxRun, acceleration * dt);
  } else {
    const drag = wasGrounded ? PHYSICS.groundDrag : PHYSICS.airDrag;
    player.vx = moveTowards(player.vx, 0, drag * dt);
  }

  if (player.jumpBufferTimer > 0 && player.coyoteTimer > 0) {
    performJump(player, "ground");
  } else if (triggers.jumpPressed && !wasGrounded && player.airJumpsLeft > 0) {
    performJump(player, "double");
  }

  if (!input.jumpHeld && player.vy < -210) {
    player.vy += 2100 * dt;
  }

  player.vy = Math.min(PHYSICS.maxFall, player.vy + PHYSICS.gravity * dt);
  player.animationTime += dt * (Math.abs(player.vx) > 70 ? 10 : 4);

  player.prevX = player.x;
  player.prevY = player.y;

  player.x += player.vx * dt;
  resolveHorizontal(player, solids);

  const landingSpeed = player.vy;
  player.y += player.vy * dt;
  player.grounded = false;
  player.onPlatform = null;
  resolveVertical(player, solids, landingSpeed, wasGrounded);

  if (player.x < 0) {
    player.x = 0;
    player.vx = 0;
  }

  if (player.x + player.w > state.level.width) {
    player.x = state.level.width - player.w;
    player.vx = 0;
  }

  if (player.y > GAME_HEIGHT + 160) {
    damagePlayer("Pip slipped into the ravine.");
    return;
  }

  const hitbox = {
    x: player.x + 6,
    y: player.y + 8,
    w: player.w - 12,
    h: player.h - 10,
  };

  for (const hazard of state.level.hazards) {
    if (rectsIntersect(hitbox, hazard)) {
      damagePlayer("The brambles bit back.");
      return;
    }
  }
}

function performJump(player, type) {
  const isDoubleJump = type === "double";
  player.vy = -(isDoubleJump ? PHYSICS.doubleJumpSpeed : PHYSICS.jumpSpeed);
  player.grounded = false;
  player.coyoteTimer = 0;
  player.jumpBufferTimer = 0;
  player.onPlatform = null;
  if (isDoubleJump) {
    player.airJumpsLeft = Math.max(0, player.airJumpsLeft - 1);
  }

  playSound("jump", { rate: isDoubleJump ? 1.14 : 1 });
  spawnBurst(player.x + player.w / 2, player.y + player.h, {
    colors: isDoubleJump
      ? ["#d5f4ff", "#fff1a0", "#88cde2"]
      : ["#fff0b2", "#b3d67f", "#9d7d5f"],
    count: isDoubleJump ? 8 : 6,
    speed: isDoubleJump ? 118 : 90,
    gravity: isDoubleJump ? 280 : 340,
    size: isDoubleJump ? 6 : 5,
  });
}

function resolveHorizontal(player, solids) {
  for (const solid of solids) {
    if (!rectsIntersect(player, solid)) continue;

    if (player.prevX + player.w <= solid.x + 4) {
      player.x = solid.x - player.w;
    } else if (player.prevX >= solid.x + solid.w - 4) {
      player.x = solid.x + solid.w;
    }

    player.vx = 0;
  }
}

function resolveVertical(player, solids, landingSpeed, wasGrounded) {
  for (const solid of solids) {
    if (!rectsIntersect(player, solid)) continue;

    const previousBottom = player.prevY + player.h;
    const previousTop = player.prevY;

    if (previousBottom <= solid.y + 8 && landingSpeed >= 0) {
      player.y = solid.y - player.h;
      player.vy = 0;
      player.grounded = true;
      player.onPlatform = solid;
      player.airJumpsLeft = 1;

      if (!wasGrounded) {
        spawnBurst(player.x + player.w / 2, player.y + player.h, {
          colors: ["#fff2c2", "#b0d48a", "#8f6b54"],
          count: 7,
          speed: 70,
          gravity: 320,
          size: 4,
        });

        if (landingSpeed > 320 && player.landCooldown <= 0) {
          playSound("land", { volume: 0.95 });
          player.landCooldown = 0.16;
        }
      }

      continue;
    }

    if (previousTop >= solid.y + solid.h - 8 && player.vy < 0) {
      player.y = solid.y + solid.h;
      player.vy = 70;
      continue;
    }

    if (player.x + player.w / 2 < solid.x + solid.w / 2) {
      player.x = solid.x - player.w;
    } else {
      player.x = solid.x + solid.w;
    }

    player.vx = 0;
  }
}

function updateEnemies(dt, collideWithPlayer) {
  const player = state.player;

  for (const enemy of state.level.enemies) {
    if (enemy.removed) continue;

    if (enemy.deadTimer > 0) {
      enemy.deadTimer -= dt;
      if (enemy.deadTimer <= 0) enemy.removed = true;
      continue;
    }

    enemy.x += enemy.speed * enemy.dir * dt;
    if (enemy.x <= enemy.minX) {
      enemy.x = enemy.minX;
      enemy.dir = 1;
    }

    if (enemy.x + enemy.w >= enemy.maxX) {
      enemy.x = enemy.maxX - enemy.w;
      enemy.dir = -1;
    }

    if (!collideWithPlayer || state.phase !== "playing") continue;
    if (!rectsIntersect(player, enemy)) continue;

    const stomped = player.vy > 120 && player.prevY + player.h <= enemy.y + 10;
    if (stomped) {
      enemy.deadTimer = 0.24;
      player.vy = -PHYSICS.stompBounce;
      player.grounded = false;
      player.onPlatform = null;
      player.airJumpsLeft = 1;
      state.score += 250;
      playSound("stomp");
      spawnBurst(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, {
        colors: ["#f7d56f", "#c8793e", "#7e4b28"],
        count: 10,
        speed: 120,
        gravity: 520,
        size: 5,
      });
    } else if (player.invulnTimer <= 0) {
      damagePlayer("A beetle clipped your boots.");
      return;
    }
  }
}

function updateCollectibles() {
  const player = state.player;
  const pickupHitbox = {
    x: player.x + 4,
    y: player.y + 4,
    w: player.w - 8,
    h: player.h - 8,
  };

  for (const collectible of state.level.collectibles) {
    if (collectible.collected) continue;

    const bob = Math.sin(state.ambientTime * 4 + collectible.phase) * 4;
    const centerY = collectible.y + bob;

    if (collectible.hidden && !collectible.revealed) {
      const closeEnough =
        Math.abs(player.x + player.w / 2 - collectible.x) < 82 &&
        Math.abs(player.y + player.h / 2 - centerY) < 72;

      if (closeEnough) {
        collectible.revealed = true;
        playSound("menuSelect", { volume: 0.72, rate: 1.08 });
        spawnBurst(collectible.x, centerY, {
          colors: ["#fff5b1", "#ffd973", "#b8f5f0"],
          count: 7,
          speed: 95,
          gravity: 280,
          size: 4,
        });
        setStatus("A hidden glimmer cache shimmered into view.");
      } else {
        continue;
      }
    }

    const bounds = {
      x: collectible.x - 14,
      y: centerY - 14,
      w: 28,
      h: 28,
    };

    if (rectsIntersect(pickupHitbox, bounds)) {
      collectible.collected = true;
      state.totalCollected += 1;
      state.score += collectible.value;
      playSound("coin", { rate: collectible.hidden ? 0.92 : 1 });
      spawnBurst(collectible.x, centerY, {
        colors: collectible.hidden
          ? ["#fff7c4", "#8de0e8", "#f3be57"]
          : ["#fff3a8", "#ffc94f", "#f28c2b"],
        count: 9,
        speed: 130,
        gravity: 420,
        size: 4,
      });

      if (collectible.hidden) {
        setStatus(`Hidden cache found. +${collectible.value} score.`);
      }
    }
  }
}

function updateGoal() {
  if (state.phase !== "playing") return;

  if (!rectsIntersect(state.player, state.level.goal)) return;

  const bonus = Math.max(0, Math.ceil(state.timer) * 10);
  state.score += bonus;
  playSound("win");

  if (state.currentLevelIndex === LEVELS.length - 1) {
    state.phase = "victory";
    setStatus(`All beacons lit. Final time bonus: ${bonus}. Press Play Again to replay.`);
  } else {
    state.phase = "intermission";
    setStatus(`Beacon rekindled. Time bonus: ${bonus}. Press Continue for the next climb.`);
  }

  updateButtons();
}

function updateCamera(dt) {
  const lead = state.player.facing > 0 ? 160 : 110;
  const target = clamp(
    state.player.x - GAME_WIDTH * 0.33 + lead + state.player.vx * 0.1,
    0,
    Math.max(0, state.level.width - GAME_WIDTH),
  );

  state.cameraX = moveTowards(state.cameraX, target, 820 * dt);
}

function damagePlayer(reason) {
  if (state.phase !== "playing") return;
  const player = state.player;
  if (player.invulnTimer > 0) return;

  player.invulnTimer = 0.9;
  state.hearts -= 1;
  playSound("hurt");
  spawnBurst(player.x + player.w / 2, player.y + player.h / 2, {
    colors: ["#ffe4bc", "#f0915d", "#b8493b"],
    count: 12,
    speed: 150,
    gravity: 560,
    size: 5,
  });

  if (state.hearts <= 0) {
    state.hearts = 0;
    state.phase = "gameOver";
    setStatus(`${reason} The trail goes dark. Press Play Again to retry.`);
    updateButtons();
    return;
  }

  state.phase = "respawning";
  state.respawnTimer = 0.85;
  setStatus(`${reason} Pip lost a mosslight. Stage resetting...`);
  updateButtons();
}

function updateParticles(dt) {
  state.particles = state.particles.filter((particle) => {
    particle.life -= dt;
    if (particle.life <= 0) return false;

    particle.vy += particle.gravity * dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    return true;
  });
}

function spawnBurst(x, y, options = {}) {
  const {
    colors = ["#ffffff"],
    count = 6,
    speed = 100,
    gravity = 420,
    size = 4,
  } = options;

  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count + Math.random() * 0.3;
    const velocity = speed * (0.5 + Math.random() * 0.75);
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity - speed * 0.25,
      gravity,
      size: size * (0.8 + Math.random() * 0.7),
      color: colors[index % colors.length],
      life: 0.35 + Math.random() * 0.18,
      maxLife: 0.48,
    });
  }
}

function getSolids() {
  return [...state.level.platforms, ...state.level.movingPlatforms];
}

function render() {
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  drawBackground();
  drawPlatforms();
  drawHazards();
  drawGoal();
  drawCollectibles();
  drawEnemies();
  drawPlayer();
  drawParticles();
  drawOverlay();
}

function drawBackground() {
  const theme = state.level.theme;
  const gradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  gradient.addColorStop(0, theme.skyTop);
  gradient.addColorStop(1, theme.skyBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = theme.haze;
  ctx.beginPath();
  ctx.arc(760, 96, 54, 0, Math.PI * 2);
  ctx.fill();

  drawClouds(theme.cloud, 0.12);
  drawHillBand(theme.farHill, 385, 88, 0.18, 160);
  drawHillBand(theme.midHill, 430, 112, 0.28, 220);
  drawHillBand(theme.nearHill, 476, 130, 0.42, 260);
  drawDistantTowers(theme.stoneFace, theme.stoneShadow);
}

function drawClouds(color, parallax) {
  ctx.fillStyle = color;
  const offset = (state.cameraX * parallax) % 260;

  for (let index = -1; index < 6; index += 1) {
    const x = index * 260 - offset;
    const y = 78 + (index % 3) * 36 + Math.sin(state.ambientTime * 0.55 + index) * 7;
    ctx.beginPath();
    ctx.arc(x + 34, y + 18, 22, 0, Math.PI * 2);
    ctx.arc(x + 62, y + 12, 28, 0, Math.PI * 2);
    ctx.arc(x + 98, y + 18, 20, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHillBand(color, baseY, height, parallax, step) {
  const offset = (state.cameraX * parallax) % step;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-step, GAME_HEIGHT);

  for (let index = -2; index < 10; index += 1) {
    const x = index * step - offset;
    const peakA = baseY - height * (0.45 + ((index + 3) % 3) * 0.13);
    const peakB = baseY - height * (0.7 - ((index + 2) % 4) * 0.08);
    ctx.quadraticCurveTo(x + step * 0.28, peakA, x + step * 0.52, baseY - height * 0.35);
    ctx.quadraticCurveTo(x + step * 0.78, peakB, x + step, baseY);
  }

  ctx.lineTo(GAME_WIDTH + step, GAME_HEIGHT);
  ctx.closePath();
  ctx.fill();
}

function drawDistantTowers(faceColor, shadowColor) {
  const offset = (state.cameraX * 0.24) % 340;

  for (let index = -1; index < 5; index += 1) {
    const x = index * 340 - offset + 28;
    const height = 150 + (index % 3) * 42;
    ctx.fillStyle = faceColor;
    ctx.fillRect(x, GAME_HEIGHT - 208 - height, 42, height);
    ctx.fillStyle = shadowColor;
    ctx.fillRect(x + 32, GAME_HEIGHT - 208 - height, 10, height);
    ctx.fillStyle = faceColor;
    ctx.beginPath();
    ctx.moveTo(x - 8, GAME_HEIGHT - 208 - height);
    ctx.lineTo(x + 21, GAME_HEIGHT - 238 - height);
    ctx.lineTo(x + 50, GAME_HEIGHT - 208 - height);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shadowColor;
  }
}

function drawPlatforms() {
  const solids = [...state.level.platforms, ...state.level.movingPlatforms];
  const theme = state.level.theme;

  for (const platform of solids) {
    const screenX = Math.round(platform.x - state.cameraX);
    if (screenX + platform.w < -60 || screenX > GAME_WIDTH + 60) continue;

    const isSecret = platform.style === "secret";
    const topHeight = platform.style === "ground" ? 15 : 10;
    const faceColor = isSecret ? shadeColor(theme.stoneFace, 22) : theme.stoneFace;
    const shadowColor = isSecret ? shadeColor(theme.stoneShadow, 12) : theme.stoneShadow;
    const topColor = isSecret ? shadeColor(theme.stoneTop, 16) : theme.stoneTop;

    ctx.fillStyle = faceColor;
    ctx.fillRect(screenX, platform.y + topHeight, platform.w, platform.h - topHeight);

    ctx.fillStyle = shadowColor;
    ctx.fillRect(screenX, platform.y + topHeight, platform.w, Math.max(4, platform.h - topHeight));

    for (let x = 0; x < platform.w; x += 24) {
      const width = Math.min(18, platform.w - x - 4);
      if (width <= 0) continue;
      ctx.fillStyle = x % 48 === 0 ? faceColor : shadeColor(theme.stoneFace, isSecret ? 8 : -8);
      ctx.fillRect(screenX + x + 3, platform.y + topHeight + 4, width, Math.max(6, platform.h - topHeight - 10));
    }

    ctx.fillStyle = topColor;
    ctx.fillRect(screenX, platform.y, platform.w, topHeight);

    for (let x = 0; x < platform.w; x += 14) {
      const bladeHeight = 4 + (x % 4);
      ctx.fillRect(screenX + x, platform.y - bladeHeight + 2, 6, bladeHeight);
    }

    if (isSecret) {
      ctx.fillStyle = "rgba(255, 244, 176, 0.38)";
      ctx.fillRect(screenX + 8, platform.y + platform.h - 5, platform.w - 16, 3);
      ctx.fillStyle = withAlpha(theme.flower, 0.7);
      for (let x = 10; x < platform.w - 10; x += 22) {
        ctx.fillRect(screenX + x, platform.y + 3, 4, 4);
      }
    }

    if (platform.style === "moving") {
      ctx.fillStyle = "rgba(255, 232, 153, 0.55)";
      ctx.fillRect(screenX + 6, platform.y + platform.h - 6, platform.w - 12, 4);
    }
  }
}

function drawHazards() {
  for (const hazard of state.level.hazards) {
    const x = Math.round(hazard.x - state.cameraX);
    if (x + hazard.w < -20 || x > GAME_WIDTH + 20) continue;

    ctx.fillStyle = "#8d3140";
    ctx.fillRect(x, hazard.y + 10, hazard.w, hazard.h - 10);

    ctx.fillStyle = "#d16a73";
    for (let spike = 0; spike < hazard.w; spike += 16) {
      ctx.beginPath();
      ctx.moveTo(x + spike, hazard.y + hazard.h);
      ctx.lineTo(x + spike + 8, hazard.y);
      ctx.lineTo(x + spike + 16, hazard.y + hazard.h);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawGoal() {
  const goal = state.level.goal;
  const x = Math.round(goal.x - state.cameraX);
  if (x + goal.w < -80 || x > GAME_WIDTH + 80) return;

  const glow = 18 + Math.sin(state.ambientTime * 5) * 4;
  ctx.fillStyle = "rgba(255, 240, 161, 0.36)";
  ctx.beginPath();
  ctx.arc(x + goal.w / 2, goal.y + 26, glow, 0, Math.PI * 2);
  ctx.fill();

  if (!drawSprite("goal", x - 6, goal.y - 32, 84, 188)) {
    ctx.fillStyle = "#6a4a35";
    ctx.fillRect(x + 14, goal.y, 8, goal.h);
    ctx.fillStyle = "#d04a3b";
    ctx.fillRect(x + 22, goal.y + 10, 28, 18);
  }
}

function drawCollectibles() {
  for (const collectible of state.level.collectibles) {
    if (collectible.collected) continue;

    const bob = Math.sin(state.ambientTime * 4 + collectible.phase) * 4;
    const x = collectible.x - state.cameraX;
    const y = collectible.y + bob;
    const shimmer = 0.9 + Math.abs(Math.sin(state.ambientTime * 8 + collectible.phase)) * 0.18;

    if (x < -30 || x > GAME_WIDTH + 30) continue;

    if (collectible.hidden && !collectible.revealed) {
      const twinkle = 0.14 + Math.abs(Math.sin(state.ambientTime * 9 + collectible.phase)) * 0.16;
      ctx.fillStyle = `rgba(255, 248, 215, ${twinkle})`;
      ctx.fillRect(x - 1, y - 6, 3, 12);
      ctx.fillRect(x - 6, y - 1, 12, 3);
      continue;
    }

    ctx.fillStyle = "rgba(255, 239, 166, 0.22)";
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fill();

    if (!drawSprite("glimmer", x - 16, y - 16, 32, 32, { scaleX: shimmer })) {
      ctx.fillStyle = "#f5b72f";
      ctx.beginPath();
      ctx.moveTo(x, y - 16);
      ctx.lineTo(x + 12, y);
      ctx.lineTo(x, y + 16);
      ctx.lineTo(x - 12, y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawEnemies() {
  for (const enemy of state.level.enemies) {
    if (enemy.removed) continue;

    const x = Math.round(enemy.x - state.cameraX);
    if (x + enemy.w < -40 || x > GAME_WIDTH + 40) continue;

    if (enemy.deadTimer > 0) {
      ctx.fillStyle = "#7e4b28";
      ctx.fillRect(x + 2, enemy.y + enemy.h - 8, enemy.w - 4, 8);
      continue;
    }

    const frame = Math.floor((state.ambientTime * 8 + enemy.phase) % 2) === 0 ? "beetleA" : "beetleB";
    if (!drawSprite(frame, x - 4, enemy.y - 6, 52, 40, { flip: enemy.dir < 0 })) {
      ctx.fillStyle = "#b76c34";
      ctx.fillRect(x, enemy.y, enemy.w, enemy.h);
    }
  }
}

function drawPlayer() {
  const player = state.player;
  if (!player) return;
  if (player.invulnTimer > 0 && Math.floor(state.ambientTime * 18) % 2 === 0 && state.phase === "playing") return;

  const x = Math.round(player.x - state.cameraX);
  const y = Math.round(player.y);

  let sprite = "playerIdle";
  if (!player.grounded) {
    sprite = "playerJump";
  } else if (Math.abs(player.vx) > 70) {
    sprite = Math.floor(player.animationTime) % 2 === 0 ? "playerRunA" : "playerRunB";
  }

  if (!drawSprite(sprite, x - 6, y - 4, 48, 48, { flip: player.facing < 0 })) {
    ctx.fillStyle = "#527238";
    ctx.fillRect(x, y, player.w, player.h);
  }
}

function drawParticles() {
  for (const particle of state.particles) {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.fillStyle = withAlpha(particle.color, alpha);
    ctx.fillRect(
      Math.round(particle.x - state.cameraX),
      Math.round(particle.y),
      particle.size,
      particle.size,
    );
  }
}

function drawOverlay() {
  if (state.phase === "playing") return;

  ctx.fillStyle = state.phase === "title" ? "rgba(12, 28, 20, 0.28)" : "rgba(10, 20, 16, 0.4)";
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  const titleByPhase = {
    title: "Mosslight Run",
    paused: "Paused",
    respawning: "Try Again",
    intermission: "Beacon Rekindled",
    gameOver: "Mosslights Out",
    victory: "All Beacons Lit",
  };

  const bodyByPhase = {
    title: "Sprint through three original retro stages, chain a midair second jump, and sniff out hidden glimmer caches.",
    paused: "Take a breath. Pip will hold the trail right here.",
    respawning: "The path resets, but your progress through the adventure stays alive.",
    intermission: "The next beacon waits beyond a harder climb.",
    gameOver: "The trail went dark. Start again and push farther into the hills.",
    victory: "Pip carried the light through every ruin. Press Play Again for another run.",
  };

  const footerByPhase = {
    title: "Press Start Adventure or Enter",
    paused: "Press Resume, Enter, Esc, or P",
    respawning: "Stage reset incoming...",
    intermission: "Press Continue or Enter",
    gameOver: "Press Play Again or Enter",
    victory: "Press Play Again or Enter",
  };

  drawPanel(160, 126, 640, 286);
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff8e0";
  ctx.font = state.phase === "title" ? "bold 54px Georgia" : "bold 46px Georgia";
  ctx.fillText(titleByPhase[state.phase], GAME_WIDTH / 2, 206);

  ctx.fillStyle = "#f3ead2";
  ctx.font = "22px Trebuchet MS";
  wrapText(bodyByPhase[state.phase], GAME_WIDTH / 2, 248, 460, 30);

  ctx.fillStyle = "#f8cf73";
  ctx.font = "bold 20px Georgia";
  ctx.fillText(footerByPhase[state.phase], GAME_WIDTH / 2, 348);
}

function drawPanel(x, y, w, h) {
  ctx.fillStyle = "rgba(15, 34, 24, 0.82)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(255, 233, 170, 0.55)";
  ctx.lineWidth = 4;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
}

function wrapText(text, centerX, startY, maxWidth, lineHeight) {
  const words = text.split(" ");
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);

  lines.forEach((line, index) => {
    ctx.fillText(line, centerX, startY + index * lineHeight);
  });
}

function drawSprite(name, x, y, width, height, options = {}) {
  const image = images[name];
  if (!image?.complete || image.naturalWidth === 0) return false;

  const {
    flip = false,
    alpha = 1,
    scaleX = 1,
    scaleY = 1,
  } = options;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(Math.round(x + width / 2), Math.round(y + height / 2));
  ctx.scale(flip ? -scaleX : scaleX, scaleY);
  ctx.drawImage(image, Math.round(-width / 2), Math.round(-height / 2), width, height);
  ctx.restore();
  return true;
}

function rectsIntersect(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function moveTowards(value, target, amount) {
  if (value < target) return Math.min(target, value + amount);
  if (value > target) return Math.max(target, value - amount);
  return target;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function shadeColor(hex, delta) {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = clamp(((value >> 16) & 0xff) + delta, 0, 255);
  const g = clamp(((value >> 8) & 0xff) + delta, 0, 255);
  const b = clamp((value & 0xff) + delta, 0, 255);
  return `rgb(${r}, ${g}, ${b})`;
}

function withAlpha(color, alpha) {
  if (color.startsWith("#")) {
    const value = Number.parseInt(color.slice(1), 16);
    const r = (value >> 16) & 0xff;
    const g = (value >> 8) & 0xff;
    const b = value & 0xff;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return color;
}
