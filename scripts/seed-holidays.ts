import Database from "better-sqlite3";
import path from "node:path";

const dbPath = path.join(process.cwd(), "todos.db");
const db = new Database(dbPath);

const holidays = [
  { holiday_date: "2026-01-01", name: "New Year's Day" },
  { holiday_date: "2026-02-17", name: "Chinese New Year (Day 1)" },
  { holiday_date: "2026-02-18", name: "Chinese New Year (Day 2)" },
  { holiday_date: "2026-03-20", name: "Hari Raya Puasa" },
  { holiday_date: "2026-04-03", name: "Good Friday" },
  { holiday_date: "2026-05-01", name: "Labour Day" },
  { holiday_date: "2026-05-31", name: "Vesak Day" },
  { holiday_date: "2026-06-17", name: "Hari Raya Haji" },
  { holiday_date: "2026-08-09", name: "National Day" },
  { holiday_date: "2026-11-08", name: "Deepavali" },
  { holiday_date: "2026-12-25", name: "Christmas Day" },
];

const insert = db.prepare("INSERT OR IGNORE INTO holidays (holiday_date, name, created_at) VALUES (?, ?, ?)");
const now = new Date().toISOString();
const run = db.transaction(() => {
  for (const holiday of holidays) {
    insert.run(holiday.holiday_date, holiday.name, now);
  }
});

run();
console.log(`Seeded ${holidays.length} holidays.`);
