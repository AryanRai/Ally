// Shake-to-summon: rapid side-to-side cursor motion opens Circle to Ask (like ChromeOS).
import { screen } from 'electron';

const SAMPLE_MS = 16;
const MIN_SWING_PX = 60;      // each swing must travel at least this far
const REVERSALS_NEEDED = 5;   // direction changes within the window
const WINDOW_MS = 900;
const COOLDOWN_MS = 2000;

let timer: NodeJS.Timeout | null = null;

/** Pure detector so the thresholds can be unit-tested without Electron. */
export function createShakeDetector(onShake: () => void) {
  let lastX: number | null = null;
  let direction = 0;          // -1 left, +1 right
  let swingStart = 0;         // x where the current swing began
  let reversals: number[] = [];
  let cooldownUntil = 0;

  return (x: number, now: number) => {
    if (lastX === null) {
      lastX = x;
      swingStart = x;
      return;
    }
    const dx = x - lastX;
    lastX = x;
    if (dx === 0) return;
    const dir = Math.sign(dx);
    if (dir !== direction) {
      if (direction !== 0 && Math.abs(x - dx - swingStart) >= MIN_SWING_PX) reversals.push(now);
      direction = dir;
      swingStart = x - dx;
    }
    reversals = reversals.filter(t => now - t <= WINDOW_MS);
    if (reversals.length >= REVERSALS_NEEDED && now >= cooldownUntil) {
      reversals = [];
      cooldownUntil = now + COOLDOWN_MS;
      onShake();
    }
  };
}

export function startShakeDetection(onShake: () => void): void {
  stopShakeDetection();
  const feed = createShakeDetector(onShake);
  timer = setInterval(() => feed(screen.getCursorScreenPoint().x, Date.now()), SAMPLE_MS);
}

export function stopShakeDetection(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
