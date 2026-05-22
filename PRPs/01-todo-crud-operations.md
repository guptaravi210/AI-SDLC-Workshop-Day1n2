# Feature 01: Todo CRUD Operations

## Feature Overview

This is the foundational feature of the Todo App. It provides full Create, Read, Update, and Delete (CRUD) operations for todos, including form-based creation, sectioned display (Overdue / Active / Completed), inline completion toggling, modal-based editing, and immediate deletion with cascade behavior. All date/time operations use Singapore timezone (`Asia/Singapore`) exclusively via `lib/timezone.ts`.

---

## User Stories

1. **As a user**, I want to create a todo with just a title so I can quickly capture tasks without friction.
2. **As a user**, I want to set a priority level and due date on my todo so I can organize tasks by importance and urgency.
3. **As a user**, I want to edit my todos to update the title, priority, due date, and other details as requirements change.
4. **As a user**, I want to mark todos as complete by toggling a checkbox so I can track my progress visually.
5. **As a user**, I want to delete todos I no longer need, and have all associated subtasks and tag associations removed automatically.
6. **As a user**, I want to see overdue tasks highlighted with a red background and warning icon so I can address them urgently.
7. **As a user**, I want my todos automatically sorted by priority, then due date, then creation date so the most important and urgent items always appear first.
8. **As a user**, I want smart color-coded time indicators on due dates so I can gauge urgency at a glance.

---

## User Flow

### Creating a Todo
1. User sees the todo creation form at the top of the main page.
2. User types a title into the text input field (required).
3. Optionally, user selects a priority from the dropdown (defaults to `medium`).
4. Optionally, user picks a due date and time using the date-time picker (must be at least 1 minute in the future).
5. User clicks the **"Add"** button (or presses Enter).
6. The new todo appears instantly in the **Active/Pending** section (optimistic UI).
7. If the API call fails, the todo is removed from the UI and an error message is shown.

### Viewing Todos
1. On page load, all todos for the authenticated user are fetched via `GET /api/todos`.
2. Todos are displayed in three sections:
   - **Overdue** (red background, ⚠️ warning icon): past due date AND not completed.
   - **Active/Pending** (default background): future due date OR no due date, AND not completed.
   - **Completed** (muted styling, checked checkbox): `is_completed = 1`.
3. Within each section, todos are sorted by: Priority (high → medium → low) → Due date (earliest → latest) → Creation date (newest → oldest).

### Editing a Todo
1. User clicks the **edit** (pencil) icon on a todo item.
2. An edit modal/form opens with all fields pre-filled (title, priority, due date).
3. User modifies any fields.
4. User clicks **"Save"** to apply changes.
5. The modal closes and the todo list updates immediately (optimistic UI).
6. If validation fails (e.g., empty title, past due date), an error message is displayed and the modal stays open.

### Toggling Completion
1. User clicks the checkbox next to a todo.
2. The todo moves to the **Completed** section (or back to **Active/Pending** if unchecking).
3. The `completed_at` timestamp is set (or cleared) in Singapore timezone.
4. If the todo is recurring and is being completed, a new instance is created (see Feature 03).

### Deleting a Todo
1. User clicks the **delete** (trash) icon on a todo item.
2. The todo is **immediately removed** from the UI (no confirmation dialog).
3. The API call cascades the delete to all associated subtasks and `todo_tags` entries.
4. If the API call fails, the todo reappears in the UI and an error message is shown.

---

## Technical Requirements

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high', 'medium', 'low')),
  due_date TEXT,
  is_completed INTEGER NOT NULL DEFAULT 0,
  is_recurring INTEGER NOT NULL DEFAULT 0,
  recurrence_pattern TEXT DEFAULT '' CHECK(recurrence_pattern IN ('', 'daily', 'weekly', 'monthly', 'yearly')),
  reminder_minutes INTEGER,
  last_notification_sent TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);
CREATE INDEX IF NOT EXISTS idx_todos_is_completed ON todos(is_completed);
CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority);
```

#### Field Reference

| Field | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | INTEGER | No | Auto-increment | Primary key |
| `user_id` | TEXT | No | — | Foreign key to `users.id` |
| `title` | TEXT | No | — | Todo title (trimmed, non-empty) |
| `priority` | TEXT | No | `'medium'` | One of: `'high'`, `'medium'`, `'low'` |
| `due_date` | TEXT | Yes | `NULL` | ISO 8601 string in Singapore timezone |
| `is_completed` | INTEGER | No | `0` | Boolean: `0` = pending, `1` = completed |
| `is_recurring` | INTEGER | No | `0` | Boolean: `0` = one-time, `1` = recurring |
| `recurrence_pattern` | TEXT | No | `''` | One of: `''`, `'daily'`, `'weekly'`, `'monthly'`, `'yearly'` |
| `reminder_minutes` | INTEGER | Yes | `NULL` | Minutes before due date to send reminder |
| `last_notification_sent` | TEXT | Yes | `NULL` | ISO 8601 timestamp of last notification |
| `created_at` | TEXT | No | — | ISO 8601 creation timestamp (Singapore TZ) |
| `completed_at` | TEXT | Yes | `NULL` | ISO 8601 completion timestamp (Singapore TZ) |

### Type Definitions

Add these to `lib/db.ts`:

```typescript
// Priority type
export type Priority = 'high' | 'medium' | 'low';

// Recurrence pattern type
export type RecurrencePattern = '' | 'daily' | 'weekly' | 'monthly' | 'yearly';

// Todo interface (matches database row)
export interface Todo {
  id: number;
  user_id: string;
  title: string;
  priority: Priority;
  due_date: string | null;
  is_completed: number;        // 0 or 1 (SQLite boolean)
  is_recurring: number;         // 0 or 1
  recurrence_pattern: RecurrencePattern;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
  completed_at: string | null;
}

// Request body for creating a todo
export interface CreateTodoRequest {
  title: string;
  priority?: Priority;
  due_date?: string | null;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern;
  reminder_minutes?: number | null;
}

// Request body for updating a todo
export interface UpdateTodoRequest {
  title?: string;
  priority?: Priority;
  due_date?: string | null;
  is_completed?: boolean;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern;
  reminder_minutes?: number | null;
}
```

### Database CRUD Operations

Add to `lib/db.ts` as part of a `todoDB` export:

```typescript
export const todoDB = {
  // Create a new todo
  create(userId: string, data: CreateTodoRequest): Todo {
    const now = getSingaporeNow().toISOString();
    const stmt = db.prepare(`
      INSERT INTO todos (user_id, title, priority, due_date, is_completed, is_recurring, recurrence_pattern, reminder_minutes, created_at)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      userId,
      data.title.trim(),
      data.priority ?? 'medium',
      data.due_date ?? null,
      data.is_recurring ? 1 : 0,
      data.recurrence_pattern ?? '',
      data.reminder_minutes ?? null,
      now
    );
    return todoDB.getById(result.lastInsertRowid as number, userId)!;
  },

  // Get all todos for a user
  getAllByUser(userId: string): Todo[] {
    const stmt = db.prepare(`
      SELECT * FROM todos WHERE user_id = ? ORDER BY
        CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
        CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
        due_date ASC,
        created_at DESC
    `);
    return stmt.all(userId) as Todo[];
  },

  // Get a single todo by ID (scoped to user)
  getById(id: number, userId: string): Todo | undefined {
    const stmt = db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?');
    return stmt.get(id, userId) as Todo | undefined;
  },

  // Update a todo
  update(id: number, userId: string, data: UpdateTodoRequest): Todo | undefined {
    const existing = todoDB.getById(id, userId);
    if (!existing) return undefined;

    const completedAt = data.is_completed !== undefined
      ? (data.is_completed ? getSingaporeNow().toISOString() : null)
      : existing.completed_at;

    const stmt = db.prepare(`
      UPDATE todos SET
        title = ?,
        priority = ?,
        due_date = ?,
        is_completed = ?,
        is_recurring = ?,
        recurrence_pattern = ?,
        reminder_minutes = ?,
        completed_at = ?
      WHERE id = ? AND user_id = ?
    `);
    stmt.run(
      (data.title ?? existing.title).trim(),
      data.priority ?? existing.priority,
      data.due_date !== undefined ? data.due_date : existing.due_date,
      data.is_completed !== undefined ? (data.is_completed ? 1 : 0) : existing.is_completed,
      data.is_recurring !== undefined ? (data.is_recurring ? 1 : 0) : existing.is_recurring,
      data.recurrence_pattern ?? existing.recurrence_pattern,
      data.reminder_minutes !== undefined ? data.reminder_minutes : existing.reminder_minutes,
      completedAt,
      id,
      userId
    );
    return todoDB.getById(id, userId);
  },

  // Delete a todo (CASCADE handled by foreign keys for subtasks, manual cleanup for todo_tags)
  delete(id: number, userId: string): boolean {
    // Delete tag associations first (todo_tags)
    const deleteTagsStmt = db.prepare('DELETE FROM todo_tags WHERE todo_id = ?');
    deleteTagsStmt.run(id);

    // Delete subtasks (also handled by CASCADE, but explicit for safety)
    const deleteSubtasksStmt = db.prepare('DELETE FROM subtasks WHERE todo_id = ?');
    deleteSubtasksStmt.run(id);

    // Delete the todo itself
    const stmt = db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?');
    const result = stmt.run(id, userId);
    return result.changes > 0;
  }
};
```

### API Endpoints

#### 1. `POST /api/todos` — Create a Todo

**File**: `app/api/todos/route.ts`

**Request**:
```json
{
  "title": "Buy groceries",
  "priority": "high",
  "due_date": "2026-05-23T14:00:00.000Z",
  "is_recurring": false,
  "recurrence_pattern": "",
  "reminder_minutes": null
}
```

**Response (201 Created)**:
```json
{
  "id": 1,
  "user_id": "user_abc123",
  "title": "Buy groceries",
  "priority": "high",
  "due_date": "2026-05-23T14:00:00.000Z",
  "is_completed": 0,
  "is_recurring": 0,
  "recurrence_pattern": "",
  "reminder_minutes": null,
  "last_notification_sent": null,
  "created_at": "2026-05-22T15:18:30.000Z",
  "completed_at": null
}
```

**Error Responses**:
```json
// 401 Unauthorized
{ "error": "Not authenticated" }

// 400 Bad Request — empty title
{ "error": "Title is required" }

// 400 Bad Request — past due date
{ "error": "Due date must be at least 1 minute in the future" }
```

**Implementation**:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, type CreateTodoRequest } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body: CreateTodoRequest = await request.json();

  // Validate title
  const title = (body.title ?? '').trim();
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  // Validate due date (must be at least 1 minute in the future)
  if (body.due_date) {
    const dueDate = new Date(body.due_date);
    const now = getSingaporeNow();
    const oneMinuteFromNow = new Date(now.getTime() + 60 * 1000);
    if (dueDate < oneMinuteFromNow) {
      return NextResponse.json(
        { error: 'Due date must be at least 1 minute in the future' },
        { status: 400 }
      );
    }
  }

  // Validate recurring requires due date
  if (body.is_recurring && !body.due_date) {
    return NextResponse.json(
      { error: 'Recurring todos require a due date' },
      { status: 400 }
    );
  }

  const todo = todoDB.create(session.userId, { ...body, title });
  return NextResponse.json(todo, { status: 201 });
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const todos = todoDB.getAllByUser(session.userId);
  return NextResponse.json(todos);
}
```

---

#### 2. `GET /api/todos` — Get All Todos

**File**: `app/api/todos/route.ts` (same file as POST)

**Response (200 OK)**:
```json
[
  {
    "id": 1,
    "user_id": "user_abc123",
    "title": "Buy groceries",
    "priority": "high",
    "due_date": "2026-05-23T14:00:00.000Z",
    "is_completed": 0,
    "is_recurring": 0,
    "recurrence_pattern": "",
    "reminder_minutes": null,
    "last_notification_sent": null,
    "created_at": "2026-05-22T15:18:30.000Z",
    "completed_at": null
  },
  {
    "id": 2,
    "user_id": "user_abc123",
    "title": "Finish report",
    "priority": "medium",
    "due_date": null,
    "is_completed": 1,
    "is_recurring": 0,
    "recurrence_pattern": "",
    "reminder_minutes": null,
    "last_notification_sent": null,
    "created_at": "2026-05-21T10:00:00.000Z",
    "completed_at": "2026-05-22T12:30:00.000Z"
  }
]
```

**Error Response**:
```json
// 401 Unauthorized
{ "error": "Not authenticated" }
```

---

#### 3. `GET /api/todos/[id]` — Get Single Todo

**File**: `app/api/todos/[id]/route.ts`

**Response (200 OK)**:
```json
{
  "id": 1,
  "user_id": "user_abc123",
  "title": "Buy groceries",
  "priority": "high",
  "due_date": "2026-05-23T14:00:00.000Z",
  "is_completed": 0,
  "is_recurring": 0,
  "recurrence_pattern": "",
  "reminder_minutes": null,
  "last_notification_sent": null,
  "created_at": "2026-05-22T15:18:30.000Z",
  "completed_at": null
}
```

**Error Responses**:
```json
// 401 Unauthorized
{ "error": "Not authenticated" }

// 404 Not Found
{ "error": "Todo not found" }
```

**Implementation**:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params; // params is async in Next.js 16
  const todo = todoDB.getById(parseInt(id), session.userId);

  if (!todo) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  return NextResponse.json(todo);
}
```

---

#### 4. `PUT /api/todos/[id]` — Update a Todo

**File**: `app/api/todos/[id]/route.ts`

**Request** (partial update — any subset of fields):
```json
{
  "title": "Buy groceries and cook dinner",
  "priority": "medium",
  "due_date": "2026-05-24T18:00:00.000Z"
}
```

**Toggle completion only**:
```json
{
  "is_completed": true
}
```

**Response (200 OK)**:
```json
{
  "id": 1,
  "user_id": "user_abc123",
  "title": "Buy groceries and cook dinner",
  "priority": "medium",
  "due_date": "2026-05-24T18:00:00.000Z",
  "is_completed": 0,
  "is_recurring": 0,
  "recurrence_pattern": "",
  "reminder_minutes": null,
  "last_notification_sent": null,
  "created_at": "2026-05-22T15:18:30.000Z",
  "completed_at": null
}
```

**Error Responses**:
```json
// 401 Unauthorized
{ "error": "Not authenticated" }

// 404 Not Found
{ "error": "Todo not found" }

// 400 Bad Request — empty title
{ "error": "Title cannot be empty" }

// 400 Bad Request — past due date
{ "error": "Due date must be at least 1 minute in the future" }
```

**Implementation** (including recurring todo handling):
```typescript
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const body: UpdateTodoRequest = await request.json();

  // Validate title if provided
  if (body.title !== undefined) {
    const trimmedTitle = body.title.trim();
    if (!trimmedTitle) {
      return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
    }
    body.title = trimmedTitle;
  }

  // Validate due date if provided (must be at least 1 minute in the future)
  if (body.due_date) {
    const dueDate = new Date(body.due_date);
    const now = getSingaporeNow();
    const oneMinuteFromNow = new Date(now.getTime() + 60 * 1000);
    if (dueDate < oneMinuteFromNow) {
      return NextResponse.json(
        { error: 'Due date must be at least 1 minute in the future' },
        { status: 400 }
      );
    }
  }

  const todoId = parseInt(id);
  const existingTodo = todoDB.getById(todoId, session.userId);
  if (!existingTodo) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  // Handle recurring todo completion: create next instance
  if (body.is_completed && existingTodo.is_recurring && existingTodo.recurrence_pattern) {
    // Create next instance with inherited properties
    const nextDueDate = calculateNextDueDate(
      existingTodo.due_date!,
      existingTodo.recurrence_pattern
    );

    todoDB.create(session.userId, {
      title: existingTodo.title,
      priority: existingTodo.priority,
      due_date: nextDueDate,
      is_recurring: true,
      recurrence_pattern: existingTodo.recurrence_pattern,
      reminder_minutes: existingTodo.reminder_minutes,
    });
    // Also copy tags from existing todo to new todo (handled separately)
  }

  const updatedTodo = todoDB.update(todoId, session.userId, body);
  return NextResponse.json(updatedTodo);
}
```

---

#### 5. `DELETE /api/todos/[id]` — Delete a Todo

**File**: `app/api/todos/[id]/route.ts`

**Response (200 OK)**:
```json
{ "success": true }
```

**Error Responses**:
```json
// 401 Unauthorized
{ "error": "Not authenticated" }

// 404 Not Found
{ "error": "Todo not found" }
```

**Implementation**:
```typescript
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const deleted = todoDB.delete(parseInt(id), session.userId);

  if (!deleted) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
```

---

### Business Logic

#### 1. Due Date Validation
- Due date is optional.
- If provided, it **must be at least 1 minute in the future** compared to `getSingaporeNow()`.
- Validation runs on both create and update.
- Date comparison uses UTC milliseconds internally; display uses Singapore timezone.

#### 2. Sorting Algorithm
Todos are sorted using a multi-level comparator:

```typescript
function sortTodos(todos: Todo[]): Todo[] {
  const priorityOrder: Record<Priority, number> = { high: 1, medium: 2, low: 3 };

  return [...todos].sort((a, b) => {
    // 1. Priority: high → medium → low
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;

    // 2. Due date: earliest first, nulls last
    if (a.due_date && b.due_date) {
      const dateDiff = new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      if (dateDiff !== 0) return dateDiff;
    } else if (a.due_date && !b.due_date) {
      return -1; // a has due date, sort before b
    } else if (!a.due_date && b.due_date) {
      return 1;  // b has due date, sort before a
    }

    // 3. Creation date: newest first
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
```

#### 3. Section Classification

```typescript
function classifyTodo(todo: Todo, now: Date): 'overdue' | 'active' | 'completed' {
  if (todo.is_completed) return 'completed';
  if (todo.due_date && new Date(todo.due_date) < now) return 'overdue';
  return 'active';
}
```

#### 4. Smart Time Display
Format the due date indicator with color-coded urgency:

```typescript
function getDueDateDisplay(dueDate: string, now: Date): { text: string; color: string } {
  const due = new Date(dueDate);
  const diffMs = due.getTime() - now.getTime();
  const diffMinutes = diffMs / (1000 * 60);
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffMs < 0) {
    return { text: 'Overdue', color: 'text-red-600 bg-red-50' };          // Past due
  } else if (diffHours < 1) {
    return { text: `${Math.round(diffMinutes)}m left`, color: 'text-red-600 bg-red-50' };   // <1 hour: red
  } else if (diffHours < 24) {
    return { text: `${Math.round(diffHours)}h left`, color: 'text-orange-600 bg-orange-50' }; // <24 hours: orange
  } else if (diffDays < 7) {
    return { text: `${Math.round(diffDays)}d left`, color: 'text-yellow-600 bg-yellow-50' };  // <7 days: yellow
  } else {
    return { text: `${Math.round(diffDays)}d left`, color: 'text-blue-600 bg-blue-50' };     // 7+ days: blue
  }
}
```

#### 5. Optimistic UI Update Pattern
```typescript
// Example: Creating a todo with optimistic update
async function handleCreateTodo(data: CreateTodoRequest) {
  // 1. Create temporary optimistic todo
  const tempId = Date.now(); // temporary negative-style ID
  const optimisticTodo: Todo = {
    id: tempId,
    user_id: '',
    title: data.title,
    priority: data.priority ?? 'medium',
    due_date: data.due_date ?? null,
    is_completed: 0,
    is_recurring: data.is_recurring ? 1 : 0,
    recurrence_pattern: data.recurrence_pattern ?? '',
    reminder_minutes: data.reminder_minutes ?? null,
    last_notification_sent: null,
    created_at: getSingaporeNow().toISOString(),
    completed_at: null,
  };

  // 2. Add to state immediately
  setTodos(prev => [...prev, optimisticTodo]);

  try {
    // 3. Make API call
    const res = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }

    const savedTodo = await res.json();

    // 4. Replace optimistic todo with real one
    setTodos(prev => prev.map(t => t.id === tempId ? savedTodo : t));
  } catch (error) {
    // 5. Revert on failure
    setTodos(prev => prev.filter(t => t.id !== tempId));
    setError(error instanceof Error ? error.message : 'Failed to create todo');
  }
}
```

---

## UI Components

All UI is implemented within `app/page.tsx` (the monolithic client component).

### Todo Creation Form

```tsx
// Inside app/page.tsx ('use client')
const [newTitle, setNewTitle] = useState('');
const [newPriority, setNewPriority] = useState<Priority>('medium');
const [newDueDate, setNewDueDate] = useState('');

// Creation form JSX
<form onSubmit={handleCreateTodo} className="flex flex-col gap-3 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
  <div className="flex gap-2">
    <input
      type="text"
      value={newTitle}
      onChange={e => setNewTitle(e.target.value)}
      placeholder="What needs to be done?"
      className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      required
    />
    <button
      type="submit"
      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700
                 transition-colors font-medium disabled:opacity-50"
      disabled={!newTitle.trim()}
    >
      Add
    </button>
  </div>

  <div className="flex gap-3 items-center">
    {/* Priority Dropdown */}
    <select
      value={newPriority}
      onChange={e => setNewPriority(e.target.value as Priority)}
      className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg
                 bg-white dark:bg-gray-700 text-sm"
    >
      <option value="high">🔴 High</option>
      <option value="medium">🟡 Medium</option>
      <option value="low">🔵 Low</option>
    </select>

    {/* Date-Time Picker */}
    <input
      type="datetime-local"
      value={newDueDate}
      onChange={e => setNewDueDate(e.target.value)}
      className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg
                 bg-white dark:bg-gray-700 text-sm"
    />
  </div>
</form>
```

### Todo Item Display

```tsx
// Single todo item component (inline in page.tsx)
function renderTodoItem(todo: Todo) {
  const now = getSingaporeNow();
  const section = classifyTodo(todo, now);
  const dueDisplay = todo.due_date ? getDueDateDisplay(todo.due_date, now) : null;

  return (
    <div
      key={todo.id}
      className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
        section === 'overdue'
          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          : section === 'completed'
          ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-75'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
      }`}
    >
      {/* Completion Checkbox */}
      <input
        type="checkbox"
        checked={todo.is_completed === 1}
        onChange={() => handleToggleComplete(todo)}
        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />

      {/* Todo Content */}
      <div className="flex-1 min-w-0">
        <span className={`text-sm ${todo.is_completed ? 'line-through text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
          {todo.title}
        </span>

        <div className="flex items-center gap-2 mt-1">
          {/* Priority Badge */}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            todo.priority === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
            todo.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
            'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
          }`}>
            {todo.priority}
          </span>

          {/* Due Date with Smart Color */}
          {dueDisplay && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${dueDisplay.color}`}>
              {dueDisplay.text}
            </span>
          )}

          {/* Overdue Warning Icon */}
          {section === 'overdue' && <span className="text-red-500 text-sm">⚠️</span>}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => openEditModal(todo)}
          className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
          title="Edit"
        >
          ✏️
        </button>
        <button
          onClick={() => handleDeleteTodo(todo.id)}
          className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
          title="Delete"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}
```

### Section Headers

```tsx
// Section rendering
<div className="space-y-6">
  {/* Overdue Section */}
  {overdueTodos.length > 0 && (
    <div>
      <h2 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2 flex items-center gap-1">
        ⚠️ Overdue ({overdueTodos.length})
      </h2>
      <div className="space-y-2">
        {sortTodos(overdueTodos).map(renderTodoItem)}
      </div>
    </div>
  )}

  {/* Active/Pending Section */}
  <div>
    <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
      📋 Active ({activeTodos.length})
    </h2>
    <div className="space-y-2">
      {sortTodos(activeTodos).map(renderTodoItem)}
    </div>
  </div>

  {/* Completed Section */}
  {completedTodos.length > 0 && (
    <div>
      <h2 className="text-sm font-semibold text-green-600 dark:text-green-400 mb-2">
        ✅ Completed ({completedTodos.length})
      </h2>
      <div className="space-y-2">
        {sortTodos(completedTodos).map(renderTodoItem)}
      </div>
    </div>
  )}
</div>
```

### Edit Modal

```tsx
// Edit modal state
const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
const [editTitle, setEditTitle] = useState('');
const [editPriority, setEditPriority] = useState<Priority>('medium');
const [editDueDate, setEditDueDate] = useState('');

function openEditModal(todo: Todo) {
  setEditingTodo(todo);
  setEditTitle(todo.title);
  setEditPriority(todo.priority);
  setEditDueDate(todo.due_date ? formatDateTimeLocal(todo.due_date) : '');
}

// Edit modal JSX
{editingTodo && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Edit Todo</h3>

      <div className="space-y-4">
        <input
          type="text"
          value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                     bg-white dark:bg-gray-700"
          placeholder="Todo title"
        />

        <select
          value={editPriority}
          onChange={e => setEditPriority(e.target.value as Priority)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                     bg-white dark:bg-gray-700"
        >
          <option value="high">🔴 High Priority</option>
          <option value="medium">🟡 Medium Priority</option>
          <option value="low">🔵 Low Priority</option>
        </select>

        <input
          type="datetime-local"
          value={editDueDate}
          onChange={e => setEditDueDate(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                     bg-white dark:bg-gray-700"
        />
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <button
          onClick={() => setEditingTodo(null)}
          className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSaveEdit}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  </div>
)}
```

---

## Edge Cases

1. **Empty title**: User submits form with empty or whitespace-only title. → API returns 400 with `"Title is required"`. UI should disable the Add button when title is empty/whitespace.

2. **Very long title**: Title exceeds reasonable display length (e.g., 1000+ characters). → No hard database limit (SQLite TEXT is unbounded), but UI should truncate display with ellipsis (`text-ellipsis overflow-hidden`). Consider a soft 500-character limit with client-side warning.

3. **Past due date on create**: User selects a date-time that is already in the past. → API returns 400 with `"Due date must be at least 1 minute in the future"`. The 1-minute buffer accounts for form submission latency.

4. **Past due date on edit**: User edits a todo and changes the due date to one in the past. → Same validation as create: must be at least 1 minute in the future. If the user only changes the title without touching the due date, skip due date validation.

5. **Concurrent edits**: Two browser tabs editing the same todo simultaneously. → Last write wins (no locking). The UI reflects the latest state on next fetch. No conflict resolution needed for this app.

6. **Delete non-existent todo**: User tries to delete a todo that was already deleted (e.g., from another tab). → API returns 404. UI should handle gracefully by removing from local state anyway.

7. **Rapid-fire creates**: User clicks "Add" multiple times quickly. → Disable the Add button while a create request is in-flight. Use a `loading` state flag.

8. **Toggling completion on recurring todo**: When a recurring todo is completed, a new instance must be created with the next due date, same priority, tags, reminder, and recurrence pattern. The original is marked completed.

9. **Network failure during optimistic update**: API call fails after UI has already updated. → Revert the optimistic change and show an error toast/message.

10. **SQL injection in title**: User enters SQL-like syntax in the title field. → Prevented by parameterized queries (prepared statements) in `better-sqlite3`. No risk.

11. **XSS in title**: User enters `<script>alert('xss')</script>` as title. → React automatically escapes JSX content. No risk.

12. **Timezone edge case — midnight boundary**: A todo created at 11:59 PM Singapore time with a due date of 12:01 AM should show as "Active" with 2 minutes remaining, not as the next day. → All comparisons use UTC timestamps internally; display formatting uses `formatSingaporeDate()`.

13. **Empty todo list**: No todos exist for the user. → Show a friendly empty state message: "No todos yet. Create your first one above!"

14. **Integer overflow for todo ID**: SQLite `INTEGER PRIMARY KEY AUTOINCREMENT` supports up to 9,223,372,036,854,775,807. Not a practical concern.

15. **Clearing a due date on edit**: User removes the due date from an existing todo. → Set `due_date` to `null` in the update. Skip due date validation when value is null/empty.

---

## Acceptance Criteria

- [ ] **AC-01**: Can create a todo with only a title (priority defaults to `medium`, no due date).
- [ ] **AC-02**: Can create a todo with title, priority, and due date.
- [ ] **AC-03**: Due date validation rejects dates less than 1 minute in the future with a clear error message.
- [ ] **AC-04**: Todo title is trimmed of whitespace before saving; empty/whitespace-only titles are rejected.
- [ ] **AC-05**: Todos are displayed in three sections: Overdue, Active/Pending, Completed.
- [ ] **AC-06**: Overdue section has a red background and warning icon (⚠️).
- [ ] **AC-07**: Todos are sorted by Priority (high→medium→low) → Due date (earliest→latest, nulls last) → Creation date (newest→oldest).
- [ ] **AC-08**: Clicking the checkbox toggles completion and moves the todo to the correct section.
- [ ] **AC-09**: Completing a todo sets `completed_at` to current Singapore timestamp.
- [ ] **AC-10**: Uncompleting a todo clears `completed_at` to null.
- [ ] **AC-11**: Edit modal opens with all fields pre-filled with current values.
- [ ] **AC-12**: Editing a todo updates it immediately in the UI (optimistic update).
- [ ] **AC-13**: Deleting a todo removes it immediately without a confirmation dialog.
- [ ] **AC-14**: Deleting a todo cascades to associated subtasks and `todo_tags` entries.
- [ ] **AC-15**: All dates use Singapore timezone via `getSingaporeNow()` — never `new Date()`.
- [ ] **AC-16**: Smart time display shows correct color: red (<1h or overdue), orange (<24h), yellow (<7d), blue (7+d).
- [ ] **AC-17**: API returns 401 for unauthenticated requests.
- [ ] **AC-18**: API returns 404 when accessing/updating/deleting a todo that doesn't exist or belongs to another user.
- [ ] **AC-19**: Default priority is `medium` when not specified.
- [ ] **AC-20**: Optimistic UI reverts on API failure and shows an error message.

---

## Testing Requirements

### E2E Tests (Playwright)

**File**: `tests/02-todo-crud.spec.ts`

**Setup**: Each test registers a new user via virtual WebAuthn authenticator (using `tests/helpers.ts`).

```typescript
import { test, expect } from '@playwright/test';
import { TodoAppHelper } from './helpers';

test.describe('Feature 01: Todo CRUD Operations', () => {
  let helper: TodoAppHelper;

  test.beforeEach(async ({ page }) => {
    helper = new TodoAppHelper(page);
    await helper.registerAndLogin();
  });

  test('TC-01: Create a todo with title only', async ({ page }) => {
    // Action: Type title and click Add
    await page.fill('[placeholder="What needs to be done?"]', 'Buy groceries');
    await page.click('button:has-text("Add")');

    // Assert: Todo appears in Active section
    await expect(page.locator('text=Buy groceries')).toBeVisible();
    // Assert: Priority defaults to medium
    await expect(page.locator('text=medium')).toBeVisible();
  });

  test('TC-02: Create a todo with title, priority, and due date', async ({ page }) => {
    await page.fill('[placeholder="What needs to be done?"]', 'Finish report');
    await page.selectOption('select', 'high');

    // Set due date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateValue = tomorrow.toISOString().slice(0, 16);
    await page.fill('input[type="datetime-local"]', dateValue);

    await page.click('button:has-text("Add")');

    await expect(page.locator('text=Finish report')).toBeVisible();
    await expect(page.locator('text=high')).toBeVisible();
  });

  test('TC-03: Reject empty title', async ({ page }) => {
    // The Add button should be disabled when title is empty
    const addButton = page.locator('button:has-text("Add")');
    await expect(addButton).toBeDisabled();

    // Type spaces only
    await page.fill('[placeholder="What needs to be done?"]', '   ');
    await expect(addButton).toBeDisabled();
  });

  test('TC-04: Reject past due date', async ({ page }) => {
    await page.fill('[placeholder="What needs to be done?"]', 'Past task');

    // Set due date to yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateValue = yesterday.toISOString().slice(0, 16);
    await page.fill('input[type="datetime-local"]', dateValue);

    await page.click('button:has-text("Add")');

    // Assert: Error message shown
    await expect(page.locator('text=Due date must be at least 1 minute in the future')).toBeVisible();
  });

  test('TC-05: Toggle todo completion', async ({ page }) => {
    // Create a todo
    await helper.createTodo('Toggle test');

    // Toggle complete
    const checkbox = page.locator('input[type="checkbox"]').first();
    await checkbox.check();

    // Assert: Todo moves to Completed section
    await expect(page.locator('text=Completed')).toBeVisible();
    await expect(page.locator('.line-through:has-text("Toggle test")')).toBeVisible();

    // Toggle incomplete
    await checkbox.uncheck();

    // Assert: Todo moves back to Active section
    await expect(page.locator('.line-through:has-text("Toggle test")')).not.toBeVisible();
  });

  test('TC-06: Edit todo title and priority', async ({ page }) => {
    await helper.createTodo('Original title');

    // Click edit button
    await page.click('button[title="Edit"]');

    // Edit title
    await page.fill('input[placeholder="Todo title"]', 'Updated title');
    await page.selectOption('select', 'high');

    // Save
    await page.click('button:has-text("Save")');

    // Assert: Updated values shown
    await expect(page.locator('text=Updated title')).toBeVisible();
    await expect(page.locator('text=high')).toBeVisible();
    await expect(page.locator('text=Original title')).not.toBeVisible();
  });

  test('TC-07: Delete todo immediately (no confirmation)', async ({ page }) => {
    await helper.createTodo('Delete me');

    // Verify todo exists
    await expect(page.locator('text=Delete me')).toBeVisible();

    // Click delete
    await page.click('button[title="Delete"]');

    // Assert: Todo removed immediately (no dialog)
    await expect(page.locator('text=Delete me')).not.toBeVisible();
  });

  test('TC-08: Overdue todos displayed in red section', async ({ page }) => {
    // Create a todo with a past due date via API (bypass client validation)
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Overdue task',
          priority: 'high',
          // Note: This bypasses validation for testing;
          // in real test, create with future date then wait or mock time
        }),
      });
      return res.json();
    });

    // Reload page
    await page.reload();

    // Assert: Overdue section visible with warning icon
    await expect(page.locator('text=Overdue')).toBeVisible();
    await expect(page.locator('text=⚠️')).toBeVisible();
  });

  test('TC-09: Sorting order — priority, then due date, then creation date', async ({ page }) => {
    // Create todos with different priorities
    await helper.createTodo('Low priority task', { priority: 'low' });
    await helper.createTodo('High priority task', { priority: 'high' });
    await helper.createTodo('Medium priority task', { priority: 'medium' });

    // Assert order: high → medium → low
    const todoTitles = await page.locator('[data-testid="todo-title"]').allTextContents();
    expect(todoTitles[0]).toBe('High priority task');
    expect(todoTitles[1]).toBe('Medium priority task');
    expect(todoTitles[2]).toBe('Low priority task');
  });

  test('TC-10: Multiple todos can be created and listed', async ({ page }) => {
    await helper.createTodo('Todo 1');
    await helper.createTodo('Todo 2');
    await helper.createTodo('Todo 3');

    await expect(page.locator('text=Todo 1')).toBeVisible();
    await expect(page.locator('text=Todo 2')).toBeVisible();
    await expect(page.locator('text=Todo 3')).toBeVisible();
  });

  test('TC-11: Edit modal pre-fills all current values', async ({ page }) => {
    // Create with specific values
    await page.fill('[placeholder="What needs to be done?"]', 'Prefill test');
    await page.selectOption('select', 'high');
    await page.click('button:has-text("Add")');

    // Open edit modal
    await page.click('button[title="Edit"]');

    // Assert pre-filled values
    const titleInput = page.locator('input[placeholder="Todo title"]');
    await expect(titleInput).toHaveValue('Prefill test');

    const prioritySelect = page.locator('select').nth(1); // edit modal select
    await expect(prioritySelect).toHaveValue('high');
  });

  test('TC-12: Smart time display colors', async ({ page }) => {
    // Create todo with due date 30 minutes from now
    // Verify red color class for <1h
    // (Implementation depends on how test helper sets due dates)
  });

  test('TC-13: Empty state message when no todos', async ({ page }) => {
    // Fresh user with no todos
    await expect(page.locator('text=No todos yet')).toBeVisible();
  });

  test('TC-14: Delete cascades to subtasks and tags', async ({ page }) => {
    // Create todo, add subtasks and tags, then delete
    // Verify via API that subtasks and tag associations are gone
    const todo = await helper.createTodo('Cascade test');

    // Add subtask (via Feature 05 helper)
    // Assign tag (via Feature 06 helper)

    // Delete the todo
    await page.click('button[title="Delete"]');
    await expect(page.locator('text=Cascade test')).not.toBeVisible();

    // Verify subtasks removed via API
    const response = await page.evaluate(async (todoId: number) => {
      const res = await fetch(`/api/todos/${todoId}/subtasks`);
      return res.status;
    }, todo.id);
    expect(response).toBe(404);
  });
});
```

### Unit Tests

Test the business logic functions:

```typescript
// tests/unit/todo-sorting.test.ts
import { describe, it, expect } from 'vitest'; // or jest

describe('Todo Sorting', () => {
  it('sorts by priority: high > medium > low', () => {
    const todos = [
      { ...baseTodo, priority: 'low' as Priority },
      { ...baseTodo, priority: 'high' as Priority },
      { ...baseTodo, priority: 'medium' as Priority },
    ];
    const sorted = sortTodos(todos);
    expect(sorted.map(t => t.priority)).toEqual(['high', 'medium', 'low']);
  });

  it('sorts by due date within same priority (earliest first)', () => {
    const todos = [
      { ...baseTodo, priority: 'high' as Priority, due_date: '2026-05-25T00:00:00Z' },
      { ...baseTodo, priority: 'high' as Priority, due_date: '2026-05-23T00:00:00Z' },
    ];
    const sorted = sortTodos(todos);
    expect(sorted[0].due_date).toBe('2026-05-23T00:00:00Z');
  });

  it('places null due dates after dated todos', () => {
    const todos = [
      { ...baseTodo, priority: 'high' as Priority, due_date: null },
      { ...baseTodo, priority: 'high' as Priority, due_date: '2026-05-23T00:00:00Z' },
    ];
    const sorted = sortTodos(todos);
    expect(sorted[0].due_date).toBe('2026-05-23T00:00:00Z');
    expect(sorted[1].due_date).toBeNull();
  });

  it('sorts by creation date (newest first) when priority and due date are equal', () => {
    const todos = [
      { ...baseTodo, priority: 'medium' as Priority, due_date: null, created_at: '2026-05-20T00:00:00Z' },
      { ...baseTodo, priority: 'medium' as Priority, due_date: null, created_at: '2026-05-22T00:00:00Z' },
    ];
    const sorted = sortTodos(todos);
    expect(sorted[0].created_at).toBe('2026-05-22T00:00:00Z');
  });
});

describe('Section Classification', () => {
  it('classifies completed todos as "completed"', () => {
    const todo = { ...baseTodo, is_completed: 1 };
    expect(classifyTodo(todo, new Date())).toBe('completed');
  });

  it('classifies past-due incomplete todos as "overdue"', () => {
    const todo = { ...baseTodo, is_completed: 0, due_date: '2020-01-01T00:00:00Z' };
    expect(classifyTodo(todo, new Date())).toBe('overdue');
  });

  it('classifies future-due incomplete todos as "active"', () => {
    const todo = { ...baseTodo, is_completed: 0, due_date: '2099-01-01T00:00:00Z' };
    expect(classifyTodo(todo, new Date())).toBe('active');
  });

  it('classifies no-due-date incomplete todos as "active"', () => {
    const todo = { ...baseTodo, is_completed: 0, due_date: null };
    expect(classifyTodo(todo, new Date())).toBe('active');
  });
});

describe('Due Date Display', () => {
  it('returns red "Overdue" for past dates', () => {
    const result = getDueDateDisplay('2020-01-01T00:00:00Z', new Date());
    expect(result.text).toBe('Overdue');
    expect(result.color).toContain('red');
  });

  it('returns red for less than 1 hour remaining', () => {
    const now = new Date();
    const thirtyMinutesLater = new Date(now.getTime() + 30 * 60 * 1000);
    const result = getDueDateDisplay(thirtyMinutesLater.toISOString(), now);
    expect(result.color).toContain('red');
  });

  it('returns orange for less than 24 hours remaining', () => {
    const now = new Date();
    const twelveHoursLater = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const result = getDueDateDisplay(twelveHoursLater.toISOString(), now);
    expect(result.color).toContain('orange');
  });

  it('returns yellow for less than 7 days remaining', () => {
    const now = new Date();
    const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const result = getDueDateDisplay(threeDaysLater.toISOString(), now);
    expect(result.color).toContain('yellow');
  });

  it('returns blue for 7+ days remaining', () => {
    const now = new Date();
    const tenDaysLater = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
    const result = getDueDateDisplay(tenDaysLater.toISOString(), now);
    expect(result.color).toContain('blue');
  });
});
```

---

## Out of Scope

The following features are **not** part of this PRP and are covered in separate PRP files:

- **Subtasks and progress tracking** → PRP 05
- **Tag creation, assignment, and filtering** → PRP 06
- **Recurring todo patterns and next-instance creation** → PRP 03 (referenced but detail in PRP 03)
- **Reminder notifications** → PRP 04
- **Template save/use** → PRP 07
- **Search and multi-criteria filtering** → PRP 08
- **Export/Import** → PRP 09
- **Calendar view** → PRP 10
- **WebAuthn authentication flow** → PRP 11 (assumed implemented; this PRP requires authenticated session)
- **Drag-and-drop reordering**
- **Bulk operations (select multiple, delete all completed)**
- **Undo/redo functionality**
- **Rich text or markdown in todo titles**
- **File attachments**
- **Collaborative/shared todos**

---

## Success Metrics

| Metric | Target | Measurement |
|---|---|---|
| **Create-to-display latency** | < 300ms | Time from clicking Add to todo appearing in list |
| **Toggle completion latency** | < 200ms | Time from checkbox click to section move |
| **Delete latency** | < 200ms | Time from delete click to removal from list |
| **API response time (create)** | < 150ms | Server-side processing time |
| **API response time (list all)** | < 200ms | For up to 500 todos |
| **Empty title rejection** | 100% | No empty/whitespace todos in database |
| **Past due date rejection** | 100% | No newly created/edited todos with past due dates |
| **Cascade delete correctness** | 100% | No orphaned subtasks or todo_tags after delete |
| **E2E test pass rate** | 100% | All Playwright tests pass on 3 consecutive runs |
| **Singapore timezone compliance** | 100% | All timestamps use `getSingaporeNow()`, zero `new Date()` calls |
