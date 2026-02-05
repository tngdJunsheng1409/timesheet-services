import { z } from "zod";

export const jiraFieldPrioritySchema = z.object({
  self: z.string(),
  iconUrl: z.string(),
  name: z.string(),
  id: z.string(),
});
