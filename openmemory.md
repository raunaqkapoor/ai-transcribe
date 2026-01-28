## Overview
- Node.js CLI script that transcribes meeting audio and generates summaries plus deeper insights using OpenAI.
- Standup preparation: generates daily standup notes from Linear issues (team filter, assignees, blocked/discussion flags, AI analysis, historical cross-reference).
- Inputs live in `inputFiles/`, processing artifacts in `processingFiles/`, and outputs in `outputFiles/`.
- Run via `npm start` (post-meeting) or `npm run standup:prepare` (pre-meeting) with `OPENAI_API_KEY` and `LINEAR_API_KEY` in `.env`.

## Architecture
- `index.ts` orchestrates the flow: pick latest input, optionally compress audio, transcribe, then generate summary + deeper insights.
- `standupPrepare.ts` orchestrates standup prep: fetch Linear issues (filter by `LINEAR_TEAM_KEYS`), enrich relations/comments, categorize, AI discussion reasons, write `{date}-standup-notes.md`. No cross-reference with historical deeper-insights.
- `modules/fileUtils.ts` handles file IO, compression, and filename sanitization.
- `modules/openaiUtils.ts` calls OpenAI for transcription and analysis (summary + deeper insights).
- `modules/linearUtils.ts` Linear API (read-only): fetch open issues by team, enrich blocking relations and recent comments.
- `modules/standupUtils.ts` standup logic: group by assignee, categorize (needs discussion, blocked, in progress, other), AI analysis, markdown generation.
- `modules/consoleUtils.ts` provides a simple console loader/spinner.

## User Defined Namespaces
- 

## Components
- `index.ts` main flow: input selection, transcription, summary generation, output writes.
- `standupPrepare.ts` standup prep flow: Linear fetch → enrich → categorize → historical cross-ref → AI analysis → markdown write.
- `modules/fileUtils.ts` IO utilities and filename handling.
- `modules/openaiUtils.ts` OpenAI integrations for transcription and meeting analysis.
- `modules/linearUtils.ts` Linear client, fetchOpenIssues, enrichIssueRelations, enrichRecentComments.
- `modules/standupUtils.ts` groupIssuesByAssignee, categorizeIssues, analyzeDiscussionItems, generateStandupSummary, generateStandupMarkdown.
- `modules/consoleUtils.ts` CLI loader helper.

## Patterns
- Output files are named `{date}-summary.md`, `{date}-deeper-insights.md`, and `{date}-standup-notes.md` based on date tags.
- Standup notes are Linear-only; no dependency on deeper-insights files or PRD numbers in historical content.
