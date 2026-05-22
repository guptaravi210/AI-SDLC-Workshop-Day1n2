# Feature 06: Tag System

## Feature Overview

The Tag System enables users to organize their todos with custom, color-coded labels. Tags follow a many-to-many relationship model — each todo can have multiple tags, and each tag can be applied to multiple todos. Users manage tags through a dedicated modal and assign them via interactive pill-style checkboxes in the todo create/edit forms. Tags also serve as a filtering dimension, allowing users to click a tag badge or use a dropdown to view only related todos. Every tag is scoped to the owning user, so the same tag name can exist independently for different users.

---

## User Stories

1. **As a user**, I want to create custom colored tags so that I can categorize my todos by topic or project.
2. **As a user**, I want to assign multiple tags to a single todo so that a task can belong to more than one category.
3. **As a user**, I want to filter todos by tag so that I can quickly see all tasks in a specific category.
4. **As a user**, I want to manage (edit name/color, delete) my tags so that my tag list stays organized over time.
5. **As a user**, I want editing a tag to instantly update its appearance on every todo that uses it, so I don't have to re-tag anything.
6. **As a user**, I want deleting a tag to cleanly remove it from all associated todos without affecting the todos themselves.

---

## User Flow

### Creating and Managing Tags

1. User clicks the **"+ Manage Tags"** button (located near the todo creation form).
2. A modal opens showing:
   - A **Create Tag** form at the top with a name text input and a color picker (defaulting to `#3B82F6`).
   - A **list of existing tags** below, each displayed as a colored pill with Edit and Delete action buttons.
3. User enters a tag name (e.g., "Work") and optionally changes the color.
4. User clicks **"Create Tag"** → tag appears in the list immediately.
5. To **edit**: User clicks "Edit" on a tag → the row switches to inline editing mode (name input + color picker). User modifies values and clicks "Save".
6. To **delete**: User clicks "Delete" → a confirmation dialog appears → on confirm, the tag is removed from all todos and from the list.
7. User closes the modal.

### Assigning Tags to a Todo

1. When creating or editing a todo, a **tag selection area** appears below the form fields (visible only when tags exist).
2. Tags are displayed as pill-shaped checkboxes:
   - **Selected**: Colored background (tag's color), white text, checkmark icon (✓).
   - **Unselected**: White/light-gray background, gray border, gray text.
3. User clicks pills to toggle selection. Multiple tags can be selected simultaneously.
4. On form submission (Add / Update), selected tag IDs are sent to the API.

### Viewing Tags on Todos

1. Each todo in the list displays its assigned tags as small colored pills (rounded-full) with white text.
2. Tag badges appear after priority and recurrence badges.
3. Tags are visible in all sections: Overdue, Pending, and Completed.

### Filtering by Tag

1. User can click any tag badge on a todo to activate filtering for that tag.
2. Alternatively, a **"All Tags"** dropdown in the filter section lists all available tags.
3. When a tag filter is active:
   - Only todos with the selected tag are shown.
   - A filter indicator displays the active tag name with a clear (✕) button.
4. Tag filter combines with other active filters (search, priority, date range, completion) using AND logic.

---

## Technical Requirements

### Database Schema

#### `tags` Table

```sql
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, name)
);
```

#### `todo_tags` Junction Table

```sql
CREATE TABLE IF NOT EXISTS todo_tags (
  todo_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (todo_id, tag_id),
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
```

#### Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_todo_tags_todo_id ON todo_tags(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_tags_tag_id ON todo_tags(tag_id);
```

> **Key points**:
> - `UNIQUE(user_id, name)` ensures tag names are unique per user.
> - `ON DELETE CASCADE` on both foreign keys in `todo_tags` means deleting a todo removes its tag associations, and deleting a tag removes it from all todos.
> - `ON DELETE CASCADE` on `tags.user_id` means deleting a user removes all their tags.

---

### Type Definitions

Add to `lib/db.ts`:

```typescript
// ──────────────────────────────
// Tag interfaces
// ──────────────────────────────

export interface Tag {
  id: number;
  user_id: string;
  name: string;
  color: string; // Hex color, e.g. '#3B82F6'
}

export interface TodoTag {
  todo_id: number;
  tag_id: number;
}

// Extended Todo interface (augment existing Todo with optional tags)
export interface TodoWithTags extends Todo {
  tags: Tag[];
}
```

---

### API Endpoints

#### 1. `GET /api/tags` — List All Tags for Current User

**File**: `app/api/tags/route.ts`

**Request**: No body required.

**Response** (200):
```json
[
  { "id": 1, "user_id": "abc123", "name": "Work", "color": "#3B82F6" },
  { "id": 2, "user_id": "abc123", "name": "Personal", "color": "#10B981" },
  { "id": 3, "user_id": "abc123", "name": "Urgent", "color": "#EF4444" }
]
```

**Response** (401):
```json
{ "error": "Not authenticated" }
```

**Implementation**:
```typescript
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTagsByUserId } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const tags = getTagsByUserId(session.userId);
  return NextResponse.json(tags);
}
```

**Database function** (`lib/db.ts`):
```typescript
export function getTagsByUserId(userId: string): Tag[] {
  const stmt = db.prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC');
  return stmt.all(userId) as Tag[];
}
```

---

#### 2. `POST /api/tags` — Create a New Tag

**File**: `app/api/tags/route.ts`

**Request**:
```json
{ "name": "Work", "color": "#3B82F6" }
```

**Validation rules**:
- `name` is required, must be a non-empty trimmed string.
- `name` maximum length: 30 characters.
- `name` must be unique for this user (case-insensitive comparison recommended).
- `color` is required, must be a valid 7-character hex color (e.g., `#3B82F6`).

**Response** (201):
```json
{ "id": 4, "user_id": "abc123", "name": "Work", "color": "#3B82F6" }
```

**Error responses**:
- 400: `{ "error": "Tag name is required" }`
- 400: `{ "error": "Tag name must be 30 characters or less" }`
- 400: `{ "error": "Invalid color format. Use hex color (e.g., #3B82F6)" }`
- 409: `{ "error": "A tag with this name already exists" }`

**Implementation**:
```typescript
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const name = body.name?.trim();
  const color = body.color?.trim();

  // Validation
  if (!name) {
    return NextResponse.json({ error: 'Tag name is required' }, { status: 400 });
  }
  if (name.length > 30) {
    return NextResponse.json({ error: 'Tag name must be 30 characters or less' }, { status: 400 });
  }

  const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
  if (!color || !hexColorRegex.test(color)) {
    return NextResponse.json(
      { error: 'Invalid color format. Use hex color (e.g., #3B82F6)' },
      { status: 400 }
    );
  }

  // Check uniqueness
  const existing = getTagByUserIdAndName(session.userId, name);
  if (existing) {
    return NextResponse.json({ error: 'A tag with this name already exists' }, { status: 409 });
  }

  const tag = createTag(session.userId, name, color);
  return NextResponse.json(tag, { status: 201 });
}
```

**Database functions** (`lib/db.ts`):
```typescript
export function getTagByUserIdAndName(userId: string, name: string): Tag | undefined {
  const stmt = db.prepare(
    'SELECT * FROM tags WHERE user_id = ? AND LOWER(name) = LOWER(?)'
  );
  return stmt.get(userId, name) as Tag | undefined;
}

export function createTag(userId: string, name: string, color: string): Tag {
  const stmt = db.prepare(
    'INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)'
  );
  const result = stmt.run(userId, name, color);
  return {
    id: result.lastInsertRowid as number,
    user_id: userId,
    name,
    color,
  };
}
```

---

#### 3. `PUT /api/tags/[id]` — Update a Tag

**File**: `app/api/tags/[id]/route.ts`

**Request**:
```json
{ "name": "Updated Work", "color": "#6366F1" }
```

Both fields are optional — send only the field(s) to update.

**Validation**: Same rules as creation (name length, hex color format, uniqueness for the new name).

**Response** (200):
```json
{ "id": 1, "user_id": "abc123", "name": "Updated Work", "color": "#6366F1" }
```

**Error responses**:
- 400: `{ "error": "Tag name must be 30 characters or less" }`
- 400: `{ "error": "Invalid color format. Use hex color (e.g., #3B82F6)" }`
- 404: `{ "error": "Tag not found" }`
- 409: `{ "error": "A tag with this name already exists" }`

**Implementation**:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTagById, updateTag, getTagByUserIdAndName } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const tagId = parseInt(id, 10);
  const existingTag = getTagById(tagId);

  if (!existingTag || existingTag.user_id !== session.userId) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
  }

  const body = await request.json();
  const name = body.name !== undefined ? body.name.trim() : existingTag.name;
  const color = body.color !== undefined ? body.color.trim() : existingTag.color;

  // Validate name
  if (!name) {
    return NextResponse.json({ error: 'Tag name is required' }, { status: 400 });
  }
  if (name.length > 30) {
    return NextResponse.json({ error: 'Tag name must be 30 characters or less' }, { status: 400 });
  }

  // Validate color
  const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
  if (!hexColorRegex.test(color)) {
    return NextResponse.json(
      { error: 'Invalid color format. Use hex color (e.g., #3B82F6)' },
      { status: 400 }
    );
  }

  // Check uniqueness if name changed
  if (name.toLowerCase() !== existingTag.name.toLowerCase()) {
    const duplicate = getTagByUserIdAndName(session.userId, name);
    if (duplicate) {
      return NextResponse.json({ error: 'A tag with this name already exists' }, { status: 409 });
    }
  }

  const updatedTag = updateTag(tagId, name, color);
  return NextResponse.json(updatedTag);
}
```

**Database functions** (`lib/db.ts`):
```typescript
export function getTagById(id: number): Tag | undefined {
  const stmt = db.prepare('SELECT * FROM tags WHERE id = ?');
  return stmt.get(id) as Tag | undefined;
}

export function updateTag(id: number, name: string, color: string): Tag {
  const stmt = db.prepare(
    'UPDATE tags SET name = ?, color = ? WHERE id = ?'
  );
  stmt.run(name, color, id);
  return getTagById(id)!;
}
```

---

#### 4. `DELETE /api/tags/[id]` — Delete a Tag

**File**: `app/api/tags/[id]/route.ts`

**Request**: No body.

**Response** (200):
```json
{ "message": "Tag deleted successfully" }
```

**Error responses**:
- 404: `{ "error": "Tag not found" }`

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
  const tagId = parseInt(id, 10);
  const existingTag = getTagById(tagId);

  if (!existingTag || existingTag.user_id !== session.userId) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
  }

  deleteTag(tagId);
  return NextResponse.json({ message: 'Tag deleted successfully' });
}
```

**Database function** (`lib/db.ts`):
```typescript
export function deleteTag(id: number): void {
  // CASCADE on todo_tags handles removing associations automatically
  const stmt = db.prepare('DELETE FROM tags WHERE id = ?');
  stmt.run(id);
}
```

---

#### 5. `POST /api/todos/[id]/tags` — Assign a Tag to a Todo

**File**: `app/api/todos/[id]/tags/route.ts`

**Request**:
```json
{ "tagId": 3 }
```

**Response** (201):
```json
{ "message": "Tag assigned successfully" }
```

**Error responses**:
- 400: `{ "error": "tagId is required" }`
- 404: `{ "error": "Todo not found" }`
- 404: `{ "error": "Tag not found" }`
- 409: `{ "error": "Tag already assigned to this todo" }`

**Implementation**:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTodoById, getTagById, addTagToTodo, getTodoTags } from '@/lib/db';

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
  const todo = getTodoById(todoId);

  if (!todo || todo.user_id !== session.userId) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  const body = await request.json();
  const { tagId } = body;

  if (!tagId) {
    return NextResponse.json({ error: 'tagId is required' }, { status: 400 });
  }

  const tag = getTagById(tagId);
  if (!tag || tag.user_id !== session.userId) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
  }

  // Check if already assigned
  const currentTags = getTagsForTodo(todoId);
  if (currentTags.some(t => t.id === tagId)) {
    return NextResponse.json({ error: 'Tag already assigned to this todo' }, { status: 409 });
  }

  addTagToTodo(todoId, tagId);
  return NextResponse.json({ message: 'Tag assigned successfully' }, { status: 201 });
}
```

**Database functions** (`lib/db.ts`):
```typescript
export function getTagsForTodo(todoId: number): Tag[] {
  const stmt = db.prepare(`
    SELECT t.* FROM tags t
    INNER JOIN todo_tags tt ON t.id = tt.tag_id
    WHERE tt.todo_id = ?
    ORDER BY t.name ASC
  `);
  return stmt.all(todoId) as Tag[];
}

export function addTagToTodo(todoId: number, tagId: number): void {
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)'
  );
  stmt.run(todoId, tagId);
}
```

---

#### 6. `DELETE /api/todos/[id]/tags` — Remove a Tag from a Todo

**File**: `app/api/todos/[id]/tags/route.ts`

**Request**:
```json
{ "tagId": 3 }
```

**Response** (200):
```json
{ "message": "Tag removed successfully" }
```

**Error responses**:
- 400: `{ "error": "tagId is required" }`
- 404: `{ "error": "Todo not found" }`

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
  const todoId = parseInt(id, 10);
  const todo = getTodoById(todoId);

  if (!todo || todo.user_id !== session.userId) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  const body = await request.json();
  const { tagId } = body;

  if (!tagId) {
    return NextResponse.json({ error: 'tagId is required' }, { status: 400 });
  }

  removeTagFromTodo(todoId, tagId);
  return NextResponse.json({ message: 'Tag removed successfully' });
}
```

**Database function** (`lib/db.ts`):
```typescript
export function removeTagFromTodo(todoId: number, tagId: number): void {
  const stmt = db.prepare(
    'DELETE FROM todo_tags WHERE todo_id = ? AND tag_id = ?'
  );
  stmt.run(todoId, tagId);
}
```

---

### Bulk Tag Sync Helper

When creating or editing a todo, the client may send all selected tag IDs at once. Instead of individual add/remove calls, use a bulk sync function:

```typescript
// lib/db.ts
export function syncTodoTags(todoId: number, tagIds: number[]): void {
  const deleteStmt = db.prepare('DELETE FROM todo_tags WHERE todo_id = ?');
  const insertStmt = db.prepare('INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)');

  const syncTransaction = db.transaction((todoId: number, tagIds: number[]) => {
    deleteStmt.run(todoId);
    for (const tagId of tagIds) {
      insertStmt.run(todoId, tagId);
    }
  });

  syncTransaction(todoId, tagIds);
}
```

This can be called from the existing `PUT /api/todos/[id]` endpoint when `tagIds` is present in the request body.

---

### Fetching Todos with Tags

When loading the todo list, tags should be included. Modify the existing `GET /api/todos` response:

```typescript
// lib/db.ts
export function getTodosWithTagsByUserId(userId: string): TodoWithTags[] {
  const todos = getTodosByUserId(userId);
  return todos.map(todo => ({
    ...todo,
    tags: getTagsForTodo(todo.id),
  }));
}
```

**Alternative — single query approach** (better performance for large datasets):

```typescript
export function getTodosWithTagsByUserId(userId: string): TodoWithTags[] {
  const todos = getTodosByUserId(userId) as TodoWithTags[];

  if (todos.length === 0) return todos;

  const todoIds = todos.map(t => t.id);
  const placeholders = todoIds.map(() => '?').join(',');

  const tagRows = db.prepare(`
    SELECT tt.todo_id, t.id, t.user_id, t.name, t.color
    FROM todo_tags tt
    INNER JOIN tags t ON tt.tag_id = t.id
    WHERE tt.todo_id IN (${placeholders})
    ORDER BY t.name ASC
  `).all(...todoIds) as (Tag & { todo_id: number })[];

  const tagMap = new Map<number, Tag[]>();
  for (const row of tagRows) {
    const tags = tagMap.get(row.todo_id) || [];
    tags.push({ id: row.id, user_id: row.user_id, name: row.name, color: row.color });
    tagMap.set(row.todo_id, tags);
  }

  return todos.map(todo => ({
    ...todo,
    tags: tagMap.get(todo.id) || [],
  }));
}
```

---

### Business Logic

1. **Tag name uniqueness**: Enforced at both the database level (`UNIQUE(user_id, name)`) and the API level (case-insensitive check before insert/update).
2. **Tag scoping**: All queries filter by `session.userId` — users can never see or modify another user's tags.
3. **CASCADE delete behavior**:
   - Deleting a **tag** → all rows in `todo_tags` referencing that tag are automatically deleted.
   - Deleting a **todo** → all rows in `todo_tags` referencing that todo are automatically deleted.
   - Deleting a **user** → all tags owned by that user are deleted, which cascades to `todo_tags`.
4. **Recurring todo inheritance**: When a recurring todo is completed and the next instance is created, the new todo must inherit the same tags. Copy all `todo_tags` rows from the completed todo's ID to the new todo's ID.
5. **Color validation**: Accept only 7-character hex strings matching `/^#[0-9A-Fa-f]{6}$/`.
6. **Tag name sanitization**: Trim whitespace from both ends. Reject empty strings after trimming.

---

## UI Components

### Tag Management Modal

```tsx
// Inside app/page.tsx (monolithic client component)

const [showTagModal, setShowTagModal] = useState(false);
const [tags, setTags] = useState<Tag[]>([]);
const [newTagName, setNewTagName] = useState('');
const [newTagColor, setNewTagColor] = useState('#3B82F6');
const [editingTagId, setEditingTagId] = useState<number | null>(null);
const [editTagName, setEditTagName] = useState('');
const [editTagColor, setEditTagColor] = useState('');

// Fetch tags on mount
useEffect(() => {
  fetchTags();
}, []);

async function fetchTags() {
  const res = await fetch('/api/tags');
  if (res.ok) {
    const data = await res.json();
    setTags(data);
  }
}

async function handleCreateTag() {
  const res = await fetch('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newTagName, color: newTagColor }),
  });
  if (res.ok) {
    const tag = await res.json();
    setTags([...tags, tag]);
    setNewTagName('');
    setNewTagColor('#3B82F6');
  } else {
    const err = await res.json();
    alert(err.error);
  }
}

async function handleUpdateTag(id: number) {
  const res = await fetch(`/api/tags/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: editTagName, color: editTagColor }),
  });
  if (res.ok) {
    const updatedTag = await res.json();
    setTags(tags.map(t => (t.id === id ? updatedTag : t)));
    setEditingTagId(null);
  } else {
    const err = await res.json();
    alert(err.error);
  }
}

async function handleDeleteTag(id: number) {
  if (!confirm('Delete this tag? It will be removed from all todos.')) return;
  const res = await fetch(`/api/tags/${id}`, { method: 'DELETE' });
  if (res.ok) {
    setTags(tags.filter(t => t.id !== id));
    // Also refresh todos to reflect removed tag badges
    fetchTodos();
  }
}
```

**Modal JSX**:
```tsx
{showTagModal && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Manage Tags
        </h2>
        <button
          onClick={() => setShowTagModal(false)}
          className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-2xl"
          aria-label="Close tag management modal"
        >
          ✕
        </button>
      </div>

      {/* Create Tag Form */}
      <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Create New Tag
        </h3>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="Tag name"
              maxLength={30}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600
                         rounded-md text-sm bg-white dark:bg-gray-800
                         text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <input
            type="color"
            value={newTagColor}
            onChange={(e) => setNewTagColor(e.target.value)}
            className="w-10 h-10 rounded cursor-pointer border border-gray-300
                       dark:border-gray-600"
            title="Pick tag color"
          />
          <button
            onClick={handleCreateTag}
            disabled={!newTagName.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium
                       rounded-md hover:bg-blue-700 disabled:opacity-50
                       disabled:cursor-not-allowed"
          >
            Create Tag
          </button>
        </div>
      </div>

      {/* Tag List */}
      <div className="space-y-2">
        {tags.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-4">
            No tags yet. Create your first tag above!
          </p>
        ) : (
          tags.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center justify-between p-3 bg-gray-50
                         dark:bg-gray-700 rounded-lg"
            >
              {editingTagId === tag.id ? (
                /* Edit Mode */
                <div className="flex gap-2 items-center flex-1">
                  <input
                    type="text"
                    value={editTagName}
                    onChange={(e) => setEditTagName(e.target.value)}
                    maxLength={30}
                    className="flex-1 px-2 py-1 border border-gray-300
                               dark:border-gray-600 rounded text-sm
                               bg-white dark:bg-gray-800
                               text-gray-900 dark:text-white"
                  />
                  <input
                    type="color"
                    value={editTagColor}
                    onChange={(e) => setEditTagColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border
                               border-gray-300 dark:border-gray-600"
                  />
                  <button
                    onClick={() => handleUpdateTag(tag.id)}
                    className="px-3 py-1 bg-green-600 text-white text-xs
                               rounded hover:bg-green-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingTagId(null)}
                    className="px-3 py-1 bg-gray-400 text-white text-xs
                               rounded hover:bg-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                /* Display Mode */
                <>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block px-3 py-1 rounded-full text-xs
                                 font-medium text-white"
                      style={{ backgroundColor: tag.color }}
                    >
                      {tag.name}
                    </span>
                    <span className="text-xs text-gray-400">{tag.color}</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        setEditingTagId(tag.id);
                        setEditTagName(tag.name);
                        setEditTagColor(tag.color);
                      }}
                      className="px-3 py-1 text-xs text-blue-600 hover:text-blue-800
                                 dark:text-blue-400 dark:hover:text-blue-300
                                 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteTag(tag.id)}
                      className="px-3 py-1 text-xs text-red-600 hover:text-red-800
                                 dark:text-red-400 dark:hover:text-red-300
                                 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  </div>
)}
```

---

### Tag Selection in Todo Create/Edit Form

```tsx
// State for selected tags in the todo form
const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

function toggleTag(tagId: number) {
  setSelectedTagIds(prev =>
    prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
  );
}
```

**Tag selector JSX** (placed inside the todo create/edit form):
```tsx
{tags.length > 0 && (
  <div className="mt-3">
    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
      Tags
    </label>
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const isSelected = selectedTagIds.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => toggleTag(tag.id)}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full
                       text-xs font-medium border transition-colors cursor-pointer
                       ${isSelected
                         ? 'text-white border-transparent'
                         : 'text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600'
                       }`}
            style={isSelected ? { backgroundColor: tag.color } : undefined}
          >
            {isSelected && <span>✓</span>}
            {tag.name}
          </button>
        );
      })}
    </div>
  </div>
)}
```

---

### Tag Badges on Todo Items

```tsx
// Inside the todo list item rendering
{todo.tags && todo.tags.length > 0 && (
  <div className="flex flex-wrap gap-1 mt-1">
    {todo.tags.map((tag) => (
      <button
        key={tag.id}
        onClick={() => setFilterTag(tag.id)}
        className="inline-block px-2 py-0.5 rounded-full text-xs font-medium
                   text-white cursor-pointer hover:opacity-80 transition-opacity"
        style={{ backgroundColor: tag.color }}
        title={`Filter by "${tag.name}"`}
      >
        {tag.name}
      </button>
    ))}
  </div>
)}
```

---

### Tag Filter Dropdown

```tsx
// State
const [filterTag, setFilterTag] = useState<number | null>(null);

// In the filter section (alongside priority filter)
<select
  value={filterTag ?? ''}
  onChange={(e) => setFilterTag(e.target.value ? parseInt(e.target.value, 10) : null)}
  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
             text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
>
  <option value="">All Tags</option>
  {tags.map((tag) => (
    <option key={tag.id} value={tag.id}>{tag.name}</option>
  ))}
</select>

{/* Tag Filter Active Indicator */}
{filterTag !== null && (
  <div className="flex items-center gap-1 text-sm">
    <span className="text-gray-600 dark:text-gray-400">Filtered by tag:</span>
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs
                 font-medium text-white"
      style={{
        backgroundColor: tags.find(t => t.id === filterTag)?.color ?? '#6B7280',
      }}
    >
      {tags.find(t => t.id === filterTag)?.name ?? 'Unknown'}
      <button
        onClick={() => setFilterTag(null)}
        className="ml-1 hover:bg-white/20 rounded-full w-4 h-4 flex items-center
                   justify-center text-xs"
        aria-label="Clear tag filter"
      >
        ✕
      </button>
    </span>
  </div>
)}
```

---

### Client-Side Tag Filtering Logic

```typescript
// Inside the todo filtering logic in app/page.tsx
const filteredTodos = useMemo(() => {
  return todos.filter((todo) => {
    // ... existing search and priority filters ...

    // Tag filter
    if (filterTag !== null) {
      const hasTags = todo.tags && todo.tags.some(t => t.id === filterTag);
      if (!hasTags) return false;
    }

    return true;
  });
}, [todos, searchQuery, filterPriority, filterTag /* ... other deps */]);
```

---

### "+ Manage Tags" Button

```tsx
<button
  onClick={() => setShowTagModal(true)}
  className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400
             bg-blue-50 dark:bg-blue-900/20 border border-blue-200
             dark:border-blue-800 rounded-lg hover:bg-blue-100
             dark:hover:bg-blue-900/30 transition-colors"
>
  + Manage Tags
</button>
```

---

## Edge Cases

1. **Duplicate tag name** — User tries to create a tag with a name that already exists (case-insensitive). The API returns a `409 Conflict` with `"A tag with this name already exists"`. The UI should display this error message and keep the form populated so the user can correct the name.

2. **Very long tag name** — Tag names are limited to 30 characters. The API validates and rejects names exceeding this limit with a `400 Bad Request`. The `<input>` has `maxLength={30}` for client-side prevention.

3. **Invalid hex color** — User submits a malformed color string (e.g., `"red"`, `"#GGG"`, `"3B82F6"` without `#`). The API validates with regex `/^#[0-9A-Fa-f]{6}$/` and returns `400`. The HTML color picker inherently produces valid hex values, but manual entry must also be validated.

4. **Deleting a tag with many associations** — When a tag is used on 100+ todos, the CASCADE delete removes all `todo_tags` rows in a single operation. This is handled atomically by SQLite. The UI should refresh the todo list after deletion to reflect removed badges.

5. **Empty tag name (whitespace only)** — User submits `"   "` as a tag name. After `.trim()`, this becomes an empty string and is rejected with `"Tag name is required"`.

6. **Concurrent editing** — Two browser tabs edit the same tag simultaneously. The last write wins. The UI should re-fetch the tag list when the modal opens to avoid stale data.

7. **Tag assigned to deleted todo** — CASCADE delete on `todo_tags.todo_id` handles this automatically; no orphaned junction rows remain.

8. **No tags exist** — When no tags have been created, the tag selector in the todo form is hidden. The filter dropdown shows only "All Tags". The management modal shows a friendly "No tags yet" empty state.

9. **Renaming a tag to an existing name** — PUT endpoint checks for uniqueness of the new name (excluding the tag being edited). Returns `409` if a collision is found.

10. **Special characters in tag names** — Tag names can contain any printable characters (including emojis, unicode). The UI must properly escape/render these. No HTML injection is possible because React auto-escapes text content.

11. **Maximum tag count** — While no hard limit is enforced, the UI uses `flex-wrap` so an excessive number of tags wraps gracefully. Performance remains acceptable up to ~100 tags per user.

12. **Recurring todo tag inheritance** — When a recurring todo is completed and the next instance is created, all tags from the completed todo must be copied to the new todo. The completion handler should call `syncTodoTags(newTodoId, getTagsForTodo(completedTodoId).map(t => t.id))`.

13. **Dark mode color contrast** — Tag pill colors must remain readable in dark mode. Since the text is white and the background is the user-chosen color, very light colors (e.g., `#FFFFFF`, `#FFFFCC`) may have poor contrast. The UI could add a subtle dark border in dark mode for additional contrast.

---

## Acceptance Criteria

- [ ] `tags` table is created with `id`, `user_id`, `name`, `color` columns and a `UNIQUE(user_id, name)` constraint.
- [ ] `todo_tags` junction table is created with composite primary key `(todo_id, tag_id)` and CASCADE delete on both foreign keys.
- [ ] `GET /api/tags` returns all tags for the authenticated user, sorted alphabetically.
- [ ] `POST /api/tags` creates a tag with validated name (non-empty, ≤30 chars, unique) and validated hex color.
- [ ] `PUT /api/tags/[id]` updates tag name and/or color with the same validation rules. Only the tag owner can update.
- [ ] `DELETE /api/tags/[id]` deletes the tag and cascades removal from all `todo_tags` associations. Only the tag owner can delete.
- [ ] `POST /api/todos/[id]/tags` assigns a tag to a todo. Both must belong to the authenticated user.
- [ ] `DELETE /api/todos/[id]/tags` removes a tag from a todo.
- [ ] The "+ Manage Tags" button opens a modal with create form and list of existing tags.
- [ ] Tags can be edited inline (name + color) in the management modal.
- [ ] Tags can be deleted from the management modal with a confirmation prompt.
- [ ] The tag selector appears in both create and edit todo forms when tags exist.
- [ ] Tag pills toggle between selected (colored background, white text, ✓) and unselected (gray border, gray text) states.
- [ ] Multiple tags can be selected simultaneously on a single todo.
- [ ] Tag badges appear on todo items as colored rounded-full pills with white text.
- [ ] Clicking a tag badge on a todo activates filter-by-tag.
- [ ] The "All Tags" dropdown in the filter section allows filtering by any tag.
- [ ] Active tag filter shows an indicator with the tag name and a clear (✕) button.
- [ ] Tag filter combines with search, priority, date range, and completion filters using AND logic.
- [ ] Editing a tag (name or color) immediately updates its appearance on all todos displaying that tag.
- [ ] Deleting a tag removes it from all todos without deleting the todos themselves.
- [ ] Completing a recurring todo copies all tags to the newly created next instance.
- [ ] All API endpoints return `401` for unauthenticated requests.
- [ ] Users cannot see, edit, or delete tags belonging to other users.
- [ ] Duplicate tag name creation returns `409` with a clear error message.
- [ ] UI is fully compatible with dark mode.

---

## Testing Requirements

### E2E Tests (Playwright)

**File**: `tests/06-tag-system.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
// Import helpers for auth registration + login with virtual WebAuthn authenticator

test.describe('Tag System', () => {

  test.describe('Tag CRUD', () => {

    test('should create a new tag with name and color', async ({ page }) => {
      // 1. Login with virtual authenticator
      // 2. Click "+ Manage Tags" button
      // 3. Enter tag name "Work"
      // 4. Pick color #3B82F6 (default)
      // 5. Click "Create Tag"
      // 6. Verify tag appears in the list with correct name and color
    });

    test('should prevent creating a tag with duplicate name', async ({ page }) => {
      // 1. Create tag "Work"
      // 2. Try to create another tag "Work"
      // 3. Verify error message "A tag with this name already exists"
    });

    test('should prevent creating a tag with duplicate name (case-insensitive)', async ({ page }) => {
      // 1. Create tag "Work"
      // 2. Try to create tag "work" (lowercase)
      // 3. Verify duplicate error
    });

    test('should prevent creating a tag with empty name', async ({ page }) => {
      // 1. Open tag modal
      // 2. Leave name empty
      // 3. Verify "Create Tag" button is disabled
    });

    test('should edit a tag name and color', async ({ page }) => {
      // 1. Create tag "Work" with color #3B82F6
      // 2. Click "Edit" on the tag
      // 3. Change name to "Office" and color to #6366F1
      // 4. Click "Save"
      // 5. Verify tag shows updated name and color
    });

    test('should delete a tag', async ({ page }) => {
      // 1. Create tag "Temporary"
      // 2. Click "Delete" on the tag
      // 3. Accept confirmation dialog
      // 4. Verify tag no longer appears in the list
    });

    test('should delete a tag and remove it from assigned todos', async ({ page }) => {
      // 1. Create tag "Work"
      // 2. Create a todo and assign the "Work" tag
      // 3. Verify tag badge appears on the todo
      // 4. Open tag modal, delete "Work" tag
      // 5. Verify tag badge no longer appears on the todo
    });

  });

  test.describe('Tag Assignment', () => {

    test('should assign a tag to a todo during creation', async ({ page }) => {
      // 1. Create tag "Personal"
      // 2. Start creating a new todo
      // 3. Click the "Personal" tag pill (should show ✓ and colored background)
      // 4. Submit the todo
      // 5. Verify "Personal" badge appears on the created todo
    });

    test('should assign multiple tags to a todo', async ({ page }) => {
      // 1. Create tags "Work" and "Urgent"
      // 2. Create a todo selecting both tags
      // 3. Verify both tag badges appear on the todo
    });

    test('should remove a tag from a todo during editing', async ({ page }) => {
      // 1. Create tags "Work" and "Personal"
      // 2. Create a todo with both tags assigned
      // 3. Edit the todo, deselect "Personal"
      // 4. Save changes
      // 5. Verify only "Work" badge remains on the todo
    });

    test('should show tag selector only when tags exist', async ({ page }) => {
      // 1. Login (no tags created)
      // 2. Verify no tag selector appears in todo form
      // 3. Create a tag
      // 4. Verify tag selector now appears
    });

  });

  test.describe('Tag Filtering', () => {

    test('should filter todos by clicking a tag badge', async ({ page }) => {
      // 1. Create tags "Work" and "Personal"
      // 2. Create todo "Report" with "Work" tag
      // 3. Create todo "Shopping" with "Personal" tag
      // 4. Click the "Work" badge on "Report"
      // 5. Verify only "Report" is visible
      // 6. Verify filter indicator shows "Work" with clear button
    });

    test('should filter todos by tag dropdown', async ({ page }) => {
      // 1. Create tags and assign to todos (mix)
      // 2. Select a tag from the "All Tags" dropdown
      // 3. Verify only todos with that tag are visible
    });

    test('should clear tag filter', async ({ page }) => {
      // 1. Apply tag filter
      // 2. Click clear (✕) button on filter indicator
      // 3. Verify all todos are visible again
    });

    test('should combine tag filter with search and priority filters', async ({ page }) => {
      // 1. Create tags and todos with various priorities
      // 2. Apply tag filter + priority filter + search
      // 3. Verify only matching todos are shown (AND logic)
    });

  });

  test.describe('Tag Editing Propagation', () => {

    test('should update tag appearance on all todos when edited', async ({ page }) => {
      // 1. Create tag "Work" (blue #3B82F6)
      // 2. Assign to two different todos
      // 3. Edit tag to "Office" (purple #6366F1)
      // 4. Verify both todos now show "Office" badge with purple color
    });

  });

  test.describe('Edge Cases', () => {

    test('should handle tag name with max length (30 characters)', async ({ page }) => {
      // 1. Create tag with exactly 30 characters
      // 2. Verify it succeeds
    });

    test('should handle tag name with special characters', async ({ page }) => {
      // 1. Create tag with name "🔥 Hot Items!"
      // 2. Verify it's created and rendered correctly
    });

    test('should isolate tags between users', async ({ page }) => {
      // 1. Register User A, create tag "Work"
      // 2. Logout, register User B
      // 3. Verify User B sees no tags
      // 4. User B creates tag "Work" — should succeed (different user)
    });

  });

});
```

### Unit Tests

Test scenarios for business logic (run via a test framework like Vitest):

1. **`getTagsByUserId`** — Returns only tags for the specified user, sorted alphabetically.
2. **`getTagByUserIdAndName`** — Case-insensitive match; returns `undefined` when not found.
3. **`createTag`** — Returns the created tag with auto-incremented `id`.
4. **`updateTag`** — Returns updated tag; does not affect other tags.
5. **`deleteTag`** — Removes tag and its `todo_tags` entries.
6. **`getTagsForTodo`** — Returns tags associated with a specific todo.
7. **`addTagToTodo`** — Inserts into `todo_tags`; `INSERT OR IGNORE` prevents duplicates.
8. **`removeTagFromTodo`** — Deletes the specific row from `todo_tags`.
9. **`syncTodoTags`** — Replaces all tag associations atomically (transaction).
10. **Hex color validation regex** — Accepts `#3B82F6`, rejects `#GGG`, `red`, `3B82F6`, `#3B82F6FF`.

---

## Out of Scope

- **Tag icons/emojis as a separate field** — Users can include emojis in the tag name itself.
- **Tag groups or categories** — Tags are a flat list per user.
- **Nested tags / tag hierarchy** — No parent-child tag relationships.
- **Tag color presets** — Users use the native HTML color picker or type a hex value; no curated palette.
- **Tag-based notifications** — Reminders are per-todo, not per-tag.
- **Tag sharing between users** — Tags are strictly user-scoped.
- **Tag usage statistics or analytics** — No count of todos per tag dashboard.
- **Drag-and-drop tag reordering** — Tags are sorted alphabetically.
- **Bulk tag assignment** — Tags are assigned per-todo (via create/edit form).

---

## Success Metrics

1. **Tag creation success rate** — ≥ 99% of tag creation attempts succeed (excluding valid duplicate-name rejections).
2. **Tag filter response time** — Filtering by tag completes in < 50ms on the client (for up to 500 todos).
3. **Cascade delete integrity** — Zero orphaned `todo_tags` rows after any tag or todo deletion.
4. **UI render accuracy** — Tag badges display with the correct user-specified color on 100% of todos.
5. **E2E test pass rate** — All tag system Playwright tests pass consistently across 3 consecutive runs.
6. **Cross-user isolation** — Zero instances of tags leaking between users in any test scenario.
