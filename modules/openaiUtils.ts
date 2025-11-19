import fs from 'fs'
import OpenAI from 'openai'
import { withConsoleLoader } from './consoleUtils.ts';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
})

export const transcribeAudio = async (params: { filePath: string; prompt: string }): Promise<string> => {
    const { filePath, prompt } = params
    console.time('Audio Transcription')
    const transcription = await withConsoleLoader(async () => openai.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: 'whisper-1',
        prompt
    }), { message: 'Transcribing audio file with whisper-1 model...' })
    console.timeEnd('Audio Transcription')
    return transcription.text
}

export const generateSummary = async (params: { googleMeetTranscript: string; accurateTranscript: string; toolsAndTech: string }): Promise<{ summary: string; deeperInsights: string }> => {
    const { googleMeetTranscript, accurateTranscript, toolsAndTech } = params
    console.time('Summary Generation')
    const summary = await withConsoleLoader(async () => openai.chat.completions.create({
        model: 'o3-2025-04-16',
        messages: [
            {
                role: 'system',
                content: `## Meeting Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}

You are provided with two transcripts from the same meeting:

- **Transcript 1 (Google Meet Live Captioning)**: Contains speaker labels but may have inaccuracies. The speaker labels are always correct, but the content may not be. The person marked as You is Raunaq.
- **Transcript 2 (Accurate Transcript)**: Contains accurate text but lacks speaker labels.

Please note that certain technical terms, tools, and participant names may have been incorrectly transcribed. Pay special attention to the following correct terms and names: **${toolsAndTech}**.

### Instructions:

1. **Cross-reference** both transcripts:
   - Use **Transcript 1** to identify who said what.
   - Use **Transcript 2** to verify and correct the accuracy of the content.

2. **Evaluate carefully**:
   - The speaker labels in the first transcript are always correct and should be trusted.
   - But the content in the first transcript is not accurate.
   - The second transcript is generally accurate but may still contain minor errors.
   - Use context, provided correct terms and names, and your judgment to determine the correct information.

3. **Exclude**:
   - Greetings, small talk, and irrelevant conversation.

4. **Provide output closely following the example format** (provided within the '---' delimiters) clearly structured in markdown, but not including the delimiters itself:

---
## Meeting Date: July 2, 2025 (Wednesday)

## Summary:
A concise summary of the entire meeting (50 words max), including brief mentions of the contributions of each participant.

## Topics:
Clearly organize all relevant information discussed in the meeting by topic, rather than by participant. Include all information here except personal information.
Try to not repeat action points here.

Example format:
1. Topic 1
  - Detail or discussion point 1
  - Detail or discussion point 2
  - etc.

2. Topic 2
  - Detail or discussion point 1
  - Detail or discussion point 2
  - etc.

## Action Points:
List all actionable tasks assigned to each participant clearly. Include all tasks, even if they are small or seem trivial.

Example format:
- Participant Name 1
  - Action point 1
  - Action point 2
  - etc.

- Participant Name 2
  - Action point 1
  - Action point 2
  - etc.
---

Please ensure clarity, accuracy, and readability in your response.`,
            }, {
                role: 'user',
                content: `Transcript 1 (Google Meet Live Captioning):
                ${googleMeetTranscript}
                Transcript 2 (Accurate Transcript):
                ${accurateTranscript}`
            }
        ],
        max_completion_tokens: 5000,
        temperature: 1
    }), {
        message: 'Generating summary for the meeting transcripts...',
    })
    console.timeEnd('Summary Generation')
    const summaryText = summary.choices[0]?.message?.content ?? '';

    console.time('Deeper Insights Generation')
    const deepDive = await withConsoleLoader(async () => openai.chat.completions.create({
        model: 'o3-2025-04-16',
        messages: [
            {
                role: 'system',
                content: `You are an expert meeting analyst.
    Given a structured meeting summary and the original context, you will:
    - Identify implicit risks, dependencies, and trade-offs
    - Highlight disagreements or misalignments between participants
    - Propose a concise set of recommendations and follow-ups for Raunaq
    Respond in clear markdown format with sections: "Deeper Insights", "Risks & Dependencies", "Alignment & Misalignment", "Recommendations".`,
            },
            {
                role: 'user',
                content: `Here is the structured summary of the meeting:
    
    ${summaryText}
    
    Now produce a deeper analysis as described in your instructions.`,
            },
        ],
        // Reasoning models use max_completion_tokens instead of max_tokens
        max_completion_tokens: 3000,
        // Optional but useful: how hard o3 should "think"
        reasoning_effort: 'high', // "low" | "medium" | "high"
    }), { message: 'Generating deeper insights for the meeting...' })

    console.timeEnd('Deeper Insights Generation')

    const deeperInsights = deepDive.choices[0]?.message?.content ?? '';

    return { summary: summaryText, deeperInsights }
}
