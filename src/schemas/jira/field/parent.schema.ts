import { z } from "zod";
import { jiraFieldsSchema } from "@/schemas/jira/fields.schema";

export const jiraFieldParentSchema = z.object({
  id: z.string(),
  key: z.string(),
  self: z.string(),
  fields: jiraFieldsSchema,
});
