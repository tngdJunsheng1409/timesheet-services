# Gemini AI Integration for JIRA Ticket Matching

## Overview

The timesheet service now supports enhanced JIRA ticket matching using Google's Gemini AI. This provides more intelligent and context-aware matching compared to simple keyword-based matching.

## Setup

1. **Get Gemini API Key**
   - Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
   - Create a new API key
   - Copy the key for your environment configuration

2. **Configure Environment**

   ```bash
   # Add to your .env file
   GEMINI_API_KEY=your-gemini-api-key-here
   ```

3. **Optional: Adjust AI Model**
   - Edit `src/constants/jira-timesheet.ts`
   - Change `MODEL_NAME` from `'gemini-1.5-flash'` to `'gemini-1.5-pro'` for better accuracy (but slower/more expensive)

## How It Works

### AI-Enhanced Matching (when GEMINI_API_KEY is set)

1. **Semantic Analysis**: Gemini analyzes the task description and compares it semantically with JIRA ticket summaries and descriptions
2. **Context Understanding**: Considers project context, task type, and business workflow
3. **Confidence Scoring**: Provides confidence scores from 0.0 to 1.0
4. **Alternative Suggestions**: Offers up to 3 alternative matches when confidence is medium

### Fallback Matching (when no API key or AI fails)

- Falls back to keyword-based string similarity matching
- Ensures the system always works even without AI configuration

## Confidence Thresholds

- **0.9-1.0**: Perfect/near-perfect match → Auto-assigned
- **0.75-0.89**: High confidence match → Auto-assigned
- **0.5-0.74**: Medium confidence → User selection required
- **0.3-0.49**: Low confidence → User selection required
- **0.0-0.29**: Very low/no match → Marked as unmapped

## API Response Changes

The `/timesheet/todo/process` endpoint now includes:

```json
{
  "entries": [...],
  "summary": {...},
  "timesheetPreview": [...],
  "aiEnabled": true,
  "matchingMethod": "AI-Enhanced"
}
```

## Benefits

1. **Better Accuracy**: AI understands context and semantics, not just keywords
2. **Project Awareness**: Considers project identifiers for better matching
3. **Intelligent Alternatives**: Suggests multiple options when confidence is medium
4. **Detailed Reasoning**: AI provides reasoning for its matches (visible in logs)
5. **Graceful Fallback**: Always works even if AI is unavailable

## Performance

- **Timeout**: 30 seconds per AI request
- **Retries**: Up to 3 attempts with exponential backoff
- **Model**: Gemini 1.5 Flash (fast) by default, configurable to Pro (more accurate)

## Monitoring

Check your application logs for AI matching status:

```
🤖 Using Gemini AI to match task: "Fix login bug"
✅ AI found match: AUTH-123 (confidence: 0.87)
```

Or fallback indicators:

```
🔍 Using keyword fallback for task: "Update documentation"
✅ Keyword match found: DOC-456 (confidence: 0.65)
```
