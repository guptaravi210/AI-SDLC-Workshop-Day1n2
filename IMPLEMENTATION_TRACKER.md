# Todo App Implementation Tracker

This document serves as an implementation tracker for GitHub Copilot. Please follow this guide sequentially to implement the 11 features defined in the `PRPs/` directory.

## Instructions for Copilot / Developer
1. **Sequential Implementation**: Implement features in order from 01 to 11 to ensure dependencies are respected (e.g. Authentication or CRUD must be done before complex filtering).
2. **Test-Driven / Verification**: For every feature, you MUST write the corresponding test cases (unit and E2E as defined in the PRP) **before** or **alongside** the implementation.
3. **Completion**: A feature can only be marked as complete (`[x]`) once both the implementation code and its corresponding tests are fully written and passing.

---

## Tracker

### Feature 01: Todo CRUD Operations (`PRPs/01-todo-crud-operations.md`)
- [x] **Implementation**: Basic structure, UI components, database schema, and API routes for Create, Read, Update, Delete.
- [x] **Tests**: Create E2E tests (Playwright) and unit tests covering empty title rejection, past date rejection, etc.
- [x] **Status**: Completed

### Feature 02: Priority System (`PRPs/02-priority-system.md`)
- [x] **Implementation**: Add high/medium/low priority levels, UI badges, and priority-based sorting logic.
- [x] **Tests**: Unit tests for sorting logic; E2E tests for badge rendering and priority dropdowns.
- [x] **Status**: Completed

### Feature 03: Recurring Todos (`PRPs/03-recurring-todos.md`)
- [x] **Implementation**: Daily/weekly/monthly/yearly recurrence, UI toggles, and logic to generate the next occurrence upon completion.
- [x] **Tests**: Unit tests for date calculation and edge cases (leap years, month ends); E2E tests for recurrence inheritance.
- [x] **Status**: Completed

### Feature 04: Reminders & Notifications (`PRPs/04-reminders-notifications.md`)
- [x] **Implementation**: Browser Notification API integration, reminder timing options, and background polling.
- [x] **Tests**: Unit tests for time calculation (`getReminderBadge`); E2E tests for permission handling and notification triggering.
- [x] **Status**: Completed

### Feature 05: Subtasks & Progress (`PRPs/05-subtasks-progress.md`)
- [x] **Implementation**: Subtask DB tables, inline addition/completion of subtasks, and progress bar calculations.
- [x] **Tests**: Unit tests for progress math (`calculateProgress`); E2E tests for cascade deletes and progress bar rendering.
- [x] **Status**: Completed

### Feature 06: Tag System (`PRPs/06-tag-system.md`)
- [x] **Implementation**: Custom tags, colors, many-to-many DB relationships, and filtering by tag.
- [x] **Tests**: DB CRUD operation tests for tags; E2E tests for cross-user isolation and color rendering.
- [x] **Status**: Completed

### Feature 07: Template System (`PRPs/07-template-system.md`)
- [x] **Implementation**: Save existing todos as templates, UI Template Manager, and instantiation of todos from templates.
- [x] **Tests**: Tests verifying that subtasks and exact offsets are perfectly cloned from templates.
- [x] **Status**: Completed

### Feature 08: Search & Filtering (`PRPs/08-search-filtering.md`)
- [x] **Implementation**: Client-side debounced text search, multi-criteria filtering, and saving filter presets to localStorage.
- [x] **Tests**: Unit tests for `isAnyFilterActive` and AND logic; E2E tests verifying preset collisions and correct results.
- [x] **Status**: Completed

### Feature 09: Export & Import (`PRPs/09-export-import.md`)
- [x] **Implementation**: JSON/CSV export, ID remapping logic for JSON import, and tag deduplication.
- [x] **Tests**: Integration tests mapping full export-import lifecycle ensuring no data loss and properly mapped IDs.
- [x] **Status**: Completed

### Feature 10: Calendar View (`PRPs/10-calendar-view.md`)
- [x] **Implementation**: Monthly grid view, padding days, URL state (`?month=`), seeded Singapore holidays.
- [x] **Tests**: Unit tests for leap year and week calculation; E2E tests for URL parsing and modal interactions.
- [x] **Status**: Completed

### Feature 11: Authentication (WebAuthn/Passkeys) (`PRPs/11-authentication-webauthn.md`)
- [x] **Implementation**: `@simplewebauthn` setup, biometric registration/login, JWT cookies, and middleware route protection.
- [x] **Tests**: JWT validation tests, DB user lookup tests, and simulated WebAuthn ceremony flows in Chromium.
- [x] **Status**: Completed
