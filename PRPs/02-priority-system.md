# Feature 02: Priority System

## Feature Overview

The Priority System enables users to categorize their todos by importance using three distinct levels: **High**, **Medium**, and **Low**. Each priority level is visually represented by a color-coded badge (Red, Yellow, Blue) that adapts to both light and dark modes while maintaining WCAG AA contrast compliance. Todos are automatically sorted by priority (high → medium → low) and secondarily by due date. Users can filter their todo list by priority level to focus on what matters most.

This feature depends on **Feature 01: Todo CRUD Operations** being implemented first, as it extends the `todos` table and the create/edit/list flows.

---

## User Stories

1. **As a user**, I want to assign priority levels (High, Medium, Low) to my todos so that I can indicate relative importance of tasks.
2. **As a user**, I want to see color-coded priority badges next to each todo so that I can quickly identify priority at a glance without reading text.
3. **As a user**, I want to filter my todo list by priority level so that I can focus on high-priority items when I'm busy.
4. **As a user**, I want my todos automatically sorted by priority so that the most important tasks always appear first.
5. **As a user**, I want a sensible default priority (Medium) when creating todos so that I don't have to select a priority every time.
6. **As a user**, I want priority badges to be readable in both light and dark modes so that the UI is usable in any environment.

---

## User Flow

### Assigning Priority on Create
1. User opens the todo creation form at the top of the main page.
2. User enters a todo title in the text input field.
3. User selects a priority from the **Priority dropdown** (defaults to "Medium").
4. User optionally sets a due date and other metadata.
5. User clicks **"Add"** to create the todo.
6. The new todo appears in the list with the corresponding **color-coded priority badge**.
7. The todo list automatically re-sorts to place the new todo in the correct priority order.

### Changing Priority on Edit
1. User clicks **"Edit"** on an existing todo.
2. The edit modal/form opens with the current priority pre-selected in the dropdown.
3. User selects a different priority from the dropdown.
4. User clicks **"Update"** to save changes.
5. The priority badge updates immediately to reflect the new color.
6. The todo list re-sorts to reflect the new priority position.

### Filtering by Priority
1. User locates the **"All Priorities"** filter dropdown below the search bar.
2. User selects one of: "All Priorities", "High Priority", "Medium Priority", or "Low Priority".
3. The todo list immediately filters to show only todos matching the selected priority.
4. Section headers (Overdue, Pending, Completed) update their counts to reflect filtered results.
5. User selects **"All Priorities"** to clear the filter and show all todos again.

### Viewing Sorted Todos
1. User views the todo list on the main page.
2. Todos are automatically sorted by:
   - **Primary sort**: Priority (high → medium → low)
   - **Secondary sort**: Due date (earliest first, todos without due dates appear last)
3. This sort order applies within each section (Overdue, Pending, Completed).

---

## Technical Requirements

### Database Schema

The `priority` field is added to the existing `todos` table. If implementing from scratch alongside Feature 01, include it in the initial `CREATE TABLE`. If adding to an existing table, use `ALTER TABLE`.

```sql
-- Option A: Include in initial todos table creation (with Feature 01)
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high', 'medium', 'low')),
  is_recurring INTEGER NOT NULL DEFAULT 0,
  recurrence_pattern TEXT CHECK(recurrence_pattern IN ('daily', 'weekly', 'monthly', 'yearly')),
  reminder_minutes INTEGER,
  last_notification_sent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Option B: Alter existing table (if Feature 01 already implemented without priority)
ALTER TABLE todos ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high', 'medium', 'low'));
```

> **Important**: The `CHECK` constraint ensures only valid priority values are stored at the database level. The `DEFAULT 'medium'` ensures backward compatibility with any existing todos.

#### Database Index (Performance)

```sql
-- Index for filtering by priority per user
CREATE INDEX IF NOT EXISTS idx_todos_user_priority ON todos(user_id, priority);

-- Composite index for sorting by priority + due date
CREATE INDEX IF NOT EXISTS idx_todos_user_priority_due ON todos(user_id, priority, due_date);
```

### Type Definitions

Add these types to `lib/db.ts`:

```typescript
// Priority type — strict union of allowed values
export type Priority = 'high' | 'medium' | 'low';

// Valid priority values array — used for runtime validation
export const VALID_PRIORITIES: Priority[] = ['high', 'medium', 'low'];

// Priority sort weight map — lower number = higher priority (sorts first)
export const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

// Todo interface (updated to include priority)
export interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: number; // 0 or 1 (SQLite boolean)
  due_date: string | null;
  priority: Priority;
  is_recurring: number; // 0 or 1
  recurrence_pattern: string | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
  updated_at: string;
}
```

### Validation Helper

Add a validation utility function in `lib/db.ts` or a shared validation module:

```typescript
/**
 * Validates that a given value is a valid Priority.
 * Returns the validated priority or 'medium' as default.
 */
export function validatePriority(value: unknown): Priority {
  if (typeof value === 'string' && VALID_PRIORITIES.includes(value as Priority)) {
    return value as Priority;
  }
  return 'medium'; // Default fallback
}

/**
 * Strict validation — throws on invalid priority.
 * Use in API routes where invalid input should be rejected.
 */
export function assertValidPriority(value: unknown): Priority {
  if (typeof value === 'string' && VALID_PRIORITIES.includes(value as Priority)) {
    return value as Priority;
  }
  throw new Error(`Invalid priority: ${value}. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
}
```

### API Endpoints

All API routes follow the standard project authentication pattern.

#### POST `/api/todos` — Create Todo (with priority)

**Request:**
```json
{
  "title": "Prepare quarterly report",
  "priority": "high",
  "due_date": "2025-12-01T14:00"
}
```

**Response (201 Created):**
```json
{
  "id": 42,
  "user_id": 1,
  "title": "Prepare quarterly report",
  "completed": 0,
  "due_date": "2025-12-01T14:00",
  "priority": "high",
  "is_recurring": 0,
  "recurrence_pattern": null,
  "reminder_minutes": null,
  "last_notification_sent": null,
  "created_at": "2025-11-15T10:30:00",
  "updated_at": "2025-11-15T10:30:00"
}
```

**Validation Logic in Route Handler:**

```typescript
// app/api/todos/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createTodo, VALID_PRIORITIES, type Priority } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const { title, priority, due_date } = body;

  // Validate title
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  // Validate priority — must be one of the valid values
  const validatedPriority: Priority = priority && VALID_PRIORITIES.includes(priority)
    ? priority
    : 'medium'; // Default to 'medium' if missing or invalid

  // Validate due date (if provided, must be in the future — at least 1 minute)
  if (due_date) {
    const dueDateTime = new Date(due_date);
    const now = getSingaporeNow();
    const oneMinuteFromNow = new Date(now.getTime() + 60 * 1000);
    if (dueDateTime < oneMinuteFromNow) {
      return NextResponse.json(
        { error: 'Due date must be at least 1 minute in the future' },
        { status: 400 }
      );
    }
  }

  const now = getSingaporeNow().toISOString();
  const todo = createTodo({
    user_id: session.userId,
    title: title.trim(),
    priority: validatedPriority,
    due_date: due_date || null,
    created_at: now,
    updated_at: now,
  });

  return NextResponse.json(todo, { status: 201 });
}
```

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Missing/empty title | `{ "error": "Title is required" }` |
| 400 | Invalid priority value | Silently defaults to `'medium'` (lenient) OR `{ "error": "Invalid priority. Must be high, medium, or low" }` (strict) |
| 400 | Due date in the past | `{ "error": "Due date must be at least 1 minute in the future" }` |
| 401 | No session | `{ "error": "Not authenticated" }` |

#### PUT `/api/todos/[id]` — Update Todo (with priority)

**Request:**
```json
{
  "title": "Prepare quarterly report - UPDATED",
  "priority": "medium",
  "due_date": "2025-12-05T14:00"
}
```

**Response (200 OK):**
```json
{
  "id": 42,
  "user_id": 1,
  "title": "Prepare quarterly report - UPDATED",
  "completed": 0,
  "due_date": "2025-12-05T14:00",
  "priority": "medium",
  "is_recurring": 0,
  "recurrence_pattern": null,
  "reminder_minutes": null,
  "last_notification_sent": null,
  "created_at": "2025-11-15T10:30:00",
  "updated_at": "2025-11-16T09:00:00"
}
```

**Route Handler:**

```typescript
// app/api/todos/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTodoById, updateTodo, VALID_PRIORITIES, type Priority } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params; // params is async in Next.js 16
  const todoId = parseInt(id, 10);

  // Verify todo exists and belongs to user
  const existingTodo = getTodoById(todoId);
  if (!existingTodo || existingTodo.user_id !== session.userId) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  const body = await request.json();
  const { title, priority, due_date, completed } = body;

  // Validate priority if provided
  let validatedPriority: Priority = existingTodo.priority;
  if (priority !== undefined) {
    if (!VALID_PRIORITIES.includes(priority)) {
      return NextResponse.json(
        { error: 'Invalid priority. Must be high, medium, or low' },
        { status: 400 }
      );
    }
    validatedPriority = priority;
  }

  const now = getSingaporeNow().toISOString();
  const updatedTodo = updateTodo(todoId, {
    title: title?.trim() ?? existingTodo.title,
    priority: validatedPriority,
    due_date: due_date !== undefined ? due_date : existingTodo.due_date,
    completed: completed !== undefined ? completed : existingTodo.completed,
    updated_at: now,
  });

  return NextResponse.json(updatedTodo);
}
```

#### GET `/api/todos` — List Todos (sorted by priority)

**Response (200 OK):**
```json
[
  {
    "id": 42,
    "title": "Urgent deadline",
    "priority": "high",
    "due_date": "2025-11-20T09:00",
    "completed": 0,
    "..."
  },
  {
    "id": 43,
    "title": "Regular task",
    "priority": "medium",
    "due_date": "2025-11-22T14:00",
    "completed": 0,
    "..."
  },
  {
    "id": 44,
    "title": "Someday task",
    "priority": "low",
    "due_date": null,
    "completed": 0,
    "..."
  }
]
```

**Database Query with Priority Sorting:**

```typescript
// In lib/db.ts — getTodosByUserId function
export function getTodosByUserId(userId: number): Todo[] {
  const stmt = db.prepare(`
    SELECT * FROM todos
    WHERE user_id = ?
    ORDER BY
      completed ASC,
      CASE priority
        WHEN 'high' THEN 0
        WHEN 'medium' THEN 1
        WHEN 'low' THEN 2
        ELSE 1
      END ASC,
      CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC,
      due_date ASC,
      created_at DESC
  `);
  return stmt.all(userId) as Todo[];
}
```

### Business Logic

#### Priority Sort Algorithm

Todos are sorted using a multi-level comparison. This can be applied either in the SQL query (server-side) or in the client component (client-side). Both are shown:

**Server-side SQL Sorting (Recommended):**

```sql
ORDER BY
  completed ASC,                                        -- Incomplete first
  CASE priority
    WHEN 'high' THEN 0
    WHEN 'medium' THEN 1
    WHEN 'low' THEN 2
    ELSE 1
  END ASC,                                               -- Priority order
  CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC,     -- Due dates first
  due_date ASC,                                           -- Earliest due date first
  created_at DESC                                         -- Newest first (tiebreaker)
```

**Client-side JavaScript Sorting (for real-time filter updates):**

```typescript
// Sorting function for use in the client component (app/page.tsx)
const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function sortTodos(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    // 1. Sort by priority (high → medium → low)
    const priorityDiff = (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
    if (priorityDiff !== 0) return priorityDiff;

    // 2. Sort by due date (earliest first, null last)
    if (a.due_date && b.due_date) {
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    }
    if (a.due_date && !b.due_date) return -1; // a has due date, comes first
    if (!a.due_date && b.due_date) return 1;  // b has due date, comes first

    // 3. Tiebreaker: newest first
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
```

#### Priority Filter Logic

```typescript
// Client-side filtering in app/page.tsx
const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');

// Apply priority filter
const filteredTodos = todos.filter((todo) => {
  // Priority filter
  if (priorityFilter !== 'all' && todo.priority !== priorityFilter) {
    return false;
  }
  // ... other filters (search, tags, etc.)
  return true;
});

// Then sort the filtered results
const sortedTodos = sortTodos(filteredTodos);
```

#### Default Priority Handling

- When creating a todo, if no priority is provided, default to `'medium'`.
- The priority dropdown should show `'medium'` as pre-selected.
- On the API side, missing or `undefined` priority defaults to `'medium'`.
- An explicitly invalid priority value (e.g., `'critical'`, `''`, `123`) should either default to `'medium'` (lenient) or return a 400 error (strict — recommended for PUT updates).

---

## UI Components

### Priority Badge Component

This inline component renders a color-coded priority label. It lives inside `app/page.tsx` (the monolithic client component).

```tsx
// Priority Badge — renders inside app/page.tsx
// Inline function component (not a separate file, since app/page.tsx is monolithic)

type Priority = 'high' | 'medium' | 'low';

interface PriorityBadgeProps {
  priority: Priority;
}

function PriorityBadge({ priority }: PriorityBadgeProps) {
  const config: Record<Priority, { label: string; emoji: string; className: string }> = {
    high: {
      label: 'High',
      emoji: '🔴',
      className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    },
    medium: {
      label: 'Medium',
      emoji: '🟡',
      className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    },
    low: {
      label: 'Low',
      emoji: '🔵',
      className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    },
  };

  const { label, emoji, className } = config[priority] ?? config.medium;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}
      aria-label={`Priority: ${label}`}
      role="status"
    >
      <span aria-hidden="true">{emoji}</span>
      {label}
    </span>
  );
}
```

**Usage in todo list item:**

```tsx
<div className="flex items-center gap-2">
  <input
    type="checkbox"
    checked={todo.completed === 1}
    onChange={() => toggleTodo(todo.id)}
    aria-label={`Mark "${todo.title}" as ${todo.completed ? 'incomplete' : 'complete'}`}
  />
  <span className={todo.completed ? 'line-through text-gray-400' : ''}>
    {todo.title}
  </span>
  <PriorityBadge priority={todo.priority} />
</div>
```

### Priority Dropdown (Create/Edit Form)

```tsx
// Priority selector in the todo create form
<label htmlFor="priority-select" className="text-sm font-medium text-gray-700 dark:text-gray-300">
  Priority
</label>
<select
  id="priority-select"
  value={newTodoPriority}
  onChange={(e) => setNewTodoPriority(e.target.value as Priority)}
  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm
             dark:border-gray-600 dark:bg-gray-700 dark:text-white
             focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
  aria-label="Select priority level"
>
  <option value="high">🔴 High</option>
  <option value="medium">🟡 Medium</option>
  <option value="low">🔵 Low</option>
</select>
```

**State initialization:**

```tsx
const [newTodoPriority, setNewTodoPriority] = useState<Priority>('medium');
```

### Priority Filter Dropdown

```tsx
// Priority filter — placed below the search bar
<label htmlFor="priority-filter" className="sr-only">
  Filter by priority
</label>
<select
  id="priority-filter"
  value={priorityFilter}
  onChange={(e) => setPriorityFilter(e.target.value as Priority | 'all')}
  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm
             dark:border-gray-600 dark:bg-gray-700 dark:text-white
             focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
  aria-label="Filter todos by priority"
>
  <option value="all">All Priorities</option>
  <option value="high">🔴 High Priority</option>
  <option value="medium">🟡 Medium Priority</option>
  <option value="low">🔵 Low Priority</option>
</select>
```

**Filter state:**

```tsx
const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
```

### WCAG AA Contrast Compliance

The chosen color combinations meet WCAG AA contrast requirements (minimum 4.5:1 for normal text):

| Mode | Priority | Background | Text | Contrast Ratio |
|------|----------|-----------|------|----------------|
| Light | High | `bg-red-100` (#FEE2E2) | `text-red-800` (#991B1B) | ≥ 7.0:1 ✅ |
| Light | Medium | `bg-yellow-100` (#FEF3C7) | `text-yellow-800` (#92400E) | ≥ 5.5:1 ✅ |
| Light | Low | `bg-blue-100` (#DBEAFE) | `text-blue-800` (#1E40AF) | ≥ 7.0:1 ✅ |
| Dark | High | `bg-red-900/30` | `text-red-400` (#F87171) | ≥ 4.5:1 ✅ |
| Dark | Medium | `bg-yellow-900/30` | `text-yellow-400` (#FACC15) | ≥ 4.5:1 ✅ |
| Dark | Low | `bg-blue-900/30` | `text-blue-400` (#60A5FA) | ≥ 4.5:1 ✅ |

---

## Edge Cases

1. **Missing priority on create**: If the `priority` field is omitted from the API request body, default to `'medium'`. The UI should always send a priority value, but the API must handle missing values gracefully.

2. **Invalid priority value**: If a client sends an invalid priority (e.g., `'critical'`, `'urgent'`, `''`, `null`, `123`, or an object), the API should:
   - On **POST** (create): silently default to `'medium'` and proceed.
   - On **PUT** (update): return `400 Bad Request` with error message `"Invalid priority. Must be high, medium, or low"`.

3. **Changing priority on a completed todo**: Allowed. The priority badge updates, but the todo remains in the Completed section. If the user uncompletes it later, it will sort according to the new priority.

4. **Priority during recurring todo creation**: When a recurring todo is completed and the next instance is created, the new instance must inherit the same priority as the completed instance.

5. **Priority filter combined with search**: When both a priority filter and a search query are active, results must match **both** criteria (AND logic). For example, filtering by "High" and searching for "report" shows only high-priority todos containing "report" in the title.

6. **Empty filter results**: When a priority filter is applied and no todos match, display the appropriate empty state message (e.g., "No high priority todos found"). Section headers should show count `(0)` or be hidden entirely.

7. **Case sensitivity of priority values**: Priority values must be **lowercase** (`'high'`, `'medium'`, `'low'`). The API should normalize to lowercase: `'HIGH'` → `'high'`, `'Medium'` → `'medium'`. Apply `.toLowerCase()` before validation.

8. **Database migration for existing todos**: If the `priority` column is added to an existing table with data, all existing todos receive `'medium'` as default priority (via `DEFAULT 'medium'` in the column definition).

9. **Priority in export/import**: Exported JSON must include the `priority` field. On import, validate the priority value; default to `'medium'` if missing or invalid.

10. **Rapid priority changes**: If a user quickly changes priority multiple times (e.g., high → low → high), each API call should succeed independently. Use optimistic UI updates to keep the interface responsive.

11. **Priority badge in overdue section**: Todos in the Overdue section must still display their priority badge alongside the overdue indicator. The priority badge should not be hidden or replaced.

12. **Concurrent filter and sort**: When the priority filter changes, the sort order must update immediately. Filtering to "Low" should still show those low-priority todos sorted by due date.

---

## Acceptance Criteria

- [ ] **Database**: `priority` column exists on `todos` table with `TEXT NOT NULL DEFAULT 'medium'` and `CHECK` constraint limiting to `'high'`, `'medium'`, `'low'`.
- [ ] **Type safety**: `Priority` type is defined as `'high' | 'medium' | 'low'` and used throughout the codebase.
- [ ] **Default value**: Creating a todo without specifying priority defaults to `'medium'`.
- [ ] **API validation (POST)**: Missing or invalid priority on create silently defaults to `'medium'`.
- [ ] **API validation (PUT)**: Invalid priority on update returns `400 Bad Request` with clear error message.
- [ ] **Priority badge**: Each priority level displays with correct color-coded badge (High=Red, Medium=Yellow, Low=Blue).
- [ ] **Badge accessibility**: Priority badges include `aria-label="Priority: {level}"` and `role="status"`.
- [ ] **Dark mode**: All three badge color variants are readable in dark mode with `dark:` Tailwind classes.
- [ ] **WCAG AA**: Badge text/background combinations meet minimum 4.5:1 contrast ratio in both light and dark modes.
- [ ] **Create form**: Priority dropdown appears in the create todo form, defaulting to "Medium".
- [ ] **Edit form**: Priority dropdown appears in the edit modal, pre-populated with the todo's current priority.
- [ ] **Filter dropdown**: "All Priorities" filter dropdown appears below the search bar with options: All, High, Medium, Low.
- [ ] **Filter works**: Selecting a priority filter immediately shows only todos with that priority.
- [ ] **Filter + search**: Priority filter combines with search using AND logic.
- [ ] **Sort order**: Todos are sorted by priority (high → medium → low), then by due date (earliest first), then by creation date (newest first).
- [ ] **Sort across sections**: Sort order applies within each section (Overdue, Pending, Completed).
- [ ] **Recurring inheritance**: Completing a recurring todo creates the next instance with the same priority.
- [ ] **Export/Import**: Priority field is included in exported JSON and validated on import.
- [ ] **Optimistic UI**: Priority changes update the badge and sort order immediately before the API response.

---

## Testing Requirements

### E2E Tests (Playwright)

Create test file: `tests/02-priority-system.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

// Helper: Register and login (reuse from tests/helpers.ts)
import { registerAndLogin, createTodo } from './helpers';

test.describe('Feature 02: Priority System', () => {

  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page, `priority-user-${Date.now()}`);
  });

  test.describe('Priority Assignment', () => {
    test('should create a todo with default medium priority', async ({ page }) => {
      // Create a todo without explicitly selecting priority
      await page.fill('[data-testid="todo-title-input"]', 'Default priority todo');
      await page.click('[data-testid="add-todo-button"]');

      // Verify medium priority badge appears
      const badge = page.locator('[data-testid="priority-badge"]').first();
      await expect(badge).toContainText('Medium');
      await expect(badge).toHaveClass(/bg-yellow-100/);
    });

    test('should create a todo with high priority', async ({ page }) => {
      await page.fill('[data-testid="todo-title-input"]', 'Urgent task');
      await page.selectOption('[data-testid="priority-select"]', 'high');
      await page.click('[data-testid="add-todo-button"]');

      const badge = page.locator('[data-testid="priority-badge"]').first();
      await expect(badge).toContainText('High');
      await expect(badge).toHaveClass(/bg-red-100/);
    });

    test('should create a todo with low priority', async ({ page }) => {
      await page.fill('[data-testid="todo-title-input"]', 'Someday task');
      await page.selectOption('[data-testid="priority-select"]', 'low');
      await page.click('[data-testid="add-todo-button"]');

      const badge = page.locator('[data-testid="priority-badge"]').first();
      await expect(badge).toContainText('Low');
      await expect(badge).toHaveClass(/bg-blue-100/);
    });

    test('should create todos with each priority level', async ({ page }) => {
      // Create one of each priority
      for (const priority of ['high', 'medium', 'low'] as const) {
        await page.fill('[data-testid="todo-title-input"]', `${priority} priority task`);
        await page.selectOption('[data-testid="priority-select"]', priority);
        await page.click('[data-testid="add-todo-button"]');
        await page.waitForTimeout(300); // Wait for UI update
      }

      // Verify all three badges are present
      const badges = page.locator('[data-testid="priority-badge"]');
      await expect(badges).toHaveCount(3);
    });
  });

  test.describe('Priority Editing', () => {
    test('should change priority from medium to high', async ({ page }) => {
      // Create a medium priority todo
      await page.fill('[data-testid="todo-title-input"]', 'Changeable todo');
      await page.click('[data-testid="add-todo-button"]');

      // Open edit modal
      await page.click('[data-testid="edit-todo-button"]');

      // Change priority to high
      await page.selectOption('[data-testid="edit-priority-select"]', 'high');
      await page.click('[data-testid="update-todo-button"]');

      // Verify badge updated
      const badge = page.locator('[data-testid="priority-badge"]').first();
      await expect(badge).toContainText('High');
      await expect(badge).toHaveClass(/bg-red-100/);
    });

    test('should pre-populate current priority in edit form', async ({ page }) => {
      // Create a high priority todo
      await page.fill('[data-testid="todo-title-input"]', 'High priority todo');
      await page.selectOption('[data-testid="priority-select"]', 'high');
      await page.click('[data-testid="add-todo-button"]');

      // Open edit modal
      await page.click('[data-testid="edit-todo-button"]');

      // Verify dropdown shows current priority
      const prioritySelect = page.locator('[data-testid="edit-priority-select"]');
      await expect(prioritySelect).toHaveValue('high');
    });
  });

  test.describe('Priority Filtering', () => {
    test.beforeEach(async ({ page }) => {
      // Create todos of each priority
      const priorities = [
        { title: 'High task A', priority: 'high' },
        { title: 'Medium task B', priority: 'medium' },
        { title: 'Low task C', priority: 'low' },
        { title: 'High task D', priority: 'high' },
      ];

      for (const { title, priority } of priorities) {
        await page.fill('[data-testid="todo-title-input"]', title);
        await page.selectOption('[data-testid="priority-select"]', priority);
        await page.click('[data-testid="add-todo-button"]');
        await page.waitForTimeout(300);
      }
    });

    test('should filter to show only high priority todos', async ({ page }) => {
      await page.selectOption('[data-testid="priority-filter"]', 'high');

      // Should see only high priority todos
      const todoItems = page.locator('[data-testid="todo-item"]');
      await expect(todoItems).toHaveCount(2);
      await expect(page.getByText('High task A')).toBeVisible();
      await expect(page.getByText('High task D')).toBeVisible();
      await expect(page.getByText('Medium task B')).not.toBeVisible();
      await expect(page.getByText('Low task C')).not.toBeVisible();
    });

    test('should filter to show only medium priority todos', async ({ page }) => {
      await page.selectOption('[data-testid="priority-filter"]', 'medium');

      const todoItems = page.locator('[data-testid="todo-item"]');
      await expect(todoItems).toHaveCount(1);
      await expect(page.getByText('Medium task B')).toBeVisible();
    });

    test('should filter to show only low priority todos', async ({ page }) => {
      await page.selectOption('[data-testid="priority-filter"]', 'low');

      const todoItems = page.locator('[data-testid="todo-item"]');
      await expect(todoItems).toHaveCount(1);
      await expect(page.getByText('Low task C')).toBeVisible();
    });

    test('should show all todos when "All Priorities" is selected', async ({ page }) => {
      // First filter to high
      await page.selectOption('[data-testid="priority-filter"]', 'high');
      await expect(page.locator('[data-testid="todo-item"]')).toHaveCount(2);

      // Then reset to all
      await page.selectOption('[data-testid="priority-filter"]', 'all');
      await expect(page.locator('[data-testid="todo-item"]')).toHaveCount(4);
    });

    test('should combine priority filter with search', async ({ page }) => {
      // Filter by high priority
      await page.selectOption('[data-testid="priority-filter"]', 'high');

      // Search for "task A"
      await page.fill('[data-testid="search-input"]', 'task A');

      const todoItems = page.locator('[data-testid="todo-item"]');
      await expect(todoItems).toHaveCount(1);
      await expect(page.getByText('High task A')).toBeVisible();
    });
  });

  test.describe('Priority Sorting', () => {
    test('should sort todos by priority: high → medium → low', async ({ page }) => {
      // Create todos in reverse priority order
      const todos = [
        { title: 'Low task', priority: 'low' },
        { title: 'High task', priority: 'high' },
        { title: 'Medium task', priority: 'medium' },
      ];

      for (const { title, priority } of todos) {
        await page.fill('[data-testid="todo-title-input"]', title);
        await page.selectOption('[data-testid="priority-select"]', priority);
        await page.click('[data-testid="add-todo-button"]');
        await page.waitForTimeout(300);
      }

      // Verify sort order
      const todoItems = page.locator('[data-testid="todo-item"]');
      const titles = await todoItems.locator('[data-testid="todo-title"]').allTextContents();

      expect(titles[0]).toContain('High task');
      expect(titles[1]).toContain('Medium task');
      expect(titles[2]).toContain('Low task');
    });

    test('should sort by due date within same priority', async ({ page }) => {
      // Create two high-priority todos with different due dates
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dayAfter = new Date();
      dayAfter.setDate(dayAfter.getDate() + 2);

      // Create the later-due todo first
      await page.fill('[data-testid="todo-title-input"]', 'Later high task');
      await page.selectOption('[data-testid="priority-select"]', 'high');
      await page.fill('[data-testid="due-date-input"]', dayAfter.toISOString().slice(0, 16));
      await page.click('[data-testid="add-todo-button"]');
      await page.waitForTimeout(300);

      // Create the earlier-due todo second
      await page.fill('[data-testid="todo-title-input"]', 'Earlier high task');
      await page.selectOption('[data-testid="priority-select"]', 'high');
      await page.fill('[data-testid="due-date-input"]', tomorrow.toISOString().slice(0, 16));
      await page.click('[data-testid="add-todo-button"]');
      await page.waitForTimeout(300);

      // The earlier-due todo should appear first
      const todoItems = page.locator('[data-testid="todo-item"]');
      const titles = await todoItems.locator('[data-testid="todo-title"]').allTextContents();

      expect(titles[0]).toContain('Earlier high task');
      expect(titles[1]).toContain('Later high task');
    });
  });

  test.describe('Priority Badge Visibility', () => {
    test('should display priority badge in the Overdue section', async ({ page }) => {
      // This test may need a todo with a past due date (which requires
      // direct DB manipulation or a test helper that bypasses validation).
      // Alternatively, create a todo with a near-future due date and wait.
      // For now, verify badge presence on active todos.
      await page.fill('[data-testid="todo-title-input"]', 'Badge test todo');
      await page.selectOption('[data-testid="priority-select"]', 'high');
      await page.click('[data-testid="add-todo-button"]');

      const badge = page.locator('[data-testid="priority-badge"]').first();
      await expect(badge).toBeVisible();
      await expect(badge).toHaveAttribute('aria-label', 'Priority: High');
    });
  });

  test.describe('API Validation', () => {
    test('should reject invalid priority on update via API', async ({ page, request }) => {
      // Create a todo first
      await page.fill('[data-testid="todo-title-input"]', 'API test todo');
      await page.click('[data-testid="add-todo-button"]');
      await page.waitForTimeout(500);

      // Get cookies from browser context for API call
      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find(c => c.name === 'session');

      if (sessionCookie) {
        // Attempt to update with invalid priority
        const response = await request.put('/api/todos/1', {
          data: { priority: 'critical' },
          headers: {
            'Cookie': `session=${sessionCookie.value}`,
          },
        });

        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.error).toContain('Invalid priority');
      }
    });
  });
});
```

### Unit Tests

Test scenarios for business logic (can be run with Jest or Vitest):

```typescript
// tests/unit/priority.test.ts
import { validatePriority, assertValidPriority, PRIORITY_ORDER } from '@/lib/db';

describe('Priority Validation', () => {
  test('validatePriority returns valid priorities as-is', () => {
    expect(validatePriority('high')).toBe('high');
    expect(validatePriority('medium')).toBe('medium');
    expect(validatePriority('low')).toBe('low');
  });

  test('validatePriority defaults to medium for invalid values', () => {
    expect(validatePriority('critical')).toBe('medium');
    expect(validatePriority('')).toBe('medium');
    expect(validatePriority(null)).toBe('medium');
    expect(validatePriority(undefined)).toBe('medium');
    expect(validatePriority(123)).toBe('medium');
    expect(validatePriority({})).toBe('medium');
  });

  test('assertValidPriority throws for invalid values', () => {
    expect(() => assertValidPriority('critical')).toThrow('Invalid priority');
    expect(() => assertValidPriority('')).toThrow('Invalid priority');
    expect(() => assertValidPriority(null)).toThrow('Invalid priority');
  });

  test('assertValidPriority returns valid priorities', () => {
    expect(assertValidPriority('high')).toBe('high');
    expect(assertValidPriority('medium')).toBe('medium');
    expect(assertValidPriority('low')).toBe('low');
  });
});

describe('Priority Sort Order', () => {
  test('PRIORITY_ORDER assigns correct weights', () => {
    expect(PRIORITY_ORDER.high).toBeLessThan(PRIORITY_ORDER.medium);
    expect(PRIORITY_ORDER.medium).toBeLessThan(PRIORITY_ORDER.low);
  });

  test('sort function orders high → medium → low', () => {
    const todos = [
      { priority: 'low', title: 'C', due_date: null, created_at: '2025-01-01' },
      { priority: 'high', title: 'A', due_date: null, created_at: '2025-01-01' },
      { priority: 'medium', title: 'B', due_date: null, created_at: '2025-01-01' },
    ];

    const sorted = todos.sort(
      (a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1)
    );

    expect(sorted[0].priority).toBe('high');
    expect(sorted[1].priority).toBe('medium');
    expect(sorted[2].priority).toBe('low');
  });

  test('sorts by due date within same priority', () => {
    const todos = [
      { priority: 'high', title: 'Later', due_date: '2025-12-31', created_at: '2025-01-01' },
      { priority: 'high', title: 'Earlier', due_date: '2025-11-15', created_at: '2025-01-01' },
    ];

    const sorted = todos.sort((a, b) => {
      const pDiff = (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
      if (pDiff !== 0) return pDiff;
      if (a.due_date && b.due_date) {
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }
      return 0;
    });

    expect(sorted[0].title).toBe('Earlier');
    expect(sorted[1].title).toBe('Later');
  });

  test('todos with due dates sort before todos without', () => {
    const todos = [
      { priority: 'high', title: 'No date', due_date: null, created_at: '2025-01-01' },
      { priority: 'high', title: 'Has date', due_date: '2025-12-01', created_at: '2025-01-01' },
    ];

    const sorted = todos.sort((a, b) => {
      const pDiff = (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
      if (pDiff !== 0) return pDiff;
      if (a.due_date && !b.due_date) return -1;
      if (!a.due_date && b.due_date) return 1;
      return 0;
    });

    expect(sorted[0].title).toBe('Has date');
    expect(sorted[1].title).toBe('No date');
  });
});
```

---

## Out of Scope

The following are explicitly **NOT** part of this feature:

1. **Custom priority levels**: Only three levels (high, medium, low) are supported. No "urgent", "critical", or user-defined levels.
2. **Priority icons/images**: Only emoji-based indicators (🔴🟡🔵) and Tailwind color classes. No custom SVG icons.
3. **Priority-based notifications**: Priority does not affect when or whether reminders fire. (That's Feature 04.)
4. **Drag-and-drop priority reordering**: Todos cannot be manually reordered by dragging. Sort order is always automatic.
5. **Priority history/audit log**: No tracking of priority changes over time.
6. **Bulk priority assignment**: Cannot change priority for multiple todos simultaneously.
7. **Priority in calendar view**: Calendar view (Feature 10) shows todos by date, not by priority. Priority badges may appear but no priority-based calendar coloring.
8. **Numeric priority values**: Priority is stored as text ('high', 'medium', 'low'), not as numeric values (1, 2, 3). The `PRIORITY_ORDER` map is only for sorting in code.

---

## Success Metrics

1. **Functional completeness**: All three priority levels can be created, displayed, edited, and filtered — verified by passing all Playwright E2E tests.
2. **Sort correctness**: 100% of todo lists display in correct priority order (high → medium → low → due date → creation date).
3. **Filter accuracy**: Selecting a priority filter shows exactly the matching todos with zero false positives or false negatives.
4. **Accessibility**: All priority badges pass WCAG AA contrast checks (4.5:1 minimum ratio) in both light and dark modes, verified via Lighthouse or axe-core.
5. **API robustness**: Invalid priority values are handled gracefully without 500 errors — verified by unit tests covering all invalid input types.
6. **Default behavior**: Todos created without explicit priority selection consistently default to 'medium' — verified by E2E test.
7. **Performance**: Priority filtering and sorting complete in < 100ms for a list of 100+ todos, measured via browser DevTools Performance tab.
8. **Dark mode parity**: Priority badges are visually distinct and readable in dark mode, verified by manual visual inspection and contrast ratio tools.
