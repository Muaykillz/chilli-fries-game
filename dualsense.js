// DualSense Web HID driver — USB only
class DualSense {
  static VENDOR_ID  = 0x054C;
  static PRODUCT_ID = 0x0CE6;

  // ±2000 deg/s full-scale over int16 range
  static GYRO_SCALE = 2000 / 32768;

  constructor() {
    this.device    = null;
    this.connected = false;
    this.gyroX = 0; // deg/s — pitch  (tilt forward/back)
    this.gyroY = 0; // deg/s — yaw    (rotate flat)
    this.gyroZ = 0; // deg/s — roll   (tilt left/right when held normally)
    this._listeners = {};
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
    this.gyroX = this.gyroY = this.gyroZ = 0;
    this._emit('disconnect');
  }

  // USB Input Report 0x01 — data arrives without report ID prefix
  // Gyro X: bytes 13–14 | Gyro Y: 15–16 | Gyro Z: 17–18 (int16 little-endian)
  _onReport({ reportId, data }) {
    if (reportId !== 0x01) return;
    this.gyroX = data.getInt16(13, true) * DualSense.GYRO_SCALE;
    this.gyroY = data.getInt16(15, true) * DualSense.GYRO_SCALE;
    this.gyroZ = data.getInt16(17, true) * DualSense.GYRO_SCALE;
  }

  // USB Output Report 0x02 (47 bytes)
  // valid_flag0 = 0xff (enable COMPATIBLE_VIBRATION + HAPTICS_SELECT + all features)
  // valid_flag1 = 0xf7 (enable lightbar, player LEDs, etc.)
  // byte 2 = motorRight 0–255 (weak/high-freq, DS4 compat mode)
  // byte 3 = motorLeft  0–255 (strong/low-freq, DS4 compat mode)
  rumble(right = 128, left = 64, durationMs = 200) {
    if (!this.device?.opened) return;
    const _send = (r, l) => {
      const buf = new Uint8Array(47);
      buf[0] = 0xff;
      buf[1] = 0xf7;
      buf[2] = r;
      buf[3] = l;
      this.device.sendReport(0x02, buf).catch(() => {});
    };
    _send(right, left);
    if (durationMs > 0) setTimeout(() => _send(0, 0), durationMs);
  }
}

window.DualSense = DualSense;
