# Feature 05: Subtasks & Progress Tracking

## Feature Overview

Subtasks allow users to break down complex todos into smaller, actionable checklist items with real-time visual progress tracking. Each todo can have unlimited subtasks that are independently completable. A progress bar and text indicator show completion status at a glance — even when the subtask list is collapsed. Subtask titles are included in the global search functionality, and all subtasks are automatically cleaned up when the parent todo is deleted (CASCADE).

---

## User Stories

1. **As a user**, I want to break down complex todos into smaller subtasks, so that I can manage multi-step tasks more effectively.
2. **As a user**, I want to see a visual progress bar showing how many subtasks I've completed, so that I can quickly gauge my progress.
3. **As a user**, I want to add and remove subtasks freely, so that I can adjust my task breakdown as requirements change.
4. **As a user**, I want subtasks automatically cleaned up when I delete the parent todo, so that I don't have orphaned data.
5. **As a user**, I want subtask titles included in search results, so that I can find todos by searching for subtask content.
6. **As a user**, I want the progress bar visible even when subtasks are collapsed, so that I can track progress without expanding every todo.

---

## User Flow

### Adding Subtasks
1. User creates or views an existing todo in the todo list.
2. User clicks the **"▶ Subtasks"** button on the todo card to expand the subtask section.
3. The button label changes to **"▼ Subtasks"** and the subtask panel slides open.
4. User types a subtask title into the input field (e.g., "Research competitors").
5. User presses **Enter** or clicks the **"Add"** button.
6. The subtask appears in the list below the input with an unchecked checkbox and a **✕** delete button.
7. The progress bar and text indicator appear/update (e.g., "0/1 subtasks").
8. User repeats steps 4–7 to add more subtasks.

### Completing Subtasks
1. User clicks the checkbox next to a subtask.
2. The subtask is marked as completed (checkbox checked, optional strikethrough styling).
3. The progress bar animates to reflect the new percentage.
4. The text indicator updates (e.g., "1/3 subtasks").
5. When all subtasks are completed, the progress bar turns green and shows 100%.

### Removing Subtasks
1. User clicks the **✕** button on a subtask.
2. The subtask is removed from the list.
3. The progress bar and text indicator update accordingly.

### Collapsing Subtasks
1. User clicks the **"▼ Subtasks"** button to collapse the panel.
2. The subtask list and input field are hidden.
3. The progress bar and text indicator remain visible below the todo title.

### Deleting Parent Todo
1. User deletes a todo that has subtasks.
2. All associated subtasks are automatically deleted (CASCADE).
3. No orphaned subtask records remain in the database.

---

## Technical Requirements

### Database Schema

Add the `subtasks` table to `lib/db.ts` in the `db.exec()` initialization block:

```sql
CREATE TABLE IF NOT EXISTS subtasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  is_completed INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
);
```

> [!IMPORTANT]
> The `ON DELETE CASCADE` foreign key ensures all subtasks are automatically deleted when the parent todo is deleted. SQLite requires `PRAGMA foreign_keys = ON;` to enforce foreign key constraints — ensure this is set in `lib/db.ts` during database initialization:
> ```typescript
> db.pragma('foreign_keys = ON');
> ```

**Index for query performance:**

```sql
CREATE INDEX IF NOT EXISTS idx_subtasks_todo_id ON subtasks(todo_id);
```

### Type Definitions

Add to `lib/db.ts`:

```typescript
// Subtask interface
export interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  is_completed: number; // 0 = false, 1 = true (SQLite boolean)
  position: number;
}

// Extended Todo interface (already exists — ensure subtasks field is included)
export interface TodoWithSubtasks extends Todo {
  subtasks: Subtask[];
}
```

### Database CRUD Operations

Add to `lib/db.ts` as part of the `subtaskDB` export object:

```typescript
export const subtaskDB = {
  // Get all subtasks for a todo, ordered by position
  getByTodoId(todoId: number): Subtask[] {
    const stmt = db.prepare('SELECT * FROM subtasks WHERE todo_id = ? ORDER BY position ASC');
    return stmt.all(todoId) as Subtask[];
  },

  // Create a new subtask
  create(todoId: number, title: string): Subtask {
    // Get next position value
    const maxPos = db.prepare(
      'SELECT COALESCE(MAX(position), -1) as max_pos FROM subtasks WHERE todo_id = ?'
    ).get(todoId) as { max_pos: number };
    const position = (maxPos?.max_pos ?? -1) + 1;

    const stmt = db.prepare(
      'INSERT INTO subtasks (todo_id, title, position) VALUES (?, ?, ?)'
    );
    const result = stmt.run(todoId, title.trim(), position);
    return {
      id: result.lastInsertRowid as number,
      todo_id: todoId,
      title: title.trim(),
      is_completed: 0,
      position,
    };
  },

  // Update subtask (title and/or completion status)
  update(id: number, updates: { title?: string; is_completed?: number }): boolean {
    const fields: string[] = [];
    const values: (string | number)[] = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title.trim());
    }
    if (updates.is_completed !== undefined) {
      fields.push('is_completed = ?');
      values.push(updates.is_completed);
    }

    if (fields.length === 0) return false;

    values.push(id);
    const stmt = db.prepare(`UPDATE subtasks SET ${fields.join(', ')} WHERE id = ?`);
    const result = stmt.run(...values);
    return result.changes > 0;
  },

  // Delete a subtask
  delete(id: number): boolean {
    const stmt = db.prepare('DELETE FROM subtasks WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },

  // Delete all subtasks for a todo (used when manually cascading if needed)
  deleteByTodoId(todoId: number): number {
    const stmt = db.prepare('DELETE FROM subtasks WHERE todo_id = ?');
    const result = stmt.run(todoId);
    return result.changes;
  },

  // Get a single subtask by id (for ownership verification)
  getById(id: number): Subtask | undefined {
    const stmt = db.prepare('SELECT * FROM subtasks WHERE id = ?');
    return stmt.get(id) as Subtask | undefined;
  },
};
```

---

### API Endpoints

#### 1. `POST /api/todos/[id]/subtasks` — Create Subtask

**File:** `app/api/todos/[id]/subtasks/route.ts`

**Request:**
```json
{
  "title": "Research competitors"
}
```

**Response (201 Created):**
```json
{
  "id": 1,
  "todo_id": 5,
  "title": "Research competitors",
  "is_completed": 0,
  "position": 0
}
```

**Error Responses:**
| Status | Condition | Response |
|--------|-----------|----------|
| 401 | Not authenticated | `{ "error": "Not authenticated" }` |
| 400 | Missing or empty title | `{ "error": "Subtask title is required" }` |
| 404 | Todo not found or not owned by user | `{ "error": "Todo not found" }` |

**Implementation:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, subtaskDB } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const todoId = parseInt(id, 10);

  // Verify todo exists and belongs to user
  const todo = todoDB.getById(todoId);
  if (!todo || todo.user_id !== session.userId) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  const body = await request.json();
  const title = body.title?.trim();

  if (!title) {
    return NextResponse.json({ error: 'Subtask title is required' }, { status: 400 });
  }

  const subtask = subtaskDB.create(todoId, title);
  return NextResponse.json(subtask, { status: 201 });
}
```

Also add a GET handler to fetch subtasks for a todo:

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const todoId = parseInt(id, 10);

  // Verify todo exists and belongs to user
  const todo = todoDB.getById(todoId);
  if (!todo || todo.user_id !== session.userId) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  const subtasks = subtaskDB.getByTodoId(todoId);
  return NextResponse.json(subtasks);
}
```

---

#### 2. `PUT /api/subtasks/[id]` — Update Subtask

**File:** `app/api/subtasks/[id]/route.ts`

**Request:**
```json
{
  "title": "Updated subtask title",
  "is_completed": 1
}
```
> Both `title` and `is_completed` are optional — send only the fields being updated.

**Response (200 OK):**
```json
{
  "id": 1,
  "todo_id": 5,
  "title": "Updated subtask title",
  "is_completed": 1,
  "position": 0
}
```

**Error Responses:**
| Status | Condition | Response |
|--------|-----------|----------|
| 401 | Not authenticated | `{ "error": "Not authenticated" }` |
| 400 | Empty title (if title provided) | `{ "error": "Subtask title cannot be empty" }` |
| 400 | Invalid is_completed value | `{ "error": "is_completed must be 0 or 1" }` |
| 404 | Subtask not found or not owned by user | `{ "error": "Subtask not found" }` |

**Implementation:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { subtaskDB, todoDB } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const subtaskId = parseInt(id, 10);

  // Verify subtask exists
  const subtask = subtaskDB.getById(subtaskId);
  if (!subtask) {
    return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
  }

  // Verify the parent todo belongs to the user
  const todo = todoDB.getById(subtask.todo_id);
  if (!todo || todo.user_id !== session.userId) {
    return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
  }

  const body = await request.json();
  const updates: { title?: string; is_completed?: number } = {};

  if (body.title !== undefined) {
    const title = body.title?.trim();
    if (!title) {
      return NextResponse.json({ error: 'Subtask title cannot be empty' }, { status: 400 });
    }
    updates.title = title;
  }

  if (body.is_completed !== undefined) {
    if (body.is_completed !== 0 && body.is_completed !== 1) {
      return NextResponse.json({ error: 'is_completed must be 0 or 1' }, { status: 400 });
    }
    updates.is_completed = body.is_completed;
  }

  subtaskDB.update(subtaskId, updates);

  // Return the updated subtask
  const updated = subtaskDB.getById(subtaskId);
  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const subtaskId = parseInt(id, 10);

  // Verify subtask exists
  const subtask = subtaskDB.getById(subtaskId);
  if (!subtask) {
    return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
  }

  // Verify the parent todo belongs to the user
  const todo = todoDB.getById(subtask.todo_id);
  if (!todo || todo.user_id !== session.userId) {
    return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
  }

  subtaskDB.delete(subtaskId);
  return NextResponse.json({ success: true });
}
```

---

#### 3. `DELETE /api/subtasks/[id]` — Delete Subtask

Implemented in the same route file as PUT above (`app/api/subtasks/[id]/route.ts`).

**Response (200 OK):**
```json
{
  "success": true
}
```

**Error Responses:**
| Status | Condition | Response |
|--------|-----------|----------|
| 401 | Not authenticated | `{ "error": "Not authenticated" }` |
| 404 | Subtask not found or not owned by user | `{ "error": "Subtask not found" }` |

---

### Business Logic

#### Progress Calculation
```typescript
function calculateProgress(subtasks: Subtask[]): { completed: number; total: number; percentage: number } {
  const total = subtasks.length;
  if (total === 0) return { completed: 0, total: 0, percentage: 0 };
  const completed = subtasks.filter(s => s.is_completed === 1).length;
  const percentage = Math.round((completed / total) * 100);
  return { completed, total, percentage };
}
```

#### Position Assignment
- New subtasks receive `position = MAX(position) + 1` for the parent todo.
- If no subtasks exist, position starts at `0`.
- Subtasks are always returned ordered by `position ASC`.

#### Ownership Verification
- When creating subtasks: verify the parent `todo.user_id === session.userId`.
- When updating/deleting subtasks: look up the subtask, then verify its parent todo belongs to the user.
- This two-step verification prevents unauthorized access to subtasks across users.

#### Search Integration
- Subtask titles must be included in the client-side search functionality.
- When fetching todos for display, subtasks should be included in the response.
- The search filter in `app/page.tsx` should match against both `todo.title` and `subtask.title`:

```typescript
const matchesSearch = (todo: TodoWithSubtasks, searchTerm: string): boolean => {
  const term = searchTerm.toLowerCase();
  if (todo.title.toLowerCase().includes(term)) return true;
  if (todo.subtasks?.some(s => s.title.toLowerCase().includes(term))) return true;
  return false;
};
```

---

## UI Components

All UI for subtasks lives in the main `app/page.tsx` client component, following the project's monolithic UI pattern.

### State Management

Add the following state variables to `app/page.tsx`:

```typescript
// Track which todos have expanded subtask sections
const [expandedSubtasks, setExpandedSubtasks] = useState<Set<number>>(new Set());

// Track subtask input values per todo
const [subtaskInputs, setSubtaskInputs] = useState<Record<number, string>>({});
```

### Subtask Toggle Button

```tsx
<button
  onClick={() => {
    setExpandedSubtasks(prev => {
      const next = new Set(prev);
      if (next.has(todo.id)) {
        next.delete(todo.id);
      } else {
        next.add(todo.id);
      }
      return next;
    });
  }}
  className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
>
  {expandedSubtasks.has(todo.id) ? '▼' : '▶'} Subtasks
  {todo.subtasks && todo.subtasks.length > 0 && (
    <span className="text-xs text-gray-400">({todo.subtasks.length})</span>
  )}
</button>
```

### Progress Bar Component

The progress bar is always visible when a todo has subtasks, even when the subtask list is collapsed:

```tsx
{todo.subtasks && todo.subtasks.length > 0 && (() => {
  const completed = todo.subtasks.filter((s: Subtask) => s.is_completed === 1).length;
  const total = todo.subtasks.length;
  const percentage = Math.round((completed / total) * 100);

  return (
    <div className="mt-2 flex items-center gap-2">
      {/* Progress bar */}
      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            percentage === 100
              ? 'bg-green-500'
              : 'bg-blue-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {/* Text indicator */}
      <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
        {completed}/{total} subtasks
      </span>
    </div>
  );
})()}
```

### Expanded Subtask Panel

Shown when `expandedSubtasks.has(todo.id)` is true:

```tsx
{expandedSubtasks.has(todo.id) && (
  <div className="mt-3 pl-4 border-l-2 border-gray-200 dark:border-gray-600">
    {/* Add subtask input */}
    <div className="flex gap-2 mb-2">
      <input
        type="text"
        value={subtaskInputs[todo.id] || ''}
        onChange={(e) =>
          setSubtaskInputs(prev => ({ ...prev, [todo.id]: e.target.value }))
        }
        onKeyDown={(e) => {
          if (e.key === 'Enter' && subtaskInputs[todo.id]?.trim()) {
            handleAddSubtask(todo.id, subtaskInputs[todo.id].trim());
          }
        }}
        placeholder="Add a subtask..."
        className="flex-1 text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded
                   bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                   focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <button
        onClick={() => {
          if (subtaskInputs[todo.id]?.trim()) {
            handleAddSubtask(todo.id, subtaskInputs[todo.id].trim());
          }
        }}
        className="text-sm px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600
                   disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={!subtaskInputs[todo.id]?.trim()}
      >
        Add
      </button>
    </div>

    {/* Subtask list */}
    {todo.subtasks && todo.subtasks
      .sort((a: Subtask, b: Subtask) => a.position - b.position)
      .map((subtask: Subtask) => (
        <div
          key={subtask.id}
          className="flex items-center gap-2 py-1 group"
        >
          <input
            type="checkbox"
            checked={subtask.is_completed === 1}
            onChange={() => handleToggleSubtask(subtask.id, subtask.is_completed === 1 ? 0 : 1)}
            className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
          />
          <span
            className={`flex-1 text-sm ${
              subtask.is_completed === 1
                ? 'line-through text-gray-400 dark:text-gray-500'
                : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            {subtask.title}
          </span>
          <button
            onClick={() => handleDeleteSubtask(todo.id, subtask.id)}
            className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100
                       transition-opacity text-sm px-1"
            aria-label={`Delete subtask: ${subtask.title}`}
          >
            ✕
          </button>
        </div>
      ))}

    {/* Empty state */}
    {(!todo.subtasks || todo.subtasks.length === 0) && (
      <p className="text-xs text-gray-400 dark:text-gray-500 italic">
        No subtasks yet. Add one above.
      </p>
    )}
  </div>
)}
```

### Handler Functions

Add these handler functions to `app/page.tsx`:

```typescript
// Add a new subtask
const handleAddSubtask = async (todoId: number, title: string) => {
  try {
    const response = await fetch(`/api/todos/${todoId}/subtasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || 'Failed to add subtask');
      return;
    }

    const newSubtask = await response.json();

    // Update local state — add subtask to the todo's subtask list
    setTodos(prev =>
      prev.map(todo =>
        todo.id === todoId
          ? { ...todo, subtasks: [...(todo.subtasks || []), newSubtask] }
          : todo
      )
    );

    // Clear the input
    setSubtaskInputs(prev => ({ ...prev, [todoId]: '' }));
  } catch (error) {
    console.error('Failed to add subtask:', error);
  }
};

// Toggle subtask completion
const handleToggleSubtask = async (subtaskId: number, isCompleted: number) => {
  try {
    const response = await fetch(`/api/subtasks/${subtaskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_completed: isCompleted }),
    });

    if (!response.ok) return;

    const updatedSubtask = await response.json();

    // Update local state
    setTodos(prev =>
      prev.map(todo => ({
        ...todo,
        subtasks: (todo.subtasks || []).map((s: Subtask) =>
          s.id === subtaskId ? updatedSubtask : s
        ),
      }))
    );
  } catch (error) {
    console.error('Failed to toggle subtask:', error);
  }
};

// Delete a subtask
const handleDeleteSubtask = async (todoId: number, subtaskId: number) => {
  try {
    const response = await fetch(`/api/subtasks/${subtaskId}`, {
      method: 'DELETE',
    });

    if (!response.ok) return;

    // Update local state — remove subtask from the todo
    setTodos(prev =>
      prev.map(todo =>
        todo.id === todoId
          ? {
              ...todo,
              subtasks: (todo.subtasks || []).filter((s: Subtask) => s.id !== subtaskId),
            }
          : todo
      )
    );
  } catch (error) {
    console.error('Failed to delete subtask:', error);
  }
};
```

### Including Subtasks in Todo Fetch

When fetching todos from the API (`GET /api/todos`), ensure subtasks are included in the response. In `app/api/todos/route.ts`:

```typescript
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const todos = todoDB.getByUserId(session.userId);

  // Enrich each todo with its subtasks
  const todosWithSubtasks = todos.map(todo => ({
    ...todo,
    subtasks: subtaskDB.getByTodoId(todo.id),
  }));

  return NextResponse.json(todosWithSubtasks);
}
```

---

## Edge Cases

1. **Empty subtask title** — The API must reject subtask creation with an empty or whitespace-only title. Return a `400` error with message `"Subtask title is required"`. The UI Add button should be disabled when the input is empty.

2. **Very long subtask title** — No explicit length limit in the schema (`TEXT` type), but the UI input should visually handle overflow with `text-overflow: ellipsis` or wrapping. Consider a reasonable client-side limit (e.g., 500 characters) for UX.

3. **Very many subtasks** — No limit on the number of subtasks per todo. The UI should handle large lists gracefully. The progress bar calculation remains O(n) which is acceptable. If performance becomes a concern with 100+ subtasks, consider pagination (out of scope for this feature).

4. **Deleting the last subtask** — When the last subtask is deleted, the progress bar and text indicator should disappear (they only render when `subtasks.length > 0`). The subtask section should show the empty state message.

5. **Toggling all subtasks to completed** — The progress bar should turn green at 100%. Subtask completion is independent of the parent todo's completion — completing all subtasks does NOT auto-complete the parent todo.

6. **Toggling all subtasks to incomplete** — The progress bar returns to blue and shows 0%. This is valid behavior.

7. **Parent todo completion vs. subtask completion** — These are independent. A parent todo can be marked complete even with incomplete subtasks, and vice versa. There is no auto-completion logic between them.

8. **Concurrent modifications** — If two browser tabs modify the same todo's subtasks, the last write wins. No real-time sync is implemented (out of scope).

9. **Creating subtask on non-existent todo** — The API returns `404`. The UI should handle this gracefully (e.g., refresh the todo list).

10. **Creating subtask on another user's todo** — The API checks `todo.user_id === session.userId` and returns `404` to prevent information leakage.

11. **Updating/deleting subtask belonging to another user's todo** — Two-step ownership verification (subtask → parent todo → user) prevents unauthorized access.

12. **Subtask ordering** — Subtasks always display in `position ASC` order. New subtasks get the next available position. Drag-and-drop reordering is out of scope.

13. **Deleting parent todo cascades** — Due to `ON DELETE CASCADE`, deleting a todo automatically removes all its subtasks. The UI should update immediately after todo deletion.

14. **Search with subtask titles** — A search for "slides" should return a todo titled "Prepare presentation" if it has a subtask titled "Create slides". The search is case-insensitive.

15. **Progress bar with zero subtasks** — The progress bar is not displayed when a todo has no subtasks. The "▶ Subtasks" button is still visible to allow adding the first subtask.

---

## Acceptance Criteria

### Database
- [ ] `subtasks` table created with `id`, `todo_id`, `title`, `is_completed`, `position` columns
- [ ] `FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE` enforced
- [ ] `PRAGMA foreign_keys = ON` is set in database initialization
- [ ] Index on `todo_id` column exists for query performance

### API
- [ ] `POST /api/todos/[id]/subtasks` creates a subtask and returns the created record with status `201`
- [ ] `GET /api/todos/[id]/subtasks` returns all subtasks for a todo ordered by position
- [ ] `PUT /api/subtasks/[id]` updates subtask title and/or `is_completed` field
- [ ] `DELETE /api/subtasks/[id]` removes the subtask and returns `{ success: true }`
- [ ] All endpoints return `401` for unauthenticated requests
- [ ] All endpoints return `404` when the todo/subtask doesn't belong to the current user
- [ ] `POST` returns `400` when title is empty or whitespace-only
- [ ] `PUT` returns `400` when provided title is empty or `is_completed` is not 0 or 1

### UI - Subtask Toggle
- [ ] Each todo displays a "▶ Subtasks" button
- [ ] Clicking the button expands the subtask panel and changes icon to "▼"
- [ ] Clicking again collapses the panel back to "▶"
- [ ] Subtask count is shown next to the toggle button (e.g., "(3)")

### UI - Add Subtask
- [ ] Expanded panel shows an input field with "Add a subtask..." placeholder
- [ ] "Add" button is disabled when input is empty
- [ ] Pressing Enter in the input field adds the subtask
- [ ] Clicking "Add" button adds the subtask
- [ ] Input clears after successful addition
- [ ] New subtask appears immediately in the list (optimistic or fast update)

### UI - Subtask List
- [ ] Each subtask shows a checkbox, title text, and delete (✕) button
- [ ] Clicking the checkbox toggles completion status
- [ ] Completed subtasks show strikethrough text styling
- [ ] Delete button (✕) appears on hover for each subtask
- [ ] Clicking ✕ removes the subtask from the list
- [ ] Subtasks are displayed in position order

### UI - Progress Bar
- [ ] Progress bar appears when a todo has one or more subtasks
- [ ] Progress bar is visible even when the subtask panel is collapsed
- [ ] Bar shows blue color for 0–99% completion
- [ ] Bar shows green color at 100% completion
- [ ] Bar width animates smoothly on changes (CSS `transition-all duration-300`)
- [ ] Text shows "X/Y subtasks" format (e.g., "3/7 subtasks")
- [ ] Progress updates immediately when a subtask is toggled or deleted

### Business Logic
- [ ] Progress = `Math.round((completed / total) * 100)`
- [ ] Subtask completion is independent of parent todo completion
- [ ] Deleting a parent todo cascades to delete all its subtasks
- [ ] Subtask titles are included in the search/filter functionality
- [ ] New subtask position = MAX(position) + 1 for the parent todo
- [ ] Ownership verification: users can only access their own subtasks

---

## Testing Requirements

### E2E Tests (Playwright)

**File:** `tests/05-subtasks-progress.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { TodoHelper } from './helpers';

test.describe('Feature 05: Subtasks & Progress Tracking', () => {
  let helper: TodoHelper;

  test.beforeEach(async ({ page }) => {
    helper = new TodoHelper(page);
    await helper.registerAndLogin('subtask-test-user');
  });

  test('should expand and collapse subtask section', async ({ page }) => {
    // Create a todo
    await helper.createTodo('Project Alpha');

    // Click "▶ Subtasks" to expand
    await page.click('button:has-text("Subtasks")');

    // Verify subtask input is visible
    await expect(page.locator('input[placeholder="Add a subtask..."]')).toBeVisible();

    // Click again to collapse
    await page.click('button:has-text("Subtasks")');

    // Verify subtask input is hidden
    await expect(page.locator('input[placeholder="Add a subtask..."]')).not.toBeVisible();
  });

  test('should add multiple subtasks', async ({ page }) => {
    await helper.createTodo('Prepare presentation');

    // Expand subtask section
    await page.click('button:has-text("Subtasks")');

    // Add first subtask
    await page.fill('input[placeholder="Add a subtask..."]', 'Create slides');
    await page.click('button:has-text("Add")');

    // Add second subtask
    await page.fill('input[placeholder="Add a subtask..."]', 'Rehearse speech');
    await page.click('button:has-text("Add")');

    // Add third subtask via Enter key
    await page.fill('input[placeholder="Add a subtask..."]', 'Print handouts');
    await page.press('input[placeholder="Add a subtask..."]', 'Enter');

    // Verify all subtasks are displayed
    await expect(page.locator('text=Create slides')).toBeVisible();
    await expect(page.locator('text=Rehearse speech')).toBeVisible();
    await expect(page.locator('text=Print handouts')).toBeVisible();

    // Verify progress shows 0/3
    await expect(page.locator('text=0/3 subtasks')).toBeVisible();
  });

  test('should toggle subtask completion and update progress', async ({ page }) => {
    await helper.createTodo('Weekly review');
    await page.click('button:has-text("Subtasks")');

    // Add two subtasks
    await helper.addSubtask('Review metrics');
    await helper.addSubtask('Write summary');

    // Verify 0/2
    await expect(page.locator('text=0/2 subtasks')).toBeVisible();

    // Complete first subtask
    const firstCheckbox = page.locator('input[type="checkbox"]').nth(1); // nth(0) is the todo checkbox
    await firstCheckbox.check();

    // Verify 1/2
    await expect(page.locator('text=1/2 subtasks')).toBeVisible();

    // Complete second subtask
    const secondCheckbox = page.locator('input[type="checkbox"]').nth(2);
    await secondCheckbox.check();

    // Verify 2/2 and green progress bar
    await expect(page.locator('text=2/2 subtasks')).toBeVisible();
  });

  test('should delete a subtask and update progress', async ({ page }) => {
    await helper.createTodo('Shopping list');
    await page.click('button:has-text("Subtasks")');

    // Add subtasks
    await helper.addSubtask('Milk');
    await helper.addSubtask('Bread');
    await helper.addSubtask('Eggs');

    // Verify 0/3
    await expect(page.locator('text=0/3 subtasks')).toBeVisible();

    // Delete one subtask (click the ✕ button)
    const deleteButton = page.locator('button:has-text("✕")').first();
    await deleteButton.click();

    // Verify 0/2
    await expect(page.locator('text=0/2 subtasks')).toBeVisible();
  });

  test('should show progress bar even when collapsed', async ({ page }) => {
    await helper.createTodo('Multi-step task');
    await page.click('button:has-text("Subtasks")');

    // Add subtasks
    await helper.addSubtask('Step 1');
    await helper.addSubtask('Step 2');

    // Collapse subtask section
    await page.click('button:has-text("Subtasks")');

    // Verify progress bar is still visible
    await expect(page.locator('text=0/2 subtasks')).toBeVisible();
  });

  test('should cascade delete subtasks when parent todo is deleted', async ({ page }) => {
    await helper.createTodo('Temporary task');
    await page.click('button:has-text("Subtasks")');

    // Add subtasks
    await helper.addSubtask('Sub-item 1');
    await helper.addSubtask('Sub-item 2');

    // Delete the parent todo
    await page.click('button:has-text("Delete")');

    // Verify todo and subtasks are gone
    await expect(page.locator('text=Temporary task')).not.toBeVisible();
    await expect(page.locator('text=Sub-item 1')).not.toBeVisible();
    await expect(page.locator('text=Sub-item 2')).not.toBeVisible();
  });

  test('should not add subtask with empty title', async ({ page }) => {
    await helper.createTodo('Test todo');
    await page.click('button:has-text("Subtasks")');

    // Verify Add button is disabled with empty input
    const addButton = page.locator('button:has-text("Add")');
    await expect(addButton).toBeDisabled();

    // Type whitespace only
    await page.fill('input[placeholder="Add a subtask..."]', '   ');
    await expect(addButton).toBeDisabled();
  });

  test('should include subtask titles in search results', async ({ page }) => {
    // Create a todo with subtasks
    await helper.createTodo('Project Alpha');
    await page.click('button:has-text("Subtasks")');
    await helper.addSubtask('Design mockups');
    await helper.addSubtask('Code review');

    // Create another todo without subtasks
    await helper.createTodo('Unrelated task');

    // Search for subtask title
    await page.fill('input[placeholder*="Search"]', 'mockups');

    // Verify only the todo with matching subtask is visible
    await expect(page.locator('text=Project Alpha')).toBeVisible();
    await expect(page.locator('text=Unrelated task')).not.toBeVisible();
  });

  test('should handle deleting the last subtask', async ({ page }) => {
    await helper.createTodo('Single subtask todo');
    await page.click('button:has-text("Subtasks")');

    // Add one subtask
    await helper.addSubtask('Only item');

    // Verify progress bar visible
    await expect(page.locator('text=0/1 subtasks')).toBeVisible();

    // Delete the subtask
    await page.click('button:has-text("✕")');

    // Verify progress bar disappears
    await expect(page.locator('text=subtasks')).not.toBeVisible();

    // Verify empty state message
    await expect(page.locator('text=No subtasks yet')).toBeVisible();
  });

  test('should show green progress bar at 100%', async ({ page }) => {
    await helper.createTodo('Complete everything');
    await page.click('button:has-text("Subtasks")');

    // Add and complete all subtasks
    await helper.addSubtask('Task A');
    await helper.addSubtask('Task B');

    // Complete both subtasks
    const checkboxes = page.locator('input[type="checkbox"]');
    // Skip the first checkbox (parent todo), toggle subtask checkboxes
    await checkboxes.nth(1).check();
    await checkboxes.nth(2).check();

    // Verify green progress bar (100%)
    const progressBar = page.locator('.bg-green-500');
    await expect(progressBar).toBeVisible();
    await expect(page.locator('text=2/2 subtasks')).toBeVisible();
  });
});
```

### Test Helpers

Add to `tests/helpers.ts`:

```typescript
async addSubtask(title: string) {
  await this.page.fill('input[placeholder="Add a subtask..."]', title);
  await this.page.click('button:has-text("Add")');
  // Wait for subtask to appear
  await expect(this.page.locator(`text=${title}`)).toBeVisible();
}
```

### Unit Tests

Business logic unit tests (can be in a separate test file or within the Playwright specs using API calls):

| Test | Description | Expected Result |
|------|-------------|-----------------|
| Progress: 0 subtasks | `calculateProgress([])` | `{ completed: 0, total: 0, percentage: 0 }` |
| Progress: none completed | 3 subtasks, 0 completed | `{ completed: 0, total: 3, percentage: 0 }` |
| Progress: partial | 2 of 5 completed | `{ completed: 2, total: 5, percentage: 40 }` |
| Progress: all completed | 4 of 4 completed | `{ completed: 4, total: 4, percentage: 100 }` |
| Progress: rounding | 1 of 3 completed | `{ completed: 1, total: 3, percentage: 33 }` (rounded) |
| Position: first subtask | Create subtask on empty todo | `position = 0` |
| Position: subsequent | Create after existing (pos 0, 1) | `position = 2` |
| Cascade: delete todo | Delete todo with 5 subtasks | All 5 subtasks deleted |
| Ownership: wrong user | Access subtask of another user's todo | `404 Not Found` |
| Validation: empty title | POST with `{ title: "" }` | `400 Bad Request` |
| Validation: whitespace title | POST with `{ title: "   " }` | `400 Bad Request` |
| Update: toggle complete | PUT with `{ is_completed: 1 }` | Subtask marked complete |
| Update: toggle incomplete | PUT with `{ is_completed: 0 }` | Subtask marked incomplete |
| Update: invalid is_completed | PUT with `{ is_completed: 2 }` | `400 Bad Request` |

---

## Out of Scope

The following features are explicitly **not included** in this PRP:

- **Drag-and-drop reordering** of subtasks — position is assigned automatically; manual reorder not supported.
- **Subtask editing inline** — subtask titles can be updated via the API, but inline editing UI is not required (can be added as an enhancement).
- **Subtask due dates** — subtasks do not have their own due dates; they inherit urgency from the parent todo.
- **Nested subtasks** — subtasks are one level deep only; no sub-subtasks.
- **Subtask assignment** — subtasks cannot be assigned to different users.
- **Subtask notifications/reminders** — only parent todos have reminders.
- **Auto-complete parent** — completing all subtasks does NOT automatically complete the parent todo.
- **Subtask limit** — no maximum number of subtasks enforced.
- **Bulk subtask operations** — no "complete all" or "delete all" buttons.
- **Real-time sync** — changes in one browser tab are not pushed to other tabs.

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Subtask creation time | < 500ms (API response) | Network tab / Playwright timing |
| Progress bar update | < 100ms (UI re-render) | Visual responsiveness |
| Cascade delete reliability | 100% (no orphaned subtasks) | Database query after todo deletion |
| E2E test pass rate | 100% across 3 consecutive runs | `npx playwright test tests/05-subtasks-progress.spec.ts` |
| Search with subtasks | Returns matching todos in < 200ms | Client-side filter performance |
| API error handling | All edge cases return correct status codes | Playwright API assertions |
| Accessibility | Progress bar has appropriate ARIA attributes | Lighthouse audit |
