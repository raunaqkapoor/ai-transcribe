## Overview
- Node.js CLI script that transcribes meeting audio and generates summaries plus deeper insights using OpenAI.
- Inputs live in `inputFiles/`, processing artifacts in `processingFiles/`, and outputs in `outputFiles/`.
- Run via `npm start` with `OPENAI_API_KEY` in `.env`.

## Architecture
- `index.ts` orchestrates the flow: pick latest input, optionally compress audio, transcribe, then generate summary + deeper insights.
- `modules/fileUtils.ts` handles file IO, compression, and filename sanitization.
- `modules/openaiUtils.ts` calls OpenAI for transcription and analysis (summary + deeper insights).
- `modules/consoleUtils.ts` provides a simple console loader/spinner.

## User Defined Namespaces
- 

## Components
- `index.ts` main flow: input selection, transcription, summary generation, output writes.
- `modules/fileUtils.ts` IO utilities and filename handling.
- `modules/openaiUtils.ts` OpenAI integrations for transcription and meeting analysis.
- `modules/consoleUtils.ts` CLI loader helper.

## Patterns
- Output files are named `{date}-summary.md` and `{date}-deeper-insights.md` based on sanitized filenames.
