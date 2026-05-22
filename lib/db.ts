import Database from "better-sqlite3";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getSingaporeNow } from "@/lib/timezone";

export type Priority = "high" | "medium" | "low";
export type RecurrencePattern = "" | "daily" | "weekly" | "monthly" | "yearly";

export interface User {
  id: string;
  username: string;
  challenge: string | null;
}

export interface Authenticator {
  credential_id: string;
  user_id: string;
  credential_public_key: string;
  counter: number;
  transports: string | null;
}

export interface Todo {
  id: number;
  user_id: string;
  title: string;
  priority: Priority;
  due_date: string | null;
  is_completed: number;
  is_recurring: number;
  recurrence_pattern: RecurrencePattern;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  is_completed: number;
  position: number;
  created_at: string;
}

export interface Tag {
  id: number;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface TodoWithDetails extends Todo {
  subtasks: Subtask[];
  tags: Tag[];
}

export interface Template {
  id: number;
  user_id: string;
  name: string;
  title: string;
  description: string | null;
  category: string | null;
  priority: Priority;
  is_recurring: number;
  recurrence_pattern: RecurrencePattern;
  reminder_minutes: number | null;
  subtasks_json: string;
  due_date_offset_minutes: number | null;
  created_at: string;
}

export interface Holiday {
  id: number;
  holiday_date: string;
  name: string;
  created_at: string;
}

export interface CreateTodoRequest {
  title: string;
  priority?: Priority;
  due_date?: string | null;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern;
  reminder_minutes?: number | null;
}

export interface UpdateTodoRequest {
  title?: string;
  priority?: Priority;
  due_date?: string | null;
  is_completed?: boolean;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern;
  reminder_minutes?: number | null;
}

const dbRoot = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.cwd();
const dbPath = path.join(dbRoot, "todos.db");

const globalForDb = globalThis as unknown as { db: Database.Database | undefined };
const db = globalForDb.db ?? new Database(dbPath);
if (!globalForDb.db) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
}
globalForDb.db = db;

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  challenge TEXT
);

CREATE TABLE IF NOT EXISTS authenticators (
  credential_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  credential_public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high', 'medium', 'low')),
  due_date TEXT,
  is_completed INTEGER NOT NULL DEFAULT 0,
  is_recurring INTEGER NOT NULL DEFAULT 0,
  recurrence_pattern TEXT NOT NULL DEFAULT '' CHECK(recurrence_pattern IN ('', 'daily', 'weekly', 'monthly', 'yearly')),
  reminder_minutes INTEGER,
  last_notification_sent TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS subtasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  is_completed INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS todo_tags (
  todo_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (todo_id, tag_id),
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  is_recurring INTEGER NOT NULL DEFAULT 0,
  due_date_offset_minutes INTEGER,
  recurrence_pattern TEXT NOT NULL DEFAULT '',
  reminder_minutes INTEGER,
  subtasks_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  holiday_date TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);
CREATE INDEX IF NOT EXISTS idx_todos_is_completed ON todos(is_completed);
CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority);
CREATE INDEX IF NOT EXISTS idx_todos_user_priority ON todos(user_id, priority);
CREATE INDEX IF NOT EXISTS idx_subtasks_todo_id ON subtasks(todo_id);
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_todo_tags_todo_id ON todo_tags(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_tags_tag_id ON todo_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_holidays_holiday_date ON holidays(holiday_date);
`);

try {
  db.exec("ALTER TABLE templates ADD COLUMN description TEXT");
} catch {}
try {
  db.exec("ALTER TABLE templates ADD COLUMN category TEXT");
} catch {}
try {
  db.exec("ALTER TABLE templates ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0");
} catch {}

export const userDB = {
  getById(id: string): User | undefined {
    const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
    return stmt.get(id) as User | undefined;
  },

  getByUsername(username: string): User | undefined {
    const stmt = db.prepare("SELECT * FROM users WHERE username = ?");
    return stmt.get(username) as User | undefined;
  },

  getOrCreateByUsername(username: string): User {
    const normalizedUsername = username.trim().toLowerCase();

    const existing = this.getByUsername(normalizedUsername);
    if (existing) {
      return existing;
    }

    const user: User = {
      id: randomUUID(),
      username: normalizedUsername,
      challenge: null,
    };

    const stmt = db.prepare("INSERT INTO users (id, username, challenge) VALUES (?, ?, NULL)");

    try {
      stmt.run(user.id, user.username);
    } catch {
      const createdByAnotherRequest = this.getByUsername(normalizedUsername);
      if (createdByAnotherRequest) {
        return createdByAnotherRequest;
      }

      throw new Error("Failed to create user");
    }

    return user;
  },

  updateChallenge(userId: string, challenge: string): void {
    const stmt = db.prepare("UPDATE users SET challenge = ? WHERE id = ?");
    stmt.run(challenge, userId);
  },

  clearChallenge(userId: string): void {
    const stmt = db.prepare("UPDATE users SET challenge = NULL WHERE id = ?");
    stmt.run(userId);
  },
};

export const authenticatorDB = {
  getByCredentialId(credentialId: string): Authenticator | undefined {
    const stmt = db.prepare("SELECT * FROM authenticators WHERE credential_id = ?");
    return stmt.get(credentialId) as Authenticator | undefined;
  },

  getByUserId(userId: string): Authenticator[] {
    const stmt = db.prepare("SELECT * FROM authenticators WHERE user_id = ?");
    return stmt.all(userId) as Authenticator[];
  },

  create(data: Authenticator): void {
    const stmt = db.prepare(`
      INSERT INTO authenticators (credential_id, user_id, credential_public_key, counter, transports)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(data.credential_id, data.user_id, data.credential_public_key, data.counter, data.transports);
  },

  updateCounter(credentialId: string, counter: number): void {
    const stmt = db.prepare("UPDATE authenticators SET counter = ? WHERE credential_id = ?");
    stmt.run(counter, credentialId);
  },
};

export const todoDB = {
  create(userId: string, data: CreateTodoRequest): Todo {
    const now = getSingaporeNow().toISOString();
    const stmt = db.prepare(`
      INSERT INTO todos (
        user_id,
        title,
        priority,
        due_date,
        is_completed,
        is_recurring,
        recurrence_pattern,
        reminder_minutes,
        created_at
      ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      userId,
      data.title.trim(),
      data.priority ?? "medium",
      data.due_date ?? null,
      data.is_recurring ? 1 : 0,
      data.recurrence_pattern ?? "",
      data.reminder_minutes ?? null,
      now
    );

    return this.getById(Number(result.lastInsertRowid), userId) as Todo;
  },

  getAllByUser(userId: string): Todo[] {
    const stmt = db.prepare(`
      SELECT * FROM todos WHERE user_id = ?
      ORDER BY
        CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
        CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
        due_date ASC,
        created_at DESC
    `);

    return stmt.all(userId) as Todo[];
  },

  getAllDetailedByUser(userId: string): TodoWithDetails[] {
    const todos = this.getAllByUser(userId);
    if (todos.length === 0) {
      return [];
    }

    return todos.map((todo) => ({
      ...todo,
      subtasks: subtaskDB.getByTodoId(todo.id),
      tags: tagDB.getByTodoId(todo.id, userId),
    }));
  },

  getById(id: number, userId: string): Todo | undefined {
    const stmt = db.prepare("SELECT * FROM todos WHERE id = ? AND user_id = ?");
    return stmt.get(id, userId) as Todo | undefined;
  },

  update(id: number, userId: string, data: UpdateTodoRequest): Todo | undefined {
    const existing = this.getById(id, userId);
    if (!existing) {
      return undefined;
    }

    const completedAt =
      data.is_completed !== undefined
        ? data.is_completed
          ? getSingaporeNow().toISOString()
          : null
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
      data.title ?? existing.title,
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

    return this.getById(id, userId);
  },

  createRecurringNextIfNotExists(userId: string, sourceTodo: Todo, nextDueDate: string): Todo | null {
    const now = getSingaporeNow().toISOString();
    const reminderSentinel = sourceTodo.reminder_minutes ?? -1;

    const stmt = db.prepare(`
      INSERT INTO todos (
        user_id,
        title,
        priority,
        due_date,
        is_completed,
        is_recurring,
        recurrence_pattern,
        reminder_minutes,
        created_at
      )
      SELECT ?, ?, ?, ?, 0, 1, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1
        FROM todos
        WHERE user_id = ?
          AND title = ?
          AND priority = ?
          AND due_date = ?
          AND is_completed = 0
          AND is_recurring = 1
          AND recurrence_pattern = ?
          AND COALESCE(reminder_minutes, -1) = ?
      )
    `);

    const result = stmt.run(
      userId,
      sourceTodo.title,
      sourceTodo.priority,
      nextDueDate,
      sourceTodo.recurrence_pattern,
      sourceTodo.reminder_minutes,
      now,
      userId,
      sourceTodo.title,
      sourceTodo.priority,
      nextDueDate,
      sourceTodo.recurrence_pattern,
      reminderSentinel
    );

    if (result.changes === 0) {
      const existingStmt = db.prepare(`
        SELECT * FROM todos
        WHERE user_id = ?
          AND title = ?
          AND priority = ?
          AND due_date = ?
          AND is_completed = 0
          AND is_recurring = 1
          AND recurrence_pattern = ?
          AND COALESCE(reminder_minutes, -1) = ?
        ORDER BY id DESC
        LIMIT 1
      `);

      return (
        (existingStmt.get(
          userId,
          sourceTodo.title,
          sourceTodo.priority,
          nextDueDate,
          sourceTodo.recurrence_pattern,
          reminderSentinel
        ) as Todo | undefined) ?? null
      );
    }

    return this.getById(Number(result.lastInsertRowid), userId) ?? null;
  },

  updateAndCreateRecurringNext(
    id: number,
    userId: string,
    data: UpdateTodoRequest,
    nextDueDate: string
  ): { updated: Todo | undefined; nextInstance: Todo | null } {
    const run = db.transaction((todoId: number, ownerId: string, updateData: UpdateTodoRequest, nextDate: string) => {
      const existing = this.getById(todoId, ownerId);
      if (!existing) {
        return { updated: undefined, nextInstance: null };
      }

      const completedAt =
        updateData.is_completed !== undefined
          ? updateData.is_completed
            ? getSingaporeNow().toISOString()
            : null
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
        updateData.title ?? existing.title,
        updateData.priority ?? existing.priority,
        updateData.due_date !== undefined ? updateData.due_date : existing.due_date,
        updateData.is_completed !== undefined ? (updateData.is_completed ? 1 : 0) : existing.is_completed,
        updateData.is_recurring !== undefined ? (updateData.is_recurring ? 1 : 0) : existing.is_recurring,
        updateData.recurrence_pattern ?? existing.recurrence_pattern,
        updateData.reminder_minutes !== undefined ? updateData.reminder_minutes : existing.reminder_minutes,
        completedAt,
        todoId,
        ownerId
      );

      const updated = this.getById(todoId, ownerId);
      if (!updated) {
        return { updated: undefined, nextInstance: null };
      }

      const nextInstance = this.createRecurringNextIfNotExists(ownerId, updated, nextDate);
      return { updated, nextInstance };
    });

    return run(id, userId, data, nextDueDate);
  },

  delete(id: number, userId: string): boolean {
    const stmt = db.prepare("DELETE FROM todos WHERE id = ? AND user_id = ?");
    const result = stmt.run(id, userId);
    return result.changes > 0;
  },

  resetNotificationSent(id: number, userId: string): void {
    const stmt = db.prepare("UPDATE todos SET last_notification_sent = NULL WHERE id = ? AND user_id = ?");
    stmt.run(id, userId);
  },

  getDueNotifications(userId: string, nowIso: string): Array<Pick<Todo, "id" | "title" | "due_date" | "reminder_minutes">> {
    const stmt = db.prepare(`
      SELECT id, title, due_date, reminder_minutes
      FROM todos
      WHERE user_id = ?
        AND reminder_minutes IS NOT NULL
        AND due_date IS NOT NULL
        AND is_completed = 0
        AND last_notification_sent IS NULL
        AND datetime(due_date, '-' || reminder_minutes || ' minutes') <= datetime(?)
      ORDER BY due_date ASC
    `);
    return stmt.all(userId, nowIso) as Array<Pick<Todo, "id" | "title" | "due_date" | "reminder_minutes">>;
  },

  markNotificationsSent(todoIds: number[], sentAt: string): void {
    if (todoIds.length === 0) {
      return;
    }

    const stmt = db.prepare("UPDATE todos SET last_notification_sent = ? WHERE id = ?");
    const run = db.transaction((ids: number[]) => {
      for (const id of ids) {
        stmt.run(sentAt, id);
      }
    });
    run(todoIds);
  },
};

export const subtaskDB = {
  getByTodoId(todoId: number): Subtask[] {
    const stmt = db.prepare("SELECT * FROM subtasks WHERE todo_id = ? ORDER BY position ASC, id ASC");
    return stmt.all(todoId) as Subtask[];
  },

  getById(id: number): Subtask | undefined {
    const stmt = db.prepare("SELECT * FROM subtasks WHERE id = ?");
    return stmt.get(id) as Subtask | undefined;
  },

  create(todoId: number, title: string): Subtask {
    const now = getSingaporeNow().toISOString();
    const maxStmt = db.prepare("SELECT COALESCE(MAX(position), -1) as max_pos FROM subtasks WHERE todo_id = ?");
    const max = maxStmt.get(todoId) as { max_pos: number };
    const nextPosition = (max?.max_pos ?? -1) + 1;

    const stmt = db.prepare(`
      INSERT INTO subtasks (todo_id, title, is_completed, position, created_at)
      VALUES (?, ?, 0, ?, ?)
    `);
    const result = stmt.run(todoId, title.trim(), nextPosition, now);
    return this.getById(Number(result.lastInsertRowid)) as Subtask;
  },

  update(id: number, data: { title?: string; is_completed?: number }): Subtask | undefined {
    const existing = this.getById(id);
    if (!existing) {
      return undefined;
    }

    const stmt = db.prepare("UPDATE subtasks SET title = ?, is_completed = ? WHERE id = ?");
    stmt.run(data.title ?? existing.title, data.is_completed ?? existing.is_completed, id);
    return this.getById(id);
  },

  delete(id: number): boolean {
    const stmt = db.prepare("DELETE FROM subtasks WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  },
};

export const tagDB = {
  getAllByUser(userId: string): Tag[] {
    const stmt = db.prepare("SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC");
    return stmt.all(userId) as Tag[];
  },

  getById(id: number, userId: string): Tag | undefined {
    const stmt = db.prepare("SELECT * FROM tags WHERE id = ? AND user_id = ?");
    return stmt.get(id, userId) as Tag | undefined;
  },

  getByName(userId: string, name: string): Tag | undefined {
    const stmt = db.prepare("SELECT * FROM tags WHERE user_id = ? AND LOWER(name) = LOWER(?)");
    return stmt.get(userId, name) as Tag | undefined;
  },

  create(userId: string, name: string, color: string): Tag {
    const now = getSingaporeNow().toISOString();
    const stmt = db.prepare("INSERT INTO tags (user_id, name, color, created_at) VALUES (?, ?, ?, ?)");
    const result = stmt.run(userId, name.trim(), color, now);
    return this.getById(Number(result.lastInsertRowid), userId) as Tag;
  },

  update(id: number, userId: string, data: { name?: string; color?: string }): Tag | undefined {
    const existing = this.getById(id, userId);
    if (!existing) {
      return undefined;
    }

    const stmt = db.prepare("UPDATE tags SET name = ?, color = ? WHERE id = ? AND user_id = ?");
    stmt.run(data.name ?? existing.name, data.color ?? existing.color, id, userId);
    return this.getById(id, userId);
  },

  delete(id: number, userId: string): boolean {
    const stmt = db.prepare("DELETE FROM tags WHERE id = ? AND user_id = ?");
    const result = stmt.run(id, userId);
    return result.changes > 0;
  },

  setTodoTags(todoId: number, tagIds: number[]): void {
    const deleteStmt = db.prepare("DELETE FROM todo_tags WHERE todo_id = ?");
    const insertStmt = db.prepare("INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)");
    const run = db.transaction((ids: number[]) => {
      deleteStmt.run(todoId);
      for (const id of ids) {
        insertStmt.run(todoId, id);
      }
    });

    run(tagIds);
  },

  getByTodoId(todoId: number, userId: string): Tag[] {
    const stmt = db.prepare(`
      SELECT t.*
      FROM tags t
      INNER JOIN todo_tags tt ON tt.tag_id = t.id
      WHERE tt.todo_id = ? AND t.user_id = ?
      ORDER BY t.name ASC
    `);
    return stmt.all(todoId, userId) as Tag[];
  },
};

export const templateDB = {
  getAllByUser(userId: string): Template[] {
    const stmt = db.prepare("SELECT * FROM templates WHERE user_id = ? ORDER BY created_at DESC");
    return stmt.all(userId) as Template[];
  },

  getById(id: number, userId: string): Template | undefined {
    const stmt = db.prepare("SELECT * FROM templates WHERE id = ? AND user_id = ?");
    return stmt.get(id, userId) as Template | undefined;
  },

  create(
    userId: string,
    data: {
      name: string;
      title: string;
      description?: string | null;
      category?: string | null;
      priority?: Priority;
      is_recurring?: boolean;
      recurrence_pattern?: RecurrencePattern;
      reminder_minutes?: number | null;
      subtasks_json?: string;
      due_date_offset_minutes?: number | null;
    }
  ): Template {
    const now = getSingaporeNow().toISOString();
    const stmt = db.prepare(`
      INSERT INTO templates (
        user_id, name, title, description, category, priority, is_recurring, recurrence_pattern,
        reminder_minutes, subtasks_json, due_date_offset_minutes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      userId,
      data.name.trim(),
      data.title.trim(),
      data.description ?? null,
      data.category ?? null,
      data.priority ?? "medium",
      data.is_recurring ? 1 : 0,
      data.recurrence_pattern ?? "",
      data.reminder_minutes ?? null,
      data.subtasks_json ?? "[]",
      data.due_date_offset_minutes ?? null,
      now
    );
    return this.getById(Number(result.lastInsertRowid), userId) as Template;
  },

  delete(id: number, userId: string): boolean {
    const stmt = db.prepare("DELETE FROM templates WHERE id = ? AND user_id = ?");
    const result = stmt.run(id, userId);
    return result.changes > 0;
  },
};

export const holidayDB = {
  getByMonth(year: number, month: number): Holiday[] {
    const monthText = String(month).padStart(2, "0");
    const prefix = `${year}-${monthText}`;
    const stmt = db.prepare("SELECT * FROM holidays WHERE holiday_date LIKE ? ORDER BY holiday_date ASC");
    return stmt.all(`${prefix}%`) as Holiday[];
  },
};

export { db as sqliteDb };
