import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  AI_CONFIG,
  EXCLUDED_ISSUE_TYPES,
  EXCLUDED_STATUS,
  JIRA_TIMESHEET_CONFIG,
} from "@/constants/jira-timesheet";

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

interface GeminiMatchingResult {
  bestMatch: {
    ticketKey: string;
    confidence: number;
    reasoning: string;
  } | null;
  alternatives: Array<{
    ticketKey: string;
    confidence: number;
    reasoning: string;
  }>;
}

// Module-level state for Gemini matcher
let genAI: GoogleGenerativeAI | null = null;
let model: any = null;

const FALLBACK_MODELS = [
  "models/gemini-2.5-flash",
  "models/gemini-2.5-pro",
  "models/gemini-2.0-flash",
  "models/gemini-flash-latest",
  "models/gemini-pro-latest",
  "models/gemini-2.0-flash-lite",
];

/**
 * Initialize the Gemini API client and model
 */
const initializeGemini = (): void => {
  if (!JIRA_TIMESHEET_CONFIG.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }

  genAI = new GoogleGenerativeAI(JIRA_TIMESHEET_CONFIG.GEMINI_API_KEY);
  initializeModel();
};

const initializeModel = (): void => {
  if (!genAI) {
    throw new Error("Gemini client not initialized");
  }

  // Try primary model first, then fallback models
  const modelsToTry = [AI_CONFIG.MODEL_NAME, ...FALLBACK_MODELS];

  for (const modelName of modelsToTry) {
    try {
      model = genAI.getGenerativeModel({ model: modelName });
      console.log(`🤖 Initialized Gemini with model: ${modelName}`);
      return;
    } catch (error) {
      console.warn(`Failed to initialize model ${modelName}:`, error);
    }
  }

  // If all models fail, try to list available models
  listAvailableModels().catch(() => {
    console.error("Could not retrieve available models list");
  });

  throw new Error("Failed to initialize any Gemini model");
};

/**
 * List available models for debugging purposes
 */
const listAvailableModels = async (): Promise<void> => {
  try {
    console.log("🔍 Attempting to list available Gemini models...");
    // Note: This requires a different API call that might not be available in all versions
    // This is mainly for debugging purposes
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${JIRA_TIMESHEET_CONFIG.GEMINI_API_KEY}`,
    );

    if (response.ok) {
      const data = await response.json();
      console.log(
        "📋 Available models:",
        data.models?.map((m: any) => m.name).join(", "),
      );
    } else {
      console.log("⚠️ Could not fetch available models");
    }
  } catch (error) {
    console.warn("Error listing models:", error);
  }
};

/**
 * Batch process multiple tasks in a single AI request
 */
const batchFindTicketMatches = async (
  tasksWithPreliminaryMatches: Array<{
    task: string;
    projectIdentifier?: string;
    preliminaryMatches: any[];
  }>,
  allTickets: any[],
): Promise<
  Array<{
    task: string;
    bestMatch: { ticket: any; score: number; reasoning: string } | null;
    alternatives: Array<{ ticket: any; score: number; reasoning: string }>;
  }>
> => {
  try {
    if (tasksWithPreliminaryMatches.length === 0) return [];

    // Ensure Gemini is initialized
    if (!genAI || !model) {
      initializeGemini();
    }

    // Filter tickets to exclude stories and done/deployed/cancelled/closed tickets
    // and filter by project identifier if any task has one
    const hasProjectIdentifiers = tasksWithPreliminaryMatches.some(
      (t) => t.projectIdentifier,
    );
    const relevantTickets = allTickets.filter((ticket) => {
      const issueType =
        ticket.issuetype?.name?.toLowerCase() ||
        ticket.issueType?.toLowerCase() ||
        "";
      const status =
        ticket.status?.name?.toLowerCase() ||
        ticket.status?.toLowerCase() ||
        "";

      const statusValid =
        !EXCLUDED_ISSUE_TYPES.includes(issueType) &&
        !EXCLUDED_STATUS.includes(status);

      // If any task has project identifier, only include tickets that could match any of them
      if (hasProjectIdentifiers) {
        const projectMatches = tasksWithPreliminaryMatches.some((task) =>
          matchesProjectIdentifier(ticket, task.projectIdentifier),
        );
        return statusValid && projectMatches;
      }

      return statusValid;
    });

    console.log(
      `🔍 Filtered tickets: ${allTickets.length} → ${relevantTickets.length} (excluded stories/done/deployed/cancelled/closed)`,
    );

    console.log(
      `🚀 Preparing MEGA-PROMPT: ${tasksWithPreliminaryMatches.length} tasks vs ${relevantTickets.length} tickets`,
    );

    const prompt = createBatchMatchingPrompt(
      tasksWithPreliminaryMatches,
      relevantTickets,
    );
    const result = await callGeminiWithBatchRetry(
      prompt,
      tasksWithPreliminaryMatches.length,
    );
    const parsed = parseBatchGeminiResponse(
      result,
      tasksWithPreliminaryMatches.length,
    );

    return parsed;
  } catch (error) {
    console.error("Batch Gemini AI matching failed:", error);
    return tasksWithPreliminaryMatches.map((item) => ({
      task: item.task,
      bestMatch: null,
      alternatives: [],
    }));
  }
};

const findBestTicketMatch = async (
  task: string,
  tickets: any[],
  projectIdentifier?: string,
): Promise<{
  ticket: any;
  score: number;
  method: string;
  alternatives: Array<{ ticket: any; score: number }>;
} | null> => {
  try {
    if (tickets.length === 0) return null;

    // Ensure Gemini is initialized
    if (!genAI || !model) {
      initializeGemini();
    }

    // Filter tickets to exclude stories and done/deployed/cancelled/closed tickets
    // and filter by project identifier if provided
    const relevantTickets = tickets.filter((ticket) => {
      const issueType =
        ticket.issuetype?.name?.toLowerCase() ||
        ticket.issueType?.toLowerCase() ||
        "";
      const status =
        ticket.status?.name?.toLowerCase() ||
        ticket.status?.toLowerCase() ||
        "";

      const statusValid =
        !EXCLUDED_ISSUE_TYPES.includes(issueType) &&
        !EXCLUDED_STATUS.includes(status);

      const projectMatches = matchesProjectIdentifier(
        ticket,
        projectIdentifier,
      );

      return statusValid && projectMatches;
    });

    if (relevantTickets.length === 0) return null;

    const prompt = createMatchingPrompt(
      task,
      relevantTickets,
      projectIdentifier,
    );

    const result = await callGeminiWithRetry(prompt);
    const parsed = parseGeminiResponse(result);

    if (!parsed.bestMatch) return null;

    // Find the actual ticket objects from the filtered list
    const bestTicket = relevantTickets.find(
      (t) => t.key === parsed.bestMatch?.ticketKey,
    );
    if (!bestTicket) return null;

    const alternatives = parsed.alternatives
      .map((alt) => {
        const ticket = relevantTickets.find((t) => t.key === alt.ticketKey);
        return ticket ? { ticket, score: alt.confidence } : null;
      })
      .filter(Boolean) as Array<{ ticket: any; score: number }>;

    return {
      ticket: bestTicket,
      score: parsed.bestMatch.confidence,
      method: "gemini-ai",
      alternatives,
    };
  } catch (error) {
    console.error("Gemini AI matching failed:", error);
    return null;
  }
};

const createBatchMatchingPrompt = (
  tasksWithMatches: Array<{
    task: string;
    projectIdentifier?: string;
    preliminaryMatches: any[];
  }>,
  allTickets: any[],
): string => {
  // Create comprehensive task list with all information
  const allTasksString = tasksWithMatches
    .map((item, index) => {
      const projectContext = item.projectIdentifier
        ? `[${item.projectIdentifier}] `
        : "";

      const preliminaryMatchesSummary = item.preliminaryMatches
        .slice(0, 2) // Top 2 preliminary matches to save space
        .map((ticket) => `${ticket.key}`)
        .join(", ");

      return `${index + 1}. "${projectContext}${item.task}" (prelim: ${preliminaryMatchesSummary || "none"})`;
    })
    .join("\n");

  // Create comprehensive ticket list - simplified for mega-prompt
  const allTicketsString = allTickets
    .map((ticket) => {
      return `${ticket.key}: ${ticket.summary.substring(0, 100)}... (${ticket.issuetype?.name || "Unknown"})`;
    })
    .join("\n");

  return `You are an expert at matching work tasks to JIRA tickets in bulk. I have ${tasksWithMatches.length} tasks that need to be matched against ${allTickets.length} JIRA tickets.

TASKS TO PROCESS:
${allTasksString}

AVAILABLE JIRA TICKETS:
${allTicketsString}

INSTRUCTIONS:
- Process ALL ${tasksWithMatches.length} tasks in one response
- Match each task to the best available ticket
- Consider project context in brackets (e.g., [mydebit] tasks should match tickets with similar project labels)
- Focus on semantic similarity and keywords
- Avoid duplicate ticket assignments when possible

Return your response in this exact JSON format:
{
  "matches": [
    {
      "taskIndex": 1,
      "bestMatch": {
        "ticketKey": "TICKET-123",
        "confidence": 0.85,
        "reasoning": "Brief explanation"
      },
      "alternatives": [
        {
          "ticketKey": "TICKET-456",
          "confidence": 0.60,
          "reasoning": "Alternative reason"
        }
      ]
    }
  ]
}

CRITICAL:
- Include ALL ${tasksWithMatches.length} tasks in your matches array
- Use taskIndex 1-${tasksWithMatches.length} (1-based indexing)
- Confidence scores: 0.9-1.0 (perfect), 0.75-0.89 (high), 0.5-0.74 (medium), 0.3-0.49 (low), 0.0-0.29 (very low)
- If no good match exists (confidence < 0.3), set bestMatch to null
- Maximum 2 alternatives per task to keep response manageable
- Be concise in reasoning to avoid token limits`;
};

const createMatchingPrompt = (
  task: string,
  tickets: any[],
  projectIdentifier?: string,
): string => {
  const ticketSummaries = tickets.map((ticket) => ({
    key: ticket.key,
    summary: ticket.summary,
    description: (ticket.description || "").substring(0, 200), // Truncate to avoid token limits
    type: ticket.issuetype?.name || "Unknown",
    priority: ticket.priority?.name || "Unknown",
    status: ticket.status?.name || "Unknown",
    project: ticket.project?.key || "Unknown",
  }));

  const projectContext = projectIdentifier
    ? `The task is from project/context: "${projectIdentifier}". Please consider this when matching.`
    : "";

  return `You are an expert at matching work tasks to JIRA tickets. I need you to find the best matching JIRA ticket(s) for a given task.

Task to match: "${task}"
${projectContext}

Available JIRA tickets:
${ticketSummaries
  .map(
    (t, i) =>
      `${i + 1}. ${t.key}: ${t.summary}
   Type: ${t.type} | Priority: ${t.priority} | Status: ${t.status} | Project: ${t.project}
   Description: ${t.description}...`,
  )
  .join("\n\n")}

Please analyze the task and find the best matching ticket(s). Consider:
1. Semantic similarity between task description and ticket summary/description
2. Project context if provided
3. Task type and ticket type compatibility
4. Keywords and technical terms
5. Business context and workflow

Return your response in this exact JSON format:
{
  "bestMatch": {
    "ticketKey": "TICKET-123",
    "confidence": 0.85,
    "reasoning": "Explanation of why this is the best match"
  },
  "alternatives": [
    {
      "ticketKey": "TICKET-456",
      "confidence": 0.60,
      "reasoning": "Why this could be an alternative"
    }
  ]
}

Confidence scores should be between 0.0 and 1.0:
- 0.9-1.0: Perfect/near-perfect match
- 0.75-0.89: High confidence match
- 0.5-0.74: Medium confidence, might need user selection
- 0.3-0.49: Low confidence, but possible
- 0.0-0.29: Very low/no meaningful match

If no good match exists (confidence < 0.3), set bestMatch to null.
Provide at most 3 alternatives, ordered by confidence.`;
};

const callGeminiWithBatchRetry = async (
  prompt: string,
  taskCount: number,
): Promise<string> => {
  let lastError: Error | null = null;
  let modelIndex = 0;
  const modelsToTry = [AI_CONFIG.MODEL_NAME, ...FALLBACK_MODELS];

  console.log(
    `📝 MEGA-REQUEST prompt size: ~${Math.round(prompt.length / 1000)}K characters for ${taskCount} tasks`,
  );

  while (modelIndex < modelsToTry.length) {
    const currentModel = modelsToTry[modelIndex];

    for (let attempt = 1; attempt <= AI_CONFIG.MAX_RETRIES; attempt++) {
      try {
        // Try current model
        if (modelIndex > 0) {
          console.log(`🔄 Trying fallback model: ${currentModel}`);
          if (!genAI) throw new Error("Gemini client not initialized");
          model = genAI.getGenerativeModel({
            model: currentModel!,
          });
        }

        console.log(
          `⏱️ MEGA-REQUEST processing (attempt ${attempt}) - may take up to ${AI_CONFIG.BATCH_TIMEOUT_MS / 1000}s for ${taskCount} tasks...`,
        );

        const result = await Promise.race([
          model.generateContent(prompt),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Batch timeout")),
              AI_CONFIG.BATCH_TIMEOUT_MS, // Use longer timeout for batch
            ),
          ),
        ]);

        // @ts-ignore - result should have response property
        const response = await result.response;
        return response.text();
      } catch (error) {
        lastError = error as Error;
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        // Check if it's a model not found error
        if (
          errorMessage.includes("is not found for API version") ||
          errorMessage.includes("404 Not Found")
        ) {
          console.warn(
            `❌ Model ${currentModel} not found, trying next model...`,
          );
          break; // Try next model
        }

        // Check for quota exceeded
        if (errorMessage.includes("429") || errorMessage.includes("quota")) {
          console.warn(
            `🚨 Rate limit hit with model ${currentModel}, trying next model...`,
          );
          break; // Try next model immediately for rate limits
        }

        console.warn(
          `MEGA-REQUEST Gemini API attempt ${attempt} with model ${currentModel} failed:`,
          errorMessage.includes("timeout")
            ? "Timeout (mega-request processing takes longer)"
            : errorMessage,
        );

        if (attempt < AI_CONFIG.MAX_RETRIES) {
          // Exponential backoff, but longer for mega-request processing
          const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 15000); // Up to 15s for mega-requests
          console.log(`⏳ Retrying mega-request in ${backoffMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }

    modelIndex++;
  }

  console.error(
    `🚨 All models exhausted for MEGA-REQUEST processing. Available models can be found at: https://ai.google.dev/gemini-api/docs/models/gemini`,
  );
  throw (
    lastError ||
    new Error("Failed to call Gemini API with any available models")
  );
};

const callGeminiWithRetry = async (prompt: string): Promise<string> => {
  let lastError: Error | null = null;
  let modelIndex = 0;
  const modelsToTry = [AI_CONFIG.MODEL_NAME, ...FALLBACK_MODELS];

  while (modelIndex < modelsToTry.length) {
    const currentModel = modelsToTry[modelIndex];

    for (let attempt = 1; attempt <= AI_CONFIG.MAX_RETRIES; attempt++) {
      try {
        // Try current model
        if (modelIndex > 0) {
          console.log(`🔄 Trying fallback model: ${currentModel}`);
          if (!genAI) throw new Error("Gemini client not initialized");
          model = genAI.getGenerativeModel({
            model: currentModel!,
          });
        }

        const result = await Promise.race([
          model.generateContent(prompt),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Timeout")),
              AI_CONFIG.TIMEOUT_MS,
            ),
          ),
        ]);

        // @ts-ignore - result should have response property
        const response = await result.response;
        return response.text();
      } catch (error) {
        lastError = error as Error;
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        // Check if it's a model not found error
        if (
          errorMessage.includes("is not found for API version") ||
          errorMessage.includes("404 Not Found")
        ) {
          console.warn(
            `❌ Model ${currentModel} not found, trying next model...`,
          );
          break; // Try next model
        }

        console.warn(
          `Gemini API attempt ${attempt} with model ${currentModel} failed:`,
          errorMessage,
        );

        if (attempt < AI_CONFIG.MAX_RETRIES) {
          // Exponential backoff
          const backoffMs = 1000 * Math.pow(2, attempt - 1);
          console.log(`⏳ Retrying in ${backoffMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }

    modelIndex++;
  }

  console.error(
    `🚨 All models exhausted. Available models can be found at: https://ai.google.dev/gemini-api/docs/models/gemini`,
  );
  throw (
    lastError ||
    new Error("Failed to call Gemini API with any available models")
  );
};

const parseBatchGeminiResponse = (
  response: string,
  expectedTaskCount: number,
): Array<{
  task: string;
  bestMatch: { ticket: any; score: number; reasoning: string } | null;
  alternatives: Array<{ ticket: any; score: number; reasoning: string }>;
}> => {
  try {
    // Clean up the response to extract JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.matches || !Array.isArray(parsed.matches)) {
      throw new Error("Invalid response structure - missing matches array");
    }

    // Convert the response to our expected format
    const results: Array<{
      task: string;
      bestMatch: { ticket: any; score: number; reasoning: string } | null;
      alternatives: Array<{ ticket: any; score: number; reasoning: string }>;
    }> = [];

    // Initialize results array with empty entries
    for (let i = 0; i < expectedTaskCount; i++) {
      results.push({
        task: `Task ${i + 1}`, // Will be updated by caller
        bestMatch: null,
        alternatives: [],
      });
    }

    // Process each match from the AI response
    for (const match of parsed.matches) {
      const taskIndex = (match.taskIndex || 1) - 1; // Convert to 0-based index

      if (taskIndex >= 0 && taskIndex < expectedTaskCount) {
        let bestMatch = null;

        if (match.bestMatch && match.bestMatch.ticketKey) {
          // Find the actual ticket object
          // Note: This will be handled by the caller since they have access to allTickets
          bestMatch = {
            ticket: match.bestMatch.ticketKey, // Store ticketKey as ticket for now
            score: Math.max(
              0,
              Math.min(1, Number(match.bestMatch.confidence) || 0),
            ),
            reasoning: match.bestMatch.reasoning || "No reasoning provided",
          };
        }

        const alternatives = (match.alternatives || [])
          .filter((alt: any) => alt && alt.ticketKey)
          .slice(0, 2)
          .map((alt: any) => ({
            ticket: alt.ticketKey, // Store ticketKey as ticket for now
            score: Math.max(0, Math.min(1, Number(alt.confidence) || 0)),
            reasoning: alt.reasoning || "No reasoning provided",
          }));

        results[taskIndex] = {
          task: `Task ${taskIndex + 1}`,
          bestMatch,
          alternatives,
        };
      }
    }

    return results;
  } catch (error) {
    console.error("Failed to parse batch Gemini response:", error);
    console.error("Raw response:", response);

    // Return empty results for all tasks
    return Array(expectedTaskCount)
      .fill(null)
      .map((_, index) => ({
        task: `Task ${index + 1}`,
        bestMatch: null,
        alternatives: [],
      }));
  }
};

const parseGeminiResponse = (response: string): GeminiMatchingResult => {
  try {
    // Clean up the response to extract JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate the structure
    if (typeof parsed !== "object") {
      throw new Error("Invalid response structure");
    }

    // Ensure confidence scores are valid numbers
    if (parsed.bestMatch) {
      parsed.bestMatch.confidence = Math.max(
        0,
        Math.min(1, Number(parsed.bestMatch.confidence) || 0),
      );
    }

    if (parsed.alternatives) {
      parsed.alternatives = parsed.alternatives
        .filter((alt: any) => alt && alt.ticketKey)
        .map((alt: any) => ({
          ...alt,
          confidence: Math.max(0, Math.min(1, Number(alt.confidence) || 0)),
        }))
        .slice(0, 3); // Limit to 3 alternatives
    }

    return parsed;
  } catch (error) {
    console.error("Failed to parse Gemini response:", error);
    console.error("Raw response:", response);
    return { bestMatch: null, alternatives: [] };
  }
};

// Create a matcher interface to match the class API
interface GeminiMatcher {
  batchFindTicketMatches: typeof batchFindTicketMatches;
  findBestTicketMatch: typeof findBestTicketMatch;
}

// Singleton instance
let geminiMatcher: GeminiMatcher | null = null;

export const getGeminiMatcher = (): GeminiMatcher | null => {
  if (!AI_CONFIG.ENABLED) {
    return null;
  }

  if (!geminiMatcher) {
    try {
      // Initialize Gemini on first use
      if (!genAI || !model) {
        initializeGemini();
      }

      geminiMatcher = {
        batchFindTicketMatches,
        findBestTicketMatch,
      };
    } catch (error) {
      console.error("Failed to initialize Gemini matcher:", error);
      return null;
    }
  }

  return geminiMatcher;
};

/**
 * Utility function to discover available Gemini models
 * Run this independently to debug model availability
 */
export const discoverAvailableModels = async (): Promise<string[]> => {
  if (!JIRA_TIMESHEET_CONFIG.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }

  console.log("🔍 Discovering available Gemini models...");

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${JIRA_TIMESHEET_CONFIG.GEMINI_API_KEY}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const models = data.models || [];

    console.log("📋 Available models:", models.length);
    models.forEach((model: any) => {
      console.log(
        `  - ${model.name} (supports: ${model.supportedGenerationMethods?.join(", ") || "unknown"})`,
      );
    });

    return models
      .filter((model: any) =>
        model.supportedGenerationMethods?.includes("generateContent"),
      )
      .map((model: any) => model.name);
  } catch (error) {
    console.error("❌ Failed to discover models:", error);
    throw error;
  }
};
