import { getSingaporeNow, parseDateInSingapore } from "@/lib/timezone";

export type Priority = "high" | "medium" | "low";
export type RecurrencePattern = "daily" | "weekly" | "monthly" | "yearly";

const PRIORITY_WEIGHT: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function isDueDateValid(dueDate: string): boolean {
  const parsed = parseDateInSingapore(dueDate);
  if (!parsed) {
    return false;
  }

  const minDate = new Date(getSingaporeNow().getTime() + 60 * 1000);
  return parsed >= minDate;
}

export function sortTodos<T extends { priority: Priority; due_date: string | null; created_at: string }>(
  todos: T[]
): T[] {
  return [...todos].sort((a, b) => {
    const p = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    if (p !== 0) {
      return p;
    }

    if (a.due_date && b.due_date) {
      const aDue = parseDateInSingapore(a.due_date);
      const bDue = parseDateInSingapore(b.due_date);
      const dueSort = (aDue?.getTime() ?? Number.MAX_SAFE_INTEGER) - (bDue?.getTime() ?? Number.MAX_SAFE_INTEGER);
      if (dueSort !== 0) {
        return dueSort;
      }
    }

    if (a.due_date && !b.due_date) {
      return -1;
    }

    if (!a.due_date && b.due_date) {
      return 1;
    }

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

function getSingaporeDateParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const readPart = (type: string) => Number.parseInt(parts.find((part) => part.type === type)?.value ?? "0", 10);

  return {
    year: readPart("year"),
    month: readPart("month"),
    day: readPart("day"),
    hour: readPart("hour"),
    minute: readPart("minute"),
    second: readPart("second"),
  };
}

function toSingaporeDateTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  milliseconds: number
): Date {
  const y = String(year).padStart(4, "0");
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  const ss = String(second).padStart(2, "0");
  const ms = String(milliseconds).padStart(3, "0");
  return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}.${ms}+08:00`);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function calculateNextRecurringDueDate(dueDate: string, pattern: RecurrencePattern): string | null {
  const parsed = parseDateInSingapore(dueDate);
  if (!parsed) {
    return null;
  }

  if (pattern === "daily") {
    return new Date(parsed.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }

  if (pattern === "weekly") {
    return new Date(parsed.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  const parts = getSingaporeDateParts(parsed);
  const milliseconds = parsed.getUTCMilliseconds();

  if (pattern === "monthly") {
    const targetMonthRaw = parts.month + 1;
    const targetYear = targetMonthRaw > 12 ? parts.year + 1 : parts.year;
    const targetMonth = targetMonthRaw > 12 ? 1 : targetMonthRaw;
    const targetDay = Math.min(parts.day, daysInMonth(targetYear, targetMonth));
    return toSingaporeDateTime(
      targetYear,
      targetMonth,
      targetDay,
      parts.hour,
      parts.minute,
      parts.second,
      milliseconds
    ).toISOString();
  }

  const targetYear = parts.year + 1;
  const targetDay = Math.min(parts.day, daysInMonth(targetYear, parts.month));
  return toSingaporeDateTime(
    targetYear,
    parts.month,
    targetDay,
    parts.hour,
    parts.minute,
    parts.second,
    milliseconds
  ).toISOString();
}

export function calculateProgress(subtasks: Array<{ is_completed: number }>): number {
  if (subtasks.length === 0) {
    return 0;
  }

  const completed = subtasks.filter((subtask) => subtask.is_completed === 1).length;
  return Math.round((completed / subtasks.length) * 100);
}

export function isAnyFilterActive(filters: {
  searchQuery: string;
  priority: "all" | Priority;
  tagId: "all" | number;
  completion: "all" | "incomplete" | "completed";
  dueDateFrom: string;
  dueDateTo: string;
}): boolean {
  return (
    filters.searchQuery.trim() !== "" ||
    filters.priority !== "all" ||
    filters.tagId !== "all" ||
    filters.completion !== "all" ||
    filters.dueDateFrom !== "" ||
    filters.dueDateTo !== ""
  );
}
