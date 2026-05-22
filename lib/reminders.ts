export const REMINDER_OPTIONS = [
  { value: null, label: "None", badge: "" },
  { value: 15, label: "15 minutes before", badge: "15m" },
  { value: 30, label: "30 minutes before", badge: "30m" },
  { value: 60, label: "1 hour before", badge: "1h" },
  { value: 120, label: "2 hours before", badge: "2h" },
  { value: 1440, label: "1 day before", badge: "1d" },
  { value: 2880, label: "2 days before", badge: "2d" },
  { value: 10080, label: "1 week before", badge: "1w" },
] as const;

export function getReminderBadge(reminderMinutes: number | null): string {
  if (reminderMinutes === null) {
    return "";
  }

  const option = REMINDER_OPTIONS.find((item) => item.value === reminderMinutes);
  if (!option) {
    return `\ud83d\udd14 ${reminderMinutes}m`;
  }

  return option.badge ? `\ud83d\udd14 ${option.badge}` : "";
}
