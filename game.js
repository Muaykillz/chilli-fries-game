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
  const dragHint  = document.getElementById('dragHint');
  const startHint = document.getElementById('startHint');
  const flashGood= document.getElementById('flashGood');
  const flashBad = document.getElementById('flashBad');
  const countdownEl = document.getElementById('countdown');
  const startScreen = document.getElementById('startScreen');
  const endScreen   = document.getElementById('endScreen');
  const startBtn    = document.getElementById('startBtn');
  const finalScore  = document.getElementById('finalScore');
  const bestStreak  = document.getElementById('bestStreak');
  const chillisHit   = document.getElementById('chillisHit');
  const connectBtn       = document.getElementById('connectBtn');
  const continueBtn      = document.getElementById('continueBtn');
  const leaderboardScreen= document.getElementById('leaderboardScreen');
  const lbListWrap       = document.getElementById('lbListWrap');
  const lbList           = document.getElementById('lbList');
  const lbAgainBtn       = document.getElementById('lbAgainBtn');
  const lbHomeBtn        = document.getElementById('lbHomeBtn');
  const debugCsvBtn      = document.getElementById('debugCsvBtn');

  // ── Debug mode ─────────────────────────────────────────────────────────────
  const DEBUG_KEY = 'friesCatcher_debugLog';

  if (CONFIG.debug?.enabled) {
    debugCsvBtn.classList.remove('hidden');
    debugCsvBtn.addEventListener('click', downloadDebugCSV);
  }

  function saveDebugRecord() {
    if (!CONFIG.debug?.enabled) return;
    const records = JSON.parse(localStorage.getItem(DEBUG_KEY) || '[]');
    records.push({
      ts:          new Date().toISOString(),
      score,
      bestStreak:  maxStreak,
      chillisHit:  chillisHitCount,
      elapsedSec:  Math.round(elapsed),
    });
    localStorage.setItem(DEBUG_KEY, JSON.stringify(records));
  }

  function downloadDebugCSV() {
    const records = JSON.parse(localStorage.getItem(DEBUG_KEY) || '[]');
    if (!records.length) { alert('No records yet.'); return; }
    const headers = Object.keys(records[0]).join(',');
    const rows    = records.map(r => Object.values(r).join(','));
    const csv     = [headers, ...rows].join('\n');
    const blob    = new Blob([csv], { type: 'text/csv' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href = url; a.download = 'fries_catcher_scores.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function updateLbFade() {
    lbListWrap.classList.toggle('fade-top',    lbList.scrollTop > 4);
    lbListWrap.classList.toggle('fade-bottom', lbList.scrollTop + lbList.clientHeight < lbList.scrollHeight - 4);
  }
  lbList.addEventListener('scroll', updateLbFade);

  function smoothScrollLb(targetTop, duration) {
    const start = lbList.scrollTop;
    const delta = targetTop - start;
    if (Math.abs(delta) < 2) { updateLbFade(); return; }
    const t0 = performance.now();
    function ease(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }
    function step(now) {
      const t = Math.min(1, (now - t0) / duration);
      lbList.scrollTop = start + delta * ease(t);
      updateLbFade();
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  const MOCK_LEADERBOARD = [
    { name: 'ต้นกล้า',    score: 82 },
    { name: 'ปรีชา',    score:  78 },
    { name: 'ภู',  score:  73 },
    { name: 'ติส',  score:  72 },
    { name: 'ฟีน',    score:  69 },
    { name: 'เอฟ',    score:  65 },
    { name: 'เคน',    score:  58 },
    { name: 'เจมส์',     score:  55 },
    { name: 'นัท',     score:  54 },
    { name: 'มิว',    score:  51 },
    { name: 'บัญชา',    score:  50 },
    { name: 'จอย',     score:  42 },
  ];

  // ---------- DualSense ----------
  const ds = new DualSense();
  const GYRO_DEADZONE    = 8;   // deg/s — filter resting noise
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
    chillis: ['assets/Chilli_1.png', 'assets/Chilli_2.png', 'assets/Chilli_3.png', 'assets/Chilli_4.png'],
    bomb:   ['assets/bombHit_1.gif', 'assets/bombHit_2.gif'],
  };
  const img = (src) => new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });
  const assets = { bucket: [], fries: [], chillis: [], bombSrcs: [] };
  async function loadAll() {
    const b = await Promise.all(ASSET_PATHS.bucket.map(img));
    const f = await Promise.all(ASSET_PATHS.fries.map(img));
    const w = await Promise.all(ASSET_PATHS.chillis.map(img));
    assets.bucket   = b.filter(Boolean);
    assets.fries    = f.filter(Boolean);
    assets.chillis    = w.filter(Boolean);
    assets.bombSrcs = ASSET_PATHS.bomb.filter(Boolean);
  }

  // ---------- Canvas sizing ----------
  let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
  const LOGICAL_W = 1180, LOGICAL_H = 820;
  function fitStage() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = Math.min(vw / LOGICAL_W, vh / LOGICAL_H);
    game.style.setProperty('--fit-s', s);
    game.style.removeProperty('transform'); // CSS rule handles scale via var(--fit-s)
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
  const STATES = { READY: 0, PLAYING: 1, OVER: 2, PAUSED: 3, SLOWMO: 4, COUNTDOWN: 5, LEADERBOARD: 6 };
  let state = STATES.READY;
  let slowmoT = 0;

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
  let chillisHitCount = 0;
  let timeLeft = CONFIG.game.duration;
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
    const { chilli: WC, fry: FC, golden: GC, speed: SC } = CONFIG;
    const chilliChance = WC.chanceBase + Math.min(WC.chanceAdd, elapsed / WC.rampDivisor);
    const isChilli = Math.random() < chilliChance;
    const goldenRoll = Math.random();
    const gate = elapsed >= GC.startElapsed;
    const bigChance   = gate ? Math.min(GC.big.chanceMax,   (elapsed - GC.startElapsed) / GC.big.rampDivisor)   : 0;
    const smallChance = gate ? Math.min(GC.small.chanceMax, (elapsed - GC.startElapsed) / GC.small.rampDivisor) : 0;
    const isGoldenBig   = !isChilli && goldenRoll < bigChance;
    const isGoldenSmall = !isChilli && !isGoldenBig && goldenRoll < bigChance + smallChance;
    const isGolden = isGoldenBig || isGoldenSmall;
    const type = isChilli ? 'chilli' : (isGolden ? 'golden' : 'fry');

    const imgArr = isChilli ? assets.chillis : assets.fries;
    const image = imgArr.length ? pick(imgArr) : null;

    let w, h;
    if (isChilli) {
      w = rand(WC.sizeMin, WC.sizeMax);
      const ar = image ? image.naturalHeight / image.naturalWidth : 0.6;
      h = w * ar;
    } else {
      w = isGoldenBig ? GC.big.size : isGoldenSmall ? GC.small.size : rand(FC.sizeMin, FC.sizeMax);
      const ar = image ? image.naturalHeight / image.naturalWidth : 1.8;
      h = w * ar;
    }

    const x = rand(w/2 + 10, W - w/2 - 10);
    const ew = SC.endBoostWindow;
    const endBoost   = timeLeft < ew ? 1 + (ew - timeLeft) / ew * SC.endBoostMult : 1;
    const speedBoost = (1 + Math.min(SC.rampCap, elapsed / SC.rampDivisor)) * endBoost;
    const vy = rand(SC.vyMin, SC.vyMax) * speedBoost;
    const vx = rand(-40, 40);

    items.push({
      type, x, y: -h, vx, vy,
      rot: rand(-0.3, 0.3),
      vr: rand(-1.5, 1.5),
      w, h,
      img: image,
      value: isGoldenBig ? GC.big.score : isGoldenSmall ? GC.small.score : FC.score,
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
    ds.playFry();
    score += 1;
    streak += 1;
    if (streak > maxStreak) maxStreak = streak;
    bucket.squash = 1.0;
    updateHUD();
    burst(it.x, it.y, '#ffd96a', CONFIG.fry.burstCount);
    addPopup(it.x, it.y - 10, '+1', '#ffe069', CONFIG.fry.popupSize);
    flash(flashGood);
    checkCombo('fry');
  }

  function catchGolden(it) {
    ds.playFry();
    score += it.value;
    streak += 1;
    if (streak > maxStreak) maxStreak = streak;
    bucket.squash = 1.0;
    updateHUD();
    const isBig = it.value === CONFIG.golden.big.score;
    burst(it.x, it.y, '#ff9200', isBig ? CONFIG.golden.big.burstCount : CONFIG.golden.small.burstCount);
    addPopup(it.x, it.y - 10, `+${it.value}`, '#ff9200', isBig ? CONFIG.golden.big.popupSize : CONFIG.golden.small.popupSize);
    flash(flashGood);
    checkCombo('fry');
  }

  function showBombEffect(x, y) {
    if (!assets.bombSrcs.length) return;
    const src = assets.bombSrcs[Math.random() < 0.5 ? 0 : 1];
    const el = document.createElement('img');
    el.src = src;
    el.style.cssText = `position:absolute;left:${x}px;top:${y}px;height:240px;width:auto;transform:translate(-50%,-50%);pointer-events:none;z-index:20;opacity:0.5;`;
    game.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  function hitChilli(it) {
    score = Math.max(0, score - CONFIG.chilli.penalty);
    streak = 0;
    chillisHitCount += 1;
    bucket.hurt = 1.0;
    updateHUD();
    burst(it.x, it.y, '#cdd27a', CONFIG.chilli.burstCount, true);
    addPopup(it.x, it.y - 10, `-${CONFIG.chilli.penalty}`, '#ff5e5e', 28);
    flash(flashBad);
    game.classList.remove('chilli-hit');
    void game.offsetWidth;
    game.classList.add('chilli-hit');
    showBombEffect(it.x, bucket.y);
    ds.rumble(255, 200, 220);
    ds.playChilli();
    checkCombo('chilli');
  }

  let fireStreak = 0;
  let fireActive = false;
  let prevFireMult = 0;
  let lastCountdownNum = 0;
  function checkCombo(trigger) {
    if (trigger === 'chilli') {
      fireActive = false;
      fireStreak = 0;
      prevFireMult = 0;
      scoreIcon.classList.remove('fire');
      clearTimeout(comboBadge._t);
      clearTimeout(comboBadge._fadeT);
      comboBadge.classList.remove('visible');
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
        comboBadge.classList.remove('visible');
        void comboBadge.offsetWidth; // restart animation
        comboBadge.classList.add('visible');
        clearTimeout(comboBadge._fadeT);
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
    ds.playTick(n);
  }

  function burst(x, y, color, n, isChilli=false) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(isChilli ? 80 : 50, isChilli ? 220 : 160);
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - (isChilli ? 30 : 80),
        life: 0, maxLife: rand(0.45, 0.85),
        size: rand(3, isChilli ? 7 : 5),
        color, type: isChilli ? 'chilli' : 'fry',
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
    // SLOWMO: physics continues with exponential time decay, then end screen
    if (state === STATES.SLOWMO) {
      slowmoT += dt;
      if (slowmoT >= CONFIG.game.slowmoDuration) { endGame(); return; }
      const sdt = dt * Math.exp(-slowmoT * 2.0);
      if (keys['ArrowLeft']  || keys['a']) bucket.targetX -= 520 * sdt;
      if (keys['ArrowRight'] || keys['d']) bucket.targetX += 520 * sdt;
      if (ds.connected) {
        const gz = Math.abs(ds.gyroZ) > GYRO_DEADZONE ? ds.gyroZ : 0;
        bucket.targetX += gz * GYRO_SENSITIVITY * sdt;
      }
      bucket.targetX = clamp(bucket.targetX, bucket.w/2 + 4, W - bucket.w/2 - 4);
      const prevXs = bucket.x;
      bucket.x += (bucket.targetX - bucket.x) * Math.min(1, sdt * 14);
      const dxs = bucket.x - prevXs;
      bucket.angle += (clamp(dxs * 0.01, -0.25, 0.25) - bucket.angle) * 0.2;
      bucket.squash = Math.max(0, bucket.squash - sdt * 3.5);
      bucket.hurt   = Math.max(0, bucket.hurt   - sdt * 2.2);
      for (const it of items) { if (!it.alive) continue; it.x += it.vx * sdt; it.y += it.vy * sdt; it.rot += it.vr * sdt; }
      for (const p of particles) { p.life += sdt; p.vy += 520 * sdt; p.x += p.vx * sdt; p.y += p.vy * sdt; }
      for (const p of popups)    { p.life += sdt; p.y -= 40 * sdt; }
      return;
    }

    if (state === STATES.COUNTDOWN) {
      if (keys['ArrowLeft']  || keys['a']) bucket.targetX -= 520 * dt;
      if (keys['ArrowRight'] || keys['d']) bucket.targetX += 520 * dt;
      if (ds.connected) {
        const gz = Math.abs(ds.gyroZ) > GYRO_DEADZONE ? ds.gyroZ : 0;
        bucket.targetX += gz * GYRO_SENSITIVITY * dt;
      }
      bucket.targetX = clamp(bucket.targetX, bucket.w/2 + 4, W - bucket.w/2 - 4);
      const prevXc = bucket.x;
      bucket.x += (bucket.targetX - bucket.x) * Math.min(1, dt * 14);
      const dxc = bucket.x - prevXc;
      bucket.angle += (clamp(dxc * 0.01, -0.25, 0.25) - bucket.angle) * 0.2;
      bucket.squash = Math.max(0, bucket.squash - dt * 3.5);
      bucket.hurt   = Math.max(0, bucket.hurt   - dt * 2.2);
      return;
    }

    if (state !== STATES.PLAYING) return;

    elapsed += dt;
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      updateHUD();
      state = STATES.SLOWMO;
      slowmoT = 0;
      return;
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
      const { baseInterval, minInterval, rampRate, jitterMin, jitterMax } = CONFIG.spawn;
      spawnCooldown = Math.max(minInterval, baseInterval - elapsed * rampRate) * rand(jitterMin, jitterMax);
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
        else if (it.type === 'golden') catchGolden(it);
        else hitChilli(it);
      } else if (it.y - it.h/2 > H + 20) {
        it.alive = false;
        if (it.type === 'fry' || it.type === 'golden') {
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
        if (it.type === 'golden') {
          const pulse = Math.sin(elapsed * 5) * 0.5 + 0.5;
          ctx.shadowColor = '#ff9200';
          ctx.shadowBlur = 14 + pulse * 16;
          ctx.strokeStyle = `rgba(255, 146, 0, ${0.5 + pulse * 0.45})`;
          ctx.lineWidth = 5 + pulse * 3;
          ctx.beginPath();
          ctx.ellipse(0, 0, it.w * 0.56, it.h * 0.36, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 8 + pulse * 10;
          ctx.drawImage(it.img, -it.w/2, -it.h/2, it.w, it.h);
          ctx.shadowBlur = 0;
          ctx.shadowColor = 'transparent';
        } else {
          ctx.drawImage(it.img, -it.w/2, -it.h/2, it.w, it.h);
        }
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
    chillisHitCount = 0;
    timeLeft = CONFIG.game.duration;
    elapsed = 0;
    spawnCooldown = CONFIG.spawn.baseInterval;
    fireActive = false;
    fireStreak = 0;
    prevFireMult = 0;
    lastCountdownNum = 0;
    countdownEl.classList.remove('ping');
    bucket.w = CONFIG.bucket.width;
    bucket.h = bucket.w * CONFIG.bucket.aspect;
    bucket.x = W / 2;
    bucket.targetX = W / 2;
    bucket.y = H - 140;
    scoreIcon.classList.remove('fire');
    comboBadge.classList.remove('visible');
    timerCard.classList.remove('urgent');
    updateHUD();
  }

  function startGame() {
    resetGame();
    state = STATES.COUNTDOWN;
    startScreen.classList.add('hidden');
    endScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    leaderboardScreen.classList.add('hidden');
    startHint.classList.remove('hidden');
    const showNum = (text) => {
      countdownEl.textContent = text;
      countdownEl.classList.remove('ping');
      void countdownEl.offsetWidth;
      countdownEl.classList.add('ping');
    };
    let step = 3;
    function tick() {
      if (step > 0) {
        const n = step--;
        showNum(n);
        ds.playStartTick(n);
        setTimeout(tick, 900);
      } else {
        showNum('GO!');
        ds.playStartTick('go');
        setTimeout(() => {
          startHint.classList.add('hidden');
          state = STATES.PLAYING;
          dragHint.classList.remove('hidden');
          setTimeout(() => dragHint.classList.add('hidden'), 2800);
        }, 600);
      }
    }
    tick();
  }
  function endGame() {
    saveDebugRecord();
    state = STATES.OVER;
    finalScore.textContent = score;
    bestStreak.textContent = maxStreak;
    chillisHit.textContent = chillisHitCount;
    endScreen.classList.remove('hidden');
  }

  function showLeaderboard() {
    const combined = [
      ...MOCK_LEADERBOARD.map(e => ({ ...e })),
      { name: 'YOU', score, isPlayer: true },
    ];
    combined.sort((a, b) => b.score - a.score);
    const playerIdx  = combined.findIndex(e => e.isPlayer);
    const playerRank = playerIdx + 1;
    const RANK_LABELS = ['', '1ST', '2ND', '3RD'];
    const RANK_CLASSES = ['', 'gold', 'silver', 'bronze'];
    const SHOW_TOP = 9;

    const makeRow = (entry, rank) => {
      const li = document.createElement('li');
      li.className = 'lb-row' + (entry.isPlayer ? ' lb-you' : '');
      const rankClass = rank <= 3 ? ` ${RANK_CLASSES[rank]}` : '';
      const rankLabel = rank <= 3 ? RANK_LABELS[rank] : `#${rank}`;
      li.innerHTML =
        `<span class="lb-rank${rankClass}">${rankLabel}</span>` +
        `<span class="lb-name">${entry.name}</span>` +
        `<span class="lb-score">${entry.score}</span>`;
      return li;
    };

    lbList.innerHTML = '';
    if (playerIdx < SHOW_TOP) {
      const count = Math.min(combined.length, Math.max(SHOW_TOP, playerIdx + 1));
      for (let i = 0; i < count; i++) lbList.appendChild(makeRow(combined[i], i + 1));
    } else {
      for (let i = 0; i < SHOW_TOP; i++) lbList.appendChild(makeRow(combined[i], i + 1));
      const sep = document.createElement('li');
      sep.className = 'lb-sep';
      sep.textContent = '···';
      lbList.appendChild(sep);
      lbList.appendChild(makeRow(combined[playerIdx], playerRank));
    }

    state = STATES.LEADERBOARD;
    endScreen.classList.add('hidden');
    leaderboardScreen.classList.remove('hidden');

    // start at top, then scroll to player row after panel animates in
    lbList.scrollTop = 0;
    updateLbFade();
    const youRow = lbList.querySelector('.lb-you');
    if (youRow) {
      setTimeout(() => {
        const target = youRow.offsetTop - lbList.clientHeight / 2 + youRow.offsetHeight / 2;
        smoothScrollLb(Math.max(0, target), 900);
      }, 500);
    }
  }

  startBtn.addEventListener('click', startGame);
  continueBtn.addEventListener('click', showLeaderboard);
  lbAgainBtn.addEventListener('click', startGame);
  lbHomeBtn.addEventListener('click', () => goHome());

  const stopBtn     = document.getElementById('stopBtn');
  const pauseScreen = document.getElementById('pauseScreen');
  const resumeBtn   = document.getElementById('resumeBtn');
  const restartBtn  = document.getElementById('restartBtn');
  const homeBtn     = document.getElementById('homeBtn');

  // ── PS5 controller shortcuts ──────────────────────────────────────────────
  ds.on('buttondown', (btn) => {
    if      (state === STATES.READY       && btn === 'cross')    startBtn.click();
    else if (state === STATES.PLAYING     && btn === 'options')  stopBtn.click();
    else if (state === STATES.PAUSED      && btn === 'cross')    resumeBtn.click();
    else if (state === STATES.PAUSED      && btn === 'triangle') restartBtn.click();
    else if (state === STATES.PAUSED      && btn === 'circle')   homeBtn.click();
    else if (state === STATES.OVER        && btn === 'cross')    continueBtn.click();
    else if (state === STATES.LEADERBOARD && btn === 'cross')    lbAgainBtn.click();
    else if (state === STATES.LEADERBOARD && btn === 'circle')   lbHomeBtn.click();
  });

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
    leaderboardScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    items.length = 0; particles.length = 0; popups.length = 0;
    score = 0; streak = 0; fireActive = false; fireStreak = 0; prevFireMult = 0; lastCountdownNum = 0;
    countdownEl.classList.remove('ping');
    timeLeft = CONFIG.game.duration;
    scoreIcon.classList.remove('fire');
    comboBadge.classList.remove('visible');
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
    bucket.w = CONFIG.bucket.width;
    bucket.h = bucket.w * CONFIG.bucket.aspect;
    bucket.x = W / 2;
    bucket.targetX = W / 2;
    bucket.y = H - 140;
    requestAnimationFrame(loop);
  })();
})();
