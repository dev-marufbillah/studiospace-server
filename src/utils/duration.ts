const UNIT_TO_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/**
 * Parses duration strings such as "7d", "12h", "30m", "45s", "2w"
 * (a plain number is interpreted as seconds) into milliseconds.
 */
export function durationToMs(spec: string): number {
  const trimmed = spec.trim();
  const match = /^(\d+)\s*([smhdw])$/i.exec(trimmed);
  if (match) {
    const amount = match[1];
    const unit = match[2];
    if (!amount || !unit) {
      throw new Error(`Invalid duration format: "${spec}"`);
    }
    const multiplier = UNIT_TO_MS[unit.toLowerCase()];
    if (multiplier === undefined) {
      throw new Error(`Invalid duration unit in: "${spec}"`);
    }
    return Number(amount) * multiplier;
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1_000;
  }
  throw new Error(
    `Invalid duration format: "${spec}". Use e.g. "7d", "12h", "30m", "45s".`
  );
}

/** Same as durationToMs but returned in whole seconds (for JWT expiresIn). */
export function durationToSeconds(spec: string): number {
  return Math.floor(durationToMs(spec) / 1_000);
}
