"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatSingaporeDate, getSingaporeNow, parseDateInSingapore } from "@/lib/timezone";

type Priority = "high" | "medium" | "low";

interface CalendarTodo {
  id: number;
  title: string;
  due_date: string | null;
  priority: Priority;
  is_completed: number;
  is_recurring: number;
  recurrence_pattern: string;
}

interface Holiday {
  id: number;
  holiday_date: string;
  name: string;
}

function getMonthFromQuery(monthParam: string | null): Date {
  if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
    return getSingaporeNow();
  }

  return new Date(`${monthParam}-01T00:00:00+08:00`);
}

function toMonthText(date: Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    month: "long",
    year: "numeric",
  }).format(date);
}

function toMonthKey(date: Date): string {
  const year = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric" }).format(date);
  const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", month: "2-digit" }).format(date);
  return `${year}-${month}`;
}

function CalendarPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const monthParam = searchParams.get("month");
  const [todos, setTodos] = useState<CalendarTodo[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const monthDate = useMemo(() => getMonthFromQuery(monthParam), [monthParam]);

  useEffect(() => {
    async function load() {
      const monthKey = toMonthKey(monthDate);
      const [todoRes, holidayRes] = await Promise.all([
        fetch("/api/todos"),
        fetch(`/api/holidays?year=${monthKey.slice(0, 4)}&month=${monthKey.slice(5, 7)}`),
      ]);

      if (todoRes.ok) {
        const todoData = (await todoRes.json()) as CalendarTodo[];
        setTodos(todoData);
      }

      if (holidayRes.ok) {
        const holidayData = (await holidayRes.json()) as Holiday[];
        setHolidays(holidayData);
      }
    }

    void load();
  }, [monthDate]);

  const dayCells = useMemo(() => {
    const monthKey = toMonthKey(monthDate);
    const base = new Date(`${monthKey}-01T00:00:00+08:00`);
    const start = new Date(base);
    start.setDate(1 - start.getDay());

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const dateKey = formatSingaporeDate(date.toISOString()).slice(0, 10);
      const dayTodos = todos.filter((todo) => todo.due_date && formatSingaporeDate(todo.due_date).slice(0, 10) === dateKey);
      const dayHoliday = holidays.filter((holiday) => holiday.holiday_date === dateKey);

      return {
        date,
        dateKey,
        dayTodos,
        dayHoliday,
        isCurrentMonth: toMonthKey(date) === monthKey,
      };
    });
  }, [holidays, monthDate, todos]);

  const selectedTodos = selectedDate
    ? todos.filter((todo) => todo.due_date && formatSingaporeDate(todo.due_date).slice(0, 10) === selectedDate)
    : [];

  const selectedHolidays = selectedDate ? holidays.filter((holiday) => holiday.holiday_date === selectedDate) : [];

  function navigateMonth(offset: number) {
    const next = new Date(monthDate);
    next.setMonth(next.getMonth() + offset);
    router.push(`/calendar?month=${toMonthKey(next)}`);
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-3xl font-semibold">Calendar</h1>
          <Link href="/" className="rounded border border-slate-300 bg-white px-3 py-2">
            Back to Todos
          </Link>
        </header>

        <div className="mb-4 flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <button className="rounded border border-slate-300 bg-white px-3 py-2" onClick={() => navigateMonth(-1)}>
              Prev
            </button>
            <button className="rounded border border-slate-300 bg-white px-3 py-2" onClick={() => navigateMonth(1)}>
              Next
            </button>
            <button className="rounded bg-blue-600 px-3 py-2 text-white" onClick={() => router.push("/calendar")}>Today</button>
          </div>
          <p className="text-xl font-semibold">{toMonthText(monthDate)}</p>
        </div>

        <div className="grid grid-cols-7 gap-2 rounded-xl bg-white p-4 shadow-sm">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="rounded bg-slate-50 p-2 text-center text-sm font-semibold">
              {day}
            </div>
          ))}
          {dayCells.map((cell) => (
            <button
              key={cell.dateKey + cell.date.toISOString()}
              className={`min-h-28 rounded border p-2 text-left ${
                cell.isCurrentMonth ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 text-slate-400"
              }`}
              onClick={() => setSelectedDate(cell.dateKey)}
            >
              <p className="text-sm font-semibold">{new Intl.DateTimeFormat("en-GB", { day: "numeric" }).format(cell.date)}</p>
              {cell.dayHoliday.map((holiday) => (
                <p key={holiday.id} className="truncate text-xs text-rose-700">
                  {holiday.name}
                </p>
              ))}
              {cell.dayTodos.slice(0, 2).map((todo) => (
                <p key={todo.id} className={`truncate text-xs ${todo.priority === "high" ? "text-red-700" : todo.priority === "medium" ? "text-amber-700" : "text-blue-700"}`}>
                  {todo.title}
                </p>
              ))}
            </button>
          ))}
        </div>

        {selectedDate ? (
          <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold">{selectedDate}</h2>
              <button className="rounded border border-slate-300 px-2 py-1" onClick={() => setSelectedDate(null)}>
                Close
              </button>
            </div>
            {selectedHolidays.map((holiday) => (
              <p key={holiday.id} className="mb-2 text-sm text-rose-700">
                {holiday.name}
              </p>
            ))}
            {selectedTodos.length === 0 ? <p className="text-sm text-slate-500">No todos on this date.</p> : null}
            <ul className="space-y-2">
              {selectedTodos.map((todo) => (
                <li key={todo.id} className="rounded border border-slate-200 p-2 text-sm">
                  <span className="font-semibold">{todo.title}</span>
                  {todo.due_date ? ` - Due ${formatSingaporeDate(todo.due_date)}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </main>
  );
}

export default function CalendarPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
          <div className="mx-auto max-w-6xl rounded-xl bg-white p-4 shadow-sm">Loading calendar...</div>
        </main>
      }
    >
      <CalendarPageContent />
    </Suspense>
  );
}
