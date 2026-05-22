# Feature 04: Reminders & Notifications

## Feature Overview

This feature adds a browser-based notification system that alerts users before their todos are due. Users can configure how far in advance they want to be reminded (from 15 minutes to 1 week before), and the system uses the Browser Notification API to deliver alerts even when the tab is in the background. A frontend polling mechanism checks the server every 30 seconds for due reminders, while the server tracks which notifications have already been sent to prevent duplicates.

All time calculations use Singapore timezone (`Asia/Singapore`) via `lib/timezone.ts`.

---

## User Stories

1. **As a user**, I want to receive browser notifications before my todos are due, so that I don't miss important deadlines.
2. **As a user**, I want to choose how far in advance I'm notified (15 minutes, 30 minutes, 1 hour, 2 hours, 1 day, 2 days, or 1 week), so that I can customize alerts to my workflow.
3. **As a user**, I want each reminder sent only once, so that I'm not spammed with repeated notifications for the same todo.
4. **As a user**, I want to see which todos have reminders set via badges (🔔), so that I know at a glance which items will trigger alerts.
5. **As a user**, I want the reminder dropdown to be disabled when no due date is set, so that I don't accidentally set a reminder that can never fire.
6. **As a user**, I want to enable/disable browser notifications with a single button click, so that I can control permissions easily.

---

## User Flow

### Enabling Notifications
1. User sees an orange **"🔔 Enable Notifications"** button in the top-right area of the app.
2. User clicks the button.
3. Browser displays a native permission prompt: _"localhost wants to show notifications"_.
4. User clicks **"Allow"**.
5. Button changes to a green badge displaying **"🔔 Notifications On"**.
6. The app begins polling `/api/notifications/check` every 30 seconds.

### Setting a Reminder on a Todo
1. User creates or edits a todo and sets a **due date** (e.g., tomorrow at 2:00 PM SGT).
2. The **"Reminder"** dropdown becomes enabled (it was disabled/grayed out before a due date was set).
3. User selects a reminder timing, e.g., **"1 hour before"**.
4. User submits the form.
5. The todo now displays a **"🔔 1h"** badge next to other badges (priority, recurrence).

### Receiving a Notification
1. The polling system checks `/api/notifications/check` every 30 seconds.
2. The API compares `due_date - reminder_minutes` against the current Singapore time.
3. When the reminder time has arrived (i.e., now >= due_date - reminder_minutes), the API returns the todo in the response.
4. The frontend triggers a browser `Notification` with the todo title and due date info.
5. The server sets `last_notification_sent` to the current timestamp, preventing the same notification from firing again.

### Notification Content
- **Title**: `"📋 Todo Reminder"`
- **Body**: `"[Todo Title] — Due: [formatted due date in SGT]"`
- **Icon**: App favicon (optional)

---

## Technical Requirements

### Database Schema

Two new nullable columns are added to the existing `todos` table:

```sql
-- Add to existing todos table via ALTER TABLE (migration)
ALTER TABLE todos ADD COLUMN reminder_minutes INTEGER DEFAULT NULL;
ALTER TABLE todos ADD COLUMN last_notification_sent TEXT DEFAULT NULL;
```

**Column Definitions:**

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `reminder_minutes` | `INTEGER` | Yes | `NULL` | Minutes before due date to send reminder. Valid values: `15`, `30`, `60`, `120`, `1440`, `2880`, `10080`, or `NULL` (no reminder). |
| `last_notification_sent` | `TEXT` | Yes | `NULL` | ISO 8601 timestamp (SGT) of when the notification was last sent. Used for duplicate prevention. |

If the `todos` table is defined all-at-once in `lib/db.ts` via `CREATE TABLE IF NOT EXISTS`, include these columns directly:

```sql
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  is_recurring INTEGER NOT NULL DEFAULT 0,
  recurrence_pattern TEXT,
  reminder_minutes INTEGER DEFAULT NULL,
  last_notification_sent TEXT DEFAULT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Type Definitions

Add to `lib/db.ts` or the shared types location:

```typescript
// Extend the existing Todo interface
export interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: number; // 0 or 1
  created_at: string;
  due_date: string | null;
  priority: 'high' | 'medium' | 'low';
  is_recurring: number; // 0 or 1
  recurrence_pattern: string | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
}

// Reminder timing option for the dropdown UI
export interface ReminderOption {
  value: number | null;
  label: string;
  badge: string; // Abbreviated display for badge
}

// Response shape from the notification check API
export interface NotificationCheckResponse {
  todos: NotificationTodo[];
}

export interface NotificationTodo {
  id: number;
  title: string;
  due_date: string;
  reminder_minutes: number;
}
```

### Reminder Options Constant

Define this constant to be shared between frontend UI and logic:

```typescript
// lib/constants.ts or inline in component
export const REMINDER_OPTIONS: ReminderOption[] = [
  { value: null,  label: 'None',              badge: '' },
  { value: 15,    label: '15 minutes before', badge: '15m' },
  { value: 30,    label: '30 minutes before', badge: '30m' },
  { value: 60,    label: '1 hour before',     badge: '1h' },
  { value: 120,   label: '2 hours before',    badge: '2h' },
  { value: 1440,  label: '1 day before',      badge: '1d' },
  { value: 2880,  label: '2 days before',     badge: '2d' },
  { value: 10080, label: '1 week before',     badge: '1w' },
];
```

### Badge Display Helper

```typescript
export function getReminderBadge(reminderMinutes: number | null): string {
  if (reminderMinutes === null) return '';
  const option = REMINDER_OPTIONS.find(o => o.value === reminderMinutes);
  return option ? `🔔 ${option.badge}` : `🔔 ${reminderMinutes}m`;
}
```

---

### API Endpoints

#### 1. `GET /api/notifications/check`

**Purpose**: Returns todos that need a notification right now (reminder time has arrived and notification not yet sent).

**File**: `app/api/notifications/check/route.ts`

**Authentication**: Required (session-based).

**Request**: No body. Uses session `userId`.

**Business Logic**:
1. Get current Singapore time via `getSingaporeNow()`.
2. Query all todos for the user where:
   - `reminder_minutes IS NOT NULL`
   - `due_date IS NOT NULL`
   - `completed = 0` (not completed)
   - The reminder time has arrived: `now >= due_date - reminder_minutes`
   - The notification has not been sent yet: `last_notification_sent IS NULL`
3. For each matching todo, update `last_notification_sent` to the current SGT timestamp.
4. Return the list of todos that need notifications.

**Implementation**:

```typescript
// app/api/notifications/check/route.ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getSingaporeNow, formatSingaporeDate } from '@/lib/timezone';
import db from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const now = getSingaporeNow();
  const nowISO = now.toISOString();

  // Query todos where reminder time has arrived and notification not yet sent
  // Reminder time = due_date minus reminder_minutes (in minutes)
  // We compare: now >= datetime(due_date, '-' || reminder_minutes || ' minutes')
  const todos = db.prepare(`
    SELECT id, title, due_date, reminder_minutes
    FROM todos
    WHERE user_id = ?
      AND reminder_minutes IS NOT NULL
      AND due_date IS NOT NULL
      AND completed = 0
      AND last_notification_sent IS NULL
      AND datetime(due_date, '-' || reminder_minutes || ' minutes') <= ?
  `).all(session.userId, nowISO) as NotificationTodo[];

  // Mark each as notified to prevent duplicates
  const updateStmt = db.prepare(`
    UPDATE todos SET last_notification_sent = ? WHERE id = ?
  `);

  const updateMany = db.transaction((todosToUpdate: NotificationTodo[]) => {
    for (const todo of todosToUpdate) {
      updateStmt.run(nowISO, todo.id);
    }
  });

  if (todos.length > 0) {
    updateMany(todos);
  }

  return NextResponse.json({ todos });
}
```

**Response (200 OK)**:
```json
{
  "todos": [
    {
      "id": 42,
      "title": "Submit quarterly report",
      "due_date": "2025-11-15T14:00:00",
      "reminder_minutes": 60
    }
  ]
}
```

**Response (200 OK — no pending notifications)**:
```json
{
  "todos": []
}
```

**Response (401 Unauthorized)**:
```json
{
  "error": "Not authenticated"
}
```

#### 2. Existing Todo CRUD Endpoints (Modifications)

**`POST /api/todos`** — Include `reminder_minutes` in create payload:

```typescript
// In the existing POST handler, extract and validate reminder_minutes
const { title, due_date, priority, is_recurring, recurrence_pattern, reminder_minutes } = await request.json();

// Validation: reminder_minutes must be a valid value or null
const validReminderValues = [null, 15, 30, 60, 120, 1440, 2880, 10080];
const sanitizedReminder = validReminderValues.includes(reminder_minutes) ? reminder_minutes : null;

// If no due_date, force reminder to null
const finalReminder = due_date ? sanitizedReminder : null;

// Include in INSERT statement
db.prepare(`
  INSERT INTO todos (user_id, title, completed, created_at, due_date, priority, is_recurring, recurrence_pattern, reminder_minutes)
  VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)
`).run(session.userId, title, getSingaporeNow().toISOString(), due_date, priority, is_recurring ? 1 : 0, recurrence_pattern, finalReminder);
```

**`PUT /api/todos/[id]`** — Include `reminder_minutes` in update payload:

```typescript
// In the existing PUT handler
const { title, due_date, priority, is_recurring, recurrence_pattern, reminder_minutes } = await request.json();

const validReminderValues = [null, 15, 30, 60, 120, 1440, 2880, 10080];
const sanitizedReminder = validReminderValues.includes(reminder_minutes) ? reminder_minutes : null;
const finalReminder = due_date ? sanitizedReminder : null;

// Reset last_notification_sent when reminder is changed so it can fire again
db.prepare(`
  UPDATE todos
  SET title = ?, due_date = ?, priority = ?, is_recurring = ?, recurrence_pattern = ?,
      reminder_minutes = ?, last_notification_sent = NULL
  WHERE id = ? AND user_id = ?
`).run(title, due_date, priority, is_recurring ? 1 : 0, recurrence_pattern, finalReminder, id, session.userId);
```

> [!IMPORTANT]
> When updating a todo's `reminder_minutes` or `due_date`, always reset `last_notification_sent` to `NULL` so the notification can fire again for the updated timing.

#### 3. Recurring Todo Completion

When a recurring todo is completed and the next instance is created, the new instance must inherit `reminder_minutes` but have `last_notification_sent = NULL`:

```typescript
// When creating next recurring instance
db.prepare(`
  INSERT INTO todos (user_id, title, completed, created_at, due_date, priority, is_recurring, recurrence_pattern, reminder_minutes, last_notification_sent)
  VALUES (?, ?, 0, ?, ?, ?, 1, ?, ?, NULL)
`).run(session.userId, title, getSingaporeNow().toISOString(), nextDueDate, priority, recurrence_pattern, reminder_minutes);
```

---

### Business Logic

#### Reminder Time Calculation

The notification should fire when:
```
currentTime (SGT) >= dueDate (SGT) - reminderMinutes
```

Example:
- Due date: `2025-11-15T14:00:00` (2:00 PM SGT)
- Reminder: `60` minutes
- Notification fires at or after: `2025-11-15T13:00:00` (1:00 PM SGT)

#### Duplicate Prevention

- The `last_notification_sent` column acts as a "sent" flag.
- On each poll, only todos with `last_notification_sent IS NULL` are returned.
- Immediately after returning todos, the server sets `last_notification_sent` to the current timestamp.
- This is done in a **transaction** to prevent race conditions from overlapping polls.

#### Reminder Reset Scenarios

The `last_notification_sent` must be reset to `NULL` when:
1. User changes `reminder_minutes` (wants to re-trigger with new timing).
2. User changes `due_date` (new deadline, new reminder window).
3. A recurring todo creates a new instance (fresh notification for the new occurrence).

#### Badge Abbreviation Mapping

| `reminder_minutes` | Badge Display |
|---------------------|---------------|
| `15` | `🔔 15m` |
| `30` | `🔔 30m` |
| `60` | `🔔 1h` |
| `120` | `🔔 2h` |
| `1440` | `🔔 1d` |
| `2880` | `🔔 2d` |
| `10080` | `🔔 1w` |
| `null` | _(no badge)_ |

---

## UI Components

### 1. Enable Notifications Button

Located in the top-right action area of `app/page.tsx`:

```tsx
// Notification permission button
function NotificationToggle() {
  const { permission, requestPermission } = useNotifications();

  if (permission === 'granted') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
        🔔 Notifications On
      </span>
    );
  }

  if (permission === 'denied') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
        🔕 Notifications Blocked
      </span>
    );
  }

  return (
    <button
      onClick={requestPermission}
      className="inline-flex items-center gap-1 rounded-full bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 transition-colors cursor-pointer"
    >
      🔔 Enable Notifications
    </button>
  );
}
```

### 2. Reminder Dropdown (in Todo Form)

```tsx
// Reminder dropdown — disabled when no due date is set
<div className="flex flex-col gap-1">
  <label htmlFor="reminder" className="text-sm font-medium text-gray-700 dark:text-gray-300">
    Reminder
  </label>
  <select
    id="reminder"
    value={reminderMinutes ?? ''}
    onChange={(e) => setReminderMinutes(e.target.value === '' ? null : Number(e.target.value))}
    disabled={!dueDate}
    className={`rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 ${
      !dueDate ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-800' : ''
    }`}
  >
    <option value="">None</option>
    <option value="15">15 minutes before</option>
    <option value="30">30 minutes before</option>
    <option value="60">1 hour before</option>
    <option value="120">2 hours before</option>
    <option value="1440">1 day before</option>
    <option value="2880">2 days before</option>
    <option value="10080">1 week before</option>
  </select>
  {!dueDate && (
    <p className="text-xs text-gray-400 dark:text-gray-500">Set a due date to enable reminders</p>
  )}
</div>
```

### 3. Reminder Badge on Todo Item

```tsx
// Inside the todo item display, alongside priority and recurrence badges
{todo.reminder_minutes !== null && todo.reminder_minutes !== undefined && (
  <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 border border-amber-300 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700">
    {getReminderBadge(todo.reminder_minutes)}
  </span>
)}
```

### 4. `useNotifications` Custom Hook

**File**: `lib/hooks/useNotifications.ts`

```typescript
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface NotificationTodo {
  id: number;
  title: string;
  due_date: string;
  reminder_minutes: number;
}

interface UseNotificationsReturn {
  /** Current browser notification permission state */
  permission: NotificationPermission | 'unsupported';
  /** Whether notifications are actively supported and granted */
  isEnabled: boolean;
  /** Request notification permission from the browser */
  requestPermission: () => Promise<void>;
  /** Manually trigger a check (in addition to automatic polling) */
  checkNow: () => Promise<void>;
}

const POLL_INTERVAL_MS = 30_000; // 30 seconds

export function useNotifications(): UseNotificationsReturn {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize permission state
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission);
  }, []);

  // Format due date for notification body
  const formatDueDate = useCallback((dueDate: string): string => {
    try {
      const date = new Date(dueDate);
      return date.toLocaleString('en-SG', {
        timeZone: 'Asia/Singapore',
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return dueDate;
    }
  }, []);

  // Send a browser notification
  const sendNotification = useCallback((todo: NotificationTodo) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const formattedDate = formatDueDate(todo.due_date);

    new Notification('📋 Todo Reminder', {
      body: `${todo.title} — Due: ${formattedDate}`,
      icon: '/favicon.ico',
      tag: `todo-reminder-${todo.id}`, // Prevents duplicate OS-level notifications
    });
  }, [formatDueDate]);

  // Check the server for pending notifications
  const checkNotifications = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
      const response = await fetch('/api/notifications/check');
      if (!response.ok) return;

      const data: { todos: NotificationTodo[] } = await response.json();

      for (const todo of data.todos) {
        sendNotification(todo);
      }
    } catch (error) {
      // Silently fail — network errors shouldn't break the app
      console.error('Notification check failed:', error);
    }
  }, [sendNotification]);

  // Request permission from the browser
  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      // If granted, do an immediate check
      if (result === 'granted') {
        await checkNotifications();
      }
    } catch (error) {
      console.error('Failed to request notification permission:', error);
    }
  }, [checkNotifications]);

  // Set up polling interval when permission is granted
  useEffect(() => {
    if (permission !== 'granted') {
      // Clean up any existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Start polling
    intervalRef.current = setInterval(checkNotifications, POLL_INTERVAL_MS);

    // Do an initial check immediately
    checkNotifications();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [permission, checkNotifications]);

  return {
    permission,
    isEnabled: permission === 'granted',
    requestPermission,
    checkNow: checkNotifications,
  };
}
```

---

## Edge Cases

1. **Browser does not support Notification API**
   - Detection: Check `'Notification' in window` before any notification logic.
   - Handling: Set `permission` to `'unsupported'`. Hide the "Enable Notifications" button entirely or show a disabled state with tooltip "Your browser does not support notifications".
   - The reminder dropdown should still work (the reminder is stored server-side); the user just won't get browser alerts.

2. **Permission denied by user**
   - The button changes to a red badge: **"🔕 Notifications Blocked"**.
   - Once denied, browsers don't allow re-prompting. User must go to browser settings to change.
   - Polling does NOT start.
   - Reminder settings are still saved on the server (they'll work if the user later grants permission via browser settings).

3. **Tab is in the background**
   - `setInterval` continues running even when the tab is backgrounded (browsers may throttle to 1-minute intervals for background tabs).
   - Browser Notification API works from background tabs — notifications will appear in the OS notification center.
   - No special handling needed; this is default browser behavior.

4. **Notification for a past due date**
   - If a todo's due date has already passed and the reminder window was in the past, the notification should still fire once (on the next poll after the reminder becomes eligible).
   - Example: User sets a 1-hour reminder on a todo due at 2 PM. User was offline from 1 PM to 3 PM. When they come back online, the notification fires on the first poll.
   - The `last_notification_sent` prevents it from firing on subsequent polls.

5. **Due date removed after reminder is set**
   - When a user removes the due date, the frontend must also set `reminder_minutes` to `null`.
   - The reminder dropdown becomes disabled with the helper text "Set a due date to enable reminders".
   - Server-side validation: if `due_date` is `null`, force `reminder_minutes` to `null`.

6. **Due date changed after notification already sent**
   - When `due_date` or `reminder_minutes` is updated, reset `last_notification_sent` to `NULL`.
   - This allows the notification to fire again for the new timing window.

7. **Completed todo with pending reminder**
   - Completed todos (`completed = 1`) are excluded from the notification check query.
   - If a user completes a todo before the reminder fires, no notification is sent.

8. **Multiple browser tabs open**
   - Each tab polls independently — the server-side `last_notification_sent` ensures only the first tab to poll triggers the notification.
   - The `tag` property on the `Notification` constructor (`todo-reminder-${todo.id}`) prevents the OS from showing duplicate notifications from different tabs.

9. **Very short reminder with imminent due date**
   - Example: User creates a todo due in 10 minutes and sets a 15-minute reminder. Since the reminder time is already past, the notification fires on the next poll (within 30 seconds).
   - This is expected and correct behavior.

10. **Recurring todo completion and notification**
    - When a recurring todo is completed and the next instance is created, the new instance inherits `reminder_minutes` but has `last_notification_sent = NULL`.
    - The next instance's reminder fires based on the new `due_date`.

11. **Network failure during poll**
    - The `checkNotifications` function catches all errors silently.
    - Polling continues on the next interval. No retry logic needed — the next poll will pick up any pending notifications.

12. **Session expires during polling**
    - The `/api/notifications/check` endpoint returns `401 Unauthorized`.
    - The hook silently ignores the error. The user will be redirected to login on their next interaction with the app (via middleware).

---

## Acceptance Criteria

### Notification Permission
- [ ] An orange **"🔔 Enable Notifications"** button is visible when notifications are not yet granted.
- [ ] Clicking the button triggers the browser permission prompt.
- [ ] After granting permission, the button changes to a green **"🔔 Notifications On"** badge.
- [ ] If permission is denied, a red **"🔕 Notifications Blocked"** badge is shown.
- [ ] If the browser doesn't support notifications, the button is hidden or shows an unsupported state.

### Reminder Dropdown
- [ ] The reminder dropdown is visible in the todo create/edit form.
- [ ] The dropdown is **disabled** when no due date is set.
- [ ] A helper text "Set a due date to enable reminders" appears when dropdown is disabled.
- [ ] The dropdown becomes **enabled** when a due date is set.
- [ ] The dropdown offers 8 options: None, 15m, 30m, 1h, 2h, 1d, 2d, 1w.
- [ ] Selecting an option stores the correct `reminder_minutes` value (e.g., `60` for "1 hour before").
- [ ] Selecting "None" sets `reminder_minutes` to `null`.
- [ ] Removing the due date automatically resets `reminder_minutes` to `null`.

### Reminder Badge
- [ ] Todos with a non-null `reminder_minutes` display a **🔔** badge with abbreviated timing.
- [ ] Badge shows correct abbreviation: `15m`, `30m`, `1h`, `2h`, `1d`, `2d`, `1w`.
- [ ] Badge has amber/yellow styling with border.
- [ ] Badge is visible in all sections: Overdue, Pending, Completed.
- [ ] Badge adapts to dark mode.

### Notification Delivery
- [ ] A browser notification fires when the reminder time arrives (due_date - reminder_minutes <= now).
- [ ] Notification title is `"📋 Todo Reminder"`.
- [ ] Notification body includes the todo title and formatted due date in Singapore timezone.
- [ ] Each notification fires **only once** per todo (duplicate prevention via `last_notification_sent`).
- [ ] Notifications work even when the browser tab is in the background.

### Polling System
- [ ] Frontend polls `/api/notifications/check` every 30 seconds when notifications are granted.
- [ ] Polling starts immediately when permission is granted (no 30-second wait for first check).
- [ ] Polling stops when the component unmounts (cleanup).
- [ ] Polling does NOT start if notification permission is not granted.
- [ ] Network errors during polling are silently caught (no UI disruption).

### Server-Side Logic
- [ ] `GET /api/notifications/check` returns only todos where reminder time has arrived and `last_notification_sent IS NULL`.
- [ ] Endpoint requires authentication (returns 401 if not authenticated).
- [ ] After returning todos, the endpoint updates `last_notification_sent` to current SGT timestamp.
- [ ] Update is done in a transaction to prevent race conditions.
- [ ] Only incomplete todos (`completed = 0`) are considered.

### Data Integrity
- [ ] `reminder_minutes` is stored as an integer in the `todos` table.
- [ ] `last_notification_sent` is stored as an ISO 8601 text timestamp.
- [ ] When `reminder_minutes` or `due_date` is updated, `last_notification_sent` is reset to `NULL`.
- [ ] When a recurring todo creates a new instance, `reminder_minutes` is inherited and `last_notification_sent` is `NULL`.
- [ ] Server-side validation: `reminder_minutes` only accepts `null`, `15`, `30`, `60`, `120`, `1440`, `2880`, `10080`.
- [ ] Server-side validation: if `due_date` is null, `reminder_minutes` is forced to `null`.

---

## Testing Requirements

### E2E Tests (Playwright)

**File**: `tests/04-reminders-notifications.spec.ts`

> [!NOTE]
> Testing browser notifications in Playwright requires granting notification permissions via browser context. Playwright supports this via `context.grantPermissions(['notifications'])`. However, testing actual `Notification` display is limited — tests should verify API behavior and UI state rather than actual OS notifications.

#### Test Scenarios

```typescript
import { test, expect } from '@playwright/test';

// Helper: register and login (reuse from auth tests)
// Helper: create a virtual WebAuthn authenticator

test.describe('Feature 04: Reminders & Notifications', () => {

  test.describe('Reminder Dropdown UI', () => {

    test('reminder dropdown is disabled when no due date is set', async ({ page }) => {
      // Navigate to app, login
      // Verify the reminder <select> has the `disabled` attribute
      // Verify helper text "Set a due date to enable reminders" is visible
    });

    test('reminder dropdown becomes enabled when due date is set', async ({ page }) => {
      // Set a due date in the form
      // Verify the reminder <select> no longer has the `disabled` attribute
      // Verify helper text is hidden
    });

    test('reminder dropdown has all 8 options', async ({ page }) => {
      // Set a due date
      // Open the reminder dropdown
      // Verify options: None, 15 minutes before, 30 minutes before,
      //   1 hour before, 2 hours before, 1 day before, 2 days before, 1 week before
    });

    test('removing due date resets reminder to None', async ({ page }) => {
      // Set due date, select "1 hour before" reminder
      // Clear the due date field
      // Verify reminder is reset to None (empty value)
      // Verify dropdown is disabled again
    });
  });

  test.describe('Reminder Badge Display', () => {

    test('todo with reminder shows bell badge with abbreviated time', async ({ page }) => {
      // Create a todo with due date and reminder = 60 (1 hour)
      // Verify the todo item displays "🔔 1h" badge
    });

    test('todo without reminder does not show bell badge', async ({ page }) => {
      // Create a todo without a reminder
      // Verify no "🔔" badge is displayed
    });

    test('badge shows correct abbreviation for each timing', async ({ page }) => {
      // Create todos with each reminder_minutes value
      // Verify: 15 -> "15m", 30 -> "30m", 60 -> "1h", 120 -> "2h",
      //         1440 -> "1d", 2880 -> "2d", 10080 -> "1w"
    });
  });

  test.describe('Notification Check API', () => {

    test('returns 401 when not authenticated', async ({ request }) => {
      const response = await request.get('/api/notifications/check');
      expect(response.status()).toBe(401);
    });

    test('returns empty array when no reminders are pending', async ({ page, request }) => {
      // Login, create todo with due date far in the future with 15m reminder
      // Call API — should return empty todos array
    });

    test('returns todo when reminder time has arrived', async ({ page, request }) => {
      // Login, create todo with due date = now + 5 minutes, reminder = 15 minutes
      // (reminder time = now - 10 minutes, which is in the past → should fire)
      // Call API — should return the todo
    });

    test('does not return same todo on second call (duplicate prevention)', async ({ page, request }) => {
      // Call API — returns todo
      // Call API again — returns empty array (last_notification_sent is set)
    });

    test('does not return completed todos', async ({ page, request }) => {
      // Create todo with imminent reminder
      // Complete the todo
      // Call API — should return empty array
    });

    test('returns todo again after reminder_minutes is updated', async ({ page, request }) => {
      // Create todo, trigger notification (last_notification_sent is set)
      // Update the todo's reminder_minutes (resets last_notification_sent)
      // Call API — should return the todo again
    });
  });

  test.describe('Enable Notifications Button', () => {

    test('shows orange Enable Notifications button by default', async ({ page }) => {
      // Verify button with text "Enable Notifications" is visible
      // Verify orange background styling
    });

    test('shows green Notifications On badge when permission is granted', async ({ page, context }) => {
      // Grant notification permission via context
      await context.grantPermissions(['notifications']);
      // Click the Enable Notifications button
      // Verify badge changes to "Notifications On" with green styling
    });
  });

  test.describe('Data Persistence', () => {

    test('reminder_minutes is saved when creating a todo', async ({ page }) => {
      // Create todo with due date and reminder = 30
      // Refresh page
      // Verify the reminder badge "🔔 30m" is still displayed
    });

    test('reminder_minutes persists through edit', async ({ page }) => {
      // Create todo with reminder
      // Edit the todo (change title only)
      // Verify reminder is preserved
    });

    test('recurring todo next instance inherits reminder', async ({ page }) => {
      // Create recurring daily todo with reminder = 60
      // Complete the todo
      // Verify the new instance shows "🔔 1h" badge
    });
  });
});
```

### Unit Tests

**Business Logic Tests** (can be implemented as Jest/Vitest tests or inline Playwright API tests):

```typescript
// Test: getReminderBadge function
test('getReminderBadge returns correct abbreviation', () => {
  expect(getReminderBadge(15)).toBe('🔔 15m');
  expect(getReminderBadge(30)).toBe('🔔 30m');
  expect(getReminderBadge(60)).toBe('🔔 1h');
  expect(getReminderBadge(120)).toBe('🔔 2h');
  expect(getReminderBadge(1440)).toBe('🔔 1d');
  expect(getReminderBadge(2880)).toBe('🔔 2d');
  expect(getReminderBadge(10080)).toBe('🔔 1w');
  expect(getReminderBadge(null)).toBe('');
});

// Test: Reminder validation
test('invalid reminder_minutes values are rejected', () => {
  const validValues = [null, 15, 30, 60, 120, 1440, 2880, 10080];
  expect(validValues.includes(45)).toBe(false);
  expect(validValues.includes(0)).toBe(false);
  expect(validValues.includes(-1)).toBe(false);
  expect(validValues.includes(999)).toBe(false);
});

// Test: Reminder time calculation
test('reminder fires at correct time', () => {
  // Due date: 2025-11-15T14:00:00 SGT
  // Reminder: 60 minutes before
  // Expected fire time: 2025-11-15T13:00:00 SGT
  const dueDate = new Date('2025-11-15T06:00:00Z'); // 14:00 SGT = 06:00 UTC
  const reminderMinutes = 60;
  const fireTime = new Date(dueDate.getTime() - reminderMinutes * 60 * 1000);
  expect(fireTime.toISOString()).toBe('2025-11-15T05:00:00.000Z'); // 13:00 SGT
});
```

---

## Out of Scope

The following are explicitly **NOT** part of this feature:

1. **Push notifications (Service Workers / Web Push API)** — This feature uses only the browser `Notification` API with polling. No service worker registration or push subscription is implemented.
2. **Email or SMS notifications** — Only browser notifications are supported.
3. **Custom notification sounds** — Uses default browser/OS notification sound.
4. **Snooze / dismiss with actions** — Notifications are fire-and-forget. No action buttons on the notification.
5. **Notification history / log** — No UI to view past notifications. `last_notification_sent` is internal only.
6. **Per-todo notification enable/disable** — Reminders are either set (with a timing) or not set (null). There's no separate on/off toggle per todo.
7. **Server-sent events (SSE) or WebSocket** — The system uses HTTP polling, not real-time push from server.
8. **Custom reminder intervals** — Only the 7 predefined intervals are supported (15m, 30m, 1h, 2h, 1d, 2d, 1w).
9. **Multiple reminders per todo** — Each todo supports only one reminder timing.
10. **Mobile push notifications** — Only desktop/browser notifications via the Notification API.

---

## Success Metrics

1. **Notification Delivery Rate**: >95% of set reminders result in a browser notification when the user has the app open and permission granted.
2. **Zero Duplicate Notifications**: The `last_notification_sent` mechanism prevents any reminder from firing more than once per todo per reminder window.
3. **Polling Efficiency**: Each poll completes in <100ms on average (simple indexed query on `user_id` + `completed` + `last_notification_sent`).
4. **Permission Adoption**: UI guides users to enable notifications smoothly (one-click flow).
5. **Badge Visibility**: All todos with reminders display the correct 🔔 badge at all times (create, edit, list, across page refreshes).
6. **Timezone Accuracy**: All reminder calculations are correct in Singapore timezone — notifications fire at the expected local time, not UTC.
7. **Data Integrity on Recurring Todos**: 100% of recurring todo instances inherit the parent's `reminder_minutes` with a fresh `last_notification_sent = NULL`.
