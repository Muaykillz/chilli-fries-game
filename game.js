// =====================================================================
// Fries Catcher — vanilla canvas game
// =====================================================================
(() => {
  const game     = document.getElementById('game');
  const canvas   = document.getElementById('play');
  const ctx      = canvas.getContext('2d');
  const scoreVal = document.getElementById('scoreVal');
  const timerVal = document.getElementById('timerVal');
  const timerCard= document.getElementById('timerCard');
  const scoreIcon= document.getElementById('scoreIcon');
  const comboBadge = document.getElementById('comboBadge');
  const dragHint = document.getElementById('dragHint');
  const flashGood= document.getElementById('flashGood');
  const flashBad = document.getElementById('flashBad');
  const countdownEl = document.getElementById('countdown');
  const startScreen = document.getElementById('startScreen');
  const endScreen   = document.getElementById('endScreen');
  const startBtn    = document.getElementById('startBtn');
  const againBtn    = document.getElementById('againBtn');
  const finalScore  = document.getElementById('finalScore');
  const bestStreak  = document.getElementById('bestStreak');
  const wormsHit    = document.getElementById('wormsHit');
  const connectBtn  = document.getElementById('connectBtn');

  // ---------- DualSense ----------
  const ds = new DualSense();
  const GYRO_DEADZONE   = 8;   // deg/s — filter resting noise
  const GYRO_SENSITIVITY = -14; // px per deg/s (flip sign in update if direction inverted)

  ds.on('connect', () => {
    connectBtn.classList.add('ds-connected');
    connectBtn.textContent = '🎮 DualSense Connected ✓';
  });
  ds.on('disconnect', () => {
    connectBtn.classList.remove('ds-connected');
    connectBtn.textContent = '🎮 Connect DualSense';
  });

  connectBtn.addEventListener('click', async () => {
    if (ds.connected) {
      await ds.disconnect();
    } else {
      await ds.connect();
    }
  });

  // ---------- Asset loading ----------
  const ASSET_PATHS = {
    bucket: ['assets/Bucket_1.png', 'assets/Bucket_2.png', 'assets/Bucket_3.png', 'assets/Bucket_4.png'],
    fries:  ['assets/FrenchFries_1.png', 'assets/FrenchFries_2.png', 'assets/FrenchFries_3.png', 'assets/FrenchFries_4.png'],
    worms:  ['assets/Worm_1.png', 'assets/Worm_2.png', 'assets/Worm_3.png', 'assets/Worm_4.png'],
  };
  const img = (src) => new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });
  const assets = { bucket: [], fries: [], worms: [] };
  async function loadAll() {
    const b = await Promise.all(ASSET_PATHS.bucket.map(img));
    const f = await Promise.all(ASSET_PATHS.fries.map(img));
    const w = await Promise.all(ASSET_PATHS.worms.map(img));
    assets.bucket = b.filter(Boolean);
    assets.fries  = f.filter(Boolean);
    assets.worms  = w.filter(Boolean);
  }

  // ---------- Canvas sizing ----------
  let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
  const LOGICAL_W = 1180, LOGICAL_H = 820;
  function fitStage() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = Math.min(vw / LOGICAL_W, vh / LOGICAL_H);
    game.style.transform = `scale(${s})`;
  }
  function resize() {
    W = LOGICAL_W; H = LOGICAL_H;
    canvas.width  = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (bucket) {
      bucket.y = H - 140;
      bucket.x = Math.max(bucket.w/2, Math.min(W - bucket.w/2, bucket.x));
    }
    fitStage();
  }
  window.addEventListener('resize', () => { fitStage(); });

  // ---------- Game state ----------
  const STATES = { READY: 0, PLAYING: 1, OVER: 2, PAUSED: 3 };
  let state = STATES.READY;

  const bucket = {
    x: 0, y: 0,
    w: 140, h: 100,
    targetX: 0,
    angle: 0,
    squash: 0,
    hurt: 0,
  };

  const items = [];
  const particles = [];
  const popups = [];

  let score = 0;
  let streak = 0;
  let maxStreak = 0;
  let wormsHitCount = 0;
  let timeLeft = 50.0;
  let spawnCooldown = 0;
  let elapsed = 0;
  let lastT = 0;

  // ---------- Utility ----------
  const rand = (a,b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- Input (drag) ----------
  let dragging = false;
  let dragOffset = 0;

  function pointerPos(e) {
    const r = game.getBoundingClientRect();
    const pt = (e.touches && e.touches[0]) || e;
    const sx = r.width / LOGICAL_W || 1;
    const sy = r.height / LOGICAL_H || 1;
    return { x: (pt.clientX - r.left) / sx, y: (pt.clientY - r.top) / sy };
  }
  function onDown(e) {
    if (state !== STATES.PLAYING) return;
    const p = pointerPos(e);
    const onBucket = Math.abs(p.x - bucket.x) < bucket.w*0.7 && Math.abs(p.y - bucket.y) < bucket.h*1.2;
    dragging = true;
    dragOffset = onBucket ? (bucket.x - p.x) : 0;
    bucket.targetX = p.x + dragOffset;
    game.classList.add('dragging');
    dragHint.classList.add('hidden');
    e.preventDefault();
  }
  function onMove(e) {
    if (!dragging || state !== STATES.PLAYING) return;
    const p = pointerPos(e);
    bucket.targetX = p.x + dragOffset;
    e.preventDefault();
  }
  function onUp() {
    dragging = false;
    game.classList.remove('dragging');
  }
  game.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  game.addEventListener('touchstart', onDown, { passive: false });
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onUp);

  const keys = {};
  window.addEventListener('keydown', (e) => { keys[e.key] = true; });
  window.addEventListener('keyup',   (e) => { keys[e.key] = false; });

  // ---------- Spawning ----------
  function spawnItem() {
    const wormChance = 0.22 + Math.min(0.16, elapsed / 400);
    const isWorm = Math.random() < wormChance;
    const type = isWorm ? 'worm' : 'fry';

    const imgArr = isWorm ? assets.worms : assets.fries;
    const image = imgArr.length ? pick(imgArr) : null;

    let w, h;
    if (isWorm) {
      w = rand(86, 118);
      const ar = image ? image.naturalHeight / image.naturalWidth : 0.6;
      h = w * ar;
    } else {
      w = rand(68, 108);
      const ar = image ? image.naturalHeight / image.naturalWidth : 1.8;
      h = w * ar;
    }

    const x = rand(w/2 + 10, W - w/2 - 10);
    const speedBoost = 1 + Math.min(1.2, elapsed / 42);
    const vy = rand(150, 230) * speedBoost;
    const vx = rand(-40, 40);

    items.push({
      type, x, y: -h, vx, vy,
      rot: rand(-0.3, 0.3),
      vr: rand(-1.5, 1.5),
      w, h,
      img: image,
      alive: true,
    });
  }

  // ---------- Collision & feedback ----------
  function rectHitsBucket(it) {
    const bx = bucket.x, by = bucket.y;
    const openW = bucket.w * 0.78;
    const openH = bucket.h * 0.55;
    const openTop = by - bucket.h * 0.35;
    const openBot = by + openH * 0.25;
    const left = bx - openW/2;
    const right = bx + openW/2;
    return (it.x > left && it.x < right && it.y + it.h*0.3 > openTop && it.y - it.h*0.2 < openBot);
  }

  function catchFry(it) {
    score += 1;
    streak += 1;
    if (streak > maxStreak) maxStreak = streak;
    bucket.squash = 1.0;
    updateHUD();
    burst(it.x, it.y, '#ffd96a', 14);
    addPopup(it.x, it.y - 10, '+1', '#ffe069', 22);
    flash(flashGood);
    checkCombo('fry');
  }

  function hitWorm(it) {
    score = Math.max(0, score - 3);
    streak = 0;
    wormsHitCount += 1;
    bucket.hurt = 1.0;
    updateHUD();
    burst(it.x, it.y, '#cdd27a', 22, true);
    addPopup(it.x, it.y - 10, '-3', '#ff5e5e', 28);
    flash(flashBad);
    ds.rumble(255, 200, 220);
    checkCombo('worm');
  }

  let fireStreak = 0;
  let fireActive = false;
  let prevFireMult = 0;
  let lastCountdownNum = 0;
  function checkCombo(trigger) {
    if (trigger === 'worm') {
      fireActive = false;
      fireStreak = 0;
      prevFireMult = 0;
      scoreIcon.classList.remove('fire');
      clearTimeout(comboBadge._t);
      clearTimeout(comboBadge._fadeT);
      comboBadge.classList.remove('visible', 'bump');
      return;
    }
    if (trigger === 'fry') {
      fireStreak += 1;
      if (fireStreak >= 10) fireActive = true;
    }
    scoreIcon.classList.toggle('fire', fireActive);
    if (fireActive) {
      const mult = Math.floor(fireStreak / 10) + 1;
      if (mult > prevFireMult) {
        prevFireMult = mult;
        comboBadge.textContent = `COMBO ×${mult} 🔥`;
        comboBadge.classList.add('visible', 'bump');
        clearTimeout(comboBadge._t);
        clearTimeout(comboBadge._fadeT);
        comboBadge._t = setTimeout(() => comboBadge.classList.remove('bump'), 220);
        comboBadge._fadeT = setTimeout(() => comboBadge.classList.remove('visible'), 2000);
      }
    }
  }

  function flash(el) {
    el.classList.remove('ping');
    void el.offsetWidth;
    el.classList.add('ping');
  }
  function showCountdown(n) {
    countdownEl.textContent = n;
    countdownEl.classList.remove('ping');
    void countdownEl.offsetWidth;
    countdownEl.classList.add('ping');
  }

  function burst(x, y, color, n, worm=false) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(worm ? 80 : 50, worm ? 220 : 160);
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - (worm ? 30 : 80),
        life: 0, maxLife: rand(0.45, 0.85),
        size: rand(3, worm ? 7 : 5),
        color, type: worm ? 'worm' : 'fry',
      });
    }
  }
  function addPopup(x, y, text, color, size) {
    popups.push({ x, y, text, color, size, life: 0, maxLife: 0.9 });
  }

  // ---------- Update & render ----------
  function updateHUD() {
    scoreVal.textContent = score;
    timerVal.textContent = Math.max(0, Math.ceil(timeLeft));
    if (timeLeft <= 10) timerCard.classList.add('urgent');
    else timerCard.classList.remove('urgent');
  }

  function update(dt) {
    if (state !== STATES.PLAYING) return;

    elapsed += dt;
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      endGame();
    }
    updateHUD();

    if (timeLeft <= 5 && timeLeft > 0) {
      const num = Math.ceil(timeLeft);
      if (num !== lastCountdownNum) {
        lastCountdownNum = num;
        showCountdown(num);
      }
    }

    if (keys['ArrowLeft']  || keys['a']) bucket.targetX -= 520 * dt;
    if (keys['ArrowRight'] || keys['d']) bucket.targetX += 520 * dt;

    if (ds.connected) {
      const gz = Math.abs(ds.gyroZ) > GYRO_DEADZONE ? ds.gyroZ : 0;
      bucket.targetX += gz * GYRO_SENSITIVITY * dt;
    }

    bucket.targetX = clamp(bucket.targetX, bucket.w/2 + 4, W - bucket.w/2 - 4);
    const prevX = bucket.x;
    bucket.x += (bucket.targetX - bucket.x) * Math.min(1, dt * 14);
    const dx = bucket.x - prevX;
    bucket.angle += (clamp(dx * 0.01, -0.25, 0.25) - bucket.angle) * 0.2;
    bucket.squash = Math.max(0, bucket.squash - dt * 3.5);
    bucket.hurt   = Math.max(0, bucket.hurt   - dt * 2.2);

    spawnCooldown -= dt;
    if (spawnCooldown <= 0) {
      spawnItem();
      const base = 1.25;
      const min = 0.35;
      spawnCooldown = Math.max(min, base - elapsed * 0.020) * rand(0.75, 1.2);
    }

    for (const it of items) {
      if (!it.alive) continue;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.rot += it.vr * dt;

      if (it.x < it.w/2) { it.x = it.w/2; it.vx *= -0.6; }
      if (it.x > W - it.w/2) { it.x = W - it.w/2; it.vx *= -0.6; }

      if (rectHitsBucket(it)) {
        it.alive = false;
        if (it.type === 'fry') catchFry(it);
        else hitWorm(it);
      } else if (it.y - it.h/2 > H + 20) {
        it.alive = false;
        if (it.type === 'fry') {
          streak = 0;
        }
      }
    }
    for (let i = items.length - 1; i >= 0; i--) if (!items[i].alive) items.splice(i, 1);

    for (const p of particles) {
      p.life += dt;
      p.vy += 520 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life >= particles[i].maxLife) particles.splice(i, 1);

    for (const p of popups) {
      p.life += dt;
      p.y -= 40 * dt;
    }
    for (let i = popups.length - 1; i >= 0; i--) if (popups[i].life >= popups[i].maxLife) popups.splice(i, 1);
  }

  function render() {
    ctx.clearRect(0, 0, W, H);

    for (const it of items) {
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.rot);

      if (it.img) {
        ctx.drawImage(it.img, -it.w/2, -it.h/2, it.w, it.h);
      } else {
        if (it.type === 'fry') {
          ctx.fillStyle = '#ffcc33';
          ctx.strokeStyle = '#a06600';
          ctx.lineWidth = 3;
          ctx.fillRect(-it.w/2, -it.h/2, it.w, it.h);
          ctx.strokeRect(-it.w/2, -it.h/2, it.w, it.h);
        } else {
          ctx.fillStyle = '#e9ecc6';
          ctx.strokeStyle = '#6c6a3e';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(0, 0, it.w/2, it.h/2, 0, 0, Math.PI*2);
          ctx.fill(); ctx.stroke();
        }
      }
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(bucket.x, bucket.y + bucket.h*0.46, bucket.w*0.48, bucket.h*0.12, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    const squashY = 1 - bucket.squash * 0.08;
    const squashX = 1 + bucket.squash * 0.10;
    ctx.save();
    ctx.translate(bucket.x, bucket.y);
    ctx.rotate(bucket.angle);
    ctx.scale(squashX, squashY);
    if (bucket.hurt > 0) {
      ctx.shadowColor = `rgba(255, 50, 50, ${0.8 * bucket.hurt})`;
      ctx.shadowBlur = 24;
    }
    const tier = Math.min(3, Math.floor(score / 5));
    const bimg = assets.bucket[tier] || assets.bucket[0];
    if (bimg) {
      const ar = bimg.naturalHeight / bimg.naturalWidth;
      const bw = bucket.w, bh = bw * ar;
      ctx.drawImage(bimg, -bw/2, -bh/2, bw, bh);
    } else {
      ctx.fillStyle = '#b0b0b0';
      ctx.fillRect(-bucket.w/2, -bucket.h/2, bucket.w, bucket.h);
    }
    ctx.restore();

    for (const p of particles) {
      const t = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.color;
      if (p.type === 'fry') {
        ctx.fillRect(p.x - p.size/2, p.y - p.size*1.5, p.size, p.size*3);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    }

    for (const p of popups) {
      const t = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.font = `900 ${p.size}px 'Bangers', sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.fillStyle = p.color;
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillText(p.text, p.x, p.y);
      ctx.restore();
    }
  }

  function loop(now) {
    if (!lastT) lastT = now;
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // ---------- Game flow ----------
  function resetGame() {
    items.length = 0;
    particles.length = 0;
    popups.length = 0;
    score = 0;
    streak = 0;
    maxStreak = 0;
    wormsHitCount = 0;
    timeLeft = 50;
    elapsed = 0;
    spawnCooldown = 0.8;
    fireActive = false;
    fireStreak = 0;
    prevFireMult = 0;
    lastCountdownNum = 0;
    countdownEl.classList.remove('ping');
    bucket.w = 230;
    bucket.h = bucket.w * 0.72;
    bucket.x = W / 2;
    bucket.targetX = W / 2;
    bucket.y = H - 140;
    scoreIcon.classList.remove('fire');
    comboBadge.classList.remove('visible', 'bump');
    timerCard.classList.remove('urgent');
    updateHUD();
  }

  function startGame() {
    resetGame();
    state = STATES.PLAYING;
    startScreen.classList.add('hidden');
    endScreen.classList.add('hidden');
    dragHint.classList.remove('hidden');
    setTimeout(() => dragHint.classList.add('hidden'), 2800);
  }
  function endGame() {
    state = STATES.OVER;
    finalScore.textContent = score;
    bestStreak.textContent = maxStreak;
    wormsHit.textContent = wormsHitCount;
    endScreen.classList.remove('hidden');
  }

  startBtn.addEventListener('click', startGame);
  againBtn.addEventListener('click', startGame);
  document.getElementById('againHomeBtn').addEventListener('click', () => goHome());

  const stopBtn     = document.getElementById('stopBtn');
  const pauseScreen = document.getElementById('pauseScreen');
  const resumeBtn   = document.getElementById('resumeBtn');
  const restartBtn  = document.getElementById('restartBtn');
  const homeBtn     = document.getElementById('homeBtn');

  function pauseGame() {
    if (state !== STATES.PLAYING) return;
    state = STATES.PAUSED;
    pauseScreen.classList.remove('hidden');
    dragging = false;
    game.classList.remove('dragging');
  }
  function resumeGame() {
    if (state !== STATES.PAUSED) return;
    state = STATES.PLAYING;
    pauseScreen.classList.add('hidden');
    lastT = 0;
  }
  function goHome() {
    state = STATES.READY;
    pauseScreen.classList.add('hidden');
    endScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    items.length = 0; particles.length = 0; popups.length = 0;
    score = 0; streak = 0; fireActive = false; fireStreak = 0; prevFireMult = 0; lastCountdownNum = 0;
    countdownEl.classList.remove('ping');
    timeLeft = 50;
    scoreIcon.classList.remove('fire');
    comboBadge.classList.remove('visible', 'bump');
    timerCard.classList.remove('urgent');
    updateHUD();
  }
  stopBtn.addEventListener('click', () => {
    if (state === STATES.PLAYING) pauseGame();
    else if (state === STATES.PAUSED) resumeGame();
  });
  resumeBtn.addEventListener('click', resumeGame);
  restartBtn.addEventListener('click', startGame);
  homeBtn.addEventListener('click', goHome);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (state === STATES.PLAYING) pauseGame();
      else if (state === STATES.PAUSED) resumeGame();
    }
  });

  // ---------- Boot ----------
  (async () => {
    await loadAll();
    resize();
    bucket.w = 230;
    bucket.h = bucket.w * 0.72;
    bucket.x = W / 2;
    bucket.targetX = W / 2;
    bucket.y = H - 140;
    requestAnimationFrame(loop);
  })();
})();
