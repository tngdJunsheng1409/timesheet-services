import {
  TodoEntry,
  TicketMatch,
  ProcessedEntry,
} from "@/schemas/timesheet.schema";
import { v4 as uuidv4 } from "uuid";

export const parseTodoLine = (line: string): TodoEntry | null => {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Match completed tasks: ✔ task description @started(...) @done(...) @lasted(...)
  const completedMatch = trimmed.match(
    /^✔\s+(.+?)(?:\s+@started\([^)]+\))?(?:\s+@done\([^)]+\))?(?:\s+@lasted\([^)]+\))?$/,
  );

  if (completedMatch) {
    let task = completedMatch[1]?.trim();
    if (!task) return null;

    // Extract project identifier from task if it exists: [project name] task description
    let projectIdentifier: string | undefined;
    const projectMatch = task.match(/^\[([^\]]+)\]\s*(.+)$/);
    if (projectMatch) {
      projectIdentifier = projectMatch[1]?.trim();
      const newTask = projectMatch[2]?.trim();
      if (newTask) {
        task = newTask;
      }
    }

    // Extract time information
    const timeInfo: any = {};
    const startedMatch = trimmed.match(/@started\(([^)]+)\)/);
    const doneMatch = trimmed.match(/@done\(([^)]+)\)/);
    const lastedMatch = trimmed.match(/@lasted\(([^)]+)\)/);

    if (startedMatch) timeInfo.started = startedMatch[1];
    if (doneMatch) timeInfo.done = doneMatch[1];
    if (lastedMatch) timeInfo.lasted = lastedMatch[1];

    const entry: TodoEntry = {
      originalLine: trimmed,
      task,
      isCompleted: true,
      timeInfo: Object.keys(timeInfo).length > 0 ? timeInfo : undefined,
    };

    if (projectIdentifier) {
      entry.projectIdentifier = projectIdentifier;
    }

    return entry;
  }

  // Match incomplete tasks: - task description or ☐ task description
  const incompleteMatch = trimmed.match(/^[-☐]\s+(.+)$/);
  if (incompleteMatch) {
    let task = incompleteMatch[1]?.trim();
    if (!task) return null;

    // Extract project identifier from task if it exists: [project name] task description
    let projectIdentifier: string | undefined;
    const projectMatch = task.match(/^\[([^\]]+)\]\s*(.+)$/);
    if (projectMatch) {
      projectIdentifier = projectMatch[1]?.trim();
      const newTask = projectMatch[2]?.trim();
      if (newTask) {
        task = newTask;
      }
    }

    const entry: TodoEntry = {
      originalLine: trimmed,
      task,
      isCompleted: false,
    };

    if (projectIdentifier) {
      entry.projectIdentifier = projectIdentifier;
    }

    return entry;
  }

  return null;
};

export const parseTodoContent = (content: string): TodoEntry[] => {
  const lines = content.split("\n");
  const entries: TodoEntry[] = [];

  for (const line of lines) {
    const entry = parseTodoLine(line);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
};

// Simple keyword-based matching fallback
export const fallbackKeywordMatch = async (
  task: string,
  tickets: any[],
): Promise<TicketMatch | null> => {
  if (tickets.length === 0) return null;

  const taskWords = task.toLowerCase().split(/\s+/);
  let bestMatch: any = null;
  let bestScore = 0;

  for (const ticket of tickets) {
    const searchText =
      `${ticket.summary} ${ticket.description || ""}`.toLowerCase();

    let score = 0;
    for (const word of taskWords) {
      if (word.length > 2 && searchText.includes(word)) {
        score += 1 / taskWords.length;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = ticket;
    }
  }

  if (bestScore > 0.2) {
    // Minimum threshold for keyword matching
    return {
      ticket: bestMatch,
      score: bestScore,
      method: "keyword-fallback",
    };
  }

  return null;
};

// Placeholder for NLP matching - you can integrate your smart-nlp logic here
export const predictBestTicket = async (
  task: string,
  tickets: any[],
): Promise<{
  ticket: any;
  score: number;
  method: string;
  alternatives: Array<{ ticket: any; score: number }>;
} | null> => {
  // For now, use the keyword fallback
  // In the real implementation, you would integrate your NLP model here
  const match = await fallbackKeywordMatch(task, tickets);

  if (match) {
    return {
      ticket: match.ticket,
      score: match.score,
      method: match.method,
      alternatives: [],
    };
  }

  return null;
};

export const processEntriesForMatching = (
  entries: TodoEntry[],
  allTickets: any[],
  thresholds: {
    highConfidence: number;
    choice: number;
    minimum: number;
  },
): Promise<ProcessedEntry[]> => {
  return Promise.all(
    entries.map(async (entry, index) => {
      const taskId = uuidv4();

      const enhancedTask = entry.projectIdentifier
        ? `${entry.projectIdentifier} ${entry.task}`
        : entry.task;

      const result = await predictBestTicket(enhancedTask, allTickets);

      if (!result || result.score < thresholds.minimum) {
        return {
          id: taskId,
          originalTask: entry.task,
          projectIdentifier: entry.projectIdentifier,
          timeInfo: entry.timeInfo,
          matches: undefined,
          selectedTicket: null,
          status: "unmapped" as const,
          confidence: result?.score,
        };
      }

      // Create matches array with the best match and alternatives
      const matches: TicketMatch[] = [
        {
          ticket: result.ticket,
          score: result.score,
          method: result.method,
        },
        ...result.alternatives.map((alt) => ({
          ticket: alt.ticket,
          score: alt.score,
          method: "alternative",
        })),
      ];

      // Determine status based on confidence thresholds
      let status: ProcessedEntry["status"];
      let selectedTicket = null;

      if (result.score >= thresholds.highConfidence) {
        status = "auto-assigned";
        selectedTicket = result.ticket;
      } else if (result.score >= thresholds.choice) {
        status = "needs-selection";
      } else {
        status = "unmapped";
      }

      return {
        id: taskId,
        originalTask: entry.task,
        projectIdentifier: entry.projectIdentifier,
        timeInfo: entry.timeInfo,
        matches,
        selectedTicket,
        status,
        confidence: result.score,
      };
    }),
  );
};

export const generateTimesheetOutput = (
  processedEntries: ProcessedEntry[],
): string[] => {
  return processedEntries.map((entry) => {
    let line = "";

    if (entry.selectedTicket) {
      line = `[${entry.selectedTicket.key}] ${entry.originalTask}`;
    } else if (entry.status === "skipped") {
      line = `[SKIPPED] ${entry.originalTask}`;
    } else {
      line = `[UNMAPPED] ${entry.originalTask}`;
    }

    // Add time information if available
    if (entry.timeInfo) {
      if (entry.timeInfo.started)
        line += ` @started(${entry.timeInfo.started})`;
      if (entry.timeInfo.done) line += ` @done(${entry.timeInfo.done})`;
      if (entry.timeInfo.lasted) line += ` @lasted(${entry.timeInfo.lasted})`;
    }

    return line;
  });
};
