import dayjs from "dayjs";
import { logWorkEntry } from "./jira";

export interface WorkLogEntry {
  issueKey: string;
  comment: string;
  started: string;
  durationSeconds: number;
  originalLine: string;
}

// Parse durations like "1h2m3s"
const parseDuration = (duration: string): number => {
  const regex = /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/;
  const match = regex.exec(duration);
  if (!match) return 0;
  const [, h = "0", m = "0", s = "0"] = match.map((x) => x || "0");
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s);
};

// Parse one activity line
const parseTimesheetLine = (line: string): WorkLogEntry | null => {
  // Support both formats: [ISSUE-KEY][project] and [ISSUE-KEY] (without project)
  const pattern =
    /\[([A-Z]+-\d+)\](?:\[([^\]]+)\])?\s*(.*?)\s@started\((.*?)\)\s@done\((.*?)\)\s@lasted\((.*?)\)/;
  const match = pattern.exec(line);
  if (!match) return null;

  const [_, issueKey, project, comment, startedStr, doneStr, lasted] = match;

  if (!issueKey || !comment || !startedStr || !lasted) return null;

  // Convert "26-02-04 11:06" → ISO 8601 (assuming YY-MM-DD)
  // Handle 2-digit year by adding 2000 if it's <= 99
  let parsedDate = dayjs(startedStr, "YY-MM-DD HH:mm");

  // If parsing fails, try with explicit 20xx century
  if (!parsedDate.isValid()) {
    // Try parsing with 20YY format
    const dateWithCentury = startedStr.replace(/^(\d{2})-/, "20$1-");
    parsedDate = dayjs(dateWithCentury, "YYYY-MM-DD HH:mm");
  }

  if (!parsedDate.isValid()) {
    console.error(`Failed to parse date: ${startedStr}`);
    return null;
  }

  // Format date as required by Jira API: "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
  const started = parsedDate.format("YYYY-MM-DDTHH:mm:ss.SSSZZ");
  const durationSeconds = parseDuration(lasted);

  return {
    issueKey,
    comment,
    started,
    durationSeconds,
    originalLine: line.trim(),
  };
};

export const parseTimesheetEntries = (
  timesheetContent: string,
): WorkLogEntry[] => {
  const lines = timesheetContent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const entries: WorkLogEntry[] = [];
  for (const line of lines) {
    const entry = parseTimesheetLine(line);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
};

// Helper function to add small delay between requests
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const logWorkToJira = async (
  email: string,
  token: string,
  entry: WorkLogEntry,
): Promise<void> => {
  try {
    // Add a small delay to prevent overwhelming the API
    await delay(100);

    await logWorkEntry(email, token, entry.issueKey, {
      comment: entry.comment,
      started: entry.started,
      timeSpentSeconds: entry.durationSeconds,
    });

    console.log(
      `✓ Successfully logged work for ${entry.issueKey}: ${entry.comment}`,
    );
  } catch (error: any) {
    // The error message is already detailed from logWorkEntry, so just re-throw
    throw error;
  }
};

// Batch function to log multiple entries with proper rate limiting
export const logMultipleWorkEntries = async (
  email: string,
  token: string,
  entries: WorkLogEntry[],
): Promise<{
  success: WorkLogEntry[];
  failed: { entry: WorkLogEntry; error: string }[];
}> => {
  const success: WorkLogEntry[] = [];
  const failed: { entry: WorkLogEntry; error: string }[] = [];

  for (const entry of entries) {
    try {
      await logWorkToJira(email, token, entry);
      success.push(entry);
    } catch (error: any) {
      failed.push({
        entry,
        error: error.message || "Unknown error",
      });
    }
  }

  return { success, failed };
};
