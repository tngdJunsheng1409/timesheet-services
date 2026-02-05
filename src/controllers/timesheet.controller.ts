import type { Request, Response } from "express";
import {
  testAuthentication,
  fetchAllUserTickets,
  fetchSubTicketsFromEpics,
  getTicketByKey,
} from "@/services/jira";
import {
  parseTodoContent,
  processEntriesForMatching,
  generateTimesheetOutput,
} from "@/services/todo-processing";
import {
  processTodoEntriesSchema,
  manualTicketSelectionSchema,
  authTestSchema,
  logTimesheetEntriesSchema,
} from "@/schemas/timesheet.schema";

import { RouteOptions } from "@/types/routes";
import {
  logWorkToJira,
  parseTimesheetEntries,
} from "@/services/timesheet-logging";

// Default configuration
const DEFAULT_THRESHOLDS = {
  highConfidence: 0.75,
  choice: 0.5,
  minimum: 0.3,
};

const timesheetAuthTest = async (req: Request, res: Response) => {
  try {
    // Validate request body
    const parsed = authTestSchema.safeParse(req.body);
    console.log("able to get here -> ", parsed);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid request body - email and token are required",
        errors: parsed.error.issues,
      });
    }

    const { email, token } = parsed.data;
    const authResult = await testAuthentication(email, token);
    console.log("authResult -> ", parsed);
    res.json(authResult);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getTicketSummary = async (req: Request, res: Response) => {
  try {
    const { ticketSummarySchema } = await import("@/schemas/timesheet.schema");

    // Validate request body
    const parsed = ticketSummarySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid request body - email and token are required",
        errors: parsed.error.issues,
      });
    }

    const { email, token, epicKeys } = parsed.data;

    const authResult = await testAuthentication(email, token);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: "Authentication failed",
      });
    }

    // Fetch user tickets
    const userTickets = await fetchAllUserTickets(
      email,
      token,
      authResult.accountId!,
      authResult.displayName!,
    );

    // Fetch common tickets from epics
    const commonTickets = await fetchSubTicketsFromEpics(
      email,
      token,
      epicKeys,
    );

    res.json({
      userTickets: userTickets || [],
      commonTickets,
      total: (userTickets?.length || 0) + commonTickets.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const processTodoEntries = async (req: Request, res: Response) => {
  try {
    // Validate request body
    const parsed = processTodoEntriesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid request body",
        errors: parsed.error.issues,
      });
    }

    const {
      email,
      token,
      timesheet,
      epicKeys,
      thresholds = DEFAULT_THRESHOLDS,
    } = parsed.data;

    // Test authentication
    const authResult = await testAuthentication(email, token);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: "JIRA authentication failed",
      });
    }

    // Parse todo content
    const todoEntries = parseTodoContent(timesheet);

    if (todoEntries.length === 0) {
      return res.json({
        entries: [],
        summary: {
          total: 0,
          mapped: 0,
          unmapped: 0,
          needsSelection: 0,
        },
        timesheetPreview: [],
      });
    }

    // Fetch tickets
    const userTickets = await fetchAllUserTickets(
      email,
      token,
      authResult.accountId!,
      authResult.displayName!,
    );
    const commonTickets = await fetchSubTicketsFromEpics(
      email,
      token,
      epicKeys,
    );
    const allTickets = userTickets
      ? [...userTickets, ...commonTickets]
      : commonTickets;

    // Process entries for matching
    const processedEntries = await processEntriesForMatching(
      todoEntries,
      allTickets,
      thresholds,
    );

    // Generate summary
    const summary = {
      total: processedEntries.length,
      mapped: processedEntries.filter(
        (e) => e.status === "auto-assigned" || e.selectedTicket,
      ).length,
      unmapped: processedEntries.filter((e) => e.status === "unmapped").length,
      needsSelection: processedEntries.filter(
        (e) => e.status === "needs-selection",
      ).length,
    };

    // Generate timesheet preview
    const timesheetPreview = generateTimesheetOutput(processedEntries).slice(
      0,
      10,
    );

    res.json({
      entries: processedEntries,
      summary,
      timesheetPreview,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const selectTicketManually = async (req: Request, res: Response) => {
  try {
    // Validate request body
    const parsed = manualTicketSelectionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid request body",
        errors: parsed.error.issues,
      });
    }

    const { email, token, selectedTicketKey } = parsed.data;

    // Fetch ticket details
    const ticket = await getTicketByKey(email, token, selectedTicketKey);

    res.json({
      success: true,
      ticket,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const generateTimesheetFile = async (req: Request, res: Response) => {
  try {
    const { entries } = req.body;

    if (!Array.isArray(entries)) {
      return res.status(400).json({
        success: false,
        message: "Invalid entries array",
      });
    }

    const timesheetOutput = generateTimesheetOutput(entries);
    const output = timesheetOutput.join("\n");

    res.set({
      "Content-Type": "text/plain",
      "Content-Disposition": 'attachment; filename="timesheet-output.txt"',
    });

    res.send(output);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const logTimesheetEntries = async (req: Request, res: Response) => {
  try {
    // Validate request body
    const parsed = logTimesheetEntriesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid request body",
        errors: parsed.error.issues,
      });
    }

    const { email, token, timesheetEntries } = parsed.data;

    // Test authentication
    const authResult = await testAuthentication(email, token);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: "JIRA authentication failed",
      });
    }

    // Parse timesheet entries
    const parsedEntries = parseTimesheetEntries(timesheetEntries);

    if (parsedEntries.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid timesheet entries found",
      });
    }

    // Log entries to Jira
    const results = await Promise.allSettled(
      parsedEntries.map((entry) => logWorkToJira(email, token, entry)),
    );

    const successCount = results.filter((r) => r.status === "fulfilled").length;
    const failureCount = results.filter((r) => r.status === "rejected").length;

    const failedEntries = results
      .map((result, index) => {
        if (result.status === "rejected") {
          return {
            entry: parsedEntries[index],
            error: result.reason.message || "Unknown error",
          };
        }
        return null;
      })
      .filter(Boolean);

    res.json({
      success: true,
      summary: {
        total: parsedEntries.length,
        successful: successCount,
        failed: failureCount,
      },
      failedEntries,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const timesheetControllers: RouteOptions[] = [
  {
    url: "/timesheet/auth/test",
    method: "POST" as const,
    handler: timesheetAuthTest,
  },
  {
    url: "/timesheet/tickets/summary",
    method: "POST" as const,
    handler: getTicketSummary,
  },
  {
    url: "/timesheet/todo/process",
    method: "POST" as const,
    handler: processTodoEntries,
  },
  {
    url: "/timesheet/tickets/select",
    method: "POST" as const,
    handler: selectTicketManually,
  },
  {
    url: "/timesheet/generate",
    method: "POST" as const,
    handler: generateTimesheetFile,
  },
  {
    url: "/timesheet/log/entries",
    method: "POST" as const,
    handler: logTimesheetEntries,
  },
];
