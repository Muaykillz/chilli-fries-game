// ─── GAME CONFIG ─────────────────────────────────────────────────────────────
// Edit values here — no need to touch game.js for balance tweaks.
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {

  // ── Debug ─────────────────────────────────────────────────────────────────
  // Set enabled:true to record every game result to localStorage + show CSV download button.
  debug: {
    enabled: false,
  },

  // ── General ──────────────────────────────────────────────────────────────
  game: {
    duration:       45,    // seconds per round
    slowmoDuration: 2.5,   // slow-mo seconds after time runs out
  },

  // ── Bucket ───────────────────────────────────────────────────────────────
  bucket: {
    width:  260,   // px (logical)
    aspect: 0.72,  // height = width × aspect
  },

  // ── Falling speed ─────────────────────────────────────────────────────────
  // vy = rand(vyMin, vyMax) × speedBoost
  // speedBoost = (1 + min(rampCap, elapsed / rampDivisor)) × endBoost
  // endBoost ramps from 1 → (1 + endBoostMult) over the last endBoostWindow seconds
  speed: {
    vyMin:           150,   // px/s — slowest spawn speed
    vyMax:           230,   // px/s — fastest spawn speed
    rampDivisor:      22,   // lower = speed ramps up faster
    rampCap:         2.0,   // max multiplier from ramp (before endBoost)
    endBoostWindow:   15,   // seconds before end to start the end-boost
    endBoostMult:    0.7,   // added to multiplier at t=0  (total = 1 + this)
  },

  // ── Spawn rate ────────────────────────────────────────────────────────────
  // cooldown = max(minInterval, baseInterval - elapsed × rampRate) × jitter
  spawn: {
    baseInterval: 1.15,   // seconds between spawns at game start
    minInterval:  0.20,   // minimum seconds between spawns (fastest)
    rampRate:     0.026,  // interval reduction per elapsed second
    jitterMin:    0.75,   // random multiplier low bound
    jitterMax:    1.20,   // random multiplier high bound
  },

  // ── Regular fry ──────────────────────────────────────────────────────────
  fry: {
    sizeMin:    68,   // px width min
    sizeMax:   108,   // px width max
    score:       1,
    burstCount: 14,   // particles on catch
    popupSize:  36,   // font size of +1 popup
  },

  // ── Chilli ─────────────────────────────────────────────────────────
  // chance = chanceBase + min(chanceAdd, elapsed / rampDivisor)
  chilli: {
    sizeMin:      86,   // px width min
    sizeMax:     102,   // px width max
    chanceBase:  0.18,  // spawn chance at elapsed=0
    chanceAdd:   0.24,  // max additional chance over time
    rampDivisor: 400,   // lower = chilli chance ramps faster
    penalty:       3,   // score deducted on hit
    burstCount:   22,
  },

  // ── Golden fries ─────────────────────────────────────────────────────────
  // Both tiers use the same startElapsed gate.
  // chance = min(chanceMax, (elapsed - startElapsed) / rampDivisor)
  golden: {
    startElapsed: 5,   // seconds elapsed before any golden can appear

    small: {
      size:        124,   // px width — fixed (no random)
      score:         3,
      chanceMax:  0.05,   // 6 % cap
      rampDivisor: 572,   // reaches cap at elapsed ≈ 50s
      burstCount:   30,
      popupSize:    66,
    },

    big: {
      size:        178,   // px width — fixed
      score:         5,
      chanceMax:  0.02,   // 3 % cap
      rampDivisor: 1334,  // reaches cap at elapsed ≈ 50s
      burstCount:   50,
      popupSize:    82,
    },
  },
};

window.CONFIG = CONFIG;
