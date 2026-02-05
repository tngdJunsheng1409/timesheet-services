import { z } from "zod/v4";
import { jiraIssueTypeSchema } from "./field/issue-type.schema";
import { jiraFieldPrioritySchema } from "./field/priority.schema";
import { jiraFieldStatusSchema } from "./field/status.schema";
import { jiraFieldSummarySchema } from "./field/summary.schema";

// Additional field schemas for timesheet functionality
const jiraUserSchema = z
  .object({
    displayName: z.string(),
    accountId: z.string().optional(),
    emailAddress: z.string().optional(),
  })
  .optional()
  .nullable();

export const jiraFieldsSchema = z.object({
  summary: jiraFieldSummarySchema.optional(),
  status: jiraFieldStatusSchema.optional(),
  priority: jiraFieldPrioritySchema.optional(),
  issuetype: jiraIssueTypeSchema.optional(),
  description: z
    .union([z.string(), z.object({}).passthrough()])
    .optional()
    .nullable(),
  assignee: jiraUserSchema,
  reporter: jiraUserSchema,
});
