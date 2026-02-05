import { z } from "zod";

// Auth Credentials Schema
export const authCredentialsSchema = z.object({
  email: z.string(),
  token: z.string().min(1),
});

// Todo Entry Schema
export const todoEntrySchema = z.object({
  originalLine: z.string(),
  task: z.string(),
  projectIdentifier: z.string().optional(),
  isCompleted: z.boolean(),
  timeInfo: z
    .object({
      started: z.string().optional(),
      done: z.string().optional(),
      lasted: z.string().optional(),
    })
    .optional(),
});

// Ticket Match Schema
export const ticketMatchSchema = z.object({
  ticket: z.object({
    key: z.string(),
    summary: z.string(),
    description: z.string().optional(),
    status: z.string(),
    assignee: z.string().optional(),
    reporter: z.string().optional(),
    issueType: z.string().optional(),
    parentEpic: z.string().optional(),
  }),
  score: z.number(),
  method: z.string(),
});

// Request Schemas
export const processTodoEntriesSchema = z.object({
  email: z.string(),
  token: z.string().min(1),
  timesheet: z.string(),
  epicKeys: z.array(z.string()),
  thresholds: z
    .object({
      highConfidence: z.number().min(0).max(1).default(0.75),
      choice: z.number().min(0).max(1).default(0.5),
      minimum: z.number().min(0).max(1).default(0.3),
    })
    .optional(),
});

export const manualTicketSelectionSchema = z.object({
  email: z.string(),
  token: z.string().min(1),
  taskId: z.string(),
  selectedTicketKey: z.string(),
  confidence: z.number().optional(),
});

export const authTestSchema = z.object({
  email: z.string(),
  token: z.string().min(1),
});

export const ticketSummarySchema = z.object({
  email: z.string().email(),
  token: z.string().min(1),
  epicKeys: z.array(z.string()),
});

export const logTimesheetEntriesSchema = z.object({
  email: z.string().email(),
  token: z.string().min(1),
  timesheetEntries: z.string().min(1),
});

// Response Schemas
export const authTestResponseSchema = z.object({
  success: z.boolean(),
  accountId: z.string().nullable(),
  displayName: z.string().nullable(),
  message: z.string().optional(),
});

export const ticketSummaryResponseSchema = z.object({
  userTickets: z.array(ticketMatchSchema.shape.ticket),
  commonTickets: z.array(ticketMatchSchema.shape.ticket),
  total: z.number(),
});

export const processedEntrySchema = z.object({
  id: z.string(),
  originalTask: z.string(),
  projectIdentifier: z.string().optional(),
  timeInfo: todoEntrySchema.shape.timeInfo.optional(),
  matches: z.array(ticketMatchSchema).optional(),
  selectedTicket: ticketMatchSchema.shape.ticket.nullable(),
  status: z.enum(["auto-assigned", "needs-selection", "skipped", "unmapped"]),
  confidence: z.number().optional(),
});

export const processingResultSchema = z.object({
  entries: z.array(processedEntrySchema),
  summary: z.object({
    total: z.number(),
    mapped: z.number(),
    unmapped: z.number(),
    needsSelection: z.number(),
  }),
  timesheetPreview: z.array(z.string()),
});

// Export types
export type AuthCredentials = z.infer<typeof authCredentialsSchema>;
export type TodoEntry = z.infer<typeof todoEntrySchema>;
export type TicketMatch = z.infer<typeof ticketMatchSchema>;
export type ProcessTodoEntries = z.infer<typeof processTodoEntriesSchema>;
export type ManualTicketSelection = z.infer<typeof manualTicketSelectionSchema>;
export type LogTimesheetEntries = z.infer<typeof logTimesheetEntriesSchema>;
export type AuthTestResponse = z.infer<typeof authTestResponseSchema>;
export type TicketSummaryResponse = z.infer<typeof ticketSummaryResponseSchema>;
export type ProcessedEntry = z.infer<typeof processedEntrySchema>;
export type ProcessingResult = z.infer<typeof processingResultSchema>;
