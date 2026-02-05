import z from "zod/v4"

export const jiraIssueTypeSchema = z.object({
  self: z.string(),
  id: z.string(),
  description: z.string(),
  iconUrl: z.string(),
  name: z.string(),
  subtask: z.boolean(),
  hierarchyLevel: z.number(),
})
