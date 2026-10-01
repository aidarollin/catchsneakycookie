(() => {
  "use strict";

  const ROUND_SECONDS = 30;
  const GIFT_THRESHOLD = 50;
  const LUCKY_PRIZES = [
    { name: "RM20 Voucher", weight: 30 },
    { name: "RM10 Voucher", weight: 30 },
    { name: "FREE 1 CLASSIC COOKIE", weight: 20 },
    { name: "FREE 1 SNEAKY DROP", weight: 20 }
  ];
  const giftDialog = document.querySelector("#gift-dialog");
  const giftOpen = document.querySelector("#gift-open");
  document.querySelector("#gift-close").addEventListener("click", () => giftDialog.close());
  giftOpen.addEventListener("click", () => {
    if (giftOpen.disabled) return;
    giftOpen.disabled = true;
    giftOpen.classList.add("is-open");
    playSound("special");
    giftOpen.setAttribute("aria-label", "Opened gift");
    const total = LUCKY_PRIZES.reduce((sum, prize) => sum + prize.weight, 0);
    if (total <= 0) {
      return;
    }
    let draw = Math.random() * total;
    const prize = LUCKY_PRIZES.find((entry) => (draw -= entry.weight) < 0);
    document.querySelector("#gift-prize").textContent = prize.name;
    reportPrize(prize.name);
  });
  // Leave blank to keep the in-game cookie shelf. Add a verified shop URL later to make the result CTA external.
  const COOKIE_SHOP_URL = "";
  // Google Apps Script web app URL (see backend/SETUP.md). Leave blank to play without saving players.
  // The one-play-per-phone switch lives in the sheet's Settings tab, not here.
  const PLAYER_API_URL = "https://script.google.com/macros/s/AKfycbwm6d3_SQ-e3_1pt_DFeyDHuo1KancwWuG0O8VPFm-1uZ9FkQMxr5QhMSmNFE_vYA1C/exec";

  const CATS = [
    { id: "tam", name: "Tam", label: "black cat", source: "assets/cats/tam.svg", spriteX: "0%", spriteY: "0%" },
    { id: "abu", name: "Abu", label: "orange and brown", source: "assets/cats/comot.svg", spriteX: "0%", spriteY: "50%" },
    { id: "comot", name: "Comot", label: "white belly and brown patches", source: "assets/cats/abu.svg", spriteX: "100%", spriteY: "0%" },
    { id: "oyen", name: "Oyen", label: "orange tabby", source: "assets/cats/oyen.svg", spriteX: "100%", spriteY: "50%" },
    { id: "tompok", name: "Tompok", label: "tuxedo", source: "assets/cats/tompok.svg", spriteX: "0%", spriteY: "100%" },
    { id: "miko", name: "Miko", label: "green & white", source: "assets/cats/miko.svg", spriteX: "100%", spriteY: "100%" }
  ];

  const CLASSIC_COOKIES = [
    { cat: "tam", src: "assets/cookies/transparent/cookie-1-uniform.svg" },
    { cat: "comot", src: "assets/cookies/transparent/cookie-2-uniform.svg" },
    { cat: "oyen", src: "assets/cookies/transparent/cookie-3-uniform.svg" },
    { cat: "tompok", src: "assets/cookies/transparent/cookie-4-uniform.svg" },
    { cat: "miko", src: "assets/cookies/transparent/cookie-5-uniform.svg" },
    { cat: "abu", src: "assets/cookies/transparent/cookie-abu.svg" }
  ];

  const HAZARD_ASSETS = {
    fishbone: "assets/hazards/fishbone.svg",
    bomb: "assets/hazards/bomb.svg",
    banana: "assets/hazards/banana.svg",
    poop: "assets/hazards/poop.svg"
  };

  const screens = Object.fromEntries([...document.querySelectorAll(".screen")].map((screen) => [screen.id.replace("-screen", ""), screen]));
  const catGrid = document.querySelector("#cat-grid");
  const playButton = document.querySelector("#play-button");
  const gameStage = document.querySelector("#game-stage");
  const gameCat = document.querySelector("#game-cat-image");
  const catCatcher = document.querySelector("#cat-catcher");
  const resultCat = document.querySelector("#result-cat-image");
  const resultCatWrap = document.querySelector("#result-cat-wrap");
  const itemsLayer = document.querySelector("#items-layer");
  const floatLayer = document.querySelector("#float-layer");
  const countdown = document.querySelector("#countdown");
  const dragHint = document.querySelector("#drag-hint");
  const scoreDisplay = document.querySelector("#score-display");
  const livesDisplay = document.querySelector("#lives-display");
  const timeDisplay = document.querySelector("#time-display");
  const resultTitle = document.querySelector("#result-title");
  const resultEyebrow = document.querySelector("#result-eyebrow");
  const resultCopy = document.querySelector("#result-copy");
  const resultScore = document.querySelector("#result-score");
  const soundButtons = [...document.querySelectorAll("[data-sound-toggle]")];
  const registerForm = document.querySelector("#register-form");
  const registerButton = document.querySelector("#register-button");
  const registerError = document.querySelector("#register-error");
  const playedDialog = document.querySelector("#played-dialog");

  // Set after sign-up. playRequest resolves to the server's id for the current round ("" when unsaved).
  let player = null;

  const game = {
    selected: CATS[0],
    screen: "select",
    running: false,
    ending: false,
    token: 0,
    rafId: 0,
    lastFrame: 0,
    startedAt: 0,
    spawnClock: 0,
    items: [],
    catX: 50,
    lives: 3,
    score: 0,
    cookiesCaught: 0,
    hurtUntil: 0,
    lastHazard: -9999,
    pointerId: null,
    soundOn: readStoredSound()
  };

  let audioContext;
  let musicTimer;
  let musicStep = 0;

  function readStoredSound() {
    try {
      return localStorage.getItem("sneaky-cat-sound") === "on";
    } catch {
      return false;
    }
  }

  function rememberSound() {
    try {
      localStorage.setItem("sneaky-cat-sound", game.soundOn ? "on" : "off");
    } catch {
      // Local preference is optional; the current-session setting still works.
    }
  }

  function currentCat() {
    return CATS.find((cat) => cat.id === game.selected.id) || CATS[0];
  }

  function alignEyeEffects(element, cat) {
    // Coordinates in the original square artwork cells, before SVG letterboxing.
    const eyes = {
      tam: [58.1, 45.1, 80.1, 41], abu: [48.4, 40.2, 67.5, 37.3],
      comot: [50.2, 45.9, 72.1, 42.2], oyen: [50.4, 42, 71.3, 37.7],
      tompok: [57, 33.2, 79.5, 29.9], miko: [50.4, 35, 72.1, 32.2]
    }[cat.id];
    // Lower eyelid positions, with a small overlap so each stream touches its eye.
    const tearY = {
      tam: [48, 44], abu: [43, 40.5],
      comot: [49, 45.5], oyen: [45.5, 41],
      tompok: [36.5, 33], miko: [38, 35.5]
    }[cat.id];
    const renderedStyle = getComputedStyle(element);
    const width = parseFloat(renderedStyle.width);
    const height = parseFloat(renderedStyle.height);
    if (!width || !height) return;
    const cellSize = Math.min(width, height);
    const singleImage = cat.id === "abu";
    const column = parseFloat(cat.spriteX) / 100;
    const row = parseFloat(cat.spriteY) / 50;
    // SVG preserveAspectRatio="xMidYMid meet" centers the whole sprite sheet
    // inside the CSS background box; its blank space must move the effects too.
    const offsetX = singleImage ? (width - cellSize) / 2 : (1 - column) * (width - cellSize);
    const offsetY = singleImage ? (height - cellSize) / 2 : (1.5 - row) * (height - cellSize);
    ["--eye-left-x", "--eye-left-y", "--eye-right-x", "--eye-right-y"].forEach((key, index) => {
      const position = (index % 2 === 0 ? offsetX : offsetY) + cellSize * eyes[index] / 100;
      element.style.setProperty(key, `${position}px`);
    });
    element.style.setProperty("--tear-left-y", `${offsetY + cellSize * tearY[0] / 100}px`);
    element.style.setProperty("--tear-right-y", `${offsetY + cellSize * tearY[1] / 100}px`);
    element.style.setProperty("--tear-width", `${cellSize * .035}px`);
    element.style.setProperty("--tear-height", `${cellSize * .08}px`);
  }

  const eyeCats = new WeakMap();
  const eyeResizeObserver = new ResizeObserver((entries) => {
    entries.forEach(({ target }) => alignEyeEffects(target, eyeCats.get(target)));
  });

  function paintPixelCat(element, cat) {
    eyeCats.set(element, cat);
    eyeResizeObserver.observe(element);
    alignEyeEffects(element, cat);
    element.style.setProperty("--sprite-x", cat.spriteX);
    element.style.setProperty("--sprite-y", cat.spriteY);
    element.classList.toggle("pixel-cat--abu", cat.id === "abu");
    element.setAttribute("aria-label", cat.name);
  }

  function syncCatArt() {
    const cat = currentCat();
    paintPixelCat(gameCat, cat);
    paintPixelCat(resultCat, cat);
    playButton.textContent = "START!!!";
  }

  function renderCatGrid() {
    catGrid.innerHTML = "";
    CATS.forEach((cat) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = `cat-card cat-card--${cat.id}${cat.id === game.selected.id ? " is-selected" : ""}`;
      card.setAttribute("aria-label", cat.name);
      card.setAttribute("aria-pressed", String(cat.id === game.selected.id));
      card.innerHTML = `
        <span class="cat-card__art pixel-cat" aria-hidden="true" style="--sprite-x:${cat.spriteX};--sprite-y:${cat.spriteY}"></span>
        <span class="cat-card__name">${cat.name}</span>
      `;
      card.querySelector(".pixel-cat").classList.toggle("pixel-cat--abu", cat.id === "abu");
      card.addEventListener("click", () => {
        game.selected = cat;
        syncCatArt();
        renderCatGrid();
        playSound("select");
      });
      catGrid.append(card);
    });
  }

  function showScreen(name) {
    Object.entries(screens).forEach(([screenName, element]) => {
      const active = screenName === name;
      element.hidden = !active;
      element.classList.toggle("screen--active", active);
    });
    game.screen = name;
    document.body.classList.toggle("is-playing-screen", name === "game");
    if (name !== "game") stopMusic();
  }

  function goTo(name) {
    if (name === "select") {
      stopRound();
      renderCatGrid();
    }
    if (name === "cookies") stopRound();
    if (name === "result" && game.screen !== "result") stopRound();
    if (name === "cookies" && COOKIE_SHOP_URL) {
      window.open(COOKIE_SHOP_URL, "_blank", "noopener,noreferrer");
      return;
    }
    playSound("click");
    showScreen(name);
  }

  function resetRound() {
    game.token += 1;
    game.running = false;
    game.ending = false;
    game.lastFrame = 0;
    game.spawnClock = .48;
    game.items.forEach((item) => item.el.remove());
    game.items = [];
    game.lives = 3;
    game.score = 0;
    game.cookiesCaught = 0;
    game.catX = 50;
    game.hurtUntil = 0;
    game.lastHazard = -9999;
    catCatcher.style.left = "50%";
    catCatcher.classList.remove("facing-left", "is-eating", "is-hurt");
    itemsLayer.replaceChildren();
    floatLayer.replaceChildren();
    dragHint.classList.remove("is-hidden");
    updateHud(ROUND_SECONDS);
  }

  function startRound() {
    if (!player) {
      showScreen("register");
      return;
    }
    if (player.onePlayOnly && player.hasPlayed) {
      showPlayedDialog(player.lastScore, player.prize);
      return;
    }
    resetRound();
    showScreen("game");
    playSound("click");
    const token = game.token;
    player.hasPlayed = true;
    player.lastScore = 0;
    player.prize = "";
    player.playRequest = reportRoundStart(token);
    player.scoreRequest = player.playRequest;
    runCountdown(token);
  }

  async function runCountdown(token) {
    const steps = ["3", "2", "1", "GO!"];
    for (const step of steps) {
      if (token !== game.token) return;
      countdown.textContent = step;
      countdown.classList.toggle("is-go", step === "GO!");
      countdown.classList.add("is-visible");
      await delay(step === "GO!" ? 430 : 560);
    }
    if (token !== game.token) return;
    countdown.classList.remove("is-visible", "is-go");
    game.running = true;
    game.startedAt = performance.now();
    game.lastFrame = game.startedAt;
    startMusic();
    game.rafId = requestAnimationFrame(tick);
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function stopRound() {
    game.token += 1;
    game.running = false;
    game.ending = false;
    if (game.rafId) cancelAnimationFrame(game.rafId);
    game.rafId = 0;
    countdown.classList.remove("is-visible", "is-go");
    stopMusic();
  }

  function tick(now) {
    if (!game.running) return;
    const delta = Math.min(.05, (now - game.lastFrame) / 1000 || 0);
    game.lastFrame = now;
    const elapsed = (now - game.startedAt) / 1000;
    const remaining = Math.max(0, ROUND_SECONDS - elapsed);
    updateHud(remaining);

    if (remaining <= 0) {
      endRound("timeup");
      return;
    }

    updateSpawning(delta, elapsed);
    updateItems(delta, now);
    game.rafId = requestAnimationFrame(tick);
  }

  function difficultyBand(elapsed) {
    return Math.min(3, Math.floor(elapsed / 7.5));
  }

  function updateSpawning(delta, elapsed) {
    const band = difficultyBand(elapsed);
    const spawnEvery = [.82, .68, .56, .46][band];
    game.spawnClock += delta;
    const cap = [4, 5, 6, 7][band];
    if (game.spawnClock < spawnEvery || game.items.length >= cap) return;
    game.spawnClock = 0;
    spawnItem(band, elapsed);
  }

  function spawnItem(band, elapsed) {
    const bounds = gameStage.getBoundingClientRect();
    const width = bounds.width;
    const height = bounds.height;
    const size = Math.round(Math.min(width * .20, 80));
    // Every cookie and strange item begins fully above the visible play area.
    const startY = -size / 2 - 24;
    let type = chooseItemType(band, elapsed);
    let x = size / 2 + 10 + Math.random() * Math.max(1, width - size - 20);

    // Do not create a wall of bad items near each other while the player has little time to react.
    const nearbyHazard = game.items.some((item) => item.hazard && item.y < height * .42 && Math.abs(item.x - x) < size * 1.65);
    if (type.hazard && nearbyHazard) type = { kind: "classic", value: 5, hazard: false };

    const el = document.createElement("div");
    el.className = `falling-item falling-item--${type.kind}${type.hazard ? " falling-item--hazard" : ""}${type.kind === "bomb" ? " falling-item--bomb" : ""}`;
    el.style.setProperty("--item-size", `${size}px`);
    el.style.transform = `translate3d(${x - size / 2}px, ${startY - size / 2}px, 0)`;
    if (type.kind === "classic") {
      const cookie = CLASSIC_COOKIES[Math.floor(Math.random() * CLASSIC_COOKIES.length)];
      type = { ...type, cookieCat: cookie.cat };
      el.classList.toggle("falling-item--favorite", cookie.cat === game.selected.id);
      el.innerHTML = `<img src="${cookie.src}" alt="" />`;
    } else if (type.hazard) {
      el.innerHTML = `<img class="hazard-sprite" src="${HAZARD_ASSETS[type.kind]}" alt="" />`;
    }
    itemsLayer.append(el);

    const baseSpeed = height * [.205, .26, .32, .39][band] * (type.hazard ? 1.30 : 1.15);
    game.items.push({
      el,
      kind: type.kind,
      cookieCat: type.cookieCat,
      value: type.value,
      hazard: type.hazard,
      x,
      y: startY,
      size,
      speed: baseSpeed * (.88 + Math.random() * .23)
    });
  }

  function chooseItemType(band, elapsed) {
    const roll = Math.random();
    const hazardChance = [.34, .44, .54, .64][band];
    const enoughGapSinceHazard = elapsed - game.lastHazard > [1.45, 1.15, .9, .7][band];

    if (roll < hazardChance && enoughGapSinceHazard) {
      game.lastHazard = elapsed;
      const hazardRoll = Math.random();
      if (band > 0 && hazardRoll < .12 + band * .03) return { kind: "bomb", value: -2, hazard: true };
      const hazards = ["fishbone", "banana", "poop"];
      return { kind: hazards[Math.floor(Math.random() * hazards.length)], value: -1, hazard: true };
    }
    return { kind: "classic", value: 5, hazard: false };
  }

  function updateItems(delta, now) {
    const stageHeight = gameStage.clientHeight;
    for (let index = game.items.length - 1; index >= 0; index -= 1) {
      const item = game.items[index];
      item.y += item.speed * delta;
      item.el.style.transform = `translate3d(${item.x - item.size / 2}px, ${item.y - item.size / 2}px, 0)`;

      if (item.y - item.size / 2 > stageHeight + 25) {
        removeItem(index);
        continue;
      }
      if (now >= game.hurtUntil && isAtMouth(item)) {
        catchItem(item, index, now);
        if (!game.running) return;
      }
    }
  }

  function isAtMouth(item) {
    const catCenter = gameStage.clientWidth * game.catX / 100;
    const mouthY = catCatcher.offsetTop + 70;
    const horizontalReach = 43 + item.size * .43;
    return Math.abs(item.x - catCenter) <= horizontalReach && item.y + item.size / 2 >= mouthY - 18 && item.y - item.size / 2 <= mouthY + 25;
  }

  function catchItem(item, index, now) {
    const x = item.x;
    const y = Math.min(item.y, gameStage.clientHeight - 110);
    removeItem(index);
    if (!item.hazard) {
      const favorite = item.cookieCat === game.selected.id;
      const points = favorite ? 10 : 5;
      game.score += points;
      game.cookiesCaught += 1;
      animateCat("is-eating", 330);
      makeFloat(favorite ? `+${points} ♥` : `+${points}`, x, y);
      playSound(favorite ? "special" : "catch");
    } else {
      game.lives = Math.max(0, game.lives + item.value);
      game.hurtUntil = now + 780;
      animateCat("is-hurt", 780);
      makeFloat(`${item.value} ♥`, x, y, true);
      playSound(item.kind === "bomb" ? "bomb" : "hurt");
    }
    updateHud(Math.max(0, ROUND_SECONDS - (now - game.startedAt) / 1000));
    if (game.lives <= 0) {
      endRound("gameover");
    }
  }

  function removeItem(index) {
    const [item] = game.items.splice(index, 1);
    if (item) item.el.remove();
  }

  function animateCat(className, duration) {
    catCatcher.classList.remove("is-eating", "is-hurt");
    // Reflow once so repeated catches retrigger the short animation.
    void catCatcher.offsetWidth;
    catCatcher.classList.add(className);
    window.setTimeout(() => catCatcher.classList.remove(className), duration);
  }

  function makeFloat(text, x, y, bad = false) {
    const floating = document.createElement("span");
    floating.className = `float-score${bad ? " float-score--bad" : ""}`;
    floating.textContent = text;
    floating.style.left = `${x}px`;
    floating.style.top = `${y}px`;
    floating.addEventListener("animationend", () => floating.remove(), { once: true });
    floatLayer.append(floating);
  }

  function updateHud(remaining) {
    const hearts = "♥ ".repeat(game.lives).trim();
    livesDisplay.textContent = hearts || "—";
    scoreDisplay.textContent = String(game.score).padStart(3, "0");
    timeDisplay.textContent = String(Math.ceil(remaining));
  }

  let lastResultLine = "";

  function dramaticResultCopy(cat, gameOver) {
    const name = cat.name;
    const count = game.cookiesCaught;
    const snacks = `${count} ${count === 1 ? "cookie" : "cookies"}`;
    const lines = gameOver ? [
      `${name} trusted the falling objects. A tragic mistake.`,
      `${name}'s snack career ended in tears. Demand a rematch!`,
      `${name} ate ${snacks}. Then chaos ate the plan.`,
      `The snacks. The betrayal. The TEARS. ${name} needs a moment.`,
      `${name} has fallen. The appetite lives on.`
    ] : count === 0 ? [
      `Not a single cookie?! ${name} is calling a family meeting.`,
      `${name} watched the cookies fall. And the trust crumble.`,
      `Zero cookies. ${name} would like to speak to the manager.`
    ] : [
      `${name} devoured ${snacks}. The timer ended. The hunger DID NOT.`,
      `${snacks} later, ${name} still claims nobody feeds them.`,
      `Time stole the buffet! ${name} demands justice. And more cookies.`,
      `${name} caught ${snacks} and developed a lifelong snack obsession.`,
      `The curtain falls. ${name} takes a bow… then searches for crumbs.`,
      `${name} survived the snack storm. ${snacks} did not.`
    ];
    const choices = lines.filter((line) => line !== lastResultLine);
    lastResultLine = choices[Math.floor(Math.random() * choices.length)];
    return lastResultLine;
  }

  function endRound(reason) {
    if (game.ending) return;
    game.ending = true;
    game.running = false;
    if (game.rafId) cancelAnimationFrame(game.rafId);
    game.rafId = 0;
    stopMusic();
    game.items.forEach((item) => item.el.remove());
    game.items = [];
    const cat = currentCat();
    const gameOver = reason === "gameover";
    resultCatWrap.classList.toggle("is-dramatic", gameOver);
    resultEyebrow.textContent = gameOver ? "OH NO" : "ROUND COMPLETE";
    resultTitle.textContent = gameOver ? "GAME OVER!" : "TIME'S UP!";
    resultCopy.textContent = dramaticResultCopy(cat, gameOver);
    resultScore.textContent = String(game.score).padStart(3, "0");
    if (gameOver) playSound("gameover"); else playSound("timeup");
    reportScore(game.score, reason);
    showScreen("result");
    if (game.score >= GIFT_THRESHOLD) {
      giftOpen.disabled = false;
      giftOpen.classList.remove("is-open");
      giftOpen.setAttribute("aria-label", "Open your gift");
      document.querySelector("#gift-prize").textContent = "";
      giftDialog.showModal();
    }
  }

  function moveCatTo(clientX) {
    if (!game.running) return;
    const rect = gameStage.getBoundingClientRect();
    const next = clamp((clientX - rect.left) / rect.width * 100, 16, 84);
    const change = next - game.catX;
    if (Math.abs(change) > .65) catCatcher.classList.toggle("facing-left", change < 0);
    game.catX = next;
    catCatcher.style.left = `${next}%`;
    dragHint.classList.add("is-hidden");
  }

  function moveCatBy(percent) {
    const rect = gameStage.getBoundingClientRect();
    moveCatTo(rect.left + rect.width * (game.catX + percent) / 100);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function installControls() {
    gameStage.addEventListener("pointerdown", (event) => {
      if (!game.running) return;
      game.pointerId = event.pointerId;
      gameStage.setPointerCapture?.(event.pointerId);
      moveCatTo(event.clientX);
    });
    gameStage.addEventListener("pointermove", (event) => {
      if (game.pointerId === event.pointerId) moveCatTo(event.clientX);
    });
    const releasePointer = (event) => {
      if (game.pointerId === event.pointerId) game.pointerId = null;
    };
    gameStage.addEventListener("pointerup", releasePointer);
    gameStage.addEventListener("pointercancel", releasePointer);

    window.addEventListener("keydown", (event) => {
      if (!game.running) return;
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        event.preventDefault();
        moveCatBy(-5.2);
      }
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
        event.preventDefault();
        moveCatBy(5.2);
      }
    });
  }

  function ensureAudio() {
    if (!game.soundOn) return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContext) audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") audioContext.resume();
    return audioContext;
  }

  function beep(frequency, duration, type = "sine", volume = .045, delay = 0) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const startAt = ctx.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, startAt + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + .03);
  }

  function playSound(name) {
    if (!game.soundOn) return;
    const sounds = {
      click: () => beep(460, .06, "square", .03),
      select: () => { beep(520, .06, "triangle", .04); beep(750, .1, "triangle", .03, .06); },
      catch: () => { beep(570, .06, "triangle", .045); beep(750, .12, "sine", .035, .05); },
      special: () => { beep(600, .07, "triangle", .04); beep(760, .07, "triangle", .04, .07); beep(990, .16, "sine", .045, .14); },
      hurt: () => { beep(180, .16, "sawtooth", .04); beep(140, .2, "triangle", .035, .05); },
      bomb: () => { beep(105, .28, "sawtooth", .07); beep(67, .34, "square", .045, .07); },
      timeup: () => { beep(523, .1, "sine", .04); beep(659, .1, "sine", .04, .11); beep(784, .23, "sine", .05, .22); },
      gameover: () => { beep(310, .12, "triangle", .045); beep(250, .12, "triangle", .04, .14); beep(185, .31, "sine", .045, .28); }
    };
    sounds[name]?.();
  }

  function startMusic() {
    if (!game.soundOn || musicTimer) return;
    const pattern = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];
    const playStep = () => {
      if (!game.running || !game.soundOn) return;
      beep(pattern[musicStep % pattern.length], .28, "sine", .013);
      if (musicStep % 2 === 0) beep(pattern[(musicStep + 3) % pattern.length] / 2, .38, "triangle", .008, .04);
      musicStep += 1;
    };
    playStep();
    musicTimer = window.setInterval(playStep, 540);
  }

  function stopMusic() {
    if (musicTimer) window.clearInterval(musicTimer);
    musicTimer = undefined;
  }

  function syncSoundButtons() {
    soundButtons.forEach((button) => {
      button.classList.toggle("is-on", game.soundOn);
      button.setAttribute("aria-label", game.soundOn ? "Turn sound off" : "Turn sound on");
      const label = button.querySelector("[data-sound-label]");
      if (label) label.textContent = game.soundOn ? "Sound on" : "Sound off";
      const icon = button.querySelector("span");
      if (icon) icon.textContent = game.soundOn ? "♪" : "×";
    });
  }

  function toggleSound() {
    game.soundOn = !game.soundOn;
    rememberSound();
    syncSoundButtons();
    if (game.soundOn) {
      ensureAudio();
      playSound("click");
      if (game.running) startMusic();
    } else {
      stopMusic();
    }
  }

  async function callPlayerApi(action, data) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      // text/plain keeps this a "simple" request, which Apps Script accepts cross-origin.
      const response = await fetch(PLAYER_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, ...data }),
        signal: controller.signal
      });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || "request_failed");
      return result;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function normalizePhone(raw) {
    const trimmed = raw.trim();
    const digits = trimmed.replace(/\D/g, "");
    // Local Malaysian numbers (012…) become 6012… so every phone is stored the same way.
    return !trimmed.startsWith("+") && digits.startsWith("0") ? `6${digits}` : digits;
  }

  function isValidPhone(phone) {
    if (phone.startsWith("60")) return /^601\d{8,9}$/.test(phone);
    return /^\d{9,15}$/.test(phone);
  }

  function readRegistration() {
    const fields = {
      name: document.querySelector("#player-name"),
      phone: document.querySelector("#player-phone"),
      email: document.querySelector("#player-email"),
      consent: document.querySelector("#player-consent")
    };
    const details = {
      name: fields.name.value.trim().replace(/\s+/g, " "),
      phone: normalizePhone(fields.phone.value),
      email: fields.email.value.trim().toLowerCase()
    };
    const problems = [
      [fields.name, !details.name, "Please enter your name."],
      [fields.phone, !isValidPhone(details.phone), "Please enter a valid mobile number, e.g. 012-345 6789."],
      [fields.email, !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(details.email), "Please enter a valid email address."],
      [fields.consent, !fields.consent.checked, "Please tick the box to agree before playing."]
    ];
    problems.forEach(([field, invalid]) => field.setAttribute("aria-invalid", String(invalid)));
    const firstProblem = problems.find(([, invalid]) => invalid);
    registerError.textContent = firstProblem ? firstProblem[2] : "";
    if (firstProblem) {
      firstProblem[0].focus();
      return null;
    }
    return details;
  }

  async function handleRegister(event) {
    event.preventDefault();
    const details = readRegistration();
    if (!details) return;
    registerButton.disabled = true;
    registerButton.textContent = "CHECKING…";
    try {
      const result = PLAYER_API_URL ? await callPlayerApi("register", details) : { status: "ok", onePlayOnly: false };
      if (result.status === "played") {
        showPlayedDialog(result.score, result.prize, details.name);
        return;
      }
      player = { ...details, onePlayOnly: result.onePlayOnly, hasPlayed: false, lastScore: 0, prize: "", playRequest: Promise.resolve(""), scoreRequest: Promise.resolve("") };
      registerForm.reset();
      goTo("select");
    } catch {
      registerError.textContent = "We couldn't reach the cookie counter. Check your connection and try again.";
    } finally {
      registerButton.disabled = false;
      registerButton.textContent = "LET'S PLAY!";
    }
  }

  async function reportRoundStart(token) {
    if (!PLAYER_API_URL) return "";
    try {
      const result = await callPlayerApi("start", { phone: player.phone, cat: currentCat().name });
      if (result.status === "played") {
        // Already played elsewhere (another tab or device): cancel this round.
        player.onePlayOnly = true;
        player.lastScore = result.score;
        player.prize = result.prize;
        if (token === game.token && game.screen === "game") {
          stopRound();
          showScreen("select");
        }
        showPlayedDialog(result.score, result.prize);
        return "";
      }
      player.onePlayOnly = result.onePlayOnly;
      return result.playId;
    } catch {
      // Keep the round playable if the network drops; this round just won't be saved.
      return "";
    }
  }

  function reportScore(score, reason) {
    if (!player) return;
    player.lastScore = score;
    const playRequest = player.playRequest;
    player.scoreRequest = playRequest.then(async (playId) => {
      if (!playId) return "";
      try {
        await callPlayerApi("score", { playId, score, result: reason });
      } catch {
        // Score saving is best effort; the round result on screen is unaffected.
      }
      return playId;
    });
  }

  function reportPrize(prizeName) {
    if (!player) return;
    player.prize = prizeName;
    player.scoreRequest.then((playId) => {
      if (playId) callPlayerApi("prize", { playId, prize: prizeName }).catch(() => {});
    });
  }

  function showPlayedDialog(score, prizeName, name = player?.name) {
    document.querySelector("#played-copy").textContent = name ? `Thanks for feeding the cats, ${name}.` : "Thanks for feeding the cats.";
    document.querySelector("#played-score").textContent = String(score || 0).padStart(3, "0");
    document.querySelector("#played-prize").textContent = prizeName ? `Your prize: ${prizeName}` : "";
    if (giftDialog.open) giftDialog.close();
    if (!playedDialog.open) playedDialog.showModal();
  }

  registerForm.addEventListener("submit", handleRegister);
  document.querySelector("#played-close").addEventListener("click", () => playedDialog.close());

  document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => goTo(button.dataset.go));
  });
  playButton.addEventListener("click", startRound);
  document.querySelector("#play-again").addEventListener("click", startRound);
  soundButtons.forEach((button) => button.addEventListener("click", toggleSound));

  installControls();
  syncCatArt();
  renderCatGrid();
  syncSoundButtons();
})();
