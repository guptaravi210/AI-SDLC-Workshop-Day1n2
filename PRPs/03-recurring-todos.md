# Feature 03: Recurring Todos

## Feature Overview

Recurring Todos allow users to create tasks that automatically regenerate on a schedule. When a recurring todo is completed, the system creates a new instance with the same settings (title, priority, tags, reminder, recurrence pattern) and a calculated next due date. This feature supports four recurrence patterns: daily, weekly, monthly, and yearly — all calculated in Singapore timezone (`Asia/Singapore`).

The core value is automation: users set up a recurring task once and never have to manually recreate it. Completing a daily standup todo at 9 AM today automatically creates tomorrow's 9 AM standup todo with all the same metadata.

---

## User Stories

1. **As a user**, I want to create daily recurring todos for habits (e.g., "Take medication"), so that a new task appears every day after I complete the current one.

2. **As a user**, I want weekly recurring todos for regular meetings (e.g., "Team standup"), so that the next week's meeting task is created automatically when I mark this week's as done.

3. **As a user**, I want the next instance to be automatically created when I complete a recurring todo, so that I don't have to manually recreate repeating tasks.

4. **As a user**, I want the new instance to inherit all my settings (priority, tags, reminder timing, recurrence pattern), so that I don't have to reconfigure each occurrence.

5. **As a user**, I want to see a visual indicator (🔄 badge) on recurring todos, so that I can quickly distinguish them from one-off tasks.

6. **As a user**, I want to disable recurrence on an existing todo by unchecking "Repeat", so that the current instance becomes a regular one-off todo.

7. **As a user**, I want monthly and yearly recurring todos to handle edge cases correctly (e.g., Jan 31 → Feb 28), so that I don't lose tasks due to calendar quirks.

---

## User Flow

### Creating a Recurring Todo
1. User enters a todo title in the main input field.
2. User checks the **"Repeat"** checkbox — this reveals the recurrence pattern dropdown.
3. User selects a pattern from the dropdown: **Daily**, **Weekly**, **Monthly**, or **Yearly**.
4. User sets a **due date** (required for recurring todos — validation enforces this).
5. User optionally sets priority, reminder, and tags.
6. User clicks **"Add"** to create the recurring todo.
7. The todo appears with a **🔄 [pattern]** purple badge (e.g., "🔄 weekly").

### Completing a Recurring Todo
1. User clicks the completion checkbox on a recurring todo.
2. The current todo is marked as completed (moves to Completed section).
3. The system **automatically creates a new todo** with:
   - Same title
   - Same priority
   - Same tags (re-linked via `todo_tags`)
   - Same `reminder_minutes`
   - Same `recurrence_pattern`
   - `is_recurring = 1`
   - `is_completed = 0`
   - New `due_date` = current `due_date` + pattern offset
4. The new todo appears immediately in the Pending/Active section.
5. User sees the new instance and can continue their workflow.

### Disabling Recurrence
1. User clicks **"Edit"** on a recurring todo.
2. User unchecks the **"Repeat"** checkbox.
3. The recurrence dropdown disappears.
4. User clicks **"Update"**.
5. The 🔄 badge is removed from the todo.
6. When this todo is completed, **no new instance** is created.

### Editing Recurrence Pattern
1. User clicks **"Edit"** on a recurring todo.
2. User changes the dropdown from e.g., "Daily" to "Weekly".
3. User clicks **"Update"**.
4. The badge updates to show "🔄 weekly".
5. Next completion will calculate the new due date using the updated pattern.

---

## Technical Requirements

### Database Schema

The `todos` table requires two columns for recurrence support. These are added via migration in `lib/db.ts`:

```sql
-- Added to todos table creation (or via ALTER TABLE migration)
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  is_completed INTEGER DEFAULT 0,
  due_date TEXT,
  priority TEXT DEFAULT 'medium',
  is_recurring INTEGER DEFAULT 0,
  recurrence_pattern TEXT,
  reminder_minutes INTEGER,
  last_notification_sent TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**Migration block** (in `lib/db.ts` initialization):

```typescript
// Migration: Add recurring fields to todos table
try {
  db.exec(`ALTER TABLE todos ADD COLUMN is_recurring INTEGER DEFAULT 0`);
} catch (e) {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE todos ADD COLUMN recurrence_pattern TEXT`);
} catch (e) {
  // Column already exists
}
```

**Column Details:**

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `is_recurring` | `INTEGER` | `0` | Boolean flag: `0` = not recurring, `1` = recurring |
| `recurrence_pattern` | `TEXT` | `NULL` | Pattern: `'daily'`, `'weekly'`, `'monthly'`, `'yearly'`, or `NULL` |

**Constraints:**
- When `is_recurring = 1`, `recurrence_pattern` MUST be one of `'daily' | 'weekly' | 'monthly' | 'yearly'`
- When `is_recurring = 1`, `due_date` MUST NOT be `NULL`
- When `is_recurring = 0`, `recurrence_pattern` SHOULD be `NULL` (cleared on disable)

### Type Definitions

Add to `lib/db.ts`:

```typescript
// Recurrence pattern type
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

// Updated Todo interface
export interface Todo {
  id: number;
  user_id: number;
  title: string;
  is_completed: number;        // 0 or 1
  due_date: string | null;
  priority: Priority;          // 'high' | 'medium' | 'low'
  is_recurring: number;        // 0 or 1
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
}
```

### API Endpoints

#### POST /api/todos — Create Todo (with recurrence support)

**File:** `app/api/todos/route.ts`

**Request Body:**
```json
{
  "title": "Daily standup",
  "priority": "high",
  "due_date": "2025-11-15T09:00",
  "is_recurring": true,
  "recurrence_pattern": "daily",
  "reminder_minutes": 15,
  "tag_ids": [1, 3]
}
```

**Validation Rules:**
1. `title` is required, non-empty after trimming.
2. If `is_recurring` is `true`, `due_date` is **required**.
3. If `is_recurring` is `true`, `recurrence_pattern` must be one of `'daily' | 'weekly' | 'monthly' | 'yearly'`.
4. `due_date` must be at least 1 minute in the future (Singapore timezone).

**Success Response (201):**
```json
{
  "id": 42,
  "title": "Daily standup",
  "is_completed": 0,
  "due_date": "2025-11-15T09:00",
  "priority": "high",
  "is_recurring": 1,
  "recurrence_pattern": "daily",
  "reminder_minutes": 15,
  "created_at": "2025-11-14T10:30:00"
}
```

**Error Response (400) — Missing due date for recurring:**
```json
{
  "error": "Recurring todos require a due date"
}
```

**Error Response (400) — Invalid recurrence pattern:**
```json
{
  "error": "Invalid recurrence pattern. Must be one of: daily, weekly, monthly, yearly"
}
```

**Implementation snippet:**
```typescript
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();
  const { title, priority, due_date, is_recurring, recurrence_pattern, reminder_minutes, tag_ids } = body;

  // Validate title
  if (!title || !title.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  // Validate recurring requirements
  if (is_recurring) {
    if (!due_date) {
      return NextResponse.json({ error: 'Recurring todos require a due date' }, { status: 400 });
    }
    const validPatterns: RecurrencePattern[] = ['daily', 'weekly', 'monthly', 'yearly'];
    if (!recurrence_pattern || !validPatterns.includes(recurrence_pattern)) {
      return NextResponse.json(
        { error: 'Invalid recurrence pattern. Must be one of: daily, weekly, monthly, yearly' },
        { status: 400 }
      );
    }
  }

  // Validate due date is in future (Singapore timezone)
  if (due_date) {
    const now = getSingaporeNow();
    const dueDateTime = new Date(due_date + ':00+08:00'); // Append Singapore offset
    const diffMs = dueDateTime.getTime() - now.getTime();
    if (diffMs < 60000) { // Less than 1 minute
      return NextResponse.json({ error: 'Due date must be at least 1 minute in the future' }, { status: 400 });
    }
  }

  const todo = todoDB.create(
    session.userId,
    title.trim(),
    due_date || null,
    priority || 'medium',
    is_recurring ? 1 : 0,
    is_recurring ? recurrence_pattern : null,
    reminder_minutes ?? null
  );

  // Link tags if provided
  if (tag_ids && Array.isArray(tag_ids)) {
    for (const tagId of tag_ids) {
      todoTagDB.link(todo.id, tagId);
    }
  }

  return NextResponse.json(todo, { status: 201 });
}
```

---

#### PUT /api/todos/[id] — Update Todo (with recurrence completion handler)

**File:** `app/api/todos/[id]/route.ts`

This is the **critical endpoint** for recurring todos. When a recurring todo is toggled to completed (`is_completed: 1`), the handler must create the next instance.

**Request Body (toggle completion):**
```json
{
  "is_completed": true
}
```

**Request Body (edit recurrence settings):**
```json
{
  "title": "Weekly team sync",
  "is_recurring": true,
  "recurrence_pattern": "weekly",
  "due_date": "2025-11-22T10:00"
}
```

**Request Body (disable recurrence):**
```json
{
  "is_recurring": false,
  "recurrence_pattern": null
}
```

**Success Response (200) — Normal update:**
```json
{
  "todo": {
    "id": 42,
    "title": "Daily standup",
    "is_completed": 1,
    "is_recurring": 1,
    "recurrence_pattern": "daily",
    "due_date": "2025-11-15T09:00"
  }
}
```

**Success Response (200) — Recurring completion (includes new instance):**
```json
{
  "todo": {
    "id": 42,
    "title": "Daily standup",
    "is_completed": 1,
    "is_recurring": 1,
    "recurrence_pattern": "daily",
    "due_date": "2025-11-15T09:00"
  },
  "nextInstance": {
    "id": 43,
    "title": "Daily standup",
    "is_completed": 0,
    "is_recurring": 1,
    "recurrence_pattern": "daily",
    "due_date": "2025-11-16T09:00",
    "priority": "high",
    "reminder_minutes": 15
  }
}
```

**Full PUT Handler Implementation:**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, todoTagDB, RecurrencePattern } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params; // Next.js 16: params is a Promise
  const todoId = parseInt(id);
  const body = await request.json();

  // Fetch existing todo
  const existingTodo = todoDB.getById(todoId, session.userId);
  if (!existingTodo) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  // Validate recurring requirements if enabling recurrence
  const isRecurring = body.is_recurring !== undefined ? body.is_recurring : existingTodo.is_recurring;
  const recurrencePattern = body.recurrence_pattern !== undefined
    ? body.recurrence_pattern
    : existingTodo.recurrence_pattern;
  const dueDate = body.due_date !== undefined ? body.due_date : existingTodo.due_date;

  if (isRecurring) {
    if (!dueDate) {
      return NextResponse.json({ error: 'Recurring todos require a due date' }, { status: 400 });
    }
    const validPatterns: RecurrencePattern[] = ['daily', 'weekly', 'monthly', 'yearly'];
    if (!recurrencePattern || !validPatterns.includes(recurrencePattern)) {
      return NextResponse.json(
        { error: 'Invalid recurrence pattern. Must be one of: daily, weekly, monthly, yearly' },
        { status: 400 }
      );
    }
  }

  // Update the todo
  const updatedTodo = todoDB.update(todoId, session.userId, {
    title: body.title ?? existingTodo.title,
    is_completed: body.is_completed !== undefined ? (body.is_completed ? 1 : 0) : existingTodo.is_completed,
    due_date: dueDate,
    priority: body.priority ?? existingTodo.priority,
    is_recurring: isRecurring ? 1 : 0,
    recurrence_pattern: isRecurring ? recurrencePattern : null,
    reminder_minutes: body.reminder_minutes !== undefined
      ? body.reminder_minutes
      : existingTodo.reminder_minutes,
  });

  let nextInstance = null;

  // === RECURRING TODO COMPLETION HANDLER ===
  // Trigger when: todo is being marked as completed AND it is recurring AND it has a due date
  const isBeingCompleted = body.is_completed === true && existingTodo.is_completed === 0;
  const todoIsRecurring = (existingTodo.is_recurring === 1) && existingTodo.recurrence_pattern;
  const hasDueDate = existingTodo.due_date;

  if (isBeingCompleted && todoIsRecurring && hasDueDate) {
    // Calculate next due date
    const nextDueDate = calculateNextDueDate(
      existingTodo.due_date!,
      existingTodo.recurrence_pattern as RecurrencePattern
    );

    // Create next instance with same settings
    const newTodo = todoDB.create(
      session.userId,
      existingTodo.title,
      nextDueDate,
      existingTodo.priority,
      1, // is_recurring = true
      existingTodo.recurrence_pattern,
      existingTodo.reminder_minutes ?? null
    );

    // Copy tags from completed todo to new instance
    const existingTags = todoTagDB.getTagsForTodo(todoId);
    for (const tag of existingTags) {
      todoTagDB.link(newTodo.id, tag.id);
    }

    nextInstance = newTodo;
  }

  return NextResponse.json({ todo: updatedTodo, nextInstance });
}
```

---

### Business Logic

#### Due Date Calculation Function

**File:** `lib/timezone.ts` (or inline in the API route)

This is the core algorithm. All calculations use Singapore timezone.

```typescript
import { getSingaporeNow } from '@/lib/timezone';
import { RecurrencePattern } from '@/lib/db';

/**
 * Calculate the next due date based on recurrence pattern.
 * All calculations are in Singapore timezone (Asia/Singapore, UTC+8).
 *
 * @param currentDueDate - The current due date string (format: "YYYY-MM-DDTHH:mm")
 * @param pattern - The recurrence pattern
 * @returns The next due date string in "YYYY-MM-DDTHH:mm" format
 */
export function calculateNextDueDate(
  currentDueDate: string,
  pattern: RecurrencePattern
): string {
  // Parse the due date in Singapore timezone
  const date = new Date(currentDueDate + ':00+08:00');

  switch (pattern) {
    case 'daily':
      date.setDate(date.getDate() + 1);
      break;

    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;

    case 'monthly': {
      // Store original day to handle month-end edge cases
      const originalDay = date.getDate();
      // Move to next month
      date.setMonth(date.getMonth() + 1);
      // Handle month-end: if the original day doesn't exist in new month,
      // JavaScript Date auto-rolls to next month. We clamp to last day instead.
      if (date.getDate() !== originalDay) {
        // Rolled over — set to last day of intended month
        date.setDate(0); // Sets to last day of previous month (the intended month)
      }
      break;
    }

    case 'yearly': {
      const originalMonth = date.getMonth();
      const originalDay = date.getDate();
      date.setFullYear(date.getFullYear() + 1);
      // Handle leap year: Feb 29 → Feb 28 in non-leap year
      if (date.getMonth() !== originalMonth || date.getDate() !== originalDay) {
        // Rolled over — fix to last valid day
        date.setDate(0);
      }
      break;
    }
  }

  // Format back to "YYYY-MM-DDTHH:mm" in Singapore timezone
  const sgDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
  const year = date.getUTCFullYear() + (date.getTimezoneOffset() > 0 ? 0 : 0);

  // Use Intl to format correctly in Singapore timezone
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const p = (type: string) => parts.find(p => p.type === type)?.value ?? '00';

  return `${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}`;
}
```

#### Due Date Calculation Examples

| Current Due Date | Pattern | Next Due Date | Notes |
|------------------|---------|---------------|-------|
| `2025-11-15T09:00` | `daily` | `2025-11-16T09:00` | Simple +1 day |
| `2025-11-15T09:00` | `weekly` | `2025-11-22T09:00` | +7 days |
| `2025-01-31T09:00` | `monthly` | `2025-02-28T09:00` | Jan 31 → Feb 28 (clamped) |
| `2025-03-31T14:00` | `monthly` | `2025-04-30T14:00` | Mar 31 → Apr 30 (clamped) |
| `2025-11-30T09:00` | `monthly` | `2025-12-30T09:00` | Nov 30 → Dec 30 (same day exists) |
| `2025-11-15T09:00` | `yearly` | `2026-11-15T09:00` | Simple +1 year |
| `2024-02-29T09:00` | `yearly` | `2025-02-28T09:00` | Leap day → Feb 28 |
| `2024-02-29T09:00` | `monthly` | `2024-03-29T09:00` | Feb 29 → Mar 29 (exists) |

#### Metadata Inheritance on Completion

When creating the next recurring instance, copy these fields from the completed todo:

| Field | Behavior |
|-------|----------|
| `title` | Exact copy |
| `priority` | Exact copy (high/medium/low) |
| `is_recurring` | Always `1` |
| `recurrence_pattern` | Exact copy |
| `reminder_minutes` | Exact copy (or `null`) |
| `due_date` | **Calculated** via `calculateNextDueDate()` |
| `is_completed` | Always `0` (new instance starts incomplete) |
| `user_id` | Same user |
| `tags` | Copied by re-linking via `todo_tags` join table |
| `subtasks` | **NOT copied** (each instance starts fresh) |
| `last_notification_sent` | `NULL` (reset for new instance) |

---

## UI Components

### Repeat Checkbox and Pattern Dropdown

Located in the todo create/edit form in `app/page.tsx`:

```tsx
{/* Recurring Todo Controls */}
<div className="flex items-center gap-3">
  {/* Repeat Checkbox */}
  <label className="flex items-center gap-2 cursor-pointer">
    <input
      type="checkbox"
      checked={isRecurring}
      onChange={(e) => {
        setIsRecurring(e.target.checked);
        if (!e.target.checked) {
          setRecurrencePattern('daily'); // Reset to default
        }
      }}
      className="w-4 h-4 text-purple-600 rounded border-gray-300
                 focus:ring-purple-500 dark:border-gray-600
                 dark:focus:ring-purple-400"
    />
    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
      🔄 Repeat
    </span>
  </label>

  {/* Pattern Dropdown — only visible when Repeat is checked */}
  {isRecurring && (
    <select
      value={recurrencePattern}
      onChange={(e) => setRecurrencePattern(e.target.value as RecurrencePattern)}
      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg
                 bg-white dark:bg-gray-700 dark:border-gray-600
                 dark:text-gray-200 focus:ring-2 focus:ring-purple-500
                 focus:border-purple-500"
    >
      <option value="daily">Daily</option>
      <option value="weekly">Weekly</option>
      <option value="monthly">Monthly</option>
      <option value="yearly">Yearly</option>
    </select>
  )}
</div>

{/* Validation message — shown when Repeat is checked but no due date */}
{isRecurring && !dueDate && (
  <p className="text-sm text-red-500 mt-1">
    ⚠️ Recurring todos require a due date
  </p>
)}
```

### Recurrence Badge Display

Displayed on each todo item in the list:

```tsx
{/* Recurrence Badge */}
{todo.is_recurring === 1 && todo.recurrence_pattern && (
  <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium
                    rounded-full border border-purple-300 bg-purple-50
                    text-purple-700 dark:border-purple-600 dark:bg-purple-900/30
                    dark:text-purple-300">
    🔄 {todo.recurrence_pattern}
  </span>
)}
```

### Badge Styling Specification

| Property | Light Mode | Dark Mode |
|----------|-----------|-----------|
| Background | `bg-purple-50` | `dark:bg-purple-900/30` |
| Text | `text-purple-700` | `dark:text-purple-300` |
| Border | `border-purple-300` | `dark:border-purple-600` |
| Font size | `text-xs` | `text-xs` |
| Shape | `rounded-full` | `rounded-full` |
| Padding | `px-2 py-0.5` | `px-2 py-0.5` |

### Todo Completion Handler (Client-Side)

```tsx
const handleToggleCompletion = async (todoId: number, currentStatus: boolean) => {
  try {
    const response = await fetch(`/api/todos/${todoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_completed: !currentStatus }),
    });

    if (!response.ok) {
      throw new Error('Failed to update todo');
    }

    const data = await response.json();

    // Update the completed todo in state
    setTodos(prev =>
      prev.map(t => t.id === todoId ? data.todo : t)
    );

    // If a next instance was created (recurring todo), add it to state
    if (data.nextInstance) {
      setTodos(prev => [...prev, data.nextInstance]);
    }
  } catch (error) {
    console.error('Error toggling todo:', error);
  }
};
```

### State Variables for Create/Edit Form

```tsx
// State for recurring todo fields
const [isRecurring, setIsRecurring] = useState<boolean>(false);
const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>('daily');

// When editing, populate from existing todo
const handleEditClick = (todo: Todo) => {
  setEditTitle(todo.title);
  setEditPriority(todo.priority);
  setEditDueDate(todo.due_date || '');
  setEditIsRecurring(todo.is_recurring === 1);
  setEditRecurrencePattern(
    (todo.recurrence_pattern as RecurrencePattern) || 'daily'
  );
  setEditReminderMinutes(todo.reminder_minutes);
  // ...open edit modal
};
```

### Create Form Submission

```tsx
const handleCreateTodo = async () => {
  // Validate recurring requires due date
  if (isRecurring && !dueDate) {
    setError('Recurring todos require a due date');
    return;
  }

  const payload = {
    title: title.trim(),
    priority,
    due_date: dueDate || null,
    is_recurring: isRecurring,
    recurrence_pattern: isRecurring ? recurrencePattern : null,
    reminder_minutes: reminderMinutes,
    tag_ids: selectedTagIds,
  };

  const response = await fetch('/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = await response.json();
    setError(data.error);
    return;
  }

  const newTodo = await response.json();
  setTodos(prev => [...prev, newTodo]);

  // Reset form
  setTitle('');
  setDueDate('');
  setIsRecurring(false);
  setRecurrencePattern('daily');
  // ...reset other fields
};
```

---

## Database Operations

### todoDB Methods (in `lib/db.ts`)

```typescript
export const todoDB = {
  // Create a new todo
  create(
    userId: number,
    title: string,
    dueDate: string | null,
    priority: Priority,
    isRecurring: number,
    recurrencePattern: string | null,
    reminderMinutes: number | null
  ): Todo {
    const stmt = db.prepare(`
      INSERT INTO todos (user_id, title, due_date, priority, is_recurring, recurrence_pattern, reminder_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(userId, title, dueDate, priority, isRecurring, recurrencePattern, reminderMinutes);
    return this.getById(result.lastInsertRowid as number, userId)!;
  },

  // Get a single todo by ID (with ownership check)
  getById(id: number, userId: number): Todo | undefined {
    const stmt = db.prepare(`SELECT * FROM todos WHERE id = ? AND user_id = ?`);
    return stmt.get(id, userId) as Todo | undefined;
  },

  // Get all todos for a user
  getAllForUser(userId: number): Todo[] {
    const stmt = db.prepare(`
      SELECT * FROM todos WHERE user_id = ?
      ORDER BY
        is_completed ASC,
        CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
        due_date ASC
    `);
    return stmt.all(userId) as Todo[];
  },

  // Update a todo
  update(
    id: number,
    userId: number,
    fields: Partial<Omit<Todo, 'id' | 'user_id' | 'created_at'>>
  ): Todo {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (fields.title !== undefined) { sets.push('title = ?'); values.push(fields.title); }
    if (fields.is_completed !== undefined) { sets.push('is_completed = ?'); values.push(fields.is_completed); }
    if (fields.due_date !== undefined) { sets.push('due_date = ?'); values.push(fields.due_date); }
    if (fields.priority !== undefined) { sets.push('priority = ?'); values.push(fields.priority); }
    if (fields.is_recurring !== undefined) { sets.push('is_recurring = ?'); values.push(fields.is_recurring); }
    if (fields.recurrence_pattern !== undefined) {
      sets.push('recurrence_pattern = ?');
      values.push(fields.recurrence_pattern);
    }
    if (fields.reminder_minutes !== undefined) {
      sets.push('reminder_minutes = ?');
      values.push(fields.reminder_minutes);
    }

    values.push(id, userId);

    const stmt = db.prepare(`UPDATE todos SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`);
    stmt.run(...values);
    return this.getById(id, userId)!;
  },

  // Delete a todo (subtasks and todo_tags CASCADE)
  delete(id: number, userId: number): boolean {
    const stmt = db.prepare(`DELETE FROM todos WHERE id = ? AND user_id = ?`);
    const result = stmt.run(id, userId);
    return result.changes > 0;
  },
};
```

---

## Edge Cases

1. **Recurring todo without due date**: Validation blocks creation. If `is_recurring = true` and `due_date` is empty/null, API returns 400 with error message `"Recurring todos require a due date"`. The UI also shows a client-side warning.

2. **January 31 → Monthly**: Next due date should be February 28 (or 29 in leap year). JavaScript's `Date.setMonth()` would roll Jan 31 → Mar 3 — we detect this day mismatch and clamp to the last day of the target month using `setDate(0)`.

3. **February 29 → Yearly (leap year to non-leap year)**: Feb 29 2024 + 1 year = Feb 28 2025. Detect the month/day mismatch after `setFullYear()` and clamp.

4. **February 29 → Monthly**: Feb 29 + 1 month = Mar 29 (valid, no clamping needed). But Feb 29 → next Feb = Feb 28 in non-leap years (when cycling through yearly months).

5. **March 31 → Monthly**: Mar 31 → Apr 30 (clamped). Apr 30 → May 30 (valid). The pattern adapts — it doesn't try to "remember" the original day 31 forever; each calculation is based on the *current* due date.

6. **Disabling recurrence on existing todo**: Setting `is_recurring = false` clears `recurrence_pattern` to `null`. When this todo is completed, the completion handler checks `is_recurring === 1` and skips next instance creation.

7. **Completing a recurring todo that was already completed**: The handler checks `existingTodo.is_completed === 0` before creating the next instance. Re-completing (toggling off and on again) does NOT create a duplicate. Only the transition from incomplete → complete triggers creation.

8. **Uncompleting a recurring todo after next instance was created**: The next instance is NOT automatically deleted. Both the uncompleted original and the next instance coexist. The user must manually delete the unwanted instance.

9. **Overdue recurring todo completion**: If a daily todo due yesterday at 9 AM is completed today, the next instance is still calculated from the *original* due date (yesterday + 1 day = today). The time of day is preserved (09:00).

10. **Tag inheritance**: Tags are copied by reading all `todo_tags` entries for the completed todo and creating new `todo_tags` entries linking the same tag IDs to the new todo. If a tag was deleted between creation and completion, it won't be copied (it no longer exists).

11. **Concurrent completion**: If the same recurring todo is completed simultaneously in two browser tabs, two next instances could be created. This is mitigated by the `existingTodo.is_completed === 0` check — the second request will see the todo as already completed and skip creation.

12. **Invalid recurrence pattern value**: If somehow a pattern value other than `daily|weekly|monthly|yearly` is stored, the `switch` statement in `calculateNextDueDate` falls through without modifying the date. Consider adding a `default` case that throws an error.

13. **Disabling recurrence during edit while unchecking Repeat**: When the user unchecks "Repeat" in the edit form and saves, the API should set `is_recurring = 0` AND `recurrence_pattern = null` to keep the data clean.

14. **Creating a recurring todo with a past due date**: The due date validation (`must be at least 1 minute in the future`) applies equally to recurring and non-recurring todos. A recurring todo cannot be created with a past due date.

---

## Acceptance Criteria

### Core Functionality
- [ ] Can create a recurring todo with "Daily" pattern and a due date
- [ ] Can create a recurring todo with "Weekly" pattern and a due date
- [ ] Can create a recurring todo with "Monthly" pattern and a due date
- [ ] Can create a recurring todo with "Yearly" pattern and a due date
- [ ] Attempting to create a recurring todo WITHOUT a due date shows error
- [ ] Attempting to create a recurring todo with invalid pattern shows error
- [ ] Non-recurring todos can be created without a due date (no change)

### Completion & Next Instance
- [ ] Completing a recurring todo creates a new todo instance
- [ ] New instance has the same title
- [ ] New instance has the same priority
- [ ] New instance has the same recurrence pattern
- [ ] New instance has the same `is_recurring = 1`
- [ ] New instance has the same `reminder_minutes`
- [ ] New instance has `is_completed = 0`
- [ ] New instance has tags copied from the original
- [ ] New instance has the correctly calculated next due date
- [ ] Completing a NON-recurring todo does NOT create a new instance

### Due Date Calculations
- [ ] Daily: adds exactly 1 day, preserving time of day
- [ ] Weekly: adds exactly 7 days, preserving time of day
- [ ] Monthly: adds 1 month, clamping to month-end if needed (Jan 31 → Feb 28)
- [ ] Yearly: adds 1 year, handling leap year (Feb 29 → Feb 28)
- [ ] All calculations use Singapore timezone (UTC+8)

### UI Components
- [ ] "Repeat" checkbox appears in create form
- [ ] "Repeat" checkbox appears in edit form/modal
- [ ] Recurrence pattern dropdown only visible when "Repeat" is checked
- [ ] Dropdown has options: Daily, Weekly, Monthly, Yearly
- [ ] Validation message shown when Repeat is checked but no due date set
- [ ] 🔄 badge appears on recurring todos with pattern name (e.g., "🔄 weekly")
- [ ] Badge has purple styling with border
- [ ] Badge adapts to dark mode
- [ ] After completing a recurring todo, the new instance appears in the list

### Edit & Disable
- [ ] Can edit recurrence pattern of existing todo (e.g., daily → weekly)
- [ ] Can disable recurrence by unchecking "Repeat" in edit form
- [ ] Disabling recurrence removes the 🔄 badge
- [ ] Completing a todo with disabled recurrence does NOT create next instance
- [ ] Can enable recurrence on a previously non-recurring todo (must set due date)

---

## Testing Requirements

### E2E Tests (Playwright)

**File:** `tests/03-recurring-todos.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { TodoHelper } from './helpers';

test.describe('Feature 03: Recurring Todos', () => {
  let helper: TodoHelper;

  test.beforeEach(async ({ page }) => {
    helper = new TodoHelper(page);
    await helper.registerAndLogin('recurring-test-user');
  });

  test('should create a daily recurring todo', async ({ page }) => {
    // 1. Enter title
    // 2. Check "Repeat" checkbox
    // 3. Select "Daily" from dropdown
    // 4. Set due date to tomorrow 9:00 AM
    // 5. Click "Add"
    // 6. Verify todo appears with "🔄 daily" badge
  });

  test('should create a weekly recurring todo', async ({ page }) => {
    // Similar to daily but verify "🔄 weekly" badge
  });

  test('should create a monthly recurring todo', async ({ page }) => {
    // Similar but verify "🔄 monthly" badge
  });

  test('should create a yearly recurring todo', async ({ page }) => {
    // Similar but verify "🔄 yearly" badge
  });

  test('should require due date for recurring todos', async ({ page }) => {
    // 1. Enter title
    // 2. Check "Repeat"
    // 3. Do NOT set due date
    // 4. Click "Add"
    // 5. Verify error message: "Recurring todos require a due date"
    // 6. Todo should NOT be created
  });

  test('should show/hide pattern dropdown when toggling Repeat', async ({ page }) => {
    // 1. Verify pattern dropdown is NOT visible
    // 2. Check "Repeat" checkbox
    // 3. Verify pattern dropdown IS visible with 4 options
    // 4. Uncheck "Repeat"
    // 5. Verify pattern dropdown is NOT visible again
  });

  test('should create next instance when completing a recurring todo', async ({ page }) => {
    // 1. Create daily recurring todo with due date "tomorrow 9 AM"
    // 2. Click completion checkbox
    // 3. Verify original todo moves to Completed section
    // 4. Verify new todo appears in Pending section
    // 5. Verify new todo has same title
    // 6. Verify new todo has "🔄 daily" badge
    // 7. Verify new todo due date is "day after tomorrow 9 AM"
  });

  test('should inherit priority in next instance', async ({ page }) => {
    // 1. Create recurring todo with High priority
    // 2. Complete it
    // 3. Verify new instance has High priority badge
  });

  test('should inherit tags in next instance', async ({ page }) => {
    // 1. Create a tag "work"
    // 2. Create recurring todo and assign "work" tag
    // 3. Complete it
    // 4. Verify new instance has "work" tag badge
  });

  test('should inherit reminder in next instance', async ({ page }) => {
    // 1. Create recurring todo with 15-minute reminder
    // 2. Complete it
    // 3. Verify new instance has "🔔 15m" badge
  });

  test('should disable recurrence by unchecking Repeat', async ({ page }) => {
    // 1. Create recurring todo
    // 2. Click "Edit"
    // 3. Uncheck "Repeat"
    // 4. Click "Update"
    // 5. Verify "🔄" badge is removed
    // 6. Complete the todo
    // 7. Verify NO new instance is created
  });

  test('should NOT create next instance for non-recurring todo', async ({ page }) => {
    // 1. Create a regular (non-recurring) todo with due date
    // 2. Complete it
    // 3. Count todos in Pending section
    // 4. Verify count did not increase (no new instance)
  });

  test('should change recurrence pattern via edit', async ({ page }) => {
    // 1. Create daily recurring todo
    // 2. Edit → change to "Weekly"
    // 3. Verify badge shows "🔄 weekly"
  });

  test('should display purple badge with correct styling', async ({ page }) => {
    // 1. Create recurring todo
    // 2. Find the 🔄 badge element
    // 3. Verify purple background/border colors
    // 4. Verify text content includes pattern name
  });
});
```

### Unit Tests

**File:** `tests/unit/recurring-calculations.test.ts` (or tested via API route tests)

```typescript
import { calculateNextDueDate } from '@/lib/timezone';

describe('calculateNextDueDate', () => {
  // Daily
  test('daily: adds 1 day', () => {
    expect(calculateNextDueDate('2025-11-15T09:00', 'daily')).toBe('2025-11-16T09:00');
  });

  test('daily: crosses month boundary', () => {
    expect(calculateNextDueDate('2025-11-30T09:00', 'daily')).toBe('2025-12-01T09:00');
  });

  test('daily: crosses year boundary', () => {
    expect(calculateNextDueDate('2025-12-31T23:00', 'daily')).toBe('2026-01-01T23:00');
  });

  // Weekly
  test('weekly: adds 7 days', () => {
    expect(calculateNextDueDate('2025-11-15T09:00', 'weekly')).toBe('2025-11-22T09:00');
  });

  test('weekly: crosses month boundary', () => {
    expect(calculateNextDueDate('2025-11-28T09:00', 'weekly')).toBe('2025-12-05T09:00');
  });

  // Monthly
  test('monthly: same day exists in next month', () => {
    expect(calculateNextDueDate('2025-11-15T09:00', 'monthly')).toBe('2025-12-15T09:00');
  });

  test('monthly: Jan 31 → Feb 28 (clamp)', () => {
    expect(calculateNextDueDate('2025-01-31T09:00', 'monthly')).toBe('2025-02-28T09:00');
  });

  test('monthly: Jan 31 → Feb 29 (leap year clamp)', () => {
    expect(calculateNextDueDate('2024-01-31T09:00', 'monthly')).toBe('2024-02-29T09:00');
  });

  test('monthly: Mar 31 → Apr 30 (clamp)', () => {
    expect(calculateNextDueDate('2025-03-31T14:00', 'monthly')).toBe('2025-04-30T14:00');
  });

  test('monthly: preserves time of day', () => {
    expect(calculateNextDueDate('2025-11-15T22:30', 'monthly')).toBe('2025-12-15T22:30');
  });

  // Yearly
  test('yearly: adds 1 year', () => {
    expect(calculateNextDueDate('2025-11-15T09:00', 'yearly')).toBe('2026-11-15T09:00');
  });

  test('yearly: Feb 29 → Feb 28 (non-leap)', () => {
    expect(calculateNextDueDate('2024-02-29T09:00', 'yearly')).toBe('2025-02-28T09:00');
  });

  test('yearly: Feb 28 → Feb 28 (consistent)', () => {
    expect(calculateNextDueDate('2025-02-28T09:00', 'yearly')).toBe('2026-02-28T09:00');
  });

  // Time preservation
  test('preserves time across all patterns', () => {
    const time = '14:30';
    expect(calculateNextDueDate(`2025-06-15T${time}`, 'daily')).toContain(time);
    expect(calculateNextDueDate(`2025-06-15T${time}`, 'weekly')).toContain(time);
    expect(calculateNextDueDate(`2025-06-15T${time}`, 'monthly')).toContain(time);
    expect(calculateNextDueDate(`2025-06-15T${time}`, 'yearly')).toContain(time);
  });
});
```

---

## Out of Scope

The following are explicitly **NOT** part of this feature:

1. **Custom recurrence intervals** (e.g., "every 3 days", "every 2 weeks") — only fixed patterns (daily/weekly/monthly/yearly) are supported.
2. **Day-of-week recurrence** (e.g., "every Monday and Wednesday") — not supported in this version.
3. **End date for recurrence** (e.g., "repeat until December 31") — recurrence continues indefinitely until manually disabled.
4. **Maximum instance count** (e.g., "repeat 10 times") — no limit on how many instances can be created.
5. **Subtask inheritance** — subtasks are NOT copied to the next instance; each occurrence starts with a clean subtask list.
6. **Batch completion of recurring todos** — each instance must be completed individually.
7. **Recurrence history/chain tracking** — there is no parent-child link between recurring instances; each is an independent todo.
8. **Calendar-aware skipping** (e.g., "skip holidays") — not supported.
9. **Bulk recurrence pattern changes** — changing the pattern on one instance does not affect previously created instances.

---

## Success Metrics

1. **Functional completeness**: All four recurrence patterns (daily, weekly, monthly, yearly) create correct next instances upon completion.
2. **Date calculation accuracy**: 100% correct due date calculations across all edge cases (month-end, leap year, timezone).
3. **Metadata fidelity**: Next instance inherits 100% of specified fields (title, priority, tags, reminder, recurrence settings).
4. **User experience**: Creating a recurring todo takes no more than 2 additional clicks (checkbox + dropdown) beyond creating a regular todo.
5. **E2E test pass rate**: All Playwright tests for this feature pass consistently across 3 consecutive runs.
6. **No data loss**: Disabling recurrence never deletes the existing todo or its data — only prevents future instance creation.
7. **Performance**: Completing a recurring todo and creating the next instance completes within 500ms (API response time).
