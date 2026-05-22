# Feature 09: Export & Import

## Feature Overview

The Export & Import feature enables users to back up their todo data as JSON (with full relational fidelity) or CSV (read-only flat format), and restore previously exported JSON data into their account. During import, all IDs are remapped to avoid collisions, existing tags are reused by name to prevent duplicates, and every relationship (subtasks, tag associations) is faithfully reconstructed. This is the primary mechanism for data portability and disaster recovery in the Todo App.

## User Stories

- **As a user**, I want to export all my todos as a JSON file so that I have a complete backup I can restore later.
- **As a user**, I want to export my todos as a CSV file so that I can open them in a spreadsheet application for analysis and reporting.
- **As a user**, I want to import a previously exported JSON file so that I can restore my data after a reset or transfer it to another device.
- **As a user**, I want tag relationships to be preserved during import so that my organizational structure is maintained.
- **As a user**, I want subtasks and their completion status preserved during import so that I don't lose progress tracking.
- **As a user**, I want clear success or error feedback after importing so that I know whether the operation succeeded and how many todos were created.
- **As a user**, I want to be protected from importing corrupted or malformed files so that my existing data is not affected.

## User Flow

### Export Flow (JSON)
1. User clicks the **"Export JSON"** button (green) in the toolbar area.
2. Client calls `GET /api/todos/export` (default format is JSON).
3. Server queries all todos, subtasks, tags, and tag associations for the authenticated user.
4. Server assembles the export JSON envelope with version, timestamp, todos (with nested subtasks and tag names), and a separate tags array.
5. Server responds with `Content-Disposition: attachment; filename="todos-YYYY-MM-DD.json"` and `Content-Type: application/json`.
6. Browser triggers automatic file download.
7. User receives the file `todos-YYYY-MM-DD.json` in their downloads folder.

### Export Flow (CSV)
1. User clicks the **"Export CSV"** button (dark green) in the toolbar area.
2. Client calls `GET /api/todos/export?format=csv`.
3. Server queries all todos for the authenticated user.
4. Server generates CSV with header row and one row per todo (flat format, no subtasks/tags).
5. Server responds with `Content-Disposition: attachment; filename="todos-YYYY-MM-DD.csv"` and `Content-Type: text/csv`.
6. Browser triggers automatic file download.

### Import Flow
1. User clicks the **"Import"** button (blue) in the toolbar area.
2. A hidden `<input type="file" accept=".json">` is triggered.
3. User selects a `.json` file from their file system.
4. Client reads the file using `FileReader`.
5. Client parses the JSON and sends it via `POST /api/todos/import`.
6. Server validates the JSON structure and required fields.
7. Server resolves tag conflicts (reuse existing tags by name, create missing ones).
8. Server creates todos with new IDs, links subtasks, and establishes tag associations.
9. Server responds with `{ "message": "Successfully imported X todos", "count": X }`.
10. Client displays the success message and refreshes the todo list.
11. If any validation error occurs, server responds with a descriptive error and client displays it to the user.

## Technical Requirements

### Database Schema

This feature does not introduce new tables. It operates on the existing schema:

```sql
-- Existing tables used by Export/Import

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
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS subtasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  is_completed INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3B82F6',
  UNIQUE(user_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS todo_tags (
  todo_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (todo_id, tag_id),
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
```

### Type Definitions

Add or reference these types in `lib/db.ts` (some may already exist):

```typescript
// --- Export Types ---

export interface ExportEnvelope {
  version: string;          // Schema version, currently "1.0"
  exportedAt: string;       // ISO 8601 with Singapore timezone offset (+08:00)
  todos: ExportTodo[];
  tags: ExportTag[];
}

export interface ExportTodo {
  id: number;
  title: string;
  priority: Priority;
  due_date: string | null;
  is_completed: number;     // 0 or 1
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  created_at: string;
  subtasks: ExportSubtask[];
  tags: string[];            // Tag names (not IDs)
}

export interface ExportSubtask {
  title: string;
  is_completed: number;     // 0 or 1
  position: number;
}

export interface ExportTag {
  name: string;
  color: string;            // Hex color, e.g. "#3B82F6"
}

// --- Import Types ---

export interface ImportResult {
  message: string;
  count: number;
}
```

### API Endpoints

#### 1. `GET /api/todos/export`

**File**: `app/api/todos/export/route.ts`

**Description**: Exports all of the authenticated user's todos with full relational data. Supports JSON (default) and CSV formats via query parameter.

**Query Parameters**:
| Parameter | Type   | Default | Description                        |
|-----------|--------|---------|------------------------------------|
| `format`  | string | `json`  | Export format: `json` or `csv`     |

**Authentication**: Required (session cookie)

**JSON Response** (`format=json`):
- **Status**: 200
- **Headers**:
  - `Content-Type: application/json`
  - `Content-Disposition: attachment; filename="todos-YYYY-MM-DD.json"`
- **Body**:
```json
{
  "version": "1.0",
  "exportedAt": "2025-11-02T10:30:00+08:00",
  "todos": [
    {
      "id": 1,
      "title": "Sample Todo",
      "priority": "high",
      "due_date": "2025-11-10T14:00",
      "is_completed": 0,
      "is_recurring": false,
      "recurrence_pattern": null,
      "reminder_minutes": 60,
      "created_at": "2025-11-02T10:30:00",
      "subtasks": [
        {
          "title": "Step 1",
          "is_completed": 0,
          "position": 0
        },
        {
          "title": "Step 2",
          "is_completed": 1,
          "position": 1
        }
      ],
      "tags": ["work", "urgent"]
    }
  ],
  "tags": [
    { "name": "work", "color": "#3B82F6" },
    { "name": "urgent", "color": "#EF4444" }
  ]
}
```

**CSV Response** (`format=csv`):
- **Status**: 200
- **Headers**:
  - `Content-Type: text/csv`
  - `Content-Disposition: attachment; filename="todos-YYYY-MM-DD.csv"`
- **Body**:
```csv
ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder
1,"Sample Todo",false,"2025-11-10T14:00","high",true,"weekly",60
2,"Another Task",true,,"medium",false,,
```

**Error Responses**:
| Status | Body                                          | Condition           |
|--------|-----------------------------------------------|---------------------|
| 401    | `{ "error": "Not authenticated" }`            | No valid session     |
| 400    | `{ "error": "Invalid format. Use json or csv" }` | Invalid format param |

**Implementation**:

```typescript
// app/api/todos/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, subtaskDB, tagDB } from '@/lib/db';
import { getSingaporeNow, formatSingaporeDate } from '@/lib/timezone';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'json';

  if (format !== 'json' && format !== 'csv') {
    return NextResponse.json(
      { error: 'Invalid format. Use json or csv' },
      { status: 400 }
    );
  }

  const todos = todoDB.getAllByUser(session.userId);

  if (format === 'csv') {
    return exportCSV(todos);
  }

  return exportJSON(todos, session.userId);
}

function exportJSON(todos: Todo[], userId: number): NextResponse {
  const now = getSingaporeNow();
  const dateStr = formatSingaporeDate(now, 'yyyy-MM-dd');

  // Gather all user tags for the top-level tags array
  const allTags = tagDB.getAllByUser(userId);

  const exportTodos = todos.map((todo) => {
    // Get subtasks for this todo
    const subtasks = subtaskDB.getAllByTodoId(todo.id);

    // Get tags for this todo
    const todoTags = tagDB.getByTodoId(todo.id);

    return {
      id: todo.id,
      title: todo.title,
      priority: todo.priority ?? 'medium',
      due_date: todo.due_date ?? null,
      is_completed: todo.is_completed ?? 0,
      is_recurring: Boolean(todo.is_recurring),
      recurrence_pattern: todo.recurrence_pattern ?? null,
      reminder_minutes: todo.reminder_minutes ?? null,
      created_at: todo.created_at,
      subtasks: subtasks.map((s) => ({
        title: s.title,
        is_completed: s.is_completed ?? 0,
        position: s.position ?? 0,
      })),
      tags: todoTags.map((t) => t.name),
    };
  });

  const exportData: ExportEnvelope = {
    version: '1.0',
    exportedAt: now.toISOString().replace('Z', '+08:00'),
    todos: exportTodos,
    tags: allTags.map((t) => ({ name: t.name, color: t.color })),
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="todos-${dateStr}.json"`,
    },
  });
}

function exportCSV(todos: Todo[]): NextResponse {
  const now = getSingaporeNow();
  const dateStr = formatSingaporeDate(now, 'yyyy-MM-dd');

  const header = 'ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder';
  const rows = todos.map((todo) => {
    const title = `"${(todo.title || '').replace(/"/g, '""')}"`;
    const completed = Boolean(todo.is_completed);
    const dueDate = todo.due_date ? `"${todo.due_date}"` : '';
    const priority = `"${todo.priority ?? 'medium'}"`;
    const recurring = Boolean(todo.is_recurring);
    const pattern = todo.recurrence_pattern ? `"${todo.recurrence_pattern}"` : '';
    const reminder = todo.reminder_minutes ?? '';

    return `${todo.id},${title},${completed},${dueDate},${priority},${recurring},${pattern},${reminder}`;
  });

  const csvContent = [header, ...rows].join('\n');

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="todos-${dateStr}.csv"`,
    },
  });
}
```

---

#### 2. `POST /api/todos/import`

**File**: `app/api/todos/import/route.ts`

**Description**: Imports todos from a previously exported JSON file. Creates new todos with remapped IDs, resolves tag conflicts by reusing existing tags, and preserves all relationships (subtasks, tag associations).

**Authentication**: Required (session cookie)

**Request**:
- **Content-Type**: `application/json`
- **Body**: The full `ExportEnvelope` JSON object (same structure as export output)

```json
{
  "version": "1.0",
  "exportedAt": "2025-11-02T10:30:00+08:00",
  "todos": [
    {
      "id": 1,
      "title": "Imported Todo",
      "priority": "high",
      "due_date": "2025-11-10T14:00",
      "is_completed": 0,
      "is_recurring": false,
      "recurrence_pattern": null,
      "reminder_minutes": 60,
      "created_at": "2025-11-02T10:30:00",
      "subtasks": [
        { "title": "Step 1", "is_completed": 0, "position": 0 }
      ],
      "tags": ["work", "urgent"]
    }
  ],
  "tags": [
    { "name": "work", "color": "#3B82F6" },
    { "name": "urgent", "color": "#EF4444" }
  ]
}
```

**Success Response**:
- **Status**: 200
- **Body**:
```json
{
  "message": "Successfully imported 5 todos",
  "count": 5
}
```

**Error Responses**:
| Status | Body                                                   | Condition                            |
|--------|--------------------------------------------------------|--------------------------------------|
| 401    | `{ "error": "Not authenticated" }`                     | No valid session                     |
| 400    | `{ "error": "Invalid JSON format" }`                   | Malformed JSON body                  |
| 400    | `{ "error": "Invalid import format: missing todos array" }` | Missing or non-array `todos` field |
| 400    | `{ "error": "Invalid todo at index N: missing title" }` | A todo is missing required `title`  |
| 400    | `{ "error": "No todos to import" }`                    | Empty `todos` array                  |

**Implementation**:

```typescript
// app/api/todos/import/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, subtaskDB, tagDB } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // 1. Parse request body
  let importData: any;
  try {
    importData = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON format' }, { status: 400 });
  }

  // 2. Validate top-level structure
  // Support both envelope format { todos: [...] } and raw array [...]
  let todos: any[];
  let importTags: any[] = [];

  if (Array.isArray(importData)) {
    // Legacy format: raw array of todos
    todos = importData;
  } else if (importData && Array.isArray(importData.todos)) {
    todos = importData.todos;
    importTags = Array.isArray(importData.tags) ? importData.tags : [];
  } else {
    return NextResponse.json(
      { error: 'Invalid import format: missing todos array' },
      { status: 400 }
    );
  }

  // 3. Check non-empty
  if (todos.length === 0) {
    return NextResponse.json({ error: 'No todos to import' }, { status: 400 });
  }

  // 4. Validate each todo has required fields
  for (let i = 0; i < todos.length; i++) {
    const todo = todos[i];
    if (!todo.title || typeof todo.title !== 'string' || todo.title.trim() === '') {
      return NextResponse.json(
        { error: `Invalid todo at index ${i}: missing title` },
        { status: 400 }
      );
    }
  }

  // 5. Resolve tags — build a map of tagName → tagId for the current user
  const tagNameToId: Map<string, number> = new Map();

  // 5a. Process tags from the envelope's top-level tags array (create if missing)
  for (const importTag of importTags) {
    if (!importTag.name || typeof importTag.name !== 'string') continue;
    const tagName = importTag.name.trim().toLowerCase();
    if (tagNameToId.has(tagName)) continue;

    // Check if user already has this tag
    const existingTag = tagDB.getByNameAndUser(tagName, session.userId);
    if (existingTag) {
      tagNameToId.set(tagName, existingTag.id);
    } else {
      // Create new tag with the imported color
      const newTag = tagDB.create({
        user_id: session.userId,
        name: tagName,
        color: importTag.color || '#3B82F6',
      });
      tagNameToId.set(tagName, newTag.id);
    }
  }

  // 5b. Also handle any tag names referenced in todos but not in top-level tags array
  for (const todo of todos) {
    if (Array.isArray(todo.tags)) {
      for (const tagName of todo.tags) {
        const normalizedName = String(tagName).trim().toLowerCase();
        if (tagNameToId.has(normalizedName)) continue;

        const existingTag = tagDB.getByNameAndUser(normalizedName, session.userId);
        if (existingTag) {
          tagNameToId.set(normalizedName, existingTag.id);
        } else {
          const newTag = tagDB.create({
            user_id: session.userId,
            name: normalizedName,
            color: '#3B82F6', // Default color when not specified in envelope
          });
          tagNameToId.set(normalizedName, newTag.id);
        }
      }
    }
  }

  // 6. Import todos with ID remapping
  let importedCount = 0;
  const now = getSingaporeNow();

  for (const todo of todos) {
    // 6a. Create the todo with a new ID (assigned by DB AUTOINCREMENT)
    const newTodo = todoDB.create({
      user_id: session.userId,
      title: todo.title.trim(),
      is_completed: todo.is_completed ?? 0,
      due_date: todo.due_date ?? null,
      priority: todo.priority ?? 'medium',
      is_recurring: todo.is_recurring ? 1 : 0,
      recurrence_pattern: todo.recurrence_pattern ?? null,
      reminder_minutes: todo.reminder_minutes ?? null,
      created_at: todo.created_at || now.toISOString(),
    });

    // 6b. Create subtasks linked to the NEW todo ID
    if (Array.isArray(todo.subtasks)) {
      for (const subtask of todo.subtasks) {
        if (!subtask.title || typeof subtask.title !== 'string') continue;
        subtaskDB.create({
          todo_id: newTodo.id,
          title: subtask.title.trim(),
          is_completed: subtask.is_completed ?? 0,
          position: subtask.position ?? 0,
        });
      }
    }

    // 6c. Link tags via todo_tags junction table
    if (Array.isArray(todo.tags)) {
      for (const tagName of todo.tags) {
        const normalizedName = String(tagName).trim().toLowerCase();
        const tagId = tagNameToId.get(normalizedName);
        if (tagId) {
          tagDB.addToTodo(newTodo.id, tagId);
        }
      }
    }

    importedCount++;
  }

  return NextResponse.json({
    message: `Successfully imported ${importedCount} todos`,
    count: importedCount,
  });
}
```

### Business Logic

#### ID Remapping Algorithm

The import process never reuses IDs from the export file. Every imported entity receives a fresh database-generated ID:

```
Export File                    Database (after import)
──────────                    ──────────────────────
Todo id=1  ───────────────►  Todo id=47  (new AUTOINCREMENT)
  Subtask todo_id=1  ─────►    Subtask todo_id=47
  Tag "work" (id=5)  ─────►    Tag "work" (id=3, EXISTING reused)
  todo_tags(1, 5)    ─────►    todo_tags(47, 3)

Todo id=2  ───────────────►  Todo id=48  (new AUTOINCREMENT)
  Subtask todo_id=2  ─────►    Subtask todo_id=48
  Tag "urgent" (id=6) ────►    Tag "urgent" (id=12, NEW created)
  todo_tags(2, 6)    ─────►    todo_tags(48, 12)
```

**Steps**:
1. Ignore the `id` field in each imported todo — the database's `AUTOINCREMENT` provides the new ID.
2. After inserting a todo, capture `newTodo.id` (the database-assigned ID).
3. Use `newTodo.id` as the `todo_id` when inserting subtasks.
4. Use `newTodo.id` when inserting into `todo_tags`.

#### Tag Conflict Resolution

When importing, tags are matched **by name** (case-insensitive) per user:

```
Import tag "work"
  └─ Does user already have tag named "work"?
       ├─ YES → Reuse existing tag ID (don't create duplicate)
       │         Keep existing tag's color (don't overwrite)
       └─ NO  → Create new tag with imported name and color
                 Use the color from the export envelope
```

**Key rules**:
1. Tag names are normalized to lowercase and trimmed before comparison.
2. If the user already has a tag with the same name, the existing tag's **color is preserved** (not overwritten by the imported color).
3. If the tag doesn't exist, it is created with the color from the export envelope, or `#3B82F6` (default blue) if no color is specified.
4. The same tag resolution applies whether the tag is referenced in the top-level `tags` array or only in a todo's `tags` array.

#### JSON Validation Rules

The import endpoint validates the incoming JSON in stages:

| Stage | Check | Error |
|-------|-------|-------|
| 1. Parse | Valid JSON syntax | `"Invalid JSON format"` |
| 2. Structure | Has `todos` array (or is an array) | `"Invalid import format: missing todos array"` |
| 3. Non-empty | `todos.length > 0` | `"No todos to import"` |
| 4. Per-todo | Each todo has non-empty string `title` | `"Invalid todo at index N: missing title"` |

**Lenient fields** (use defaults if missing):
- `priority` → defaults to `"medium"`
- `is_completed` → defaults to `0`
- `is_recurring` → defaults to `false`/`0`
- `recurrence_pattern` → defaults to `null`
- `reminder_minutes` → defaults to `null`
- `due_date` → defaults to `null`
- `created_at` → defaults to current Singapore time
- `subtasks` → defaults to empty array (skip)
- `tags` → defaults to empty array (skip)

#### Export Date Formatting

The `exportedAt` timestamp uses Singapore timezone:

```typescript
const now = getSingaporeNow();
// Format: "2025-11-02T10:30:00+08:00"
const exportedAt = now.toISOString().replace('Z', '+08:00');
```

The filename date uses `YYYY-MM-DD` format in Singapore timezone:

```typescript
const dateStr = formatSingaporeDate(now, 'yyyy-MM-dd');
// Result: "2025-11-02"
```

## UI Components

### Export & Import Buttons

Located in the toolbar area of `app/page.tsx`, near other action buttons:

```tsx
{/* Export/Import Buttons - in the toolbar area */}
<div className="flex gap-2 items-center">
  {/* Export JSON Button */}
  <button
    onClick={handleExportJSON}
    className="bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-1.5 rounded-md transition-colors"
  >
    Export JSON
  </button>

  {/* Export CSV Button */}
  <button
    onClick={handleExportCSV}
    className="bg-green-800 hover:bg-green-900 text-white text-sm px-3 py-1.5 rounded-md transition-colors"
  >
    Export CSV
  </button>

  {/* Import Button */}
  <button
    onClick={() => fileInputRef.current?.click()}
    className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded-md transition-colors"
  >
    Import
  </button>

  {/* Hidden file input for import */}
  <input
    ref={fileInputRef}
    type="file"
    accept=".json"
    onChange={handleImport}
    className="hidden"
  />
</div>
```

### Export Handler (Client-Side)

```tsx
// In app/page.tsx

const fileInputRef = useRef<HTMLInputElement>(null);

const handleExportJSON = async () => {
  try {
    const response = await fetch('/api/todos/export');
    if (!response.ok) throw new Error('Export failed');

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // Extract filename from Content-Disposition header
    const disposition = response.headers.get('Content-Disposition');
    const filenameMatch = disposition?.match(/filename="(.+)"/);
    a.download = filenameMatch ? filenameMatch[1] : 'todos-export.json';

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Export failed:', error);
    alert('Failed to export todos');
  }
};

const handleExportCSV = async () => {
  try {
    const response = await fetch('/api/todos/export?format=csv');
    if (!response.ok) throw new Error('CSV export failed');

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const disposition = response.headers.get('Content-Disposition');
    const filenameMatch = disposition?.match(/filename="(.+)"/);
    a.download = filenameMatch ? filenameMatch[1] : 'todos-export.csv';

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('CSV export failed:', error);
    alert('Failed to export CSV');
  }
};
```

### Import Handler (Client-Side)

```tsx
const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    let importData: any;

    try {
      importData = JSON.parse(text);
    } catch {
      alert('Invalid JSON file. Please select a valid export file.');
      return;
    }

    const response = await fetch('/api/todos/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(importData),
    });

    const result = await response.json();

    if (!response.ok) {
      alert(result.error || 'Failed to import todos. Please check the file format.');
      return;
    }

    alert(result.message); // "Successfully imported X todos"

    // Refresh the todo list
    fetchTodos();
  } catch (error) {
    console.error('Import failed:', error);
    alert('Failed to import todos');
  } finally {
    // Reset file input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }
};
```

### Success/Error Message Display

The import result can be shown inline instead of via `alert()` for a better UX. Use a state variable:

```tsx
const [importMessage, setImportMessage] = useState<{
  type: 'success' | 'error';
  text: string;
} | null>(null);

// In the import handler, replace alert() with:
setImportMessage({ type: 'success', text: result.message });
// or
setImportMessage({ type: 'error', text: result.error });

// Auto-clear after 5 seconds:
setTimeout(() => setImportMessage(null), 5000);

// Render inline message:
{importMessage && (
  <div className={`mt-2 px-4 py-2 rounded-md text-sm ${
    importMessage.type === 'success'
      ? 'bg-green-100 text-green-800'
      : 'bg-red-100 text-red-800'
  }`}>
    {importMessage.text}
  </div>
)}
```

## Edge Cases

1. **Empty export (no todos)**: When user has no todos, export should still return valid JSON with empty `todos` array and empty `tags` array. CSV should return only the header row.

2. **Corrupted/invalid JSON file**: If the imported file is not valid JSON, return `400` with `"Invalid JSON format"`. The client should display a clear error message and not crash.

3. **Missing required fields**: If a todo in the import is missing a `title`, return `400` with the index of the invalid todo so the user can fix the file.

4. **Very large import (hundreds of todos)**: The import should process all todos in a single transaction-like flow. Consider that `better-sqlite3` is synchronous — large imports may block the event loop briefly. No explicit file size limit is enforced, but practical limits apply (JSON parsing memory).

5. **Duplicate tags across import and existing data**: If the user already has a tag named "work" (blue) and the import file also contains a tag named "Work" (red), the existing tag is reused (case-insensitive match). The existing color is preserved.

6. **Importing the same file twice**: Since import always creates NEW todos with new IDs, importing the same file twice will create duplicate todos. This is by design — the user is informed that "import creates duplicates, doesn't merge."

7. **Import with tags but no top-level tags array**: If the import JSON has `tags: ["work"]` inside individual todos but no top-level `tags` array, the system should still resolve tags by creating them with a default color.

8. **Import with legacy format (raw array)**: Support importing a raw JSON array of todos `[{...}, {...}]` in addition to the envelope format `{ todos: [...] }` for backward compatibility.

9. **Special characters in todo titles (CSV)**: Titles containing commas, quotes, or newlines must be properly escaped in CSV output. Wrap titles in double quotes and escape internal double quotes by doubling them (`"""`).

10. **Todo with no subtasks or tags**: These fields should default to empty arrays and not cause errors during export or import.

11. **User isolation**: A user should only export their own todos and import into their own account. The `session.userId` is used for all queries, never trusting any `user_id` from the import file.

12. **File input reset**: After an import (success or failure), the file input must be reset (`input.value = ''`) so the user can select the same file again if needed.

13. **Concurrent imports**: If two imports happen simultaneously for the same user, each should complete independently. Tag resolution uses `getByNameAndUser` which may find tags created by the concurrent import — this is acceptable and prevents duplicate tags.

14. **Invalid format query parameter**: If `GET /api/todos/export?format=xml` is called, return `400` with `"Invalid format. Use json or csv"`.

15. **Subtask with missing title**: During import, subtasks without a valid title string should be silently skipped rather than causing the entire import to fail.

## Acceptance Criteria

### Export (JSON)
- [ ] `GET /api/todos/export` returns 200 with valid JSON when user is authenticated
- [ ] Response includes `Content-Disposition` header with filename in `todos-YYYY-MM-DD.json` format
- [ ] Response includes `Content-Type: application/json` header
- [ ] Export JSON contains `version`, `exportedAt`, `todos`, and `tags` top-level fields
- [ ] `exportedAt` uses Singapore timezone offset (`+08:00`)
- [ ] Each exported todo includes all fields: `id`, `title`, `priority`, `due_date`, `is_completed`, `is_recurring`, `recurrence_pattern`, `reminder_minutes`, `created_at`
- [ ] Each exported todo includes nested `subtasks` array with `title`, `is_completed`, `position`
- [ ] Each exported todo includes `tags` array with tag name strings
- [ ] Top-level `tags` array includes all user's tags with `name` and `color`
- [ ] Export with no todos returns `{ "version": "1.0", "todos": [], "tags": [...] }`
- [ ] Unauthenticated requests return 401

### Export (CSV)
- [ ] `GET /api/todos/export?format=csv` returns 200 with valid CSV
- [ ] Response includes `Content-Disposition` header with filename in `todos-YYYY-MM-DD.csv` format
- [ ] Response includes `Content-Type: text/csv` header
- [ ] CSV has header row: `ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder`
- [ ] Each todo is one CSV row with correct values
- [ ] Titles with commas or quotes are properly escaped
- [ ] Empty export returns header-only CSV

### Import
- [ ] `POST /api/todos/import` accepts exported JSON and creates todos with new IDs
- [ ] Import preserves all todo fields: title, priority, due_date, is_completed, is_recurring, recurrence_pattern, reminder_minutes, created_at
- [ ] Import creates subtasks linked to the new todo IDs
- [ ] Import creates tag associations via `todo_tags` junction table
- [ ] Tag conflict resolution: existing tags are reused by name (case-insensitive)
- [ ] New tags are created when they don't exist for the user
- [ ] Existing tag colors are not overwritten
- [ ] Success response returns `{ "message": "Successfully imported X todos", "count": X }`
- [ ] Invalid JSON returns 400 with `"Invalid JSON format"`
- [ ] Missing todos array returns 400 with `"Invalid import format: missing todos array"`
- [ ] Todo missing title returns 400 with index information
- [ ] Empty todos array returns 400 with `"No todos to import"`
- [ ] Unauthenticated requests return 401
- [ ] Imported todos belong to the authenticated user (not the original exporter)
- [ ] Supports both envelope format and raw array format

### UI
- [ ] "Export JSON" button (green) triggers JSON file download
- [ ] "Export CSV" button (dark green) triggers CSV file download
- [ ] "Import" button (blue) opens file picker (`.json` only)
- [ ] Success message shown after successful import with todo count
- [ ] Error message shown when import fails with descriptive reason
- [ ] Todo list refreshes automatically after successful import
- [ ] File input resets after import so the same file can be re-selected

## Testing Requirements

### E2E Tests (Playwright)

**Test file**: `tests/09-export-import.spec.ts`

#### Test 1: JSON Export with Todos
```
Description: Verify that exporting todos as JSON produces a valid file with all data
Steps:
  1. Register and login
  2. Create a todo with title, priority, due date, and reminder
  3. Add subtasks to the todo
  4. Create a tag and assign it to the todo
  5. Click "Export JSON" button
  6. Intercept the download or call the API directly
  7. Verify the JSON structure has version, exportedAt, todos, and tags
  8. Verify the todo data matches what was created
  9. Verify subtasks are nested inside the todo
  10. Verify tag names are in the todo's tags array
```

#### Test 2: CSV Export
```
Description: Verify that CSV export produces a valid spreadsheet-compatible file
Steps:
  1. Register and login
  2. Create multiple todos with different properties
  3. Call GET /api/todos/export?format=csv
  4. Verify Content-Type is text/csv
  5. Verify Content-Disposition has .csv filename
  6. Parse CSV and verify header row
  7. Verify each todo appears as a row with correct values
```

#### Test 3: Empty Export
```
Description: Verify export works correctly when user has no todos
Steps:
  1. Register and login (no todos created)
  2. Call GET /api/todos/export
  3. Verify response has empty todos array
  4. Verify version and exportedAt are present
  5. Call GET /api/todos/export?format=csv
  6. Verify CSV has only the header row
```

#### Test 4: JSON Import - Basic
```
Description: Verify that importing a JSON file creates new todos
Steps:
  1. Register and login
  2. Construct a valid import JSON with 3 todos
  3. POST to /api/todos/import
  4. Verify response: "Successfully imported 3 todos"
  5. Call GET /api/todos to verify 3 new todos exist
  6. Verify each todo has a new ID (not from the import file)
  7. Verify all fields (title, priority, due_date, etc.) are preserved
```

#### Test 5: Import with Subtasks
```
Description: Verify subtask relationships are preserved during import
Steps:
  1. Register and login
  2. Construct import JSON with a todo that has 2 subtasks
  3. POST to /api/todos/import
  4. Verify the imported todo has 2 subtasks
  5. Verify subtask titles and completion status match
  6. Verify subtask positions are preserved
```

#### Test 6: Import with Tag Conflict Resolution
```
Description: Verify existing tags are reused and new tags are created
Steps:
  1. Register and login
  2. Create a tag "work" with color "#3B82F6"
  3. Construct import JSON with todos tagged "work" and "newTag"
  4. POST to /api/todos/import
  5. Verify only one "work" tag exists (not duplicated)
  6. Verify "newTag" was created
  7. Verify the imported todo is linked to the existing "work" tag
```

#### Test 7: Import Validation - Invalid JSON
```
Description: Verify error handling for malformed JSON
Steps:
  1. Register and login
  2. POST invalid JSON string to /api/todos/import
  3. Verify 400 response with "Invalid JSON format"
```

#### Test 8: Import Validation - Missing Title
```
Description: Verify per-todo validation catches missing required fields
Steps:
  1. Register and login
  2. Construct import JSON where one todo has no title
  3. POST to /api/todos/import
  4. Verify 400 response with index-specific error message
```

#### Test 9: Round-Trip Export then Import
```
Description: Verify data integrity through a full export → import cycle
Steps:
  1. Register and login
  2. Create 2 todos with subtasks and tags
  3. Export as JSON via GET /api/todos/export
  4. Delete all existing todos
  5. Import the exported JSON via POST /api/todos/import
  6. Verify all todos are restored with correct data
  7. Verify subtasks are restored
  8. Verify tag associations are restored
```

#### Test 10: Import Same File Twice (Duplicates)
```
Description: Verify importing the same file twice creates duplicate todos
Steps:
  1. Register and login
  2. Construct import JSON with 2 todos
  3. POST to /api/todos/import (first time)
  4. Verify 2 todos exist
  5. POST the same JSON again (second time)
  6. Verify 4 todos now exist (2 originals + 2 duplicates)
  7. All 4 should have unique IDs
```

#### Test 11: UI Export/Import Buttons
```
Description: Verify the Export and Import buttons are present and functional
Steps:
  1. Register and login
  2. Verify "Export JSON" button is visible and green
  3. Verify "Export CSV" button is visible
  4. Verify "Import" button is visible and blue
  5. Click Import → verify file picker appears (input type="file")
```

#### Test 12: Invalid Format Parameter
```
Description: Verify error for unsupported export format
Steps:
  1. Register and login
  2. Call GET /api/todos/export?format=xml
  3. Verify 400 response with "Invalid format. Use json or csv"
```

#### Test 13: User Isolation
```
Description: Verify users can only export their own data
Steps:
  1. Register User A and create todos
  2. Register User B (no todos)
  3. Login as User B
  4. Export as JSON
  5. Verify exported JSON has empty todos array (no User A data)
```

### Unit Tests

#### Test 1: Tag Name Normalization
```
Description: Verify tag matching is case-insensitive
Input: Existing tag "Work", import references "work", "WORK", "Work"
Expected: All three reference the same existing tag, no duplicates created
```

#### Test 2: CSV Escaping
```
Description: Verify special characters in CSV output are properly escaped
Input: Todo with title: 'Buy "organic" milk, eggs'
Expected CSV: '"Buy ""organic"" milk, eggs"'
```

#### Test 3: ID Remapping Integrity
```
Description: Verify no imported entity retains the old ID
Input: Export with todo id=999, subtask todo_id=999
Expected: New todo has id≠999, subtask references new todo ID
```

#### Test 4: Default Values for Missing Fields
```
Description: Verify lenient parsing assigns correct defaults
Input: Todo with only { "title": "Minimal" }
Expected: priority="medium", is_completed=0, is_recurring=0, etc.
```

#### Test 5: Empty Subtasks and Tags Arrays
```
Description: Verify todos with no subtasks or tags import cleanly
Input: Todo with subtasks=[] and tags=[]
Expected: Todo created successfully, no subtask or tag rows
```

## Out of Scope

- **Selective export**: Exporting only specific todos (filtered subset) is not supported — export always includes all user todos.
- **CSV import**: CSV format is read-only export; importing CSV is not supported.
- **Merge/sync logic**: Import always creates new todos. There is no deduplication, merging, or update-in-place logic.
- **Export scheduling**: Automatic periodic exports are not supported.
- **Cloud backup**: Integration with external cloud storage services (Dropbox, Google Drive) is not supported.
- **Export encryption**: Exported files are plain JSON/CSV with no encryption.
- **Version migration**: The `version` field in the export envelope is informational. There is no logic to migrate between export format versions.
- **Bulk delete before import**: There is no "replace all" import mode that deletes existing todos first.
- **Progress/loading indicator**: No progress bar for large imports; the operation blocks until complete.
- **Import undo**: Once imported, there is no one-click undo. User must manually delete imported todos.

## Success Metrics

1. **Export completeness**: Exported JSON contains 100% of user's todos, subtasks, tags, and associations with no data loss.
2. **Round-trip fidelity**: After export → delete all → import, all todo titles, priorities, due dates, recurrence settings, subtasks (titles, completion, positions), and tag associations match the original data.
3. **Tag deduplication**: Importing a file with tags that already exist for the user results in exactly zero duplicate tag records.
4. **Error resilience**: All invalid inputs (corrupted JSON, missing fields, wrong format) return descriptive 400-level errors without creating partial data.
5. **Performance**: Import of 100 todos with subtasks and tags completes in under 3 seconds on typical hardware.
6. **User isolation**: No cross-user data leakage — exports contain only the authenticated user's data, imports are scoped to the authenticated user.
