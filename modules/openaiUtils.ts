import fs from 'fs'
import OpenAI from 'openai'
import { withConsoleLoader } from './consoleUtils.ts';
import { OUTPUT_DIRECTORY } from './constants.ts';
import { readFileContent } from './fileUtils.ts';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
})

const formatDateTag = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}_${month}_${day}`
}

const currentDateTag = formatDateTag(new Date())
const meetingDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
console.log('Meeting Date:', meetingDate);

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

// Helper function to validate if content is meaningful (not just a date header)
const isValidContent = (content: string): boolean => {
    if (!content || content.trim().length === 0) {
        return false;
    }

    // Remove the date header if present
    let contentWithoutDate = content.trim();
    if (contentWithoutDate.startsWith('## Meeting Date:')) {
        // Remove the date line and any following whitespace/newlines
        contentWithoutDate = contentWithoutDate
            .split('\n')
            .slice(1)
            .join('\n')
            .trim();
    }

    // Check if there's meaningful content (at least 50 characters after removing date)
    return contentWithoutDate.length >= 50;
};

// Helper function to retry an operation up to maxRetries times
const retryWithValidation = async <T>(
    operation: () => Promise<T>,
    extractContent: (result: T) => string,
    maxRetries: number = 3,
    operationName: string
): Promise<T> => {
    let lastResult: T | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const result = await operation();
        lastResult = result;
        const content = extractContent(result);

        if (isValidContent(content)) {
            if (attempt > 1) {
                console.log(`${operationName} succeeded on attempt ${attempt}`);
            }
            return result;
        }

        if (attempt < maxRetries) {
            console.warn(`${operationName} attempt ${attempt} failed: content is missing or incomplete. Retrying...`);
        } else {
            console.error(`${operationName} failed after ${maxRetries} attempts: content is still missing or incomplete.`);
        }
    }

    // Return the last attempt even if invalid (to avoid breaking the flow)
    return lastResult!;
};

export const generateSummary = async (params: { summaryText: string; googleMeetTranscript: string; accurateTranscript: string; toolsAndTech: string }): Promise<{ summary: string; deeperInsights: string }> => {
    let summaryText = params.summaryText.trim()
    const { googleMeetTranscript, accurateTranscript, toolsAndTech } = params
    const hasAccurateTranscript = accurateTranscript.trim().length > 0

    const normalizeItem = (item: string): string => {
        return item.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    }

    const tokenizeItem = (item: string): string[] => {
        return normalizeItem(item)
            .split(' ')
            .filter(token => token.length > 2)
    }

    const hasStrongOverlap = (aTokens: string[], bTokens: string[]): boolean => {
        if (aTokens.length === 0 || bTokens.length === 0) {
            return false
        }

        const aSet = new Set(aTokens)
        const bSet = new Set(bTokens)
        let overlap = 0

        for (const token of aSet) {
            if (bSet.has(token)) {
                overlap += 1
            }
        }

        const minSize = Math.min(aSet.size, bSet.size)
        return overlap / minSize >= 0.7
    }

    const isLikelySameItem = (a: string, b: string): boolean => {
        const normalizedA = normalizeItem(a)
        const normalizedB = normalizeItem(b)

        if (!normalizedA || !normalizedB) {
            return false
        }

        if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) {
            return true
        }

        return hasStrongOverlap(tokenizeItem(a), tokenizeItem(b))
    }

    const extractSectionItems = (content: string, sectionPrefix: string): string[] => {
        const lines = content.split(/\r?\n/)
        const items: string[] = []
        let inSection = false
        const sectionPrefixLower = sectionPrefix.toLowerCase()

        for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed.startsWith('### ')) {
                const header = trimmed.replace(/^###\s+/, '').toLowerCase()
                if (header.startsWith(sectionPrefixLower)) {
                    inSection = true
                    continue
                }
                if (inSection) {
                    break
                }
            }

            if (!inSection || !trimmed) {
                continue
            }

            if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) {
                items.push(trimmed.replace(/^[-*•]\s+/, '').trim())
            }
        }

        return items.filter(Boolean)
    }

    const stripSections = (content: string, sectionPrefixes: string[]): string => {
        const lines = content.split(/\r?\n/)
        const prefixesLower = sectionPrefixes.map(prefix => prefix.toLowerCase())
        let inSection = false
        const keptLines: string[] = []

        for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed.startsWith('### ')) {
                const header = trimmed.replace(/^###\s+/, '').toLowerCase()
                const isTargetSection = prefixesLower.some(prefix => header.startsWith(prefix))
                if (isTargetSection) {
                    inSection = true
                    continue
                }
                if (inSection) {
                    inSection = false
                }
            }

            if (inSection) {
                continue
            }

            keptLines.push(line)
        }

        return keptLines.join('\n').trim()
    }

    // Get last 6 historical deeper insights
    const getHistoricalInsights = (): { historicalContent: string; filesCount: number; historicalOpenItems: string[]; historicalClosedItems: string[] } => {
        try {
            const files = fs.readdirSync(OUTPUT_DIRECTORY)
                .filter(file => file.endsWith('-deeper-insights.md'))
                .filter(file => !file.startsWith(`${currentDateTag}-`))
                .map(file => {
                    const filePath = `${OUTPUT_DIRECTORY}/${file}`;
                    // Extract date from filename (format: YYYY_MM_DD-deeper-insights.md)
                    const dateMatch = file.match(/^(\d{4}_\d{2}_\d{2})-/);
                    const dateStr = dateMatch ? dateMatch[1] : '0000_00_00';
                    return { file, dateStr, filePath };
                })
                .sort((a, b) => a.dateStr.localeCompare(b.dateStr)) // Sort ascending by date (oldest -> newest)
                .slice(0, 6);

            if (files.length === 0) {
                return { historicalContent: '', filesCount: 0, historicalOpenItems: [], historicalClosedItems: [] };
            }

            const historicalOpenItems: string[] = []
            const historicalClosedItems: string[] = []

            const historicalContent = files.map(({ file, filePath }) => {
                const content = readFileContent(filePath);
                historicalOpenItems.push(...extractSectionItems(content, 'Open Items'))
                historicalClosedItems.push(...extractSectionItems(content, 'Completed Items'))
                const sanitizedContent = stripSections(content, ['Open Items', 'Completed Items'])
                return `## ${file}\n${sanitizedContent}`;
            }).join('\n\n---\n\n');

            const uniqueOpenItems: string[] = []
            const seenOpenItems = new Set<string>()
            const uniqueClosedItems: string[] = []
            const seenClosedItems = new Set<string>()
            for (const item of historicalClosedItems) {
                const key = normalizeItem(item)
                if (!seenClosedItems.has(key)) {
                    seenClosedItems.add(key)
                    uniqueClosedItems.push(item)
                }
            }

            const filteredOpenItems = historicalOpenItems.filter(item => {
                return !uniqueClosedItems.some(closedItem => isLikelySameItem(item, closedItem))
            })

            for (const item of filteredOpenItems) {
                const key = normalizeItem(item)
                if (!seenOpenItems.has(key)) {
                    seenOpenItems.add(key)
                    uniqueOpenItems.push(item)
                }
            }

            return { historicalContent, filesCount: files.length, historicalOpenItems: uniqueOpenItems, historicalClosedItems: uniqueClosedItems };
        } catch (error) {
            console.warn('Error reading historical insights:', error);
            return { historicalContent: '', filesCount: 0, historicalOpenItems: [], historicalClosedItems: [] };
        }
    };

    const { historicalContent, filesCount, historicalOpenItems } = getHistoricalInsights();

    if (!summaryText) {
    // Generate summary with retry logic
        console.time('Summary Generation')
        const summary = await retryWithValidation(
            async () => withConsoleLoader(async () => openai.chat.completions.create({
                model: 'o3-2025-04-16',
                messages: [
                    {
                        role: 'system',
                        content: `## Meeting Date: ${meetingDate}

    You are provided with two transcripts from the same meeting:

    - **Transcript 1 (Google Meet Live Captioning)**: Contains speaker labels but may have inaccuracies. The speaker labels are always correct, but the content may not be. The person marked as You is Raunaq.
    ${hasAccurateTranscript
                                ? '- **Transcript 2 (Accurate Transcript)**: Contains accurate text but lacks speaker labels.'
                                : '- **Transcript 2 (Accurate Transcript)**: Not available for this meeting.'}

    Please note that certain technical terms, tools, and participant names may have been incorrectly transcribed. Pay special attention to the following correct terms and names: **${toolsAndTech}**.

    ### Instructions:

    1. **Cross-reference** both transcripts:
    - Use **Transcript 1** to identify who said what.
    ${hasAccurateTranscript
                                ? '- Use **Transcript 2** to verify and correct the accuracy of the content.'
                                : '- Since Transcript 2 is missing, rely on Transcript 1 and your best judgment for accuracy.'}

    2. **Evaluate carefully**:
    - The speaker labels in the first transcript are always correct and should be trusted.
    - But the content in the first transcript is not accurate.
    - ${hasAccurateTranscript
                                ? 'The second transcript is generally accurate but may still contain minor errors.'
                                : 'There is no second transcript available for accuracy verification.'}
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
                        ${hasAccurateTranscript ? accurateTranscript : '[Not available]'}`
                    }
                ],
                max_completion_tokens: 5000,
                temperature: 1
            }), {
                message: 'Generating summary for the meeting transcripts...',
            }),
            (result) => result.choices[0]?.message?.content ?? '',
            3,
            'Summary Generation'
        );
        console.timeEnd('Summary Generation')
        console.log(`Summary Generation Usage: ${summary.usage?.total_tokens} tokens`)
        summaryText = summary.choices[0]?.message?.content ?? '';
    } else {
        console.log('Using existing summary file...')
    }


    // Generate deeper insights with retry logic
    console.time('Deeper Insights Generation')
    const deepDive = await retryWithValidation(
        async () => withConsoleLoader(async () => openai.chat.completions.create({
            model: 'o3-2025-04-16',
            messages: [
                {
                    role: 'system',
                    content: `You are an expert meeting analyst.
    Given a structured meeting summary and the original context, you will:
    - Identify implicit risks, dependencies, and trade-offs
    - Highlight disagreements or misalignments between participants
    - Propose a concise set of recommendations and follow-ups for Raunaq
    - Maintain a list of open items that are carried forward from previous meetings
    - Identify the list of closed items that are not part of the summary, or explicitly mentioned in the summary under Completed Items section
    - Treat an item as closed if it appears in the current summary’s Completed Items section or is explicitly described as done/closed in the current summary
    Respond in clear markdown format with sections: "Deeper Insights", "Risks & Dependencies", "Alignment & Misalignment", "Recommendations", "Open Items (Carried Forward)".

    For the "Open Items (Carried Forward)" section:
    - Review the historical deeper insights provided below
    - Only carry forward items that appear in prior "Open Items (Carried Forward)" sections (do not infer new open items from other sections)
    - Exclude items marked completed/closed in the current summary (including its Completed Items section)
    - Treat any item listed under a historical "Completed Items" section as closed, even if the description suggests otherwise, unless the current summary explicitly reopens it
    - When an item appears with conflicting status across meetings, prefer the most recent status
    - List items that are still relevant and have not been completed or resolved
    - Format as a clear list with brief context for each item`,
                },
                {
                    role: 'user',
                    content: `Here is the structured summary of the current meeting:
    
    ${summaryText}
    
    ${historicalOpenItems.length ? `Here is the extracted list of open items from historical insights (completed items removed). Use only this list for "Open Items (Carried Forward)" unless the current summary explicitly reopens something not listed:
    
    ${historicalOpenItems.map(item => `- ${item}`).join('\n')}
    
    ` : ''}${filesCount ? `Here are the last ${filesCount} historical deeper insights for context:
    
    ${historicalContent}
    
    ` : ''}Now produce a deeper analysis as described in your instructions. Include the meeting date as the first line of your response in the format: "## Meeting Date: ${meetingDate}"`,
                },
            ],
            // Reasoning models use max_completion_tokens instead of max_tokens
            max_completion_tokens: 3000,
            // Optional but useful: how hard o3 should "think"
            reasoning_effort: 'high', // "low" | "medium" | "high"
        }), { message: 'Generating deeper insights for the meeting...' }),
        (result) => result.choices[0]?.message?.content ?? '',
        3,
        'Deeper Insights Generation'
    );

    console.timeEnd('Deeper Insights Generation')
    console.log(`Deeper Insights Generation Usage: ${deepDive.usage?.total_tokens} tokens`)
    let deeperInsights = deepDive.choices[0]?.message?.content ?? '';

    // Ensure date is the first line if not already present
    if (!deeperInsights.startsWith('## Meeting Date:')) {
        deeperInsights = `## Meeting Date: ${meetingDate}\n\n${deeperInsights}`;
    }

    return { summary: summaryText, deeperInsights }
}
