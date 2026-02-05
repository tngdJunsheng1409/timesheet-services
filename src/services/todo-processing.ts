import {
  TodoEntry,
  TicketMatch,
  ProcessedEntry,
} from "@/schemas/timesheet.schema";
import { v4 as uuidv4 } from "uuid";
import { getGeminiMatcher } from "./gemini-ticket-matcher";
import {
  AI_CONFIG,
  EXCLUDED_ISSUE_TYPES,
  EXCLUDED_STATUS,
} from "@/constants/jira-timesheet";

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

// Helper function to check if a ticket matches the project identifier
const matchesProjectIdentifier = (
  ticket: any,
  projectIdentifier?: string,
): boolean => {
  if (!projectIdentifier) return true; // No filtering if no project identifier

  const summary = ticket.summary?.toLowerCase() || "";
  const description = ticket.description?.toLowerCase() || "";
  const projectLower = projectIdentifier.toLowerCase();

  // Check if ticket summary or description contains project identifier in brackets
  // e.g., "[mydebit]" should match "[Acq MyDebit]" or "[MyDebit]"
  const ticketText = `${summary} ${description}`;

  // Extract project identifiers from brackets in ticket text
  const bracketMatches = ticketText.match(/\[([^\]]+)\]/g) || [];

  for (const bracket of bracketMatches) {
    const bracketContent = bracket.toLowerCase().replace(/[\[\]]/g, "");
    // Check if project identifier is contained in any bracket content
    if (
      bracketContent.includes(projectLower) ||
      projectLower.includes(bracketContent.replace(/\s+/g, ""))
    ) {
      return true;
    }
  }

  return false;
};

// Simple keyword-based matching fallback
export const fallbackKeywordMatch = async (
  task: string,
  tickets: any[],
  projectIdentifier?: string,
): Promise<TicketMatch | null> => {
  if (tickets.length === 0) return null;

  // Filter tickets to exclude stories and done/deployed/cancelled/closed tickets
  // and filter by project identifier if provided
  const relevantTickets = tickets.filter((ticket) => {
    const issueType =
      ticket.issuetype?.name?.toLowerCase() ||
      ticket.issueType?.toLowerCase() ||
      "";
    const status =
      ticket.status?.name?.toLowerCase() || ticket.status?.toLowerCase() || "";

    const statusValid =
      !EXCLUDED_ISSUE_TYPES.includes(issueType) &&
      !EXCLUDED_STATUS.includes(status);

    const projectMatches = matchesProjectIdentifier(ticket, projectIdentifier);

    return statusValid && projectMatches;
  });

  const taskWords = task.toLowerCase().split(/\s+/);
  let bestMatch: any = null;
  let bestScore = 0;

  for (const ticket of relevantTickets) {
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

// Enhanced batch prediction using Gemini AI with keyword fallback
export const batchPredictTickets = async (
  tasks: Array<{
    task: string;
    projectIdentifier?: string;
  }>,
  tickets: any[],
  useAI: boolean = true,
): Promise<
  Array<{
    task: string;
    ticket: any;
    score: number;
    method: string;
    alternatives: Array<{ ticket: any; score: number }>;
  } | null>
> => {
  if (tasks.length === 0) return [];

  // Step 1: Get preliminary matches using keyword matching for all tasks
  console.log(
    `🔍 Getting preliminary keyword matches for ${tasks.length} tasks...`,
  );
  const tasksWithPreliminaryMatches = await Promise.all(
    tasks.map(async (taskItem) => {
      const enhancedTask = taskItem.projectIdentifier
        ? `${taskItem.projectIdentifier} ${taskItem.task}`
        : taskItem.task;

      // Get top 5 keyword matches for this task
      const keywordMatches = await getTopKeywordMatches(
        enhancedTask,
        tickets,
        5,
        taskItem.projectIdentifier,
      );

      return {
        task: taskItem.task,
        projectIdentifier: taskItem.projectIdentifier,
        preliminaryMatches: keywordMatches,
      };
    }),
  );

  // Step 2: Use AI to process ALL tasks in a single mega-request if user opted for it and AI is enabled
  if (useAI && AI_CONFIG.ENABLED) {
    try {
      const geminiMatcher = getGeminiMatcher();
      if (geminiMatcher) {
        console.log(
          `🤖 Using Gemini AI to process ALL ${tasksWithPreliminaryMatches.length} tasks in single mega-request...`,
        );

        // Single mega-request for ALL tasks
        const batchResults = await geminiMatcher.batchFindTicketMatches(
          tasksWithPreliminaryMatches,
          tickets,
        );

        // Convert AI results to our expected format
        const results = batchResults.map((result, index) => {
          const originalTask = tasksWithPreliminaryMatches[index];

          if (!originalTask) {
            console.log(`❌ Missing task at index ${index}`);
            return null;
          }

          if (!result.bestMatch || !result.bestMatch.ticket) {
            console.log(
              `❌ AI found no confident match for task: "${originalTask.task}"`,
            );
            return null;
          }

          // Find the actual ticket objects
          const bestTicket = tickets.find(
            (t) => t.key === result.bestMatch?.ticket,
          );
          if (!bestTicket) {
            console.log(
              `⚠️ AI suggested ticket ${result.bestMatch.ticket} not found`,
            );
            return null;
          }

          const alternatives = result.alternatives
            .map((alt: { ticket: string; score: number }) => {
              const ticket = tickets.find((t) => t.key === alt.ticket);
              return ticket ? { ticket, score: alt.score } : null;
            })
            .filter(Boolean) as Array<{ ticket: any; score: number }>;

          console.log(
            `✅ AI found match: ${bestTicket.key} (confidence: ${result.bestMatch.score.toFixed(2)}) for "${originalTask.task}"`,
          );

          return {
            task: originalTask.task,
            ticket: bestTicket,
            score: result.bestMatch.score,
            method: "gemini-ai-mega",
            alternatives,
          };
        });

        return results;
      } else {
        console.log(`⚠️ Gemini matcher not available - check configuration`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (
        errorMessage.includes("is not found for API version") ||
        errorMessage.includes("404 Not Found")
      ) {
        console.error(
          "🚨 Gemini model configuration error. The model name might be incorrect or unsupported.",
        );
      } else if (
        errorMessage.includes("429") ||
        errorMessage.includes("quota")
      ) {
        console.error(
          "🚨 Gemini API quota exceeded. Falling back to keyword matching.",
        );
      } else {
        console.error(
          "Gemini AI batch matching failed, falling back to keyword matching:",
          errorMessage,
        );
      }
    }
  } else if (!useAI) {
    console.log(
      `🔍 User chose keyword-only matching for ${tasks.length} tasks`,
    );
  } else if (!AI_CONFIG.ENABLED) {
    console.log(
      `⚠️ AI requested but not configured (GEMINI_API_KEY missing) for ${tasks.length} tasks`,
    );
  }

  // Step 3: Fallback to keyword matching results
  console.log(`🔍 Using keyword matching results for ${tasks.length} tasks`);
  return tasksWithPreliminaryMatches.map((taskItem) => {
    const bestKeywordMatch = taskItem.preliminaryMatches[0];

    if (!bestKeywordMatch || bestKeywordMatch.prelimScore < 0.2) {
      console.log(`❌ No keyword match found for task: "${taskItem.task}"`);
      return null;
    }

    const alternatives = taskItem.preliminaryMatches
      .slice(1, 3)
      .map((match) => ({ ticket: match, score: match.prelimScore }));

    console.log(
      `✅ Keyword match found: ${bestKeywordMatch.key} (confidence: ${bestKeywordMatch.prelimScore.toFixed(2)}) for "${taskItem.task}"`,
    );

    return {
      task: taskItem.task,
      ticket: bestKeywordMatch,
      score: bestKeywordMatch.prelimScore,
      method: "keyword-batch",
      alternatives,
    };
  });
};

// Helper function to get top keyword matches for a single task
const getTopKeywordMatches = async (
  task: string,
  tickets: any[],
  limit: number = 5,
  projectIdentifier?: string,
): Promise<any[]> => {
  // Filter tickets to exclude stories and done/deployed/cancelled/closed tickets
  // and filter by project identifier if provided
  const relevantTickets = tickets.filter((ticket) => {
    const issueType =
      ticket.issuetype?.name?.toLowerCase() ||
      ticket.issueType?.toLowerCase() ||
      "";
    const status =
      ticket.status?.name?.toLowerCase() || ticket.status?.toLowerCase() || "";

    const statusValid =
      !EXCLUDED_ISSUE_TYPES.includes(issueType) &&
      !EXCLUDED_STATUS.includes(status);

    const projectMatches = matchesProjectIdentifier(ticket, projectIdentifier);

    return statusValid && projectMatches;
  });

  const taskWords = task.toLowerCase().split(/\s+/);
  const scoredTickets: Array<{ ticket: any; score: number }> = [];

  for (const ticket of relevantTickets) {
    const searchText =
      `${ticket.summary} ${ticket.description || ""}`.toLowerCase();

    let score = 0;
    for (const word of taskWords) {
      if (word.length > 2 && searchText.includes(word)) {
        score += 1 / taskWords.length;
      }
    }

    if (score > 0) {
      scoredTickets.push({ ticket, score });
    }
  }

  return scoredTickets
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => ({ ...item.ticket, prelimScore: item.score }));
};

// Enhanced prediction using Gemini AI with keyword fallback
export const predictBestTicket = async (
  task: string,
  tickets: any[],
  projectIdentifier?: string,
): Promise<{
  ticket: any;
  score: number;
  method: string;
  alternatives: Array<{ ticket: any; score: number }>;
} | null> => {
  // Try Gemini AI first if available
  if (AI_CONFIG.ENABLED) {
    try {
      const geminiMatcher = getGeminiMatcher();
      if (geminiMatcher) {
        console.log(`🤖 Using Gemini AI to match task: "${task}"`);
        const aiResult = await geminiMatcher.findBestTicketMatch(
          task,
          tickets,
          projectIdentifier,
        );

        if (aiResult && aiResult.score >= 0.3) {
          console.log(
            `✅ AI found match: ${aiResult.ticket.key} (confidence: ${aiResult.score.toFixed(2)})`,
          );
          return aiResult;
        } else {
          console.log(`❌ AI found no confident match for task`);
        }
      } else {
        console.log(`⚠️  Gemini matcher not available - check configuration`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (
        errorMessage.includes("is not found for API version") ||
        errorMessage.includes("404 Not Found")
      ) {
        console.error(
          "🚨 Gemini model configuration error. The model name might be incorrect or unsupported.",
          "Check the MODEL_NAME in AI_CONFIG and visit https://ai.google.dev/gemini-api/docs/models/gemini for valid models.",
        );
      } else {
        console.error(
          "Gemini AI matching failed, falling back to keyword matching:",
          errorMessage,
        );
      }
    }
  }

  // Fallback to keyword matching
  console.log(`🔍 Using keyword fallback for task: "${task}"`);
  const match = await fallbackKeywordMatch(task, tickets, projectIdentifier);

  if (match) {
    console.log(
      `✅ Keyword match found: ${match.ticket.key} (confidence: ${match.score.toFixed(2)})`,
    );
    return {
      ticket: match.ticket,
      score: match.score,
      method: match.method,
      alternatives: [],
    };
  }

  console.log(`❌ No match found for task`);
  return null;
};

export const processEntriesForMatching = async (
  entries: TodoEntry[],
  allTickets: any[],
  thresholds: {
    highConfidence: number;
    choice: number;
    minimum: number;
  },
  useAI: boolean = true,
): Promise<ProcessedEntry[]> => {
  // Prepare tasks for batch processing
  const tasks = entries.map((entry) => ({
    task: entry.task,
    projectIdentifier: entry.projectIdentifier,
  }));

  // Batch process all tasks
  const batchResults = await batchPredictTickets(tasks, allTickets, useAI);

  // Convert results to ProcessedEntry format
  return entries.map((entry, index) => {
    const taskId = uuidv4();
    const result = batchResults[index];

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
  });
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
