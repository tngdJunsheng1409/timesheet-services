import { z } from "zod";
import { jiraFieldParentSchema } from "./field/parent.schema";
import { jiraFieldsSchema } from "@/schemas/jira/fields.schema";

export const jiraIssueSchema = z.object({
  id: z.string(),
  self: z.string(),
  key: z.string(),
  fields: jiraFieldsSchema.extend({
    parent: jiraFieldParentSchema.optional(),
  }),
});
