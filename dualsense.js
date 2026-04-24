// DualSense Web HID driver — USB + Bluetooth
class DualSense {
  static VENDOR_ID  = 0x054C;
  static PRODUCT_ID = 0x0CE6;

  // ±2000 deg/s full-scale over int16 range
  static GYRO_SCALE = 2000 / 32768;

  constructor() {
    this.device    = null;
    this.connected = false;
    this.mode      = null; // 'usb' | 'bt' — detected from first input report
    this.gyroX = 0; // deg/s — pitch  (tilt forward/back)
    this.gyroY = 0; // deg/s — yaw    (rotate flat)
    this.gyroZ = 0; // deg/s — roll   (tilt left/right when held normally)
    this._seqTag   = 0;    // BT output sequence counter (0–15, upper nibble of byte 0)
    this._audioCtx = null; // Web Audio context routed to controller speaker
    this._listeners = {};
    // Button state — used for rising-edge detection → 'buttondown' events
    this.buttons = { cross: false, circle: false, triangle: false, square: false, options: false };
  }

  on(event, fn) { this._listeners[event] = fn; }
  _emit(event, ...args) { this._listeners[event]?.(...args); }

  async connect() {
    if (!navigator.hid) {
      alert('Web HID not supported.\nUse Chrome or Edge on desktop.');
      return false;
    }
    let devices;
    try {
      devices = await navigator.hid.requestDevice({
        filters: [{ vendorId: DualSense.VENDOR_ID, productId: DualSense.PRODUCT_ID }]
      });
    } catch {
      return false;
    }
    if (!devices.length) return false;

    this.device = devices[0];
    await this.device.open();
    // BT-only: triggers switch from short 0x01 reports to full 0x31 reports (includes gyro)
    try { await this.device.receiveFeatureReport(0x05); } catch {}
    this.device.addEventListener('inputreport', e => this._onReport(e));
    navigator.hid.addEventListener('disconnect', ({ device }) => {
      if (device === this.device) this._handleDisconnect();
    });

    this.connected = true;
    this._emit('connect', this.device.productName);
    return true;
  }

  async disconnect() {
    if (this.device?.opened) {
      try { await this.device.close(); } catch {}
    }
    this._handleDisconnect();
  }

  _handleDisconnect() {
    this.device    = null;
    this.connected = false;
    this.mode      = null;
    this.gyroX = this.gyroY = this.gyroZ = 0;
    if (this._audioCtx) { this._audioCtx.close(); this._audioCtx = null; }
    this._emit('disconnect');
  }

  _getAudio() {
    if (!this._audioCtx) this._audioCtx = new AudioContext();
    if (this._audioCtx.state === 'suspended') this._audioCtx.resume();
    return this._audioCtx;
  }

  _playTone(freqStart, freqEnd, vol, dur, type = 'sine') {
    const ctx = this._getAudio();
    const t   = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur * 0.7);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t); osc.stop(t + dur);
  }

  // warm "pop" — lower, triangle wave, less shrill
  playFry()  { this._playTone(370, 540, 0.22, 0.13, 'triangle'); }
  playWorm() { this._playTone(200,  55, 0.30, 0.20); }

  // Start countdown: escalating 3→2→1, then triumphant GO chime
  playStartTick(n) {
    const ctx = this._getAudio();
    const t   = ctx.currentTime;
    if (n === 'go') {
      // rising two-tone chime
      [0, 0.13].forEach((delay, i) => {
        const freq = i === 0 ? 660 : 990;
        const osc = ctx.createOscillator(), g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + delay);
        g.gain.setValueAtTime(0, t + delay);
        g.gain.linearRampToValueAtTime(0.3, t + delay + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.35);
        osc.start(t + delay); osc.stop(t + delay + 0.35);
      });
    } else {
      // 3=low 2=mid 1=high, each short triangle blip
      const freqs = { 3: 280, 2: 370, 1: 520 };
      const freq  = freqs[n] ?? 280;
      this._playTone(freq, freq * 1.05, 0.28, 0.12, 'triangle');
    }
  }

  // dramatic bass thump, clearly distinct from fry/worm sounds
  // n=1 gets extra high ping layer for maximum impact
  playTick(n) {
    const ctx = this._getAudio();
    const t   = ctx.currentTime;
    const baseFreq = n === 1 ? 160 : 100;
    // bass drop: starts at 2.5× freq then crashes down → punchy thud
    const bass  = ctx.createOscillator();
    const bassG = ctx.createGain();
    bass.connect(bassG); bassG.connect(ctx.destination);
    bass.type = 'sine';
    bass.frequency.setValueAtTime(baseFreq * 2.5, t);
    bass.frequency.exponentialRampToValueAtTime(baseFreq, t + 0.06);
    bassG.gain.setValueAtTime(0, t);
    bassG.gain.linearRampToValueAtTime(n === 1 ? 0.85 : 0.6, t + 0.003);
    bassG.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    bass.start(t); bass.stop(t + 0.22);
    // extra rising ping on "1" for dramatic finish
    if (n === 1) {
      const hi  = ctx.createOscillator();
      const hiG = ctx.createGain();
      hi.connect(hiG); hiG.connect(ctx.destination);
      hi.type = 'sine';
      hi.frequency.setValueAtTime(1100, t + 0.05);
      hi.frequency.exponentialRampToValueAtTime(1600, t + 0.22);
      hiG.gain.setValueAtTime(0, t + 0.05);
      hiG.gain.linearRampToValueAtTime(0.38, t + 0.06);
      hiG.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      hi.start(t + 0.05); hi.stop(t + 0.28);
    }
  }

  // USB Input Report 0x01 (~1000 Hz): gyro at bytes 13–18 (int16 LE)
  // BT  Input Report 0x31 (~250 Hz):  3-byte header → gyro at bytes 16–21
  // EMA (α=0.3) runs at report rate so gyroZ is pre-smoothed before game reads it.
  // τ ≈ 11 ms at 250 Hz — kills jitter while keeping fast wrist motion.
  // USB 0x01 layout: [0-3]=sticks [4-5]=L2/R2 analog [6]=seq [7]=face+dpad [8]=shoulders [9]=PS...
  // BT  0x31 layout: [0-2]=header then same +3 offset → face=10 sys=11
  // Face byte bits: 4=□  5=✕  6=○  7=△   (bits 0-3 = d-pad direction)
  // Sys  byte bits: 0=L1 1=R1 2=L2 3=R2 4=Create 5=Options 6=L3 7=R3
  _onReport({ reportId, data }) {
    let rx, ry, rz, faceB, sysB;
    if (reportId === 0x01) {
      if (data.byteLength < 20) return;
      this.mode = 'usb';
      rx    = data.getInt16(13, true) * DualSense.GYRO_SCALE;
      ry    = data.getInt16(15, true) * DualSense.GYRO_SCALE;
      rz    = data.getInt16(17, true) * DualSense.GYRO_SCALE;
      faceB = data.getUint8(7);
      sysB  = data.getUint8(8);
    } else if (reportId === 0x31) {
      if (data.byteLength < 22) return;
      this.mode = 'bt';
      rx    = data.getInt16(16, true) * DualSense.GYRO_SCALE;
      ry    = data.getInt16(18, true) * DualSense.GYRO_SCALE;
      rz    = data.getInt16(20, true) * DualSense.GYRO_SCALE;
      faceB = data.getUint8(10);
      sysB  = data.getUint8(11);
    } else { return; }

    this.gyroX = this.gyroX * 0.7 + rx * 0.3;
    this.gyroY = this.gyroY * 0.7 + ry * 0.3;
    this.gyroZ = this.gyroZ * 0.7 + rz * 0.3;

    const next = {
      cross:    !!(faceB & 0x20),
      circle:   !!(faceB & 0x40),
      triangle: !!(faceB & 0x80),
      square:   !!(faceB & 0x10),
      options:  !!(sysB  & 0x20),
    };
    for (const k of Object.keys(next)) {
      if (next[k] && !this.buttons[k]) this._emit('buttondown', k);
    }
    this.buttons = next;
  }

  // CRC32 (IEEE 802.3) — required for BT output reports
  static _crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (const b of buf) {
      crc ^= b;
      for (let i = 0; i < 8; i++) crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // USB Output Report 0x02 (47 bytes): byte0=valid_flag0, byte1=valid_flag1, byte2=motorRight, byte3=motorLeft
  // BT  Output Report 0x31 (77 bytes): same layout, CRC32 appended at bytes 73–76
  //   CRC seed: [0xa2, 0x31, buf[0..72]] (75 bytes)
  rumble(right = 128, left = 64, durationMs = 200) {
    if (!this.device?.opened) return;
    const _send = (r, l) => {
      if (this.mode === 'bt') {
        const buf = new Uint8Array(77);
        buf[0] = (this._seqTag++ & 0x0F) << 4; // seq_tag (upper nibble, rotates 0–15)
        buf[1] = 0x10;   // tag
        buf[2] = 0xff;   // valid_flag0
        buf[3] = 0xf7;   // valid_flag1
        buf[4] = r;      // motorRight (weak/high-freq)
        buf[5] = l;      // motorLeft  (strong/low-freq)
        const seed = new Uint8Array(75);
        seed[0] = 0xa2; seed[1] = 0x31;
        seed.set(buf.slice(0, 73), 2);
        const crc = DualSense._crc32(seed);
        buf[73] = (crc >>>  0) & 0xff;
        buf[74] = (crc >>>  8) & 0xff;
        buf[75] = (crc >>> 16) & 0xff;
        buf[76] = (crc >>> 24) & 0xff;
        this.device.sendReport(0x31, buf).catch(() => {});
      } else {
        const buf = new Uint8Array(47);
        buf[0] = 0xff;   // valid_flag0
        buf[1] = 0xf7;   // valid_flag1
        buf[2] = r;      // motorRight
        buf[3] = l;      // motorLeft
        this.device.sendReport(0x02, buf).catch(() => {});
      }
    };
    _send(right, left);
    if (durationMs > 0) setTimeout(() => _send(0, 0), durationMs);
  }
}

window.DualSense = DualSense;
