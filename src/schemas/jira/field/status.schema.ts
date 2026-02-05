import { z } from "zod";

export const jiraFieldStatusSchema = z.object({
  self: z.string(),
  description: z.string(),
  iconUrl: z.string(),
  name: z.string(),
  untranslatedName: z.string().optional(),
  id: z.string(),
  statusCategory: z.object({
    self: z.string(),
    id: z.number(),
    key: z.string(),
    colorName: z.string(),
    name: z.string(),
  }),
});
