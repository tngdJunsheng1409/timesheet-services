import { tngdJiraDomain } from "@/constants/jira";
import { jiraApiSchemas } from "@/schemas/jira.schema";
import { createZodRequestor } from "@/utils/create-zod-requestor";
import axios from "axios";
import { jiraSearchResSchema } from "@/schemas/services/jira/search.schema";
import { jiraUserAuthResSchema } from "@/schemas/services/jira/timesheet.schema";
import { jiraIssueSchema } from "@/schemas/jira/issue.schema";

interface ProcessedTicket {
  key: string;
  summary: string;
  description: string;
  status: string;
  assignee: string;
  reporter: string;
  issueType: string;
  parentEpic?: string;
}

const JIRA_URL = process.env.JIRA_URL;

if (!JIRA_URL) {
  throw new Error("JIRA_URL environment variable is required for JIRA access.");
}

// Helper function to create requestor with dynamic credentials
const createJiraRequestor = (email: string, apiToken: string) => {
  const token = Buffer.from(`${email}:${apiToken}`).toString("base64");
  return createZodRequestor(jiraApiSchemas, {
    baseURL: `${tngdJiraDomain}/rest/api/3/`,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${token}`,
    },
  });
};

// Timesheet functionality using dynamic credentials
export const testAuthentication = async (email: string, apiToken: string) => {
  try {
    const jiraRequestor = createJiraRequestor(email, apiToken);
    const jiraGetMyself = jiraRequestor.createNormalRequest("myself", {
      method: "GET",
    });

    const rawRes = await jiraGetMyself();
    const res = jiraUserAuthResSchema.parse(rawRes);

    return {
      success: true,
      accountId: res.accountId,
      displayName: res.displayName,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      accountId: null,
      displayName: null,
      message: errorMessage,
    };
  }
};

export const fetchAllUserTickets = async (
  email: string,
  apiToken: string,
  accountId: string,
  displayName: string,
): Promise<ProcessedTicket[]> => {
  try {
    const jiraRequestor = createJiraRequestor(email, apiToken);
    const jiraSearchIssues = jiraRequestor.createNormalRequest("search/jql");

    const rawRes = await jiraSearchIssues({
      jql: `(assignee="${accountId}" OR reporter="${accountId}") AND type != Story`,
      maxResults: 1000,
      fields: [
        "key",
        "summary",
        "status",
        "assignee",
        "reporter",
        "description",
        "issuetype",
      ],
    });

    const res = jiraSearchResSchema.parse(rawRes);

    if (res.issues.length > 0) {
      const tickets = res.issues
        .filter((issue) => {
          const issueType = issue.fields?.issuetype?.name?.toLowerCase() || "";
          const status = issue.fields?.status?.name?.toLowerCase() || "";
          return (
            issueType !== "story" && status !== "done" && status !== "deployed"
          );
        })
        .map(
          (issue): ProcessedTicket => ({
            key: issue.key,
            summary: issue.fields?.summary || "No summary",
            description:
              typeof issue.fields?.description === "string"
                ? issue.fields.description
                : "",
            status: issue.fields?.status?.name || "Unknown",
            assignee: issue.fields?.assignee?.displayName || "Unassigned",
            reporter: issue.fields?.reporter?.displayName || "Unknown",
            issueType: issue.fields?.issuetype?.name || "Unknown",
          }),
        );

      const userTickets = tickets.filter(
        (ticket) =>
          (ticket.assignee &&
            ticket.assignee
              .toLowerCase()
              .includes(displayName.toLowerCase())) ||
          (ticket.reporter &&
            ticket.reporter.toLowerCase().includes(displayName.toLowerCase())),
      );

      return userTickets.length > 0 ? userTickets : tickets;
    }
    return [];
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch user tickets:", errorMessage);
    throw error;
  }

  return [];
};

export const fetchSubTicketsFromEpics = async (
  email: string,
  apiToken: string,
  epicKeys: string[] = [],
): Promise<ProcessedTicket[]> => {
  let allSubTickets: ProcessedTicket[] = [];

  try {
    const jiraRequestor = createJiraRequestor(email, apiToken);
    const jiraSearchIssues = jiraRequestor.createNormalRequest("search/jql");

    for (const epicKey of epicKeys) {
      const jqlQuery = `("Epic Link" = ${epicKey} OR parent = ${epicKey}) AND assignee is EMPTY`;

      const rawRes = await jiraSearchIssues({
        jql: jqlQuery,
        maxResults: 1000,
        fields: [
          "key",
          "summary",
          "status",
          "assignee",
          "description",
          "issuetype",
          "parent",
        ],
      });

      const res = jiraSearchResSchema.parse(rawRes);

      if (res.issues.length > 0) {
        const subTickets = res.issues
          .filter((issue) => {
            const assignee = issue.fields?.assignee?.displayName;
            return !assignee || assignee === "Unassigned";
          })
          .map(
            (issue): ProcessedTicket => ({
              key: issue.key,
              summary: issue.fields?.summary || "No summary",
              description:
                typeof issue.fields?.description === "string"
                  ? issue.fields.description
                  : "",
              status: issue.fields?.status?.name || "Unknown",
              assignee: issue.fields?.assignee?.displayName || "Unassigned",
              issueType: issue.fields?.issuetype?.name || "Unknown",
              reporter: issue.fields?.reporter?.displayName || "Unknown",
              parentEpic: epicKey,
            }),
          );

        if (subTickets.length > 0) {
          allSubTickets = allSubTickets.concat(subTickets);
        }
      }
    }

    return allSubTickets;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch sub-tickets from epics:", errorMessage);
    throw error;
  }
};

export const getTicketByKey = async (
  email: string,
  apiToken: string,
  ticketKey: string,
): Promise<ProcessedTicket> => {
  try {
    const token = Buffer.from(`${email}:${apiToken}`).toString("base64");
    const res = await axios.get(`${JIRA_URL}/rest/api/3/issue/${ticketKey}`, {
      headers: {
        Authorization: `Basic ${token}`,
        Accept: "application/json",
      },
    });

    const issue = jiraIssueSchema.parse(res.data);
    return {
      key: issue.key,
      summary: issue.fields?.summary || "No summary",
      description:
        typeof issue.fields?.description === "string"
          ? issue.fields.description
          : "",
      status: issue.fields?.status?.name || "Unknown",
      assignee: issue.fields?.assignee?.displayName || "Unassigned",
      reporter: issue.fields?.reporter?.displayName || "Unknown",
      issueType: issue.fields?.issuetype?.name || "Unknown",
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to fetch ticket ${ticketKey}:`, errorMessage);
    throw error;
  }
};

export const logWorkEntry = async (
  email: string,
  apiToken: string,
  issueKey: string,
  worklogData: {
    comment: string;
    started: string;
    timeSpentSeconds: number;
  },
): Promise<void> => {
  try {
    const jiraRequestor = createJiraRequestor(email, apiToken);
    const jiraLogWork = jiraRequestor.createNormalRequest(
      `issue/{issueKey}/worklog`,
      {
        method: "POST",
      },
    );

    const data = {
      comment: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: worklogData.comment,
              },
            ],
          },
        ],
      },
      started: worklogData.started,
      timeSpentSeconds: worklogData.timeSpentSeconds,
    };

    await jiraLogWork(data);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to log work for ${issueKey}:`, errorMessage);
    throw error;
  }
};
