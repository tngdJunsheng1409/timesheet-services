// Environment variables
export const JIRA_TIMESHEET_CONFIG = {
  JIRA_URL: process.env.JIRA_URL,
  EMAIL: process.env.EMAIL,
  API_TOKEN: process.env.API_TOKEN,
} as const;

// Confidence thresholds for ticket matching
export const CONFIDENCE_THRESHOLDS = {
  HIGH_CONFIDENCE: 0.75, // Auto-assign tickets above this threshold
  CHOICE: 0.5, // Show choices for multiple tickets above this
  MINIMUM: 0.3, // Minimum threshold to consider a match
} as const;

// Epic keys for fetching sub-tasks
export const COMMON_EPIC_KEYS = [
  "EW-268499", // Zircon Epic
  "EW-236320", // MyDebit Epic
] as const;

// JIRA API configuration
export const JIRA_API_CONFIG = {
  MAX_RESULTS: 1000,
  SEARCH_MAX_RESULTS_DEFAULT: 50,
  REQUIRED_FIELDS: [
    "key",
    "summary",
    "status",
    "assignee",
    "reporter",
    "description",
    "issuetype",
  ] as const,
  SUB_TICKET_FIELDS: [
    "key",
    "summary",
    "status",
    "assignee",
    "description",
    "issuetype",
    "parent",
  ] as const,
} as const;
