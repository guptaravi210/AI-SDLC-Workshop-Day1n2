const SINGAPORE_TIMEZONE = "Asia/Singapore";
const SINGAPORE_UTC_OFFSET = "+08:00";
const DATETIME_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/i;

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) {
    return false;
  }

  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= maxDay;
}

function isValidTimeParts(hour: number, minute: number, second: number): boolean {
  if (hour < 0 || hour > 23) {
    return false;
  }

  if (minute < 0 || minute > 59) {
    return false;
  }

  return second >= 0 && second <= 59;
}

export function getSingaporeNow(): Date {
  return new Date();
}

export function parseDateInSingapore(input: string): Date | null {
  const match = DATETIME_REGEX.exec(input);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const hour = Number.parseInt(match[4], 10);
  const minute = Number.parseInt(match[5], 10);
  const second = Number.parseInt(match[6] ?? "0", 10);
  const milliseconds = Number.parseInt((match[7] ?? "0").padEnd(3, "0"), 10);
  const timezone = match[8] ?? SINGAPORE_UTC_OFFSET;

  if (!isValidDateParts(year, month, day) || !isValidTimeParts(hour, minute, second)) {
    return null;
  }

  const normalized = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${String(second).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}${timezone}`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function toSingaporeDate(input: string | Date): Date {
  if (input instanceof Date) {
    return input;
  }

  const parsed = parseDateInSingapore(input);
  return parsed ?? new Date(input);
}

export function formatSingaporeDate(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: SINGAPORE_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
