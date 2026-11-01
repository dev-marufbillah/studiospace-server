/** Shared request-validation helpers. */

export const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
export const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Escapes user input before it is embedded in a MongoDB $regex. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True for a real calendar date in YYYY-MM-DD form. */
export function isValidCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/** "YYYY-MM-DD" compared against today in server-local time. */
export function isPastDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return true;
  const target = new Date(year, month - 1, day);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return target.getTime() < startOfToday.getTime();
}

/** Converts "HH:MM" to minutes since midnight. */
export function timeToMinutes(value: string): number {
  const match = TIME_PATTERN.exec(value);
  if (!match) throw new Error(`Invalid time: ${value}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    throw new Error(`Invalid time: ${value}`);
  }
  return hours * 60 + minutes;
}
