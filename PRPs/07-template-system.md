# Feature 07: Template System

## Feature Overview

The Template System allows users to save frequently-used todo patterns as reusable templates and instantly create new todos from them. Templates capture a todo's title, priority, recurrence settings, reminder timing, and subtasks (serialized as JSON), along with metadata like name, description, and category. When a template is "used," a new todo is created with all saved settings, and the due date is calculated dynamically from a configurable hour-based offset. Templates are user-scoped—each user manages their own library of templates organized by categories such as Work, Personal, Finance, Health, and Education.

## User Stories

1. **As a user**, I want to save a frequently-used todo pattern as a template, so that I can quickly recreate it without filling in all the details each time.
2. **As a user**, I want to instantly create a todo from a saved template, so that I save time on repetitive task creation.
3. **As a user**, I want templates to include subtasks and all settings (priority, recurrence, reminders), so that complex multi-step tasks are fully reproduced.
4. **As a user**, I want to organize my templates by category (Work, Personal, Finance, Health, Education), so that I can find the right template quickly.
5. **As a user**, I want to browse, view details, use, and delete templates from a template manager modal, so that I have full control over my template library.
6. **As a user**, I want to use a template directly from a dropdown in the todo form area, so that I can create todos from templates without opening the manager.

## User Flow

### Saving a Template
1. User fills out the todo form with a title (required) and optionally sets priority, recurrence, reminder, and adds subtasks.
2. A **"💾 Save as Template"** button appears below the todo form once the title field is non-empty.
3. User clicks the button → a **Save Template modal** opens.
4. Modal pre-fills with the current form state and prompts the user for:
   - **Name** (required) — the template's display name
   - **Description** (optional) — a brief explanation of the template
   - **Category** (optional) — a dropdown with preset values (Work, Personal, Finance, Health, Education) and a free-text option
5. User clicks **"Save Template"** → API call creates the template → success toast → modal closes.

### Using a Template (Quick Dropdown)
1. In the todo form area, a **"Use Template"** dropdown is visible.
2. User selects a template from the dropdown (templates show name and category in parentheses, e.g., "Weekly Review (Work)").
3. A new todo is created instantly via `POST /api/templates/[id]/use` with all template settings applied.
4. The todo list refreshes to show the new todo.

### Using a Template (Template Manager)
1. User clicks the **"📋 Templates"** button in the top navigation bar.
2. The **Template Manager modal** opens, listing all saved templates.
3. Each template card shows: name, description, category badge, priority badge, recurrence indicator (🔄), and reminder indicator (🔔).
4. User clicks **"Use"** on a template → todo is created → modal closes → todo list refreshes.

### Deleting a Template
1. In the Template Manager modal, user clicks **"Delete"** on a template.
2. Confirmation prompt appears.
3. On confirmation, the template is deleted via `DELETE /api/templates/[id]`.
4. Existing todos previously created from this template are **not affected**.

## Technical Requirements

### Database Schema

Add the following table to `lib/db.ts` in the `db.exec()` initialization block:

```sql
CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  priority TEXT DEFAULT 'medium' CHECK(priority IN ('high', 'medium', 'low')),
  is_recurring INTEGER DEFAULT 0,
  recurrence_pattern TEXT CHECK(recurrence_pattern IN ('daily', 'weekly', 'monthly', 'yearly') OR recurrence_pattern IS NULL),
  reminder_minutes INTEGER,
  subtasks_json TEXT,
  due_date_offset_hours INTEGER,
  created_at TEXT NOT NULL
);
```

**Column Details:**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK AUTOINCREMENT | Unique template identifier |
| `user_id` | TEXT | NOT NULL, FK → users(id), CASCADE | Owner of the template |
| `name` | TEXT | NOT NULL | Display name (e.g., "Weekly Review") |
| `description` | TEXT | nullable | Optional description/purpose |
| `category` | TEXT | nullable | Organizational category (Work, Personal, etc.) |
| `priority` | TEXT | DEFAULT 'medium', CHECK constraint | Todo priority: 'high', 'medium', 'low' |
| `is_recurring` | INTEGER | DEFAULT 0 | Boolean flag: 0 = not recurring, 1 = recurring |
| `recurrence_pattern` | TEXT | CHECK constraint, nullable | Pattern: 'daily', 'weekly', 'monthly', 'yearly' |
| `reminder_minutes` | INTEGER | nullable | Reminder offset in minutes before due date |
| `subtasks_json` | TEXT | nullable | JSON-serialized subtask array |
| `due_date_offset_hours` | INTEGER | nullable | Hours from creation time for due date |
| `created_at` | TEXT | NOT NULL | ISO 8601 timestamp in Singapore timezone |

### Type Definitions

Add these types/interfaces to `lib/db.ts`:

```typescript
// Template interface
export interface Template {
  id: number;
  user_id: string;
  name: string;
  description: string | null;
  category: string | null;
  priority: Priority;          // reuse existing 'high' | 'medium' | 'low'
  is_recurring: number;        // 0 or 1
  recurrence_pattern: RecurrencePattern | null;  // reuse existing type
  reminder_minutes: number | null;
  subtasks_json: string | null;
  due_date_offset_hours: number | null;
  created_at: string;
}

// Parsed subtask item (for JSON serialization/deserialization)
export interface TemplateSubtask {
  title: string;
  position: number;
}

// Input for creating a template
export interface CreateTemplateInput {
  user_id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  priority?: Priority;
  is_recurring?: number;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
  subtasks_json?: string | null;
  due_date_offset_hours?: number | null;
}

// Input for updating a template
export interface UpdateTemplateInput {
  name?: string;
  description?: string | null;
  category?: string | null;
  priority?: Priority;
  is_recurring?: number;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
  subtasks_json?: string | null;
  due_date_offset_hours?: number | null;
}
```

### Database CRUD Operations

Add a `templateDB` export to `lib/db.ts`:

```typescript
export const templateDB = {
  // Get all templates for a user
  getByUserId(userId: string): Template[] {
    const stmt = db.prepare('SELECT * FROM templates WHERE user_id = ? ORDER BY created_at DESC');
    return stmt.all(userId) as Template[];
  },

  // Get a single template by ID
  getById(id: number): Template | undefined {
    const stmt = db.prepare('SELECT * FROM templates WHERE id = ?');
    return stmt.get(id) as Template | undefined;
  },

  // Create a new template
  create(input: CreateTemplateInput): Template {
    const now = getSingaporeNow().toISOString();
    const stmt = db.prepare(`
      INSERT INTO templates (user_id, name, description, category, priority, is_recurring, recurrence_pattern, reminder_minutes, subtasks_json, due_date_offset_hours, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      input.user_id,
      input.name,
      input.description ?? null,
      input.category ?? null,
      input.priority ?? 'medium',
      input.is_recurring ?? 0,
      input.recurrence_pattern ?? null,
      input.reminder_minutes ?? null,
      input.subtasks_json ?? null,
      input.due_date_offset_hours ?? null,
      now
    );
    return templateDB.getById(Number(result.lastInsertRowid))!;
  },

  // Update an existing template
  update(id: number, input: UpdateTemplateInput): Template | undefined {
    const existing = templateDB.getById(id);
    if (!existing) return undefined;

    const stmt = db.prepare(`
      UPDATE templates
      SET name = ?, description = ?, category = ?, priority = ?, is_recurring = ?, recurrence_pattern = ?, reminder_minutes = ?, subtasks_json = ?, due_date_offset_hours = ?
      WHERE id = ?
    `);
    stmt.run(
      input.name ?? existing.name,
      input.description !== undefined ? input.description : existing.description,
      input.category !== undefined ? input.category : existing.category,
      input.priority ?? existing.priority,
      input.is_recurring ?? existing.is_recurring,
      input.recurrence_pattern !== undefined ? input.recurrence_pattern : existing.recurrence_pattern,
      input.reminder_minutes !== undefined ? input.reminder_minutes : existing.reminder_minutes,
      input.subtasks_json !== undefined ? input.subtasks_json : existing.subtasks_json,
      input.due_date_offset_hours !== undefined ? input.due_date_offset_hours : existing.due_date_offset_hours,
      id
    );
    return templateDB.getById(id);
  },

  // Delete a template
  delete(id: number): boolean {
    const stmt = db.prepare('DELETE FROM templates WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
};
```

### API Endpoints

#### 1. GET `/api/templates` — List User's Templates

**File:** `app/api/templates/route.ts`

**Request:** No body required.

**Response (200):**
```json
[
  {
    "id": 1,
    "user_id": "user-abc123",
    "name": "Weekly Review",
    "description": "End-of-week review and planning",
    "category": "Work",
    "priority": "high",
    "is_recurring": 1,
    "recurrence_pattern": "weekly",
    "reminder_minutes": 60,
    "subtasks_json": "[{\"title\":\"Review completed tasks\",\"position\":1},{\"title\":\"Plan next week\",\"position\":2}]",
    "due_date_offset_hours": 24,
    "created_at": "2025-11-15T10:30:00.000Z"
  }
]
```

**Error Responses:**
- `401`: `{ "error": "Not authenticated" }`

**Implementation:**
```typescript
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { templateDB } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const templates = templateDB.getByUserId(session.userId);
  return NextResponse.json(templates);
}
```

---

#### 2. POST `/api/templates` — Create a Template

**File:** `app/api/templates/route.ts`

**Request Body:**
```json
{
  "name": "Weekly Review",
  "description": "End-of-week review and planning",
  "category": "Work",
  "priority": "high",
  "is_recurring": 1,
  "recurrence_pattern": "weekly",
  "reminder_minutes": 60,
  "subtasks_json": "[{\"title\":\"Review completed tasks\",\"position\":1},{\"title\":\"Plan next week\",\"position\":2}]",
  "due_date_offset_hours": 24
}
```

**Response (201):**
```json
{
  "id": 1,
  "user_id": "user-abc123",
  "name": "Weekly Review",
  "description": "End-of-week review and planning",
  "category": "Work",
  "priority": "high",
  "is_recurring": 1,
  "recurrence_pattern": "weekly",
  "reminder_minutes": 60,
  "subtasks_json": "[{\"title\":\"Review completed tasks\",\"position\":1},{\"title\":\"Plan next week\",\"position\":2}]",
  "due_date_offset_hours": 24,
  "created_at": "2025-11-15T10:30:00.000Z"
}
```

**Error Responses:**
- `400`: `{ "error": "Template name is required" }`
- `400`: `{ "error": "Template name must be a non-empty string" }`
- `400`: `{ "error": "Invalid priority value" }`
- `400`: `{ "error": "Invalid recurrence pattern" }`
- `400`: `{ "error": "Invalid subtasks JSON format" }`
- `401`: `{ "error": "Not authenticated" }`

**Implementation:**
```typescript
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const { name, description, category, priority, is_recurring, recurrence_pattern, reminder_minutes, subtasks_json, due_date_offset_hours } = body;

  // Validate name
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Template name is required' }, { status: 400 });
  }

  // Validate priority if provided
  if (priority && !['high', 'medium', 'low'].includes(priority)) {
    return NextResponse.json({ error: 'Invalid priority value' }, { status: 400 });
  }

  // Validate recurrence_pattern if provided
  if (recurrence_pattern && !['daily', 'weekly', 'monthly', 'yearly'].includes(recurrence_pattern)) {
    return NextResponse.json({ error: 'Invalid recurrence pattern' }, { status: 400 });
  }

  // Validate subtasks_json if provided
  if (subtasks_json) {
    try {
      const parsed = JSON.parse(subtasks_json);
      if (!Array.isArray(parsed)) {
        return NextResponse.json({ error: 'Invalid subtasks JSON format' }, { status: 400 });
      }
      for (const item of parsed) {
        if (typeof item.title !== 'string' || typeof item.position !== 'number') {
          return NextResponse.json({ error: 'Invalid subtasks JSON format' }, { status: 400 });
        }
      }
    } catch {
      return NextResponse.json({ error: 'Invalid subtasks JSON format' }, { status: 400 });
    }
  }

  const template = templateDB.create({
    user_id: session.userId,
    name: name.trim(),
    description: description?.trim() || null,
    category: category?.trim() || null,
    priority: priority || 'medium',
    is_recurring: is_recurring ?? 0,
    recurrence_pattern: recurrence_pattern || null,
    reminder_minutes: reminder_minutes ?? null,
    subtasks_json: subtasks_json || null,
    due_date_offset_hours: due_date_offset_hours ?? null,
  });

  return NextResponse.json(template, { status: 201 });
}
```

---

#### 3. PUT `/api/templates/[id]` — Update a Template

**File:** `app/api/templates/[id]/route.ts`

**Request Body (partial update):**
```json
{
  "name": "Updated Weekly Review",
  "description": "Updated description",
  "category": "Personal"
}
```

**Response (200):** Updated template object (same shape as creation response).

**Error Responses:**
- `400`: `{ "error": "Template name must be a non-empty string" }`
- `400`: `{ "error": "Invalid priority value" }`
- `400`: `{ "error": "Invalid recurrence pattern" }`
- `400`: `{ "error": "Invalid subtasks JSON format" }`
- `401`: `{ "error": "Not authenticated" }`
- `403`: `{ "error": "Not authorized" }`
- `404`: `{ "error": "Template not found" }`

**Implementation:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { templateDB } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params; // Next.js 16: params is a Promise
  const templateId = parseInt(id, 10);

  const existing = templateDB.getById(templateId);
  if (!existing) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  if (existing.user_id !== session.userId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const body = await request.json();

  // Validate name if provided
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return NextResponse.json({ error: 'Template name must be a non-empty string' }, { status: 400 });
    }
    body.name = body.name.trim();
  }

  // Validate priority if provided
  if (body.priority && !['high', 'medium', 'low'].includes(body.priority)) {
    return NextResponse.json({ error: 'Invalid priority value' }, { status: 400 });
  }

  // Validate recurrence_pattern if provided
  if (body.recurrence_pattern && !['daily', 'weekly', 'monthly', 'yearly'].includes(body.recurrence_pattern)) {
    return NextResponse.json({ error: 'Invalid recurrence pattern' }, { status: 400 });
  }

  // Validate subtasks_json if provided
  if (body.subtasks_json) {
    try {
      const parsed = JSON.parse(body.subtasks_json);
      if (!Array.isArray(parsed)) {
        return NextResponse.json({ error: 'Invalid subtasks JSON format' }, { status: 400 });
      }
      for (const item of parsed) {
        if (typeof item.title !== 'string' || typeof item.position !== 'number') {
          return NextResponse.json({ error: 'Invalid subtasks JSON format' }, { status: 400 });
        }
      }
    } catch {
      return NextResponse.json({ error: 'Invalid subtasks JSON format' }, { status: 400 });
    }
  }

  const updated = templateDB.update(templateId, body);
  return NextResponse.json(updated);
}
```

---

#### 4. DELETE `/api/templates/[id]` — Delete a Template

**File:** `app/api/templates/[id]/route.ts`

**Request:** No body required.

**Response (200):**
```json
{ "success": true }
```

**Error Responses:**
- `401`: `{ "error": "Not authenticated" }`
- `403`: `{ "error": "Not authorized" }`
- `404`: `{ "error": "Template not found" }`

**Implementation:**
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
  const templateId = parseInt(id, 10);

  const existing = templateDB.getById(templateId);
  if (!existing) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  if (existing.user_id !== session.userId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  templateDB.delete(templateId);
  return NextResponse.json({ success: true });
}
```

---

#### 5. POST `/api/templates/[id]/use` — Create a Todo from a Template

**File:** `app/api/templates/[id]/use/route.ts`

This is the most complex endpoint. It reads the template, creates a new todo with all template settings, calculates the due date from the offset, and creates subtasks from the parsed JSON.

**Request:** No body required (all data comes from the template).

**Response (201):**
```json
{
  "todo": {
    "id": 42,
    "user_id": "user-abc123",
    "title": "Weekly Review",
    "completed": 0,
    "due_date": "2025-11-16T10:30:00.000Z",
    "priority": "high",
    "is_recurring": 1,
    "recurrence_pattern": "weekly",
    "reminder_minutes": 60,
    "created_at": "2025-11-15T10:30:00.000Z"
  },
  "subtasks": [
    { "id": 101, "todo_id": 42, "title": "Review completed tasks", "completed": 0, "position": 1 },
    { "id": 102, "todo_id": 42, "title": "Plan next week", "completed": 0, "position": 2 }
  ]
}
```

**Error Responses:**
- `401`: `{ "error": "Not authenticated" }`
- `403`: `{ "error": "Not authorized" }`
- `404`: `{ "error": "Template not found" }`

**Implementation:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { templateDB, todoDB, subtaskDB, TemplateSubtask } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const templateId = parseInt(id, 10);

  // Fetch the template
  const template = templateDB.getById(templateId);
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  if (template.user_id !== session.userId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  // Calculate due date from offset
  let dueDate: string | null = null;
  if (template.due_date_offset_hours != null && template.due_date_offset_hours > 0) {
    const now = getSingaporeNow();
    now.setHours(now.getHours() + template.due_date_offset_hours);
    dueDate = now.toISOString();
  }

  // Create the todo using template settings
  const todo = todoDB.create({
    user_id: session.userId,
    title: template.name,                           // Template name becomes todo title
    due_date: dueDate,
    priority: template.priority ?? 'medium',
    is_recurring: template.is_recurring ?? 0,
    recurrence_pattern: template.recurrence_pattern ?? null,
    reminder_minutes: template.reminder_minutes ?? null,
  });

  // Parse and create subtasks from JSON
  let createdSubtasks: any[] = [];
  if (template.subtasks_json) {
    try {
      const subtasks: TemplateSubtask[] = JSON.parse(template.subtasks_json);
      if (Array.isArray(subtasks)) {
        for (const subtask of subtasks) {
          if (subtask.title && typeof subtask.title === 'string') {
            const created = subtaskDB.create({
              todo_id: todo.id,
              title: subtask.title.trim(),
              position: subtask.position ?? 0,
            });
            createdSubtasks.push(created);
          }
        }
      }
    } catch {
      // If JSON parsing fails, skip subtasks but still create the todo
      console.error('Failed to parse subtasks_json for template:', templateId);
    }
  }

  return NextResponse.json({ todo, subtasks: createdSubtasks }, { status: 201 });
}
```

### Business Logic

#### Subtasks JSON Serialization

When **saving** a template (from the todo form with subtasks):
```typescript
// Serialize subtasks to JSON for storage
const subtasksForTemplate: TemplateSubtask[] = currentSubtasks.map((s, index) => ({
  title: s.title,
  position: index + 1,
}));
const subtasks_json = JSON.stringify(subtasksForTemplate);
```

When **using** a template (creating a todo):
```typescript
// Deserialize subtasks from JSON
const subtasks: TemplateSubtask[] = JSON.parse(template.subtasks_json);
// Create each subtask linked to the new todo
for (const subtask of subtasks) {
  subtaskDB.create({
    todo_id: newTodo.id,
    title: subtask.title,
    position: subtask.position,
  });
}
```

#### Due Date Offset Calculation

The `due_date_offset_hours` field stores how many hours from "now" the due date should be set when the template is used:

| Offset Value | Meaning | Example (if used at 10:00 AM) |
|--------------|---------|-------------------------------|
| `1` | 1 hour from now | 11:00 AM today |
| `24` | Tomorrow same time | 10:00 AM tomorrow |
| `48` | 2 days from now | 10:00 AM in 2 days |
| `168` | 1 week from now | 10:00 AM next week |
| `null` or `0` | No due date | No due date set |

**Calculation (Singapore timezone):**
```typescript
import { getSingaporeNow } from '@/lib/timezone';

function calculateDueDate(offsetHours: number | null): string | null {
  if (offsetHours == null || offsetHours <= 0) return null;
  const now = getSingaporeNow();
  now.setHours(now.getHours() + offsetHours);
  return now.toISOString();
}
```

#### Template-to-Todo Field Mapping

| Template Field | Todo Field | Notes |
|----------------|-----------|-------|
| `name` | `title` | Template name becomes todo title |
| `priority` | `priority` | Direct copy |
| `is_recurring` | `is_recurring` | Direct copy |
| `recurrence_pattern` | `recurrence_pattern` | Direct copy |
| `reminder_minutes` | `reminder_minutes` | Direct copy |
| `due_date_offset_hours` | `due_date` | Calculated: now + offset hours |
| `subtasks_json` | Creates subtask rows | Parsed JSON → individual subtask records |
| `description` | — | Template metadata only, not copied to todo |
| `category` | — | Template metadata only, not copied to todo |

#### What Templates Preserve vs. Do NOT Preserve

**Preserved:**
- ✅ Title (template name → todo title)
- ✅ Priority level (high / medium / low)
- ✅ Recurrence enabled flag
- ✅ Recurrence pattern (daily / weekly / monthly / yearly)
- ✅ Reminder timing (minutes before due date)
- ✅ Subtasks (from JSON → individual subtask records)
- ✅ Category and description (on the template itself)

**NOT Preserved:**
- ❌ Specific due dates — calculated dynamically from `due_date_offset_hours`
- ❌ Tags — user selects tags separately at todo creation time (tags are not part of the template)

## UI Components

### "Save as Template" Button

Visible in the todo form area when the title input has a non-empty value:

```tsx
{/* Save as Template button - appears when title is filled */}
{newTodoTitle.trim().length > 0 && (
  <button
    onClick={() => setShowSaveTemplateModal(true)}
    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors dark:bg-purple-900 dark:text-purple-200 dark:hover:bg-purple-800"
    title="Save current form as a reusable template"
  >
    💾 Save as Template
  </button>
)}
```

### Save Template Modal

```tsx
{showSaveTemplateModal && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
      <h2 className="text-xl font-bold mb-4 dark:text-white">💾 Save as Template</h2>

      {/* Template Name (required) */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Template Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          placeholder="e.g., Weekly Review"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          autoFocus
        />
      </div>

      {/* Description (optional) */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Description
        </label>
        <textarea
          value={templateDescription}
          onChange={(e) => setTemplateDescription(e.target.value)}
          placeholder="Brief description of this template..."
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        />
      </div>

      {/* Category (optional) */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Category
        </label>
        <select
          value={templateCategory}
          onChange={(e) => setTemplateCategory(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        >
          <option value="">None</option>
          <option value="Work">Work</option>
          <option value="Personal">Personal</option>
          <option value="Finance">Finance</option>
          <option value="Health">Health</option>
          <option value="Education">Education</option>
        </select>
      </div>

      {/* Preview of captured settings */}
      <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Template will capture:</p>
        <ul className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
          <li>📝 Title: {newTodoTitle}</li>
          <li>🎯 Priority: {newTodoPriority}</li>
          {isRecurring && <li>🔄 Recurrence: {recurrencePattern}</li>}
          {reminderMinutes && <li>🔔 Reminder: {reminderMinutes} min</li>}
          {subtasks.length > 0 && <li>📋 Subtasks: {subtasks.length} item(s)</li>}
        </ul>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 justify-end">
        <button
          onClick={() => {
            setShowSaveTemplateModal(false);
            setTemplateName('');
            setTemplateDescription('');
            setTemplateCategory('');
          }}
          className="px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Cancel
        </button>
        <button
          onClick={handleSaveTemplate}
          disabled={!templateName.trim()}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save Template
        </button>
      </div>
    </div>
  </div>
)}
```

### "Use Template" Dropdown

Located in the todo form area:

```tsx
{/* Use Template Dropdown */}
{templates.length > 0 && (
  <div className="flex items-center gap-2">
    <select
      onChange={(e) => {
        if (e.target.value) {
          handleUseTemplate(parseInt(e.target.value, 10));
          e.target.value = ''; // Reset dropdown after use
        }
      }}
      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500"
      defaultValue=""
    >
      <option value="" disabled>Use Template...</option>
      {templates.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}{t.category ? ` (${t.category})` : ''}
        </option>
      ))}
    </select>
  </div>
)}
```

### Template Manager Modal

```tsx
{showTemplateModal && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold dark:text-white">📋 Template Manager</h2>
        <button
          onClick={() => setShowTemplateModal(false)}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl"
        >
          ✕
        </button>
      </div>

      {templates.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400 py-8">
          No templates yet. Fill in the todo form and click "💾 Save as Template" to create one.
        </p>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => (
            <div
              key={template.id}
              className="border border-gray-200 dark:border-gray-600 rounded-lg p-4"
            >
              {/* Template name and description */}
              <h3 className="font-semibold text-lg dark:text-white">{template.name}</h3>
              {template.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {template.description}
                </p>
              )}

              {/* Badges row */}
              <div className="flex flex-wrap gap-2 mt-2">
                {/* Category badge */}
                {template.category && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                    {template.category}
                  </span>
                )}

                {/* Priority badge */}
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                  template.priority === 'high'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200'
                    : template.priority === 'low'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                    : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200'
                }`}>
                  {template.priority}
                </span>

                {/* Recurrence badge */}
                {template.is_recurring === 1 && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200">
                    🔄 {template.recurrence_pattern}
                  </span>
                )}

                {/* Reminder badge */}
                {template.reminder_minutes != null && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200">
                    🔔 {formatReminderBadge(template.reminder_minutes)}
                  </span>
                )}

                {/* Subtasks count */}
                {template.subtasks_json && (() => {
                  try {
                    const count = JSON.parse(template.subtasks_json).length;
                    return count > 0 ? (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200">
                        📋 {count} subtask{count !== 1 ? 's' : ''}
                      </span>
                    ) : null;
                  } catch { return null; }
                })()}

                {/* Due date offset */}
                {template.due_date_offset_hours != null && template.due_date_offset_hours > 0 && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                    ⏰ Due in {template.due_date_offset_hours}h
                  </span>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => {
                    handleUseTemplate(template.id);
                    setShowTemplateModal(false);
                  }}
                  className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Use
                </button>
                <button
                  onClick={() => handleDeleteTemplate(template.id)}
                  className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
)}
```

### Client-Side Handlers (in `app/page.tsx`)

```typescript
// State variables
const [templates, setTemplates] = useState<Template[]>([]);
const [showTemplateModal, setShowTemplateModal] = useState(false);
const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
const [templateName, setTemplateName] = useState('');
const [templateDescription, setTemplateDescription] = useState('');
const [templateCategory, setTemplateCategory] = useState('');

// Fetch templates on mount
const fetchTemplates = async () => {
  try {
    const res = await fetch('/api/templates');
    if (res.ok) {
      const data = await res.json();
      setTemplates(data);
    }
  } catch (error) {
    console.error('Failed to fetch templates:', error);
  }
};

useEffect(() => {
  fetchTemplates();
}, []);

// Save template handler
const handleSaveTemplate = async () => {
  if (!templateName.trim()) return;

  // Serialize current subtasks (if any)
  let subtasksJson: string | null = null;
  if (subtasks.length > 0) {
    const templateSubtasks = subtasks.map((s, index) => ({
      title: s.title,
      position: index + 1,
    }));
    subtasksJson = JSON.stringify(templateSubtasks);
  }

  try {
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: templateName.trim(),
        description: templateDescription.trim() || null,
        category: templateCategory || null,
        priority: newTodoPriority,
        is_recurring: isRecurring ? 1 : 0,
        recurrence_pattern: isRecurring ? recurrencePattern : null,
        reminder_minutes: reminderMinutes || null,
        subtasks_json: subtasksJson,
        due_date_offset_hours: null, // User can set later or default
      }),
    });

    if (res.ok) {
      await fetchTemplates();
      setShowSaveTemplateModal(false);
      setTemplateName('');
      setTemplateDescription('');
      setTemplateCategory('');
      // Show success toast/notification
    }
  } catch (error) {
    console.error('Failed to save template:', error);
  }
};

// Use template handler
const handleUseTemplate = async (templateId: number) => {
  try {
    const res = await fetch(`/api/templates/${templateId}/use`, {
      method: 'POST',
    });

    if (res.ok) {
      await fetchTodos(); // Refresh todo list to show new todo
      // Show success toast/notification
    } else {
      const data = await res.json();
      console.error('Failed to use template:', data.error);
    }
  } catch (error) {
    console.error('Failed to use template:', error);
  }
};

// Delete template handler
const handleDeleteTemplate = async (templateId: number) => {
  if (!confirm('Are you sure you want to delete this template? This will NOT affect existing todos.')) {
    return;
  }

  try {
    const res = await fetch(`/api/templates/${templateId}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      await fetchTemplates();
    }
  } catch (error) {
    console.error('Failed to delete template:', error);
  }
};

// Helper: format reminder badge text
const formatReminderBadge = (minutes: number): string => {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${minutes / 60}h`;
  if (minutes < 10080) return `${minutes / 1440}d`;
  return `${minutes / 10080}w`;
};
```

### Templates Button in Navigation

```tsx
<button
  onClick={() => setShowTemplateModal(true)}
  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors dark:bg-purple-900 dark:text-purple-200 dark:hover:bg-purple-800"
>
  📋 Templates
</button>
```

## Edge Cases

1. **Empty template name**: The "Save Template" button is disabled when the name field is empty or whitespace-only. The API returns `400` with `"Template name is required"`. The client trims whitespace before sending.

2. **Invalid subtasks JSON**: If `subtasks_json` contains invalid JSON or is not an array of `{title, position}` objects, the API returns `400` with `"Invalid subtasks JSON format"`. Each item must have a `string` title and `number` position.

3. **Using a deleted template**: If a template is deleted between the time the user loaded the template list and clicks "Use," the API returns `404` with `"Template not found"`. The UI should show an error message and refresh the template list.

4. **Duplicate template names**: Duplicate template names are **allowed** — there is no unique constraint on `name` per user. Users may have multiple templates with the same name (e.g., different versions). The template list differentiates by ID and shows category if available.

5. **Subtasks JSON parsing failure on use**: If `subtasks_json` stored in the database is somehow corrupted and cannot be parsed during `POST /api/templates/[id]/use`, the todo is still created successfully but without subtasks. The error is logged server-side.

6. **Template with no due date offset**: If `due_date_offset_hours` is `null` or `0`, the created todo will have no due date. If a reminder is set on the template but no due date offset is present, the reminder field is still set on the todo (it will take effect once the user manually sets a due date).

7. **Very large offset values**: No upper limit is enforced on `due_date_offset_hours`. A value of `8760` (1 year) is valid. The calculated due date uses Singapore timezone.

8. **Template with recurrence but no due date offset**: If `is_recurring` is `1` but `due_date_offset_hours` is `null`, the todo is created as recurring but without a due date. The user should set a due date manually for recurrence to function properly.

9. **Concurrent template deletion**: If two browser tabs attempt to delete the same template, the first succeeds and the second gets a `404`. The template list should be refreshed after any mutation.

10. **Template ownership**: A user can only view, use, update, and delete their own templates. The API checks `template.user_id === session.userId` and returns `403` for unauthorized access attempts.

11. **Maximum template count**: No limit is enforced on the number of templates per user. For performance, templates are loaded in a single query ordered by `created_at DESC`.

12. **Special characters in template name/description**: HTML special characters are safely handled by React's JSX escaping. No XSS risk. Template names can contain emojis, unicode, and special punctuation.

## Acceptance Criteria

- [ ] `templates` table is created in the database with all specified columns and constraints
- [ ] `Template`, `TemplateSubtask`, `CreateTemplateInput`, `UpdateTemplateInput` interfaces are exported from `lib/db.ts`
- [ ] `templateDB` CRUD operations (getByUserId, getById, create, update, delete) work correctly
- [ ] `GET /api/templates` returns all templates for the authenticated user, ordered by `created_at DESC`
- [ ] `POST /api/templates` creates a template and returns `201` with the created template
- [ ] `POST /api/templates` validates name is non-empty and returns `400` for missing/empty name
- [ ] `POST /api/templates` validates `subtasks_json` format and returns `400` for invalid JSON
- [ ] `POST /api/templates` validates `priority` and `recurrence_pattern` values
- [ ] `PUT /api/templates/[id]` updates a template with partial data
- [ ] `PUT /api/templates/[id]` returns `404` for non-existent template
- [ ] `PUT /api/templates/[id]` returns `403` when attempting to update another user's template
- [ ] `DELETE /api/templates/[id]` removes the template and returns `{ "success": true }`
- [ ] `DELETE /api/templates/[id]` does NOT affect existing todos created from that template
- [ ] `POST /api/templates/[id]/use` creates a new todo with all template settings applied
- [ ] `POST /api/templates/[id]/use` calculates the due date correctly from `due_date_offset_hours` using Singapore timezone
- [ ] `POST /api/templates/[id]/use` creates subtasks from parsed `subtasks_json`
- [ ] `POST /api/templates/[id]/use` returns `404` for deleted/non-existent template
- [ ] "💾 Save as Template" button appears only when the todo form title is non-empty
- [ ] Save Template modal has fields: name (required), description (optional), category (dropdown, optional)
- [ ] Save Template modal shows a preview of captured settings (priority, recurrence, reminder, subtask count)
- [ ] "Use Template" dropdown lists all user templates with name and category
- [ ] Selecting a template from the dropdown instantly creates a todo
- [ ] "📋 Templates" button opens the Template Manager modal
- [ ] Template Manager modal lists all templates with name, description, category badge, priority badge, recurrence (🔄), and reminder (🔔) indicators
- [ ] "Use" button in template manager creates a todo and closes the modal
- [ ] "Delete" button in template manager shows confirmation and deletes the template
- [ ] Empty state message is shown when user has no templates
- [ ] All API endpoints return `401` for unauthenticated requests
- [ ] All date/time operations use `getSingaporeNow()` from `lib/timezone.ts`
- [ ] `params` is awaited in all Next.js 16 dynamic route handlers

## Testing Requirements

### E2E Tests (Playwright)

**File:** `tests/07-templates.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Template System', () => {

  test.describe('Creating Templates', () => {

    test('should show "Save as Template" button when title is filled', async ({ page }) => {
      // 1. Navigate to main page, register/login
      // 2. Verify "Save as Template" button is NOT visible with empty title
      // 3. Type a title into the todo input
      // 4. Verify "Save as Template" button appears
      // 5. Clear the title
      // 6. Verify "Save as Template" button disappears again
    });

    test('should open Save Template modal and create a template', async ({ page }) => {
      // 1. Fill in todo form: title, priority=high, recurrence=weekly
      // 2. Click "Save as Template"
      // 3. Verify modal opens with name, description, category fields
      // 4. Verify settings preview shows correct captured values
      // 5. Enter template name "Weekly Review"
      // 6. Select category "Work"
      // 7. Click "Save Template"
      // 8. Verify modal closes
      // 9. Verify template appears in template dropdown
    });

    test('should prevent saving template with empty name', async ({ page }) => {
      // 1. Fill in todo form with title
      // 2. Click "Save as Template"
      // 3. Leave name field empty
      // 4. Verify "Save Template" button is disabled
    });

    test('should save template with subtasks included', async ({ page }) => {
      // 1. Create a todo with subtasks
      // 2. Fill in todo form (or capture current subtask state)
      // 3. Save as template with subtasks
      // 4. Open template manager
      // 5. Verify subtask count badge is shown
    });
  });

  test.describe('Using Templates', () => {

    test('should create todo from template via dropdown', async ({ page }) => {
      // 1. Create a template (via API or UI) with name="Test Template", priority=high
      // 2. Select template from "Use Template" dropdown
      // 3. Verify a new todo appears in the list with correct title and priority
    });

    test('should create todo from template via Template Manager', async ({ page }) => {
      // 1. Create a template
      // 2. Click "Templates" button
      // 3. Verify template details are shown (name, priority badge, etc.)
      // 4. Click "Use" button
      // 5. Verify modal closes
      // 6. Verify new todo appears in list
    });

    test('should calculate due date from offset hours', async ({ page }) => {
      // 1. Create template with due_date_offset_hours=24
      // 2. Use the template
      // 3. Verify the created todo has a due date approximately 24 hours from now
    });

    test('should create subtasks when using template with subtasks_json', async ({ page }) => {
      // 1. Create template with subtasks_json containing 3 subtasks
      // 2. Use the template
      // 3. Expand subtasks on the created todo
      // 4. Verify all 3 subtasks are present with correct titles and order
    });

    test('should create recurring todo from template', async ({ page }) => {
      // 1. Create template with is_recurring=1, recurrence_pattern="daily"
      // 2. Use the template
      // 3. Verify created todo shows recurrence badge (🔄 daily)
    });
  });

  test.describe('Managing Templates', () => {

    test('should display all templates in Template Manager', async ({ page }) => {
      // 1. Create 3 templates with different categories
      // 2. Open Template Manager
      // 3. Verify all 3 templates are listed
      // 4. Verify each shows correct name, category badge, priority badge
    });

    test('should show empty state when no templates exist', async ({ page }) => {
      // 1. Open Template Manager with no templates
      // 2. Verify empty state message is displayed
    });

    test('should delete a template without affecting existing todos', async ({ page }) => {
      // 1. Create a template
      // 2. Use the template to create a todo
      // 3. Verify todo exists in list
      // 4. Delete the template
      // 5. Verify template is removed from Template Manager
      // 6. Verify the todo created from template still exists
    });

    test('should show confirmation dialog before deleting', async ({ page }) => {
      // 1. Create a template
      // 2. Open Template Manager
      // 3. Click "Delete" on the template
      // 4. Verify confirmation dialog appears
      // 5. Cancel → template still exists
      // 6. Confirm → template is deleted
    });
  });

  test.describe('Template Details Display', () => {

    test('should display category badge on template card', async ({ page }) => {
      // 1. Create template with category="Work"
      // 2. Open Template Manager
      // 3. Verify "Work" badge is visible
    });

    test('should display priority badge with correct color', async ({ page }) => {
      // 1. Create template with priority="high"
      // 2. Open Template Manager
      // 3. Verify red-styled priority badge showing "high"
    });

    test('should display recurrence indicator', async ({ page }) => {
      // 1. Create template with is_recurring=1, recurrence_pattern="weekly"
      // 2. Open Template Manager
      // 3. Verify 🔄 badge with "weekly" text
    });

    test('should display reminder indicator', async ({ page }) => {
      // 1. Create template with reminder_minutes=60
      // 2. Open Template Manager
      // 3. Verify 🔔 badge with "1h" text
    });

    test('should display subtasks count badge', async ({ page }) => {
      // 1. Create template with 3 subtasks in subtasks_json
      // 2. Open Template Manager
      // 3. Verify 📋 badge with "3 subtasks" text
    });
  });

  test.describe('Edge Cases', () => {

    test('should handle using a template that was just deleted', async ({ page }) => {
      // 1. Create a template
      // 2. Open template manager in two views (or simulate stale data)
      // 3. Delete the template via one path
      // 4. Attempt to use via the other
      // 5. Verify graceful error handling (404 message)
    });

    test('should allow duplicate template names', async ({ page }) => {
      // 1. Create template with name="My Template"
      // 2. Create another template with same name "My Template"
      // 3. Both should appear in Template Manager
      // 4. Both should be independently usable and deletable
    });
  });

  test.describe('Authentication', () => {

    test('should return 401 for unauthenticated template API access', async ({ request }) => {
      // 1. Call GET /api/templates without session
      // 2. Verify 401 response
      // 3. Call POST /api/templates without session
      // 4. Verify 401 response
    });
  });
});
```

### Unit Tests

Test scenarios for business logic (can be tested via API integration tests or isolated function tests):

1. **Subtasks JSON serialization**:
   - Valid array `[{title: "A", position: 1}]` → serializes and deserializes correctly
   - Empty array `[]` → valid, creates no subtasks
   - Invalid JSON string → rejected with 400
   - Array with missing `title` property → rejected with 400
   - Array with non-number `position` → rejected with 400

2. **Due date offset calculation**:
   - `offset_hours = 24` → due date is approximately 24 hours from Singapore now
   - `offset_hours = null` → no due date set on created todo
   - `offset_hours = 0` → no due date set on created todo
   - `offset_hours = 1` → due date is 1 hour from now (Singapore timezone)

3. **Template ownership validation**:
   - User A creates template → User B cannot GET/PUT/DELETE/USE it
   - User A creates template → User A can perform all operations

4. **Template field mapping to todo**:
   - Template `name` → todo `title`
   - Template `priority` → todo `priority`
   - Template `is_recurring` + `recurrence_pattern` → todo recurrence fields
   - Template `reminder_minutes` → todo `reminder_minutes`
   - Template `description` and `category` are NOT copied to todo

5. **Input validation**:
   - Empty name → 400 error
   - Whitespace-only name → 400 error
   - Invalid priority ("urgent") → 400 error
   - Invalid recurrence pattern ("biweekly") → 400 error

## Out of Scope

The following are explicitly **NOT** part of Feature 07:

1. **Tag preservation in templates**: Templates do not store or apply tags. Tags are selected by the user at todo creation time.
2. **Template editing UI**: There is no inline edit form for templates in the Template Manager modal. Templates can only be updated via the `PUT` API endpoint (future feature).
3. **Template sharing between users**: Templates are strictly user-scoped. No sharing or public template library.
4. **Template import/export**: Templates are not included in the JSON export/import system (Feature 09).
5. **Template versioning**: No version history or undo for template modifications.
6. **Template ordering/sorting**: Templates are always ordered by `created_at DESC` (newest first). No custom ordering.
7. **Template search/filter**: No search bar or category filter in the Template Manager modal.
8. **Due date offset UI**: The `due_date_offset_hours` field is set programmatically or via direct API. No dedicated UI picker is included for this value in the Save Template modal.
9. **Batch template operations**: No bulk delete or bulk use functionality.

## Success Metrics

1. **Template creation rate**: Users can save a template in under 10 seconds from the "Save as Template" button click to completion.
2. **Template usage rate**: Creating a todo from a template takes 2 clicks or fewer (dropdown select = 1 action, or manager "Use" button = 2 actions).
3. **Subtask accuracy**: 100% of subtasks defined in a template's `subtasks_json` are correctly created when the template is used.
4. **Due date accuracy**: Due dates calculated from `due_date_offset_hours` are within ±1 minute of the expected time (accounting for processing delay).
5. **Data integrity**: Deleting a template has zero impact on existing todos — verified by checking todo count before and after template deletion.
6. **API response time**: All template API endpoints respond in under 200ms for a user with up to 50 templates.
7. **Zero authentication bypass**: All template endpoints reject unauthenticated requests with 401.
