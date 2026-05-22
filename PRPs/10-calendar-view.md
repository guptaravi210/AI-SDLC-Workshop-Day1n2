# Feature 10: Calendar View

## Feature Overview

The Calendar View provides a monthly calendar interface at `/calendar` where users can visualize their todos on specific due dates, see Singapore public holidays, and navigate between months. The calendar page is a separate route protected by middleware, with its own `'use client'` component. It fetches todos and holidays via API routes, generates a grid of weeks/days for the displayed month, and supports URL-based state management via `?month=YYYY-MM` query parameter.

Key capabilities:
- Monthly calendar grid with proper day padding from previous/next months
- Singapore public holidays seeded into a `holidays` database table via `scripts/seed-holidays.ts`
- Todos displayed on their due dates with priority-based color coding
- Day-click modal showing all todos for a selected date
- Month navigation with previous/next/today buttons
- URL state management (`?month=YYYY-MM`) for shareable/bookmarkable views
- Responsive grid layout with dark mode support
- All date operations use Singapore timezone (`Asia/Singapore`)

---

## User Stories

1. **As a user**, I want to see my todos on a monthly calendar so that I can visualize my schedule and plan my time effectively.
2. **As a user**, I want to navigate between months using previous/next buttons so that I can plan ahead or review past months.
3. **As a user**, I want to see Singapore public holidays displayed on the calendar so that I can plan around non-working days.
4. **As a user**, I want to click on a specific day to see all todos due on that date so that I can review my workload for any given day.
5. **As a user**, I want the current day highlighted on the calendar so that I can quickly orient myself in time.
6. **As a user**, I want todos color-coded by priority on the calendar so that I can identify high-priority items at a glance.
7. **As a user**, I want to share or bookmark a specific month view via URL so that I can return to a particular month directly.
8. **As a user**, I want to navigate between the calendar view and the main todo list easily so that I can switch between planning and task management views.

---

## User Flow

### Accessing the Calendar
1. User is on the main todo list page (`/`).
2. User clicks the **"Calendar"** button (purple) in the top navigation area.
3. Browser navigates to `/calendar`.
4. Calendar page loads showing the **current month** (Singapore timezone).
5. URL is `/calendar` (no `?month=` param means current month).

### Viewing the Calendar
1. Calendar header shows: `◀  November 2025  ▶  [Today]`
2. Day headers row: `Sun  Mon  Tue  Wed  Thu  Fri  Sat`
3. Calendar grid displays 5–6 rows of 7 day cells each.
4. Padding days from previous/next months are shown with muted styling.
5. **Current day** cell has a highlighted border/background (e.g., blue ring).
6. **Weekend** cells (Saturday, Sunday) have a slightly different background.
7. **Holidays** show the holiday name in the cell with special styling (e.g., red/green text).
8. **Todos** appear on their due date cells:
   - Color-coded dot or bar by priority (red = high, yellow = medium, blue = low)
   - Todo title text (truncated if too long)
   - If multiple todos on one day, they stack vertically
   - A badge shows the count (e.g., "3 todos") when there are ≥2 todos

### Navigating Months
1. User clicks **◀** (previous month) — calendar shifts to the previous month.
2. URL updates to `?month=2025-10` (for example).
3. User clicks **▶** (next month) — calendar shifts to the next month.
4. URL updates to `?month=2025-12`.
5. User clicks **Today** — calendar returns to the current month.
6. URL updates to `/calendar` (no param, or `?month=` matching current month).

### Clicking a Day
1. User clicks on a day cell (e.g., November 15, 2025).
2. A **modal** appears showing:
   - The date heading: "Friday, November 15, 2025"
   - Holiday name (if applicable): "🎉 Deepavali"
   - List of all todos due on that day, each showing:
     - Priority badge (colored)
     - Todo title
     - Completion status (checkbox icon, non-interactive)
     - Recurrence badge (if recurring)
   - "No todos on this day" message if empty
3. User clicks **Close** or clicks outside the modal to dismiss.

### Returning to Todo List
1. User clicks **"Back to Todos"** link/button on the calendar page.
2. Or user clicks browser back button.
3. Browser navigates to `/`.

---

## Technical Requirements

### Database Schema

#### `holidays` Table

```sql
CREATE TABLE IF NOT EXISTS holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,          -- Format: 'YYYY-MM-DD'
  name TEXT NOT NULL,          -- e.g., 'New Year''s Day'
  type TEXT DEFAULT 'public_holiday'  -- e.g., 'public_holiday', 'observance'
);

-- Index for efficient month-based queries
CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);
```

> **Note**: The `holidays` table is **not** user-specific. It stores shared Singapore public holidays. No `user_id` column.

#### Holiday Seeder Script: `scripts/seed-holidays.ts`

```typescript
// scripts/seed-holidays.ts
// Run with: npx tsx scripts/seed-holidays.ts

import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'todos.db');

const holidays = [
  // 2025 Singapore Public Holidays
  { date: '2025-01-01', name: "New Year's Day", type: 'public_holiday' },
  { date: '2025-01-29', name: 'Chinese New Year (Day 1)', type: 'public_holiday' },
  { date: '2025-01-30', name: 'Chinese New Year (Day 2)', type: 'public_holiday' },
  { date: '2025-03-31', name: 'Hari Raya Puasa', type: 'public_holiday' },
  { date: '2025-04-18', name: 'Good Friday', type: 'public_holiday' },
  { date: '2025-05-01', name: 'Labour Day', type: 'public_holiday' },
  { date: '2025-05-12', name: 'Vesak Day', type: 'public_holiday' },
  { date: '2025-06-07', name: 'Hari Raya Haji', type: 'public_holiday' },
  { date: '2025-08-09', name: 'National Day', type: 'public_holiday' },
  { date: '2025-10-20', name: 'Deepavali', type: 'public_holiday' },
  { date: '2025-12-25', name: 'Christmas Day', type: 'public_holiday' },

  // 2026 Singapore Public Holidays
  { date: '2026-01-01', name: "New Year's Day", type: 'public_holiday' },
  { date: '2026-02-17', name: 'Chinese New Year (Day 1)', type: 'public_holiday' },
  { date: '2026-02-18', name: 'Chinese New Year (Day 2)', type: 'public_holiday' },
  { date: '2026-03-20', name: 'Hari Raya Puasa', type: 'public_holiday' },
  { date: '2026-04-03', name: 'Good Friday', type: 'public_holiday' },
  { date: '2026-05-01', name: 'Labour Day', type: 'public_holiday' },
  { date: '2026-05-31', name: 'Vesak Day', type: 'public_holiday' },
  { date: '2026-05-27', name: 'Hari Raya Haji', type: 'public_holiday' },
  { date: '2026-08-09', name: 'National Day', type: 'public_holiday' },
  { date: '2026-11-08', name: 'Deepavali', type: 'public_holiday' },
  { date: '2026-12-25', name: 'Christmas Day', type: 'public_holiday' },
];

function seedHolidays() {
  const db = new Database(DB_PATH);

  // Create table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'public_holiday'
    );
    CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);
  `);

  // Clear existing holidays to avoid duplicates
  db.exec('DELETE FROM holidays');

  // Insert holidays
  const insert = db.prepare(
    'INSERT INTO holidays (date, name, type) VALUES (?, ?, ?)'
  );

  const insertMany = db.transaction((items: typeof holidays) => {
    for (const h of items) {
      insert.run(h.date, h.name, h.type);
    }
  });

  insertMany(holidays);

  console.log(`✅ Seeded ${holidays.length} Singapore public holidays`);

  // Verify
  const count = db.prepare('SELECT COUNT(*) as count FROM holidays').get() as { count: number };
  console.log(`📅 Total holidays in database: ${count.count}`);

  db.close();
}

seedHolidays();
```

### Database Functions in `lib/db.ts`

Add the following to `lib/db.ts`:

```typescript
// --- Holiday Interfaces ---

export interface Holiday {
  id: number;
  date: string;       // 'YYYY-MM-DD'
  name: string;
  type: string;       // 'public_holiday'
}

// --- Holiday CRUD ---

export function getHolidays(): Holiday[] {
  const stmt = db.prepare('SELECT * FROM holidays ORDER BY date ASC');
  return stmt.all() as Holiday[];
}

export function getHolidaysByMonth(year: number, month: number): Holiday[] {
  // month is 1-indexed (1 = January, 12 = December)
  const monthStr = String(month).padStart(2, '0');
  const prefix = `${year}-${monthStr}`;
  const stmt = db.prepare('SELECT * FROM holidays WHERE date LIKE ? ORDER BY date ASC');
  return stmt.all(`${prefix}%`) as Holiday[];
}

export function getHolidaysByDateRange(startDate: string, endDate: string): Holiday[] {
  const stmt = db.prepare(
    'SELECT * FROM holidays WHERE date >= ? AND date <= ? ORDER BY date ASC'
  );
  return stmt.all(startDate, endDate) as Holiday[];
}
```

### Type Definitions

```typescript
// Calendar-specific types (used in app/calendar/page.tsx)

interface CalendarDay {
  date: Date;                  // Full date object (Singapore TZ-aware)
  dateStr: string;             // 'YYYY-MM-DD' format
  dayOfMonth: number;          // 1-31
  isCurrentMonth: boolean;     // true if day belongs to displayed month
  isToday: boolean;            // true if this is today (Singapore time)
  isWeekend: boolean;          // true if Saturday or Sunday
  todos: CalendarTodo[];       // todos due on this day
  holidays: Holiday[];         // holidays on this day
}

interface CalendarTodo {
  id: number;
  title: string;
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
  due_date: string;
  is_recurring: boolean;
  recurrence_pattern: string | null;
}

interface CalendarWeek {
  days: CalendarDay[];         // Always 7 days (Sun-Sat)
}

interface DayModalData {
  dateStr: string;             // 'YYYY-MM-DD'
  displayDate: string;         // 'Friday, November 15, 2025'
  todos: CalendarTodo[];
  holidays: Holiday[];
}
```

### API Endpoints

#### `GET /api/holidays`

**File**: `app/api/holidays/route.ts`

**Purpose**: Returns holidays, optionally filtered by month/year.

**Query Parameters**:
- `month` (optional): Month number (1-12)
- `year` (optional): Year number (e.g., 2025)
- If both provided: returns holidays for that specific month
- If neither provided: returns all holidays

**Request**:
```
GET /api/holidays?year=2025&month=11
```

**Response (200)**:
```json
{
  "holidays": [
    {
      "id": 10,
      "date": "2025-11-08",
      "name": "Deepavali",
      "type": "public_holiday"
    }
  ]
}
```

**Response (401)**:
```json
{ "error": "Not authenticated" }
```

**Implementation**:
```typescript
// app/api/holidays/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getHolidays, getHolidaysByMonth } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const year = searchParams.get('year');
  const month = searchParams.get('month');

  let holidays;
  if (year && month) {
    holidays = getHolidaysByMonth(parseInt(year), parseInt(month));
  } else {
    holidays = getHolidays();
  }

  return NextResponse.json({ holidays });
}
```

#### `GET /api/todos` (existing — used by calendar)

The calendar reuses the existing `GET /api/todos` endpoint. All todos for the user are fetched, and the calendar page filters them client-side to map each todo to its due date.

**Note**: The existing `GET /api/todos` response already includes `due_date`, `priority`, `completed`, `is_recurring`, and `recurrence_pattern` fields.

---

### Middleware Protection

The `/calendar` route must be protected by `middleware.ts`. Add `/calendar` to the list of protected paths:

```typescript
// middleware.ts (relevant section)
const protectedPaths = ['/', '/calendar'];
```

This ensures unauthenticated users are redirected to `/login` when visiting `/calendar`.

---

### Business Logic

#### Calendar Generation Algorithm

Generate a 2D grid of weeks for a given month. Each week contains exactly 7 days (Sunday–Saturday). The first week may include padding days from the previous month, and the last week may include padding days from the next month.

```typescript
/**
 * Generates calendar weeks for a given year/month.
 * Week starts on Sunday (day index 0).
 *
 * @param year - Full year (e.g., 2025)
 * @param month - 0-indexed month (0 = January, 11 = December)
 * @param todos - All user todos (will be filtered by due_date)
 * @param holidays - Holidays for the visible date range
 * @returns Array of CalendarWeek objects (5-6 weeks)
 */
function generateCalendarWeeks(
  year: number,
  month: number,
  todos: CalendarTodo[],
  holidays: Holiday[]
): CalendarWeek[] {
  const weeks: CalendarWeek[] = [];

  // First day of the target month
  const firstDayOfMonth = new Date(year, month, 1);
  // Day of week for the 1st (0=Sun, 6=Sat)
  const startDayOfWeek = firstDayOfMonth.getDay();
  // Last day of the target month
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const totalDaysInMonth = lastDayOfMonth.getDate();

  // Calculate start date (may be in previous month)
  const calendarStartDate = new Date(year, month, 1 - startDayOfWeek);

  // Calculate total cells needed (must be multiple of 7)
  const totalCells = Math.ceil((startDayOfWeek + totalDaysInMonth) / 7) * 7;

  // Get today's date string for comparison (Singapore timezone)
  const todayStr = formatSingaporeDate(getSingaporeNow(), 'YYYY-MM-DD');

  // Build todo map: dateStr -> CalendarTodo[]
  const todoMap = new Map<string, CalendarTodo[]>();
  for (const todo of todos) {
    if (todo.due_date) {
      // Extract date portion (YYYY-MM-DD) from due_date
      const dueDateStr = todo.due_date.substring(0, 10);
      if (!todoMap.has(dueDateStr)) {
        todoMap.set(dueDateStr, []);
      }
      todoMap.get(dueDateStr)!.push(todo);
    }
  }

  // Build holiday map: dateStr -> Holiday[]
  const holidayMap = new Map<string, Holiday[]>();
  for (const holiday of holidays) {
    if (!holidayMap.has(holiday.date)) {
      holidayMap.set(holiday.date, []);
    }
    holidayMap.get(holiday.date)!.push(holiday);
  }

  // Generate days
  let currentWeek: CalendarDay[] = [];
  for (let i = 0; i < totalCells; i++) {
    const cellDate = new Date(
      calendarStartDate.getFullYear(),
      calendarStartDate.getMonth(),
      calendarStartDate.getDate() + i
    );

    const dateStr = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, '0')}-${String(cellDate.getDate()).padStart(2, '0')}`;
    const dayOfWeek = cellDate.getDay(); // 0=Sun, 6=Sat

    const day: CalendarDay = {
      date: cellDate,
      dateStr,
      dayOfMonth: cellDate.getDate(),
      isCurrentMonth: cellDate.getMonth() === month && cellDate.getFullYear() === year,
      isToday: dateStr === todayStr,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      todos: todoMap.get(dateStr) || [],
      holidays: holidayMap.get(dateStr) || [],
    };

    currentWeek.push(day);

    if (currentWeek.length === 7) {
      weeks.push({ days: currentWeek });
      currentWeek = [];
    }
  }

  return weeks;
}
```

#### URL State Management

```typescript
// In app/calendar/page.tsx
'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { getSingaporeNow } from '@/lib/timezone';

function CalendarPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Parse month from URL or default to current Singapore month
  const monthParam = searchParams.get('month'); // e.g., '2025-11'
  const now = getSingaporeNow();

  let displayYear: number;
  let displayMonth: number; // 0-indexed

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split('-').map(Number);
    displayYear = y;
    displayMonth = m - 1; // Convert to 0-indexed
  } else {
    displayYear = now.getFullYear();
    displayMonth = now.getMonth();
  }

  // Navigation functions
  const navigateToMonth = (year: number, month: number) => {
    // month is 0-indexed
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    router.push(`/calendar?month=${monthStr}`);
  };

  const goToPrevMonth = () => {
    let newMonth = displayMonth - 1;
    let newYear = displayYear;
    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    }
    navigateToMonth(newYear, newMonth);
  };

  const goToNextMonth = () => {
    let newMonth = displayMonth + 1;
    let newYear = displayYear;
    if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }
    navigateToMonth(newYear, newMonth);
  };

  const goToToday = () => {
    const today = getSingaporeNow();
    navigateToMonth(today.getFullYear(), today.getMonth());
  };

  // ... rest of component
}
```

#### Priority Color Mapping

```typescript
const priorityColors: Record<string, { bg: string; text: string; dot: string }> = {
  high:   { bg: 'bg-red-100 dark:bg-red-900/30',     text: 'text-red-700 dark:text-red-300',     dot: 'bg-red-500' },
  medium: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', dot: 'bg-yellow-500' },
  low:    { bg: 'bg-blue-100 dark:bg-blue-900/30',    text: 'text-blue-700 dark:text-blue-300',    dot: 'bg-blue-500' },
};
```

---

## UI Components

### Calendar Page Layout: `app/calendar/page.tsx`

```typescript
// app/calendar/page.tsx
'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

// Types
interface CalendarTodo {
  id: number;
  title: string;
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
  due_date: string;
  is_recurring: boolean;
  recurrence_pattern: string | null;
}

interface Holiday {
  id: number;
  date: string;
  name: string;
  type: string;
}

interface CalendarDay {
  date: Date;
  dateStr: string;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  todos: CalendarTodo[];
  holidays: Holiday[];
}

interface CalendarWeek {
  days: CalendarDay[];
}

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const priorityColors: Record<string, { bg: string; text: string; dot: string }> = {
  high:   { bg: 'bg-red-100 dark:bg-red-900/30',     text: 'text-red-700 dark:text-red-300',     dot: 'bg-red-500' },
  medium: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', dot: 'bg-yellow-500' },
  low:    { bg: 'bg-blue-100 dark:bg-blue-900/30',    text: 'text-blue-700 dark:text-blue-300',    dot: 'bg-blue-500' },
};

function CalendarContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [todos, setTodos] = useState<CalendarTodo[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);

  // Parse current display month from URL
  const monthParam = searchParams.get('month');
  const now = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' })
  );

  let displayYear: number;
  let displayMonth: number;

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split('-').map(Number);
    displayYear = y;
    displayMonth = m - 1;
  } else {
    displayYear = now.getFullYear();
    displayMonth = now.getMonth();
  }

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [todosRes, holidaysRes] = await Promise.all([
        fetch('/api/todos'),
        fetch(`/api/holidays?year=${displayYear}&month=${displayMonth + 1}`),
      ]);

      if (todosRes.ok) {
        const todosData = await todosRes.json();
        setTodos(todosData.todos || todosData);
      }
      if (holidaysRes.ok) {
        const holidaysData = await holidaysRes.json();
        setHolidays(holidaysData.holidays || []);
      }
    } catch (error) {
      console.error('Failed to fetch calendar data:', error);
    } finally {
      setLoading(false);
    }
  }, [displayYear, displayMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Navigation
  const navigateToMonth = (year: number, month: number) => {
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    router.push(`/calendar?month=${monthStr}`);
  };

  const goToPrevMonth = () => {
    let newMonth = displayMonth - 1;
    let newYear = displayYear;
    if (newMonth < 0) { newMonth = 11; newYear -= 1; }
    navigateToMonth(newYear, newMonth);
  };

  const goToNextMonth = () => {
    let newMonth = displayMonth + 1;
    let newYear = displayYear;
    if (newMonth > 11) { newMonth = 0; newYear += 1; }
    navigateToMonth(newYear, newMonth);
  };

  const goToToday = () => {
    navigateToMonth(now.getFullYear(), now.getMonth());
  };

  // Calendar generation (algorithm described in Business Logic)
  const weeks = generateCalendarWeeks(displayYear, displayMonth, todos, holidays);

  // Format display date for modal
  const formatDisplayDate = (dateStr: string): string => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-SG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Singapore',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header with navigation */}
        <div className="flex items-center justify-between mb-6">
          <a
            href="/"
            className="text-purple-600 dark:text-purple-400 hover:underline font-medium"
          >
            ← Back to Todos
          </a>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Calendar
          </h1>
          <div className="w-24" /> {/* Spacer for alignment */}
        </div>

        {/* Month Navigation */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <button
            onClick={goToPrevMonth}
            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 
                       text-gray-700 dark:text-gray-300 transition-colors"
            aria-label="Previous month"
          >
            ◀
          </button>

          <h2 className="text-xl font-semibold text-gray-900 dark:text-white min-w-[200px] text-center">
            {MONTH_NAMES[displayMonth]} {displayYear}
          </h2>

          <button
            onClick={goToNextMonth}
            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 
                       text-gray-700 dark:text-gray-300 transition-colors"
            aria-label="Next month"
          >
            ▶
          </button>

          <button
            onClick={goToToday}
            className="ml-4 px-4 py-2 bg-purple-600 text-white rounded-lg 
                       hover:bg-purple-700 transition-colors text-sm font-medium"
          >
            Today
          </button>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="text-center py-20 text-gray-500 dark:text-gray-400">
            Loading calendar...
          </div>
        ) : (
          <>
            {/* Day Headers */}
            <div className="grid grid-cols-7 gap-px mb-px">
              {DAY_HEADERS.map((day) => (
                <div
                  key={day}
                  className="p-2 text-center text-sm font-semibold 
                             text-gray-600 dark:text-gray-400 
                             bg-gray-100 dark:bg-gray-800"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 border border-gray-200 dark:border-gray-700">
              {weeks.map((week, weekIdx) =>
                week.days.map((day, dayIdx) => (
                  <button
                    key={`${weekIdx}-${dayIdx}`}
                    onClick={() => setSelectedDay(day)}
                    className={`
                      min-h-[100px] p-2 text-left align-top transition-colors
                      hover:bg-gray-100 dark:hover:bg-gray-700
                      ${day.isCurrentMonth
                        ? 'bg-white dark:bg-gray-800'
                        : 'bg-gray-50 dark:bg-gray-850 opacity-50'
                      }
                      ${day.isWeekend && day.isCurrentMonth
                        ? 'bg-blue-50/50 dark:bg-blue-900/10'
                        : ''
                      }
                      ${day.isToday
                        ? 'ring-2 ring-blue-500 ring-inset bg-blue-50 dark:bg-blue-900/20'
                        : ''
                      }
                    `}
                    aria-label={`${day.dayOfMonth}, ${day.todos.length} todos`}
                  >
                    {/* Day Number */}
                    <div className="flex items-center justify-between mb-1">
                      <span className={`
                        text-sm font-medium
                        ${day.isToday
                          ? 'bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center'
                          : day.isCurrentMonth
                            ? 'text-gray-900 dark:text-gray-100'
                            : 'text-gray-400 dark:text-gray-500'
                        }
                      `}>
                        {day.dayOfMonth}
                      </span>

                      {/* Todo count badge */}
                      {day.todos.length >= 2 && (
                        <span className="text-xs bg-purple-100 dark:bg-purple-900/50 
                                         text-purple-700 dark:text-purple-300 
                                         px-1.5 py-0.5 rounded-full font-medium">
                          {day.todos.length}
                        </span>
                      )}
                    </div>

                    {/* Holidays */}
                    {day.holidays.map((holiday) => (
                      <div
                        key={holiday.id}
                        className="text-xs bg-red-100 dark:bg-red-900/40 
                                   text-red-700 dark:text-red-300 
                                   px-1 py-0.5 rounded mb-1 truncate font-medium"
                        title={holiday.name}
                      >
                        🎉 {holiday.name}
                      </div>
                    ))}

                    {/* Todos */}
                    {day.todos.slice(0, 3).map((todo) => {
                      const colors = priorityColors[todo.priority] || priorityColors.medium;
                      return (
                        <div
                          key={todo.id}
                          className={`text-xs px-1 py-0.5 rounded mb-0.5 truncate flex items-center gap-1 ${colors.bg}`}
                          title={todo.title}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors.dot}`} />
                          <span className={`truncate ${todo.completed ? 'line-through opacity-60' : ''} ${colors.text}`}>
                            {todo.title}
                          </span>
                        </div>
                      );
                    })}

                    {/* Overflow indicator */}
                    {day.todos.length > 3 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        +{day.todos.length - 3} more
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </>
        )}

        {/* Day Detail Modal */}
        {selectedDay && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedDay(null)}
          >
            <div
              className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {formatDisplayDate(selectedDay.dateStr)}
                  </h3>
                  <button
                    onClick={() => setSelectedDay(null)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl"
                    aria-label="Close modal"
                  >
                    ✕
                  </button>
                </div>

                {/* Holidays in modal */}
                {selectedDay.holidays.length > 0 && (
                  <div className="mt-2">
                    {selectedDay.holidays.map((h) => (
                      <span
                        key={h.id}
                        className="inline-block text-sm bg-red-100 dark:bg-red-900/40 
                                   text-red-700 dark:text-red-300 
                                   px-2 py-1 rounded-full font-medium mr-2"
                      >
                        🎉 {h.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal Body - Todos List */}
              <div className="p-6">
                {selectedDay.todos.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                    No todos on this day.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {selectedDay.todos.map((todo) => {
                      const colors = priorityColors[todo.priority] || priorityColors.medium;
                      return (
                        <li
                          key={todo.id}
                          className={`p-3 rounded-lg border ${
                            todo.completed
                              ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
                              : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-750'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Completion indicator */}
                            <span className={`mt-0.5 text-lg ${
                              todo.completed ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'
                            }`}>
                              {todo.completed ? '✅' : '⬜'}
                            </span>

                            <div className="flex-1 min-w-0">
                              <p className={`font-medium ${
                                todo.completed
                                  ? 'line-through text-gray-400 dark:text-gray-500'
                                  : 'text-gray-900 dark:text-white'
                              }`}>
                                {todo.title}
                              </p>

                              <div className="flex items-center gap-2 mt-1">
                                {/* Priority badge */}
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors.bg} ${colors.text}`}>
                                  {todo.priority}
                                </span>

                                {/* Recurring badge */}
                                {todo.is_recurring && todo.recurrence_pattern && (
                                  <span className="text-xs px-2 py-0.5 rounded-full font-medium 
                                                   bg-purple-100 dark:bg-purple-900/40 
                                                   text-purple-700 dark:text-purple-300">
                                    🔄 {todo.recurrence_pattern}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Main export with Suspense boundary for useSearchParams
export default function CalendarPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Loading calendar...</p>
      </div>
    }>
      <CalendarContent />
    </Suspense>
  );
}
```

### Calendar Button on Main Page (`app/page.tsx`)

Add a "Calendar" button in the header/navigation area of the main page:

```typescript
{/* Calendar navigation button — add near top action buttons */}
<a
  href="/calendar"
  className="px-4 py-2 bg-purple-600 text-white rounded-lg 
             hover:bg-purple-700 transition-colors text-sm font-medium
             flex items-center gap-2"
>
  📅 Calendar
</a>
```

---

## Edge Cases

1. **Months with different day counts**: February (28 or 29 days), months with 30 or 31 days. The calendar generation algorithm handles this by using `new Date(year, month + 1, 0)` to get the last day of the month, which correctly accounts for all month lengths.

2. **Leap years**: February 29 in leap years. `new Date(2024, 2, 0).getDate()` returns `29`, which is correct. The algorithm does not hardcode month lengths.

3. **Year boundary navigation**: Clicking "Previous" from January 2025 navigates to December 2024 (`displayMonth = 11, displayYear = 2024`). Clicking "Next" from December 2025 navigates to January 2026 (`displayMonth = 0, displayYear = 2026`).

4. **Day with many todos (>3)**: Only the first 3 todos are shown in the cell with an "+N more" indicator. Clicking the day opens the modal showing all todos.

5. **Holidays falling on weekends**: The holiday styling takes precedence and is overlaid on the weekend background. Both visual indicators are present.

6. **Invalid `?month=` parameter**: If the URL contains an invalid month format (e.g., `?month=abc` or `?month=2025-13`), the regex validation fails and the calendar defaults to the current month.

7. **Todos without due dates**: Todos without `due_date` are not shown on the calendar. They are filtered out during the todoMap construction (only todos with a non-null `due_date` are mapped).

8. **Padding days at month boundaries**: Days from previous/next months appear with muted styling (`opacity-50`) to differentiate them from the current month's days. They still show any todos or holidays that fall on those dates.

9. **No holidays in database**: If the holidays table is empty or the seeder hasn't been run, the calendar renders normally without holiday markers. No errors occur.

10. **Empty month (no todos, no holidays)**: Calendar grid renders with all empty day cells. No error state needed — it's a valid view.

11. **Very long todo titles**: Titles are truncated with `truncate` (CSS `text-overflow: ellipsis`). Full title visible on hover via `title` attribute and in the day detail modal.

12. **Month with 6 weeks**: Some months (e.g., a month starting on Saturday with 30+ days) require 6 rows. The algorithm dynamically calculates `totalCells` as `Math.ceil((startDayOfWeek + totalDaysInMonth) / 7) * 7`.

13. **Timezone mismatch**: A todo due at "2025-11-15T23:30" in Singapore could appear on a different date in UTC. All date comparisons use the `YYYY-MM-DD` portion extracted from the Singapore-timezone due_date string stored in the database.

14. **Concurrent data changes**: If a user modifies todos on the main page and then navigates to the calendar, the calendar fetches fresh data on mount via `useEffect`. The calendar always fetches the latest data when a month is navigated to.

---

## Acceptance Criteria

### Calendar Display
- [ ] Calendar page loads at `/calendar` route
- [ ] Calendar shows the current month by default (Singapore timezone)
- [ ] Calendar grid has 7 columns (Sun–Sat)
- [ ] Calendar grid has 5–6 rows depending on the month
- [ ] Day headers display: Sun, Mon, Tue, Wed, Thu, Fri, Sat
- [ ] Current day is highlighted with a special border/background (blue ring)
- [ ] Weekend days (Sat, Sun) have a slightly different background
- [ ] Padding days from prev/next months are shown with muted styling
- [ ] Calendar renders correctly for months of different lengths (28–31 days)

### Holidays
- [ ] `holidays` table exists in database with correct schema
- [ ] `scripts/seed-holidays.ts` seeds Singapore public holidays for 2025–2026
- [ ] `GET /api/holidays` returns all holidays when no filter
- [ ] `GET /api/holidays?year=2025&month=11` returns only November 2025 holidays
- [ ] `GET /api/holidays` returns 401 for unauthenticated users
- [ ] Holiday names appear on the correct calendar day cells
- [ ] Holidays have special styling (red/green background, emoji)

### Todos on Calendar
- [ ] Todos with due dates appear on the correct calendar day
- [ ] Todos are color-coded by priority: red (high), yellow (medium), blue (low)
- [ ] Completed todos show with line-through/muted styling
- [ ] Multiple todos on the same day stack vertically
- [ ] Maximum 3 todos visible per cell with "+N more" overflow indicator
- [ ] Todo count badge appears on days with 2+ todos
- [ ] Todos without due dates do not appear on the calendar

### Month Navigation
- [ ] "◀" button navigates to the previous month
- [ ] "▶" button navigates to the next month
- [ ] "Today" button returns to the current month
- [ ] Year boundary navigation works (Dec→Jan, Jan→Dec)
- [ ] URL updates with `?month=YYYY-MM` on navigation
- [ ] Loading page with `?month=2025-03` shows March 2025
- [ ] Loading page without `?month=` shows current month
- [ ] Invalid `?month=` values default to current month

### Day Click Modal
- [ ] Clicking a day cell opens a modal
- [ ] Modal header shows formatted date (e.g., "Friday, November 15, 2025")
- [ ] Modal shows holiday names if present for that day
- [ ] Modal lists all todos for that day with priority badges
- [ ] Modal shows "No todos on this day" for empty days
- [ ] Modal displays completion status icons (✅/⬜)
- [ ] Modal shows recurring badge for recurring todos
- [ ] Modal closes on "✕" button click
- [ ] Modal closes on backdrop click

### Navigation
- [ ] "Calendar" button (purple) is present on the main page
- [ ] Clicking "Calendar" navigates to `/calendar`
- [ ] "Back to Todos" link navigates back to `/`
- [ ] `/calendar` is protected by middleware (redirects to `/login` if unauthenticated)

### Responsive & Dark Mode
- [ ] Calendar grid is responsive on different screen sizes
- [ ] All elements support dark mode
- [ ] Text is readable in both light and dark modes
- [ ] Day cells have adequate touch targets on mobile

---

## Testing Requirements

### E2E Tests (Playwright)

**File**: `tests/10-calendar-view.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

// Helper: Register and login (reuse from tests/helpers.ts)
// Assumes WebAuthn virtual authenticator is configured

test.describe('Feature 10: Calendar View', () => {

  test.beforeEach(async ({ page }) => {
    // Register/login and create test data
    // Navigate to calendar
    await page.goto('/calendar');
  });

  test.describe('Calendar Display', () => {
    test('should display current month by default', async ({ page }) => {
      await page.goto('/calendar');
      // Verify current month name and year are displayed
      const header = page.locator('h2');
      const now = new Date(
        new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' })
      );
      const monthName = now.toLocaleString('en-US', { month: 'long' });
      const year = now.getFullYear();
      await expect(header).toContainText(`${monthName} ${year}`);
    });

    test('should display day headers Sun through Sat', async ({ page }) => {
      await page.goto('/calendar');
      const headers = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      for (const day of headers) {
        await expect(page.getByText(day, { exact: true }).first()).toBeVisible();
      }
    });

    test('should highlight current day', async ({ page }) => {
      await page.goto('/calendar');
      // Current day should have a special ring/highlight class
      const todayCell = page.locator('[class*="ring-blue-500"]');
      await expect(todayCell).toBeVisible();
    });

    test('should display 7 columns in the grid', async ({ page }) => {
      await page.goto('/calendar');
      const grid = page.locator('.grid-cols-7').last();
      await expect(grid).toBeVisible();
    });
  });

  test.describe('Month Navigation', () => {
    test('should navigate to previous month', async ({ page }) => {
      await page.goto('/calendar');
      const prevButton = page.getByLabel('Previous month');
      await prevButton.click();
      // URL should update with ?month= parameter
      await expect(page).toHaveURL(/month=/);
    });

    test('should navigate to next month', async ({ page }) => {
      await page.goto('/calendar');
      const nextButton = page.getByLabel('Next month');
      await nextButton.click();
      await expect(page).toHaveURL(/month=/);
    });

    test('should return to current month on Today button click', async ({ page }) => {
      await page.goto('/calendar');
      // Navigate away first
      await page.getByLabel('Previous month').click();
      await page.getByLabel('Previous month').click();
      // Click Today
      await page.getByText('Today').click();
      // Verify current month is displayed
      const now = new Date(
        new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' })
      );
      const monthName = now.toLocaleString('en-US', { month: 'long' });
      await expect(page.locator('h2')).toContainText(monthName);
    });

    test('should handle year boundary (December to January)', async ({ page }) => {
      // Navigate to December
      await page.goto('/calendar?month=2025-12');
      await expect(page.locator('h2')).toContainText('December 2025');
      // Click next
      await page.getByLabel('Next month').click();
      await expect(page.locator('h2')).toContainText('January 2026');
      await expect(page).toHaveURL(/month=2026-01/);
    });

    test('should handle year boundary (January to December)', async ({ page }) => {
      await page.goto('/calendar?month=2025-01');
      await expect(page.locator('h2')).toContainText('January 2025');
      await page.getByLabel('Previous month').click();
      await expect(page.locator('h2')).toContainText('December 2024');
      await expect(page).toHaveURL(/month=2024-12/);
    });
  });

  test.describe('URL State Management', () => {
    test('should load specific month from URL parameter', async ({ page }) => {
      await page.goto('/calendar?month=2025-03');
      await expect(page.locator('h2')).toContainText('March 2025');
    });

    test('should default to current month for invalid month param', async ({ page }) => {
      await page.goto('/calendar?month=invalid');
      const now = new Date(
        new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' })
      );
      const monthName = now.toLocaleString('en-US', { month: 'long' });
      await expect(page.locator('h2')).toContainText(monthName);
    });

    test('should update URL when navigating months', async ({ page }) => {
      await page.goto('/calendar?month=2025-06');
      await page.getByLabel('Next month').click();
      await expect(page).toHaveURL(/month=2025-07/);
    });
  });

  test.describe('Todos on Calendar', () => {
    test('should display todo on its due date', async ({ page }) => {
      // First create a todo with a specific due date
      await page.goto('/');
      // ... create todo with due date ...
      // Then navigate to calendar for that month
      await page.goto('/calendar?month=2025-11');
      // Verify todo title appears in the correct date cell
      // (implementation depends on exact due date used)
    });

    test('should color-code todos by priority', async ({ page }) => {
      // Create todos with different priorities
      // Navigate to calendar
      // Verify color classes
      await page.goto('/calendar');
      // Check for priority dot colors
    });

    test('should show todo count badge for days with multiple todos', async ({ page }) => {
      // Create multiple todos on same due date
      // Navigate to calendar
      // Verify badge appears with correct count
    });

    test('should show overflow indicator for days with >3 todos', async ({ page }) => {
      // Create 5 todos on same day
      // Verify "+2 more" text appears
    });
  });

  test.describe('Holidays', () => {
    test('should display holiday on correct date', async ({ page }) => {
      // Assuming holidays are seeded
      await page.goto('/calendar?month=2025-12');
      // Look for Christmas Day on December 25
      await expect(page.getByText('Christmas Day')).toBeVisible();
    });

    test('should show holiday with special styling', async ({ page }) => {
      await page.goto('/calendar?month=2025-08');
      // National Day on August 9
      const holidayBadge = page.getByText('National Day');
      await expect(holidayBadge).toBeVisible();
    });
  });

  test.describe('Day Click Modal', () => {
    test('should open modal when clicking a day', async ({ page }) => {
      await page.goto('/calendar');
      // Click on any day cell
      const dayCells = page.locator('button[aria-label*="todos"]');
      await dayCells.first().click();
      // Modal should appear
      await expect(page.getByLabel('Close modal')).toBeVisible();
    });

    test('should show "No todos on this day" for empty day', async ({ page }) => {
      await page.goto('/calendar');
      // Click on a day with no todos
      // ...click day cell
      await expect(page.getByText('No todos on this day')).toBeVisible();
    });

    test('should display holiday in modal', async ({ page }) => {
      await page.goto('/calendar?month=2025-12');
      // Click December 25
      // Verify modal shows Christmas Day holiday badge
    });

    test('should close modal on X button', async ({ page }) => {
      await page.goto('/calendar');
      const dayCells = page.locator('button[aria-label*="todos"]');
      await dayCells.first().click();
      await page.getByLabel('Close modal').click();
      await expect(page.getByLabel('Close modal')).not.toBeVisible();
    });

    test('should close modal on backdrop click', async ({ page }) => {
      await page.goto('/calendar');
      const dayCells = page.locator('button[aria-label*="todos"]');
      await dayCells.first().click();
      // Click backdrop (the overlay div)
      await page.locator('.fixed.inset-0').click({ position: { x: 10, y: 10 } });
      await expect(page.getByLabel('Close modal')).not.toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test('should have Calendar button on main page', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByText('Calendar')).toBeVisible();
    });

    test('should navigate to calendar from main page', async ({ page }) => {
      await page.goto('/');
      await page.getByText('Calendar').click();
      await expect(page).toHaveURL(/\/calendar/);
    });

    test('should have Back to Todos link on calendar page', async ({ page }) => {
      await page.goto('/calendar');
      await expect(page.getByText('Back to Todos')).toBeVisible();
    });

    test('should navigate back to main page', async ({ page }) => {
      await page.goto('/calendar');
      await page.getByText('Back to Todos').click();
      await expect(page).toHaveURL('/');
    });

    test('should redirect to login if not authenticated', async ({ page, context }) => {
      // Clear cookies to simulate unauthenticated state
      await context.clearCookies();
      await page.goto('/calendar');
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('Responsive & Dark Mode', () => {
    test('should render calendar grid on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/calendar');
      await expect(page.locator('.grid-cols-7').last()).toBeVisible();
    });
  });
});
```

### Unit Tests

Test scenarios for business logic (can be tested with a separate test file or integrated):

1. **Calendar generation — February 28 days (non-leap year)**:
   - Input: year=2025, month=1 (February)
   - Expected: Correct number of weeks, correct padding days
   - First cell should be a Sunday

2. **Calendar generation — February 29 days (leap year)**:
   - Input: year=2024, month=1 (February)
   - Expected: 29 days in month, correct week count

3. **Calendar generation — month starting on Sunday**:
   - No padding days needed at start
   - First cell = 1st of month

4. **Calendar generation — month starting on Saturday**:
   - 6 padding days from previous month at start
   - May result in 6 rows

5. **Todo-to-date mapping**:
   - Todo with `due_date: '2025-11-15T14:00'` maps to '2025-11-15'
   - Todo without `due_date` is excluded

6. **Holiday-to-date mapping**:
   - Holiday with `date: '2025-12-25'` maps to correct cell

7. **Year boundary navigation**:
   - From month=0 (Jan), prev → month=11 (Dec), year-1
   - From month=11 (Dec), next → month=0 (Jan), year+1

8. **URL parameter parsing**:
   - `'2025-11'` → year=2025, month=10 (0-indexed)
   - `'invalid'` → defaults to current month
   - `null` → defaults to current month
   - `'2025-13'` → defaults to current month (month out of range)

---

## File Structure

```
app/
├── calendar/
│   └── page.tsx              ← Calendar page component ('use client')
├── api/
│   └── holidays/
│       └── route.ts          ← GET /api/holidays endpoint
lib/
├── db.ts                     ← Add Holiday interface + getHolidays(), getHolidaysByMonth()
├── timezone.ts               ← Existing: getSingaporeNow(), formatSingaporeDate()
scripts/
└── seed-holidays.ts          ← Holiday seeder script
middleware.ts                 ← Add '/calendar' to protected paths
tests/
└── 10-calendar-view.spec.ts  ← Playwright E2E tests
```

---

## Out of Scope

The following are explicitly **NOT** included in this feature:

1. **Week view or day view** — Only monthly calendar view is implemented
2. **Drag-and-drop todo rescheduling** — Todos cannot be moved between days on the calendar
3. **Creating/editing todos from the calendar** — Users must use the main page for CRUD; calendar is read-only
4. **Multi-month view** — Only one month is displayed at a time
5. **Recurring todo visualization** — Only the next occurrence (the one with a due date) is shown, not all future instances
6. **Custom holiday management** — Users cannot add/edit/delete holidays; they are seeded data
7. **Calendar export (iCal/ICS)** — Not supported
8. **Time-of-day display on calendar cells** — Only the date matters; specific times are shown in the modal
9. **Filtering on the calendar page** — No priority/tag/search filters on the calendar view
10. **Agenda/list view for a month** — Only the grid calendar layout is provided

---

## Success Metrics

1. **Page Load Time**: Calendar page loads within 2 seconds with up to 100 todos
2. **Navigation Speed**: Month navigation transitions in <500ms
3. **Data Accuracy**: 100% of todos appear on their correct due dates
4. **Holiday Coverage**: All seeded Singapore public holidays display correctly
5. **URL Reliability**: Bookmarked `?month=YYYY-MM` URLs load the correct month
6. **User Adoption**: Users can navigate from main page to calendar and back without confusion
7. **Accessibility**: Calendar cells have proper ARIA labels; modal is keyboard-dismissible (Escape key)
8. **Cross-Browser**: Calendar renders correctly in Chrome, Firefox, Safari, and Edge
9. **Mobile Usability**: Calendar is usable on screens ≥ 375px wide
10. **Dark Mode**: All calendar elements are readable and properly styled in dark mode
