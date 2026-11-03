// The roadmap's proposed field widths exceed 80 bits. This wire format uses
// 12-bit sequences and half-pixel positions to retain a true ten-byte packet.
const fields = [['sequence',12],['timestamp',16],['x',12],['y',12],['level',7],['status',3],['shots',4],['angle',12],['reserved',2]];
export const STATUS = { ready: 0, moving: 1, won: 2 };
export function encodeTelemetry(frame) {
  const values = { ...frame, x: Math.round(frame.x * 2), y: Math.round(frame.y * 2), angle: Math.round((((frame.angle ?? 0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 4095), status: typeof frame.status === 'string' ? STATUS[frame.status] : frame.status, reserved: 0 };
  let bits = 0n;
  for (const [key,width] of fields) bits = bits << BigInt(width) | BigInt(Math.max(0,Math.min(2 ** width - 1,Math.round(values[key] ?? 0))));
  const bytes = new Uint8Array(10);
  for (let i = 9; i >= 0; i--) { bytes[i] = Number(bits & 255n); bits >>= 8n; }
  return bytes.buffer;
}
export function decodeTelemetry(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.byteLength !== 10) throw new RangeError('Telemetry must contain ten bytes');
  let bits = 0n; for (const byte of bytes) bits = bits << 8n | BigInt(byte);
  const result = {};
  for (const [key,width] of [...fields].reverse()) { result[key] = Number(bits & ((1n << BigInt(width)) - 1n)); bits >>= BigInt(width); }
  result.x /= 2; result.y /= 2; result.angle = result.angle / 4095 * Math.PI * 2;
  return result;
}
export const isNewer = (next, previous, modulus = 4096) => { const delta = (next - previous + modulus) % modulus; return delta > 0 && delta < modulus / 2; };
export const unwrapTime = (stamp, near) => near + ((stamp - near % 65536 + 98304) % 65536 - 32768);

export class GhostBuffer {
  constructor(delay = 60) { this.delay = delay; this.frames = []; }
  push(frame, receivedAt) {
    const last = this.frames.at(-1);
    if (last && !isNewer(frame.sequence, last.sequence)) return;
    this.frames.push({ ...frame, time: unwrapTime(frame.timestamp, receivedAt) });
    if (this.frames.length > 32) this.frames.shift();
  }
  sample(now) {
    if (!this.frames.length) return null;
    const target = now - this.delay;
    let index = this.frames.findIndex(frame => frame.time >= target);
    if (index <= 0) return this.frames[index === 0 ? 0 : this.frames.length - 1];
    const a = this.frames[index - 1], b = this.frames[index];
    if (a.level !== b.level || Math.hypot(b.x-a.x,b.y-a.y) > 220) return b;
    const previous = this.frames[Math.max(0,index-2)], next = this.frames[Math.min(this.frames.length-1,index+1)];
    const dt = Math.max(1,b.time-a.time), t = Math.max(0,Math.min(1,(target-a.time)/dt));
    const h00 = 2*t*t*t-3*t*t+1, h10 = t*t*t-2*t*t+t, h01 = -2*t*t*t+3*t*t, h11 = t*t*t-t*t;
    const interpolate = key => h00*a[key]+h10*(b[key]-previous[key])/Math.max(1,b.time-previous.time)*dt+h01*b[key]+h11*(next[key]-a[key])/Math.max(1,next.time-a.time)*dt;
    return { ...b, x: interpolate('x'), y: interpolate('y'), angle: a.angle + Math.atan2(Math.sin(b.angle-a.angle),Math.cos(b.angle-a.angle))*t };
  }
}
