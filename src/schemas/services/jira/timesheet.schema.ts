import { z } from "zod";

// User authentication schema
export const jiraUserAuthReqSchema = z.object({});

export const jiraUserAuthResSchema = z.object({
  accountId: z.string(),
  displayName: z.string(),
  emailAddress: z.string(),
  active: z.boolean(),
  timeZone: z.string().optional(),
});

export const jiraUserAuthServiceSchema = {
  request: jiraUserAuthReqSchema,
  response: jiraUserAuthResSchema,
};

// Text search schema (for ticket search by query)
export const jiraTextSearchReqSchema = z.object({
  jql: z.string(),
  maxResults: z.number().optional(),
  fields: z.array(z.string()).optional(),
});

export const jiraTextSearchResSchema = z.object({
  issues: z.array(z.any()), // Using any since we'll transform the response
  total: z.number(),
  maxResults: z.number(),
});

export const jiraTextSearchServiceSchema = {
  request: jiraTextSearchReqSchema,
  response: jiraTextSearchResSchema,
};
