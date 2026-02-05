#!/usr/bin/env bun
/**
 * Debug script to discover available Gemini models
 * Run with: bun run debug-gemini-models.ts
 */

import { discoverAvailableModels } from "./src/services/gemini-ticket-matcher";
import { JIRA_TIMESHEET_CONFIG } from "./src/constants/jira-timesheet";

async function main() {
  console.log("🔧 Gemini Models Debug Script");
  console.log("===============================");

  if (!JIRA_TIMESHEET_CONFIG.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY environment variable not set");
    console.log(
      "Please set your Gemini API key in your environment variables.",
    );
    process.exit(1);
  }

  console.log(
    "✅ API key found:",
    JIRA_TIMESHEET_CONFIG.GEMINI_API_KEY.substring(0, 10) + "...",
  );
  console.log("");

  try {
    const availableModels = await discoverAvailableModels();

    console.log("");
    console.log("🎯 Models that support generateContent:");
    availableModels.forEach((model) => {
      console.log(`  ✓ ${model}`);
    });

    if (availableModels.length > 0) {
      console.log("");
      console.log(
        "💡 Suggestion: Update AI_CONFIG.MODEL_NAME to one of the above models",
      );
      console.log('   Example: MODEL_NAME: "' + availableModels[0] + '"');
    } else {
      console.log("");
      console.log("⚠️  No models found that support generateContent");
      console.log(
        "   This might indicate an issue with your API key or regional availability",
      );
    }
  } catch (error) {
    console.error("💥 Error discovering models:", error);
    console.log("");
    console.log("🔍 Troubleshooting tips:");
    console.log("  1. Verify your API key is correct and active");
    console.log("  2. Check if your API key has the necessary permissions");
    console.log("  3. Ensure your region has access to Gemini models");
    console.log(
      "  4. Visit https://makersuite.google.com/app/apikey to manage your API keys",
    );
  }

  console.log("");
  console.log("🔗 Useful links:");
  console.log(
    "  • Gemini API Documentation: https://ai.google.dev/gemini-api/docs",
  );
  console.log(
    "  • Available Models: https://ai.google.dev/gemini-api/docs/models/gemini",
  );
  console.log(
    "  • API Key Management: https://makersuite.google.com/app/apikey",
  );
}

main().catch(console.error);
