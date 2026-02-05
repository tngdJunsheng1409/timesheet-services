import { z } from "zod";

// Worklog request schema
export const jiraWorklogReqSchema = z.object({
  comment: z.object({
    type: z.literal("doc"),
    version: z.number(),
    content: z.array(
      z.object({
        type: z.literal("paragraph"),
        content: z.array(
          z.object({
            type: z.literal("text"),
            text: z.string(),
          }),
        ),
      }),
    ),
  }),
  started: z.string(),
  timeSpentSeconds: z.number(),
});

// Worklog response schema
export const jiraWorklogResSchema = z.object({
  self: z.string(),
  author: z.object({
    self: z.string(),
    accountId: z.string(),
    displayName: z.string(),
  }),
  comment: z.object({
    type: z.literal("doc"),
    version: z.number(),
    content: z.array(
      z.object({
        type: z.literal("paragraph"),
        content: z.array(
          z.object({
            type: z.literal("text"),
            text: z.string(),
          }),
        ),
      }),
    ),
  }),
  created: z.string(),
  updated: z.string(),
  started: z.string(),
  timeSpent: z.string(),
  timeSpentSeconds: z.number(),
  id: z.string(),
  issueId: z.string(),
});

// Service schema for worklog endpoint
export const jiraWorklogServiceSchema = {
  request: jiraWorklogReqSchema,
  response: jiraWorklogResSchema,
};

// Export types
export type JiraWorklogReq = z.infer<typeof jiraWorklogReqSchema>;
export type JiraWorklogRes = z.infer<typeof jiraWorklogResSchema>;
