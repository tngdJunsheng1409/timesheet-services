import { z } from "zod/v4";
import { jiraIssueSchema } from "@/schemas/jira/issue.schema";

export const jiraSearchReqSchema = z.object({
  jql: z.string(),
  fields: z.array(z.string()).optional(),
  nextPageToken: z.string().optional(),
});

export const jiraSearchResSchema = z.object({
  isLast: z.boolean(),
  issues: z.array(jiraIssueSchema),
  nextPageToken: z.string().optional(),
});

export const jiraSearchServiceSchema = {
  request: jiraSearchReqSchema,
  response: jiraSearchResSchema,
};
