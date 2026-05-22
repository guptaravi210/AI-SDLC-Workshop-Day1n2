# Feature 08: Search & Filtering

## Feature Overview

Search & Filtering provides real-time, client-side search and multi-criteria filtering for the todo list. Users can instantly find specific todos by typing in a search box, narrow results by priority or tag, and use advanced filters for completion status and date ranges. Filter combinations can be saved as named presets in `localStorage` for reuse. All filtering logic runs entirely on the client to ensure instant responsiveness — no API calls are made when filters change.

**Dependencies**: Feature 01 (Todo CRUD), Feature 02 (Priority System), Feature 05 (Subtasks), Feature 06 (Tag System)

---

## User Stories

1. **As a user**, I want to search todos by title so that I can quickly find specific tasks among many.
2. **As a user**, I want my search to also match subtask titles so that I don't miss tasks where the detail is in the subtask.
3. **As a user**, I want to filter by priority so that I can focus on high-importance tasks first.
4. **As a user**, I want to filter by tag so that I can view only tasks in a specific category.
5. **As a user**, I want to combine search text, priority, and tag filters so that I can get precise results.
6. **As a user**, I want advanced filters (completion status, date range) so that I can create complex queries.
7. **As a user**, I want to save filter combinations I use frequently so that I don't have to re-set them each time.
8. **As a user**, I want to clear all filters with one click so that I can reset to the full list instantly.
9. **As a user**, I want to see how many todos match in each section so that I know the scope of my filtered results.
10. **As a user**, I want sections to auto-hide when filtering produces zero results in them so the UI stays clean.

---

## User Flow

### Basic Search
1. User sees a full-width search input below the "Add Todo" form, with a 🔍 icon on the left.
2. User types a query (e.g., "proj").
3. After a 300ms debounce pause, the todo list updates to show only todos whose title **or** subtask titles contain "proj" (case-insensitive, partial match).
4. A ✕ clear button appears in the search input when text is present.
5. User clicks ✕ — search clears and full list is restored.

### Priority Filter
6. User clicks the "Priority" dropdown (default: "All Priorities").
7. User selects "High".
8. Only todos with `priority = 'high'` are shown (AND with any active search text).

### Tag Filter
9. If the user has created tags, a "Tag" dropdown appears (default: "All Tags").
10. User selects a tag name (e.g., "work").
11. Only todos associated with the "work" tag are shown.

### Advanced Filters
12. User clicks the **"Advanced"** button to expand the advanced filter panel.
13. Panel reveals:
    - **Completion Status** dropdown: All Todos | Incomplete Only | Completed Only
    - **Due Date From** date input
    - **Due Date To** date input
    - **Save Filter** button (green)
    - **Saved Presets** dropdown (if any presets exist)
14. User sets "Incomplete Only" and a date range, then clicks **"Save Filter"**.
15. A prompt asks for a preset name (e.g., "This Week Pending").
16. Preset is saved to `localStorage`.

### Filter Summary & Clear
17. When any filter is active, a summary bar appears: e.g., `Filters active: search "proj" · Priority: High · Tag: work`.
18. A red **"Clear All"** button appears next to the summary.
19. User clicks "Clear All" — all filters reset, full list restored.

### Section Counts & Auto-Hide
20. Section headers update: "Overdue (2)", "Pending (5)", "Completed (1)".
21. If a section has 0 matching todos after filtering, the entire section (header + list) is hidden.

---

## Technical Requirements

### Database Schema

No database changes required. Search & filtering is entirely client-side, operating on the todo data already fetched via `GET /api/todos`.

The existing `Todo` interface from `lib/db.ts` provides all necessary fields:

```typescript
// Already defined in lib/db.ts
interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: number; // 0 or 1
  created_at: string;
  due_date: string | null;
  priority: 'high' | 'medium' | 'low';
  recurrence_pattern: string | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
}

// Subtasks already fetched with todos
interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: number;
  position: number;
}

// Tags already associated with todos
interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string;
}
```

### Type Definitions

Add these types in `app/page.tsx` (inside the client component, since filtering is client-only):

```typescript
// ─── Filter State Types ────────────────────────────────────────────
type CompletionFilter = 'all' | 'incomplete' | 'completed';

interface FilterState {
  searchQuery: string;          // raw input value (not debounced)
  debouncedQuery: string;       // debounced search string used for actual filtering
  priority: 'all' | 'high' | 'medium' | 'low';
  tagId: 'all' | number;       // 'all' or a specific tag ID
  completion: CompletionFilter;
  dueDateFrom: string;          // ISO date string 'YYYY-MM-DD' or ''
  dueDateTo: string;            // ISO date string 'YYYY-MM-DD' or ''
}

interface FilterPreset {
  id: string;                   // crypto.randomUUID()
  name: string;                 // user-provided name
  createdAt: string;            // ISO timestamp (Singapore time)
  filters: Omit<FilterState, 'searchQuery' | 'debouncedQuery'>; // presets don't save search text
}

// Default/initial filter state
const DEFAULT_FILTERS: FilterState = {
  searchQuery: '',
  debouncedQuery: '',
  priority: 'all',
  tagId: 'all',
  completion: 'all',
  dueDateFrom: '',
  dueDateTo: '',
};
```

### API Endpoints

**No new API endpoints required.** All filtering is client-side using already-fetched data from:

| Existing Endpoint | Data Used For |
|---|---|
| `GET /api/todos` | Todo list with subtasks |
| `GET /api/tags` | Tag list for filter dropdown |
| `GET /api/todos/[id]/tags` | Tags associated with each todo |

### Business Logic

#### 1. Debounce Implementation

Implement a `useDebounce` custom hook in `app/page.tsx`:

```typescript
function useDebounce<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}

// Usage in component:
const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
const debouncedSearchQuery = useDebounce(filters.searchQuery, 300);

// Update debouncedQuery in filter state when debounced value changes
useEffect(() => {
  setFilters(prev => ({ ...prev, debouncedQuery: debouncedSearchQuery }));
}, [debouncedSearchQuery]);
```

#### 2. Core Filter Logic

The `filterTodos` function applies all active filters using AND logic. Each filter must pass for a todo to be included:

```typescript
function filterTodos(
  todos: TodoWithDetails[],
  filters: FilterState,
  todoTagsMap: Map<number, Tag[]>  // map of todoId → associated tags
): TodoWithDetails[] {
  return todos.filter(todo => {
    // 1. Search query filter (matches todo title OR any subtask title)
    if (filters.debouncedQuery.trim() !== '') {
      const query = filters.debouncedQuery.toLowerCase().trim();
      const titleMatch = todo.title.toLowerCase().includes(query);
      const subtaskMatch = (todo.subtasks ?? []).some(
        (st: Subtask) => st.title.toLowerCase().includes(query)
      );
      if (!titleMatch && !subtaskMatch) return false;
    }

    // 2. Priority filter
    if (filters.priority !== 'all' && todo.priority !== filters.priority) {
      return false;
    }

    // 3. Tag filter
    if (filters.tagId !== 'all') {
      const todoTags = todoTagsMap.get(todo.id) ?? [];
      const hasTag = todoTags.some(tag => tag.id === filters.tagId);
      if (!hasTag) return false;
    }

    // 4. Completion status filter
    if (filters.completion === 'incomplete' && todo.completed === 1) return false;
    if (filters.completion === 'completed' && todo.completed === 0) return false;

    // 5. Due date range filter
    if (filters.dueDateFrom && todo.due_date) {
      if (todo.due_date < filters.dueDateFrom) return false;
    }
    if (filters.dueDateFrom && !todo.due_date) {
      return false; // Exclude todos without due date when date range is set
    }
    if (filters.dueDateTo && todo.due_date) {
      if (todo.due_date > filters.dueDateTo + 'T23:59:59') return false;
    }
    if (filters.dueDateTo && !todo.due_date) {
      return false; // Exclude todos without due date when date range is set
    }

    return true;
  });
}
```

#### 3. Active Filter Detection

```typescript
function isAnyFilterActive(filters: FilterState): boolean {
  return (
    filters.debouncedQuery.trim() !== '' ||
    filters.priority !== 'all' ||
    filters.tagId !== 'all' ||
    filters.completion !== 'all' ||
    filters.dueDateFrom !== '' ||
    filters.dueDateTo !== ''
  );
}
```

#### 4. Section Counting After Filtering

```typescript
function categorizeFilteredTodos(filteredTodos: TodoWithDetails[]) {
  const now = getSingaporeNow().toISOString();

  const overdue = filteredTodos.filter(
    t => t.completed === 0 && t.due_date && t.due_date < now
  );
  const pending = filteredTodos.filter(
    t => t.completed === 0 && (!t.due_date || t.due_date >= now)
  );
  const completed = filteredTodos.filter(t => t.completed === 1);

  return {
    overdue:   { todos: overdue,   count: overdue.length },
    pending:   { todos: pending,   count: pending.length },
    completed: { todos: completed, count: completed.length },
  };
}
```

#### 5. Preset Management (localStorage)

```typescript
const PRESETS_STORAGE_KEY = 'todo-filter-presets';

function loadPresets(): FilterPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function savePresets(presets: FilterPreset[]): void {
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

function createPreset(name: string, filters: FilterState): FilterPreset {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    createdAt: getSingaporeNow().toISOString(),
    filters: {
      priority: filters.priority,
      tagId: filters.tagId,
      completion: filters.completion,
      dueDateFrom: filters.dueDateFrom,
      dueDateTo: filters.dueDateTo,
    },
  };
}

function applyPreset(preset: FilterPreset, setFilters: React.Dispatch<React.SetStateAction<FilterState>>): void {
  setFilters(prev => ({
    ...prev,
    priority: preset.filters.priority,
    tagId: preset.filters.tagId,
    completion: preset.filters.completion,
    dueDateFrom: preset.filters.dueDateFrom,
    dueDateTo: preset.filters.dueDateTo,
    // preserve current searchQuery — presets don't override search text
  }));
}

function deletePreset(presetId: string): void {
  const presets = loadPresets();
  savePresets(presets.filter(p => p.id !== presetId));
}
```

---

## UI Components

### 1. Search Input Bar

Positioned below the "Add Todo" form, full-width:

```tsx
{/* ── Search Bar ─────────────────────────────────── */}
<div className="relative mb-4">
  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg pointer-events-none">
    🔍
  </span>
  <input
    type="text"
    value={filters.searchQuery}
    onChange={(e) => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
    placeholder="Search todos and subtasks..."
    className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg
               focus:ring-2 focus:ring-blue-500 focus:border-blue-500
               text-sm bg-white dark:bg-gray-800 dark:border-gray-600
               dark:text-white placeholder-gray-400"
    maxLength={200}
    aria-label="Search todos"
  />
  {filters.searchQuery && (
    <button
      onClick={() => setFilters(prev => ({ ...prev, searchQuery: '' }))}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400
                 hover:text-gray-600 dark:hover:text-gray-300 text-lg
                 focus:outline-none cursor-pointer"
      aria-label="Clear search"
      title="Clear search"
    >
      ✕
    </button>
  )}
</div>
```

### 2. Filter Bar (Priority + Tag + Advanced Toggle)

Rendered directly below the search input:

```tsx
{/* ── Filter Bar ────────────────────────────────── */}
<div className="flex flex-wrap items-center gap-3 mb-4">
  {/* Priority Dropdown */}
  <select
    value={filters.priority}
    onChange={(e) => setFilters(prev => ({
      ...prev,
      priority: e.target.value as FilterState['priority']
    }))}
    className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white
               dark:bg-gray-800 dark:border-gray-600 dark:text-white
               focus:ring-2 focus:ring-blue-500 cursor-pointer"
    aria-label="Filter by priority"
  >
    <option value="all">All Priorities</option>
    <option value="high">🔴 High</option>
    <option value="medium">🟡 Medium</option>
    <option value="low">🟢 Low</option>
  </select>

  {/* Tag Dropdown — only shown if user has tags */}
  {tags.length > 0 && (
    <select
      value={filters.tagId}
      onChange={(e) => setFilters(prev => ({
        ...prev,
        tagId: e.target.value === 'all' ? 'all' : Number(e.target.value)
      }))}
      className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white
                 dark:bg-gray-800 dark:border-gray-600 dark:text-white
                 focus:ring-2 focus:ring-blue-500 cursor-pointer"
      aria-label="Filter by tag"
    >
      <option value="all">All Tags</option>
      {tags.map(tag => (
        <option key={tag.id} value={tag.id}>
          {tag.name}
        </option>
      ))}
    </select>
  )}

  {/* Advanced Toggle Button */}
  <button
    onClick={() => setShowAdvancedFilters(prev => !prev)}
    className={`px-3 py-2 text-sm rounded-lg border transition-colors cursor-pointer ${
      showAdvancedFilters
        ? 'bg-blue-100 border-blue-400 text-blue-700 dark:bg-blue-900 dark:border-blue-600 dark:text-blue-300'
        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300'
    }`}
    aria-expanded={showAdvancedFilters}
    aria-controls="advanced-filters-panel"
  >
    Advanced {showAdvancedFilters ? '▲' : '▼'}
  </button>
</div>
```

### 3. Advanced Filters Panel

Conditionally rendered when `showAdvancedFilters` is `true`:

```tsx
{/* ── Advanced Filters Panel ────────────────────── */}
{showAdvancedFilters && (
  <div
    id="advanced-filters-panel"
    className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200
               dark:border-gray-700 rounded-lg space-y-4"
  >
    <div className="flex flex-wrap items-end gap-4">
      {/* Completion Status */}
      <div className="flex flex-col">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          Status
        </label>
        <select
          value={filters.completion}
          onChange={(e) => setFilters(prev => ({
            ...prev,
            completion: e.target.value as CompletionFilter
          }))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white
                     dark:bg-gray-700 dark:border-gray-600 dark:text-white
                     focus:ring-2 focus:ring-blue-500 cursor-pointer"
          aria-label="Filter by completion status"
        >
          <option value="all">All Todos</option>
          <option value="incomplete">Incomplete Only</option>
          <option value="completed">Completed Only</option>
        </select>
      </div>

      {/* Due Date From */}
      <div className="flex flex-col">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          Due Date From
        </label>
        <input
          type="date"
          value={filters.dueDateFrom}
          onChange={(e) => setFilters(prev => ({ ...prev, dueDateFrom: e.target.value }))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white
                     dark:bg-gray-700 dark:border-gray-600 dark:text-white
                     focus:ring-2 focus:ring-blue-500"
          aria-label="Due date from"
        />
      </div>

      {/* Due Date To */}
      <div className="flex flex-col">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          Due Date To
        </label>
        <input
          type="date"
          value={filters.dueDateTo}
          onChange={(e) => setFilters(prev => ({ ...prev, dueDateTo: e.target.value }))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white
                     dark:bg-gray-700 dark:border-gray-600 dark:text-white
                     focus:ring-2 focus:ring-blue-500"
          aria-label="Due date to"
        />
      </div>
    </div>

    {/* Preset Actions Row */}
    <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
      {/* Save Filter Button */}
      <button
        onClick={handleSavePreset}
        disabled={!isAnyFilterActive(filters)}
        className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg
                   hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors cursor-pointer"
      >
        💾 Save Filter
      </button>

      {/* Saved Presets Dropdown */}
      {presets.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value=""
            onChange={(e) => {
              const preset = presets.find(p => p.id === e.target.value);
              if (preset) applyPreset(preset, setFilters);
            }}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white
                       dark:bg-gray-700 dark:border-gray-600 dark:text-white
                       focus:ring-2 focus:ring-blue-500 cursor-pointer"
            aria-label="Load saved filter preset"
          >
            <option value="" disabled>Load Preset…</option>
            {presets.map(preset => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => handleDeletePreset(selectedPresetId)}
            className="px-2 py-1.5 text-sm text-red-600 hover:text-red-800
                       dark:text-red-400 dark:hover:text-red-300 cursor-pointer"
            title="Delete selected preset"
            aria-label="Delete preset"
          >
            🗑️
          </button>
        </div>
      )}
    </div>
  </div>
)}
```

### 4. Filter Summary Bar

Displayed when any filter is active:

```tsx
{/* ── Filter Summary ────────────────────────────── */}
{isAnyFilterActive(filters) && (
  <div className="flex items-center justify-between mb-4 px-3 py-2 bg-blue-50
                  dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800
                  rounded-lg text-sm">
    <div className="flex flex-wrap items-center gap-1 text-blue-700 dark:text-blue-300">
      <span className="font-medium">Filters active:</span>
      {filters.debouncedQuery && (
        <span className="bg-blue-100 dark:bg-blue-800 px-2 py-0.5 rounded">
          search &quot;{filters.debouncedQuery}&quot;
        </span>
      )}
      {filters.priority !== 'all' && (
        <span className="bg-blue-100 dark:bg-blue-800 px-2 py-0.5 rounded">
          Priority: {filters.priority}
        </span>
      )}
      {filters.tagId !== 'all' && (
        <span className="bg-blue-100 dark:bg-blue-800 px-2 py-0.5 rounded">
          Tag: {tags.find(t => t.id === filters.tagId)?.name ?? 'Unknown'}
        </span>
      )}
      {filters.completion !== 'all' && (
        <span className="bg-blue-100 dark:bg-blue-800 px-2 py-0.5 rounded">
          Status: {filters.completion}
        </span>
      )}
      {filters.dueDateFrom && (
        <span className="bg-blue-100 dark:bg-blue-800 px-2 py-0.5 rounded">
          From: {filters.dueDateFrom}
        </span>
      )}
      {filters.dueDateTo && (
        <span className="bg-blue-100 dark:bg-blue-800 px-2 py-0.5 rounded">
          To: {filters.dueDateTo}
        </span>
      )}
    </div>
    <button
      onClick={() => setFilters({ ...DEFAULT_FILTERS })}
      className="ml-3 px-3 py-1 text-sm bg-red-600 text-white rounded-lg
                 hover:bg-red-700 transition-colors whitespace-nowrap cursor-pointer"
    >
      ✕ Clear All
    </button>
  </div>
)}
```

### 5. Section Headers with Counts

```tsx
{/* ── Section Header with Count ─────────────────── */}
{sections.overdue.count > 0 && (
  <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
    ⚠️ Overdue ({sections.overdue.count})
  </h2>
  {/* Render sections.overdue.todos */}
)}

{sections.pending.count > 0 && (
  <h2 className="text-lg font-semibold text-yellow-600 dark:text-yellow-400 mb-2">
    📋 Pending ({sections.pending.count})
  </h2>
  {/* Render sections.pending.todos */}
)}

{sections.completed.count > 0 && (
  <h2 className="text-lg font-semibold text-green-600 dark:text-green-400 mb-2">
    ✅ Completed ({sections.completed.count})
  </h2>
  {/* Render sections.completed.todos */}
)}
```

### 6. Empty State (No Results)

```tsx
{/* ── No Results State ──────────────────────────── */}
{isAnyFilterActive(filters) && filteredTodos.length === 0 && (
  <div className="text-center py-12">
    <div className="text-5xl mb-4">🔍</div>
    <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">
      No todos match your filters
    </h3>
    <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
      Try adjusting your search or filter criteria.
    </p>
    <button
      onClick={() => setFilters({ ...DEFAULT_FILTERS })}
      className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg
                 hover:bg-blue-700 transition-colors cursor-pointer"
    >
      Clear All Filters
    </button>
  </div>
)}
```

### 7. Save Preset Handler

```tsx
function handleSavePreset(): void {
  const name = prompt('Enter a name for this filter preset:');
  if (!name || !name.trim()) return;

  const trimmedName = name.trim();

  // Check for duplicate name
  const existingPresets = loadPresets();
  if (existingPresets.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
    const overwrite = confirm(
      `A preset named "${trimmedName}" already exists. Do you want to replace it?`
    );
    if (!overwrite) return;
    // Remove old preset with same name
    const filtered = existingPresets.filter(
      p => p.name.toLowerCase() !== trimmedName.toLowerCase()
    );
    const newPreset = createPreset(trimmedName, filters);
    savePresets([...filtered, newPreset]);
  } else {
    const newPreset = createPreset(trimmedName, filters);
    savePresets([...existingPresets, newPreset]);
  }

  // Refresh presets state
  setPresets(loadPresets());
}

function handleDeletePreset(presetId: string): void {
  if (!confirm('Delete this saved filter preset?')) return;
  deletePreset(presetId);
  setPresets(loadPresets());
}
```

### 8. Component State Integration

All state declarations needed in `app/page.tsx`:

```tsx
// ── Filter State ──────────────────────────────────
const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
const [presets, setPresets] = useState<FilterPreset[]>([]);

// ── Debounce Hook ──────────────────────────────────
const debouncedSearchQuery = useDebounce(filters.searchQuery, 300);

// Sync debounced query into filter state
useEffect(() => {
  setFilters(prev => ({ ...prev, debouncedQuery: debouncedSearchQuery }));
}, [debouncedSearchQuery]);

// Load presets on mount
useEffect(() => {
  setPresets(loadPresets());
}, []);

// ── Compute filtered todos ─────────────────────────
const filteredTodos = useMemo(
  () => filterTodos(todos, filters, todoTagsMap),
  [todos, filters, todoTagsMap]
);

const sections = useMemo(
  () => categorizeFilteredTodos(filteredTodos),
  [filteredTodos]
);

const filtersActive = isAnyFilterActive(filters);
```

---

## Edge Cases

1. **Search with special characters**: User types `"test (1)"` or `<script>` — the search uses `String.includes()`, not regex, so special characters are treated as literal text. No escaping needed. HTML in the search field is safely handled by React's built-in XSS prevention (rendered as text, not HTML).

2. **Very long search query**: The input has `maxLength={200}` to prevent excessive input. The debounce ensures filtering only runs after the user pauses typing, avoiding per-keystroke computation on large datasets.

3. **Conflicting filters returning no results**: e.g., Priority "High" + Tag "personal" when no high-priority todos have the "personal" tag. The empty state component is shown with a "Clear All Filters" call to action. Section counts show (0) and sections auto-hide.

4. **Preset name collision**: If a user saves a preset with a name that already exists (case-insensitive comparison), they are prompted with a confirmation dialog to overwrite. If they decline, the save is cancelled.

5. **Maximum presets limit**: Cap at 20 saved presets. When the limit is reached, show an alert: `"Maximum of 20 saved presets reached. Please delete an existing preset first."` This prevents unbounded localStorage growth.

6. **Tag deleted after preset saved**: If a preset references a `tagId` that no longer exists (tag was deleted), when the preset is applied, the tag dropdown will show "All Tags" since the tag ID won't match any existing tag. The filter still applies, but yields no matches on the tag criterion — effectively filtering out everything. Display a toast/alert: `"Tag in preset no longer exists. Tag filter has been reset."` and reset `tagId` to `'all'`.

7. **Empty tag list**: The tag filter dropdown is completely hidden when `tags.length === 0`. No empty dropdown is rendered.

8. **Due date range where From > To**: Validate on change — if `dueDateFrom > dueDateTo` and both are set, show inline warning text: `"'From' date must be before 'To' date"` and skip the date range filter (treat both as empty) until corrected.

9. **Subtasks not yet loaded**: If subtasks for a todo haven't been fetched yet (subtasks array is undefined/null), the search should still match on the todo title. Use `(todo.subtasks ?? [])` to safely handle missing subtasks.

10. **Browser without `crypto.randomUUID()`**: Provide a fallback using `Date.now().toString(36) + Math.random().toString(36).slice(2)` for older browsers, though modern browsers all support it.

11. **localStorage not available**: Wrap all localStorage operations in try-catch. If localStorage is unavailable (private browsing in some browsers), presets silently fail to persist and the preset features degrade gracefully (dropdown is empty, save does nothing harmful).

12. **Rapid filter changes**: The `useMemo` hook ensures `filterTodos` only recomputes when `todos`, `filters`, or `todoTagsMap` actually change. React's batched state updates prevent unnecessary intermediate renders.

---

## Acceptance Criteria

### Search
- [ ] Search input appears below the "Add Todo" form, full-width, with 🔍 icon and placeholder "Search todos and subtasks..."
- [ ] Typing in search input shows ✕ clear button
- [ ] Clicking ✕ clears the search text and restores full list
- [ ] Search is debounced at 300ms (no filtering until user pauses)
- [ ] Search is case-insensitive ("PROJ" matches "project")
- [ ] Search supports partial matches ("proj" matches "project plan")
- [ ] Search matches todo titles
- [ ] Search matches subtask titles (a todo shows if any of its subtask titles match)
- [ ] Search input has `maxLength={200}`

### Priority Filter
- [ ] Priority dropdown shows: All Priorities, 🔴 High, 🟡 Medium, 🟢 Low
- [ ] Selecting a priority filters the list immediately
- [ ] Priority filter combines with search using AND logic

### Tag Filter
- [ ] Tag dropdown is hidden when the user has no tags
- [ ] Tag dropdown shows "All Tags" plus all user tags by name
- [ ] Selecting a tag filters to only todos associated with that tag
- [ ] Tag filter combines with other filters using AND logic

### Advanced Filters
- [ ] "Advanced" button toggles the advanced filter panel open/closed
- [ ] Advanced button visual changes when panel is open (highlighted style)
- [ ] Completion status dropdown: All Todos, Incomplete Only, Completed Only
- [ ] Due Date From input filters todos with `due_date >= value`
- [ ] Due Date To input filters todos with `due_date <= value + end of day`
- [ ] When date range is set, todos without a due date are excluded
- [ ] Invalid date range (From > To) shows inline warning

### Filter Presets
- [ ] "Save Filter" button is disabled when no filters are active
- [ ] Clicking "Save Filter" prompts for a preset name
- [ ] Empty preset name is rejected (nothing happens)
- [ ] Duplicate preset name (case-insensitive) prompts for overwrite confirmation
- [ ] Preset is saved to localStorage under key `todo-filter-presets`
- [ ] Saved presets appear in "Load Preset…" dropdown
- [ ] Selecting a preset applies its filters (priority, tag, completion, date range — not search text)
- [ ] Delete button removes preset from localStorage after confirmation
- [ ] Maximum of 20 presets enforced

### Filter Summary & Clear
- [ ] Filter summary bar appears when any filter is active
- [ ] Summary displays each active filter as a labeled badge
- [ ] Red "Clear All" button resets all filters to defaults
- [ ] After clearing, filter summary bar disappears

### Section Behavior
- [ ] Section headers show filtered count: "Overdue (X)", "Pending (X)", "Completed (X)"
- [ ] Sections with 0 matching todos are completely hidden (header + list)
- [ ] When all sections are empty, the empty state message is shown

### Empty State
- [ ] Empty state shows 🔍 icon, "No todos match your filters" heading, and descriptive text
- [ ] Empty state includes a "Clear All Filters" button
- [ ] Clicking "Clear All Filters" in empty state resets all filters

### Performance
- [ ] All filtering is client-side (no API calls when filters change)
- [ ] Filtering uses `useMemo` to avoid unnecessary recomputation
- [ ] Debounce prevents excessive filtering during rapid typing

---

## Testing Requirements

### E2E Tests (Playwright)

File: `tests/08-search-filtering.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { TodoHelper } from './helpers';

test.describe('Feature 08: Search & Filtering', () => {
  let helper: TodoHelper;

  test.beforeEach(async ({ page }) => {
    helper = new TodoHelper(page);
    await helper.registerAndLogin();

    // Seed test data
    await helper.createTodo('Buy groceries', { priority: 'high' });
    await helper.createTodo('Project meeting notes', { priority: 'medium' });
    await helper.createTodo('Read Playwright docs', { priority: 'low' });
    await helper.createTodo('Weekly report', { priority: 'high' });
  });

  test.describe('Search', () => {
    test('should filter todos by title as user types', async ({ page }) => {
      const searchInput = page.getByPlaceholder('Search todos and subtasks...');
      await searchInput.fill('project');

      // Wait for debounce (300ms + buffer)
      await page.waitForTimeout(500);

      // Only "Project meeting notes" should be visible
      await expect(page.getByText('Project meeting notes')).toBeVisible();
      await expect(page.getByText('Buy groceries')).not.toBeVisible();
      await expect(page.getByText('Read Playwright docs')).not.toBeVisible();
    });

    test('should be case-insensitive', async ({ page }) => {
      const searchInput = page.getByPlaceholder('Search todos and subtasks...');
      await searchInput.fill('PROJECT');
      await page.waitForTimeout(500);

      await expect(page.getByText('Project meeting notes')).toBeVisible();
    });

    test('should support partial matches', async ({ page }) => {
      const searchInput = page.getByPlaceholder('Search todos and subtasks...');
      await searchInput.fill('proj');
      await page.waitForTimeout(500);

      await expect(page.getByText('Project meeting notes')).toBeVisible();
    });

    test('should match subtask titles', async ({ page }) => {
      // Add a subtask to "Buy groceries"
      await helper.addSubtask('Buy groceries', 'Pick up milk at store');

      const searchInput = page.getByPlaceholder('Search todos and subtasks...');
      await searchInput.fill('milk');
      await page.waitForTimeout(500);

      // "Buy groceries" should appear because its subtask matches
      await expect(page.getByText('Buy groceries')).toBeVisible();
    });

    test('should show clear button and clear on click', async ({ page }) => {
      const searchInput = page.getByPlaceholder('Search todos and subtasks...');
      await searchInput.fill('groceries');
      await page.waitForTimeout(500);

      // Clear button should be visible
      const clearButton = page.getByLabel('Clear search');
      await expect(clearButton).toBeVisible();

      await clearButton.click();

      // All todos should be visible again
      await expect(searchInput).toHaveValue('');
      await expect(page.getByText('Buy groceries')).toBeVisible();
      await expect(page.getByText('Project meeting notes')).toBeVisible();
    });

    test('should show empty state for no matches', async ({ page }) => {
      const searchInput = page.getByPlaceholder('Search todos and subtasks...');
      await searchInput.fill('zzzznonexistent');
      await page.waitForTimeout(500);

      await expect(page.getByText('No todos match your filters')).toBeVisible();
    });

    test('should handle special characters in search', async ({ page }) => {
      await helper.createTodo('Fix bug (critical)');
      const searchInput = page.getByPlaceholder('Search todos and subtasks...');
      await searchInput.fill('(critical)');
      await page.waitForTimeout(500);

      await expect(page.getByText('Fix bug (critical)')).toBeVisible();
    });
  });

  test.describe('Priority Filter', () => {
    test('should filter by high priority', async ({ page }) => {
      await page.getByLabel('Filter by priority').selectOption('high');

      await expect(page.getByText('Buy groceries')).toBeVisible();
      await expect(page.getByText('Weekly report')).toBeVisible();
      await expect(page.getByText('Project meeting notes')).not.toBeVisible();
      await expect(page.getByText('Read Playwright docs')).not.toBeVisible();
    });

    test('should combine priority filter with search', async ({ page }) => {
      await page.getByLabel('Filter by priority').selectOption('high');

      const searchInput = page.getByPlaceholder('Search todos and subtasks...');
      await searchInput.fill('weekly');
      await page.waitForTimeout(500);

      // Only "Weekly report" is high priority AND matches "weekly"
      await expect(page.getByText('Weekly report')).toBeVisible();
      await expect(page.getByText('Buy groceries')).not.toBeVisible();
    });
  });

  test.describe('Tag Filter', () => {
    test('should hide tag dropdown when no tags exist', async ({ page }) => {
      // Before creating tags, dropdown should not exist
      await expect(page.getByLabel('Filter by tag')).not.toBeVisible();
    });

    test('should filter by tag', async ({ page }) => {
      // Create a tag and assign it
      await helper.createTag('work', '#3B82F6');
      await helper.assignTag('Buy groceries', 'work');

      await page.getByLabel('Filter by tag').selectOption({ label: 'work' });

      await expect(page.getByText('Buy groceries')).toBeVisible();
      await expect(page.getByText('Project meeting notes')).not.toBeVisible();
    });
  });

  test.describe('Advanced Filters', () => {
    test('should toggle advanced panel', async ({ page }) => {
      const advButton = page.getByRole('button', { name: /Advanced/ });
      await advButton.click();

      await expect(page.getByLabel('Filter by completion status')).toBeVisible();
      await expect(page.getByLabel('Due date from')).toBeVisible();
      await expect(page.getByLabel('Due date to')).toBeVisible();

      // Click again to close
      await advButton.click();
      await expect(page.getByLabel('Filter by completion status')).not.toBeVisible();
    });

    test('should filter by completion status - incomplete only', async ({ page }) => {
      // Complete one todo
      await helper.toggleTodoCompletion('Buy groceries');

      const advButton = page.getByRole('button', { name: /Advanced/ });
      await advButton.click();
      await page.getByLabel('Filter by completion status').selectOption('incomplete');

      await expect(page.getByText('Buy groceries')).not.toBeVisible();
      await expect(page.getByText('Project meeting notes')).toBeVisible();
    });

    test('should filter by completion status - completed only', async ({ page }) => {
      await helper.toggleTodoCompletion('Buy groceries');

      const advButton = page.getByRole('button', { name: /Advanced/ });
      await advButton.click();
      await page.getByLabel('Filter by completion status').selectOption('completed');

      await expect(page.getByText('Buy groceries')).toBeVisible();
      await expect(page.getByText('Project meeting notes')).not.toBeVisible();
    });
  });

  test.describe('Filter Summary & Clear All', () => {
    test('should show filter summary when filters active', async ({ page }) => {
      await page.getByLabel('Filter by priority').selectOption('high');

      await expect(page.getByText('Filters active:')).toBeVisible();
      await expect(page.getByText('Priority: high')).toBeVisible();
    });

    test('should clear all filters with Clear All button', async ({ page }) => {
      await page.getByLabel('Filter by priority').selectOption('high');

      const searchInput = page.getByPlaceholder('Search todos and subtasks...');
      await searchInput.fill('weekly');
      await page.waitForTimeout(500);

      // Click Clear All
      await page.getByRole('button', { name: /Clear All/ }).click();

      // All todos should be visible, summary gone
      await expect(page.getByText('Buy groceries')).toBeVisible();
      await expect(page.getByText('Project meeting notes')).toBeVisible();
      await expect(page.getByText('Read Playwright docs')).toBeVisible();
      await expect(page.getByText('Filters active:')).not.toBeVisible();
      await expect(searchInput).toHaveValue('');
    });
  });

  test.describe('Filter Presets', () => {
    test('should save and load a filter preset', async ({ page }) => {
      // Set a filter
      await page.getByLabel('Filter by priority').selectOption('high');

      // Open advanced to access Save
      const advButton = page.getByRole('button', { name: /Advanced/ });
      await advButton.click();

      // Mock the prompt dialog
      page.on('dialog', async dialog => {
        if (dialog.type() === 'prompt') {
          await dialog.accept('High Priority Tasks');
        }
      });

      await page.getByRole('button', { name: /Save Filter/ }).click();

      // Clear filters
      await page.getByRole('button', { name: /Clear All/ }).click();

      // Load preset
      await page.getByLabel('Load saved filter preset').selectOption({ label: 'High Priority Tasks' });

      // Priority should be set back to high
      await expect(page.getByLabel('Filter by priority')).toHaveValue('high');
      await expect(page.getByText('Buy groceries')).toBeVisible();
      await expect(page.getByText('Project meeting notes')).not.toBeVisible();
    });

    test('should persist presets across page reload', async ({ page }) => {
      // Set and save filter
      await page.getByLabel('Filter by priority').selectOption('medium');
      const advButton = page.getByRole('button', { name: /Advanced/ });
      await advButton.click();

      page.on('dialog', async dialog => {
        if (dialog.type() === 'prompt') {
          await dialog.accept('Medium Tasks');
        }
      });

      await page.getByRole('button', { name: /Save Filter/ }).click();

      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Open advanced filters and check preset is still there
      await page.getByRole('button', { name: /Advanced/ }).click();
      const presetDropdown = page.getByLabel('Load saved filter preset');
      await expect(presetDropdown).toBeVisible();
      // Verify preset option exists
      const options = presetDropdown.locator('option');
      await expect(options).toContainText(['Medium Tasks']);
    });

    test('should handle duplicate preset name with overwrite prompt', async ({ page }) => {
      await page.getByLabel('Filter by priority').selectOption('high');
      const advButton = page.getByRole('button', { name: /Advanced/ });
      await advButton.click();

      let dialogCount = 0;
      page.on('dialog', async dialog => {
        dialogCount++;
        if (dialog.type() === 'prompt') {
          await dialog.accept('My Preset');
        } else if (dialog.type() === 'confirm') {
          await dialog.accept(); // Overwrite
        }
      });

      // Save first
      await page.getByRole('button', { name: /Save Filter/ }).click();
      // Save again with same name — should trigger confirm dialog
      await page.getByRole('button', { name: /Save Filter/ }).click();

      expect(dialogCount).toBeGreaterThanOrEqual(3); // prompt + prompt + confirm
    });
  });

  test.describe('Section Counts & Auto-Hide', () => {
    test('should update section counts when filtered', async ({ page }) => {
      await page.getByLabel('Filter by priority').selectOption('high');

      // Only high-priority pending todos should count
      // Check section header contains the count
      const pendingHeader = page.locator('h2', { hasText: /Pending/ });
      await expect(pendingHeader).toContainText('(2)');
    });

    test('should hide empty sections', async ({ page }) => {
      // Filter to a state where "Completed" section should be empty
      const advButton = page.getByRole('button', { name: /Advanced/ });
      await advButton.click();
      await page.getByLabel('Filter by completion status').selectOption('incomplete');

      // Completed section should not be visible
      await expect(page.locator('h2', { hasText: /Completed/ })).not.toBeVisible();
    });
  });

  test.describe('Combined Filters (AND Logic)', () => {
    test('should apply search + priority + tag together', async ({ page }) => {
      // Create tag and assign
      await helper.createTag('urgent', '#EF4444');
      await helper.assignTag('Weekly report', 'urgent');

      // Set all three filters
      await page.getByLabel('Filter by priority').selectOption('high');
      await page.getByLabel('Filter by tag').selectOption({ label: 'urgent' });

      const searchInput = page.getByPlaceholder('Search todos and subtasks...');
      await searchInput.fill('report');
      await page.waitForTimeout(500);

      // Only "Weekly report" matches all three
      await expect(page.getByText('Weekly report')).toBeVisible();
      await expect(page.getByText('Buy groceries')).not.toBeVisible();
    });
  });
});
```

### Unit Tests

Test the pure filter logic functions in isolation. These can be added as inline tests or in a separate test file:

| Test Case | Input | Expected Output |
|---|---|---|
| Empty search returns all todos | `debouncedQuery: ''`, 4 todos | 4 todos returned |
| Search matches title | `debouncedQuery: 'buy'`, 4 todos | 1 todo ("Buy groceries") |
| Search matches subtask | `debouncedQuery: 'milk'`, todo with subtask "Pick up milk" | 1 todo returned |
| Case-insensitive search | `debouncedQuery: 'BUY'` | Matches "Buy groceries" |
| Priority filter 'high' | `priority: 'high'`, todos with mixed priorities | Only high-priority todos |
| Priority filter 'all' | `priority: 'all'` | All todos returned |
| Tag filter specific ID | `tagId: 5`, only 1 todo has tag 5 | 1 todo returned |
| Completion 'incomplete' | `completion: 'incomplete'` | Only `completed === 0` todos |
| Completion 'completed' | `completion: 'completed'` | Only `completed === 1` todos |
| Date range From only | `dueDateFrom: '2025-06-01'` | Todos due on/after June 1 |
| Date range To only | `dueDateTo: '2025-06-30'` | Todos due on/before June 30 |
| Date range excludes no-date | `dueDateFrom: '2025-06-01'`, todo has `due_date: null` | Todo excluded |
| AND logic all filters | search + priority + tag + completion | Only matching todos |
| `isAnyFilterActive` with defaults | `DEFAULT_FILTERS` | `false` |
| `isAnyFilterActive` with search | `debouncedQuery: 'test'` | `true` |
| Debounce delays value | Input changes rapidly | Value updates after 300ms |
| Preset save/load round-trip | Save preset, load it back | Filters restored correctly |
| Preset name collision detection | Two presets with same name (different case) | Collision detected |
| Max presets limit | 21st preset save attempt | Blocked with alert |

---

## Out of Scope

- **Server-side search**: All filtering is client-side. For very large datasets (10,000+ todos), server-side search with SQL `LIKE` would be needed but is not covered here.
- **Full-text search (FTS)**: SQLite FTS5 extension is not used. Simple `String.includes()` is sufficient for the expected data sizes.
- **Fuzzy/typo-tolerant search**: "projct" will NOT match "project". Only exact substring matching is supported.
- **Search history**: Previously searched queries are not tracked or suggested.
- **Sort controls**: Sorting is handled by the existing priority sort logic (Feature 02), not by this feature.
- **URL query parameters for filters**: Filter state is not reflected in the URL (no shareable filter links).
- **Cross-device preset sync**: Presets are stored in `localStorage` and do not sync across browsers or devices.
- **Regex search**: Users cannot use regular expressions in the search input.

---

## Success Metrics

| Metric | Target |
|---|---|
| Search response time (debounced) | < 50ms for up to 500 todos |
| Filter application time | < 20ms for up to 500 todos |
| Search input to first result update | ≤ 350ms (300ms debounce + 50ms filter) |
| Preset save/load time | < 10ms (localStorage) |
| All E2E test scenarios passing | 100% pass rate |
| Zero API calls when changing filters | 0 network requests on filter change |
| Accessibility: all interactive elements | Have proper `aria-label` attributes |
| Filter state consistency | Clearing filters always returns to exact full list |
