import { jiraSearchServiceSchema } from "@/schemas/services/jira/search.schema";
import {
  jiraUserAuthServiceSchema,
  jiraTextSearchServiceSchema,
} from "@/schemas/services/jira/timesheet.schema";
import { jiraWorklogServiceSchema } from "@/schemas/services/jira/worklog.schema";

export const jiraApiSchemas = {
  "search/jql": jiraSearchServiceSchema,
  myself: jiraUserAuthServiceSchema,
  "search/text": jiraTextSearchServiceSchema,
  "issue/{issueKey}/worklog": jiraWorklogServiceSchema,
};
