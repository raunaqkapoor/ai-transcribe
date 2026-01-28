import OpenAI from 'openai'
import type { EnrichedIssue } from './linearUtils.ts'
import { withConsoleLoader } from './consoleUtils.ts'

const STALE_DAYS = 7
const AT_RISK_DAYS_UNTIL_DUE = 3
const AT_RISK_NO_UPDATE_HOURS = 48
const DISCUSSION_BATCH_SIZE = 10

export type IssueCategory = 'needs_discussion' | 'blocked' | 'in_progress' | 'other'

export interface CategorizedIssue extends EnrichedIssue {
    category: IssueCategory
    overdue: boolean
    stale: boolean
    atRisk: boolean
    discussionReason: string | null
}

export interface AssigneeGroup {
    assigneeName: string
    issues: CategorizedIssue[]
}

export function groupIssuesByAssignee(issues: CategorizedIssue[]): AssigneeGroup[] {
    const byAssignee = new Map<string, CategorizedIssue[]>()
    for (const issue of issues) {
        const name = issue.assigneeName ?? 'Unassigned'
        if (!byAssignee.has(name)) byAssignee.set(name, [])
        byAssignee.get(name)!.push(issue)
    }
    const unassigned = byAssignee.get('Unassigned')
    byAssignee.delete('Unassigned')
    const others = [...byAssignee.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    const result: AssigneeGroup[] = others.map(([assigneeName, issues]) => ({ assigneeName, issues }))
    if (unassigned?.length) {
        result.push({ assigneeName: 'Unassigned', issues: unassigned })
    }
    return result
}

const now = (): Date => new Date()
const toTimelessDate = (s: string | null): Date | null => {
    if (!s) return null
    const [y, m, d] = s.split('-').map(Number)
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null
    return new Date(y, m - 1, d)
}
const daysBetween = (a: Date, b: Date): number =>
    Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000))
const hoursBetween = (a: Date, b: Date): number =>
    (a.getTime() - b.getTime()) / (60 * 60 * 1000)

export function categorizeIssues(issues: EnrichedIssue[]): CategorizedIssue[] {
    const today = now()
    return issues.map((issue): CategorizedIssue => {
        const due = toTimelessDate(issue.dueDate)
        const overdue = due !== null && due < today
        const updatedAt = issue.updatedAt instanceof Date ? issue.updatedAt : new Date(issue.updatedAt)
        const daysSinceUpdate = daysBetween(today, updatedAt)
        const stale = daysSinceUpdate >= STALE_DAYS
        const dueInDays = due !== null ? daysBetween(due, today) : null
        const hoursSinceUpdate = hoursBetween(today, updatedAt)
        const atRisk =
            dueInDays !== null &&
            dueInDays >= 0 &&
            dueInDays <= AT_RISK_DAYS_UNTIL_DUE &&
            hoursSinceUpdate >= AT_RISK_NO_UPDATE_HOURS
        const blocked = issue.blockedBy.length > 0
        const highPriority = issue.priority >= 1 && issue.priority <= 2
        const activeRecently = hoursSinceUpdate <= 24
        const noScope = issue.estimate == null && !issue.dueDate
        const needsDiscussion =
            blocked ||
            overdue ||
            stale ||
            atRisk ||
            highPriority ||
            activeRecently ||
            issue.hasRecentComment ||
            noScope
        let category: IssueCategory = 'other'
        if (blocked) category = 'blocked'
        else if (issue.stateType === 'started') category = 'in_progress'
        else if (needsDiscussion) category = 'needs_discussion'

        return {
            ...issue,
            category,
            overdue,
            stale,
            atRisk,
            discussionReason: null,
        }
    })
}

/** Optional: generate 2-3 sentence standup summary with GPT-4o. */
export async function generateStandupSummary(groups: AssigneeGroup[]): Promise<string> {
    if (!process.env.OPENAI_API_KEY) return 'Review the sections below and discuss blocked and at-risk items.'
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const summary: string[] = []
    for (const g of groups) {
        const blocked = g.issues.filter((i) => i.category === 'blocked').length
        const needs = g.issues.filter((i) => i.category === 'needs_discussion').length
        if (g.issues.length) {
            summary.push(`${g.assigneeName}: ${g.issues.length} items${blocked ? `, ${blocked} blocked` : ''}${needs ? `, ${needs} need discussion` : ''}.`)
        }
    }
    if (summary.length === 0) return 'No open issues for the selected teams.'
    try {
        const res = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: 'In 2-3 short sentences, summarize the standup focus: who has work, blockers, and what needs discussion. Be concise.',
                },
                { role: 'user', content: summary.join('\n') },
            ],
            max_tokens: 150,
            temperature: 0.3,
        })
        return (res.choices[0]?.message?.content ?? summary.join(' ')).trim()
    } catch {
        return summary.join(' ')
    }
}

/** AI-generated reasons for why each discussion item needs discussion. Batches of 10, GPT-4o. */
export async function analyzeDiscussionItems(issues: CategorizedIssue[]): Promise<void> {
    const toAnalyze = issues.filter((i) => i.category === 'needs_discussion' || i.category === 'blocked')
    if (toAnalyze.length === 0) return
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    if (!process.env.OPENAI_API_KEY) return
    for (let i = 0; i < toAnalyze.length; i += DISCUSSION_BATCH_SIZE) {
        const batch = toAnalyze.slice(i, i + DISCUSSION_BATCH_SIZE)
        const prompt = batch
            .map(
                (issue, idx) =>
                    `${idx + 1}. [${issue.identifier}] ${issue.title} | Priority: ${issue.priority} | State: ${issue.stateName} | Updated: ${issue.updatedAt.toISOString().slice(0, 10)}${issue.blockedBy.length ? ` | Blocked by: ${issue.blockedBy.join(', ')}` : ''}${issue.overdue ? ' (OVERDUE)' : ''}${issue.stale ? ' (STALE)' : ''}${issue.atRisk ? ' (AT RISK)' : ''}`
            )
            .join('\n')
        try {
            const res = await withConsoleLoader(
                () =>
                    openai.chat.completions.create({
                        model: 'gpt-4o',
                        messages: [
                            {
                                role: 'system',
                                content:
                                    'For each numbered item, respond with exactly one short sentence (max 15 words) on why it needs discussion in standup. One line per number, format: 1. sentence 2. sentence ...',
                            },
                            { role: 'user', content: prompt },
                        ],
                        max_tokens: 500,
                        temperature: 0.3,
                    }),
                { message: `Analyzing discussion items (batch ${Math.floor(i / DISCUSSION_BATCH_SIZE) + 1})...` }
            )
            const text = res.choices[0]?.message?.content ?? ''
            const lines = text.split('\n').filter(Boolean)
            for (let j = 0; j < batch.length && j < lines.length; j++) {
                const line = lines[j].replace(/^\s*\d+\.\s*/, '').trim()
                if (line) batch[j].discussionReason = line
            }
        } catch {
            // Graceful degradation: leave discussionReason null
        }
    }
}

function relativeTime(d: Date): string {
    const now = Date.now()
    const t = d.getTime()
    const diffMs = now - t
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000))
    if (diffDays > 7) return `${diffDays}d ago`
    if (diffDays >= 1) return `${diffDays}d ago`
    const diffHours = Math.floor(diffMs / (60 * 60 * 1000))
    if (diffHours >= 1) return `${diffHours}h ago`
    const diffMins = Math.floor(diffMs / (60 * 1000))
    return diffMins <= 0 ? 'just now' : `${diffMins}m ago`
}

function priorityLabel(p: number): string {
    if (p <= 1) return 'Urgent'
    if (p === 2) return 'High'
    if (p === 3) return 'Normal'
    return 'Low'
}

export function generateStandupMarkdown(
    groups: AssigneeGroup[],
    options: { summary?: string; generatedAt?: Date } = {}
): string {
    const dayLabel = (options.generatedAt ?? now()).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    })
    const iso = (options.generatedAt ?? now()).toISOString()
    const summary = options.summary ?? 'Review the sections below and discuss blocked and at-risk items.'

    const section = (issues: CategorizedIssue[], title: string, filter: (i: CategorizedIssue) => boolean) => {
        const list = issues.filter(filter)
        if (list.length === 0) return ''
        const lines = list.map((issue) => {
            const updated = issue.updatedAt instanceof Date ? issue.updatedAt : new Date(issue.updatedAt)
            const bullets: string[] = [
                `- **[${issue.identifier}]** ${issue.title} (Priority: ${priorityLabel(issue.priority)})`,
                `  - **Status:** ${issue.stateName}`,
                `  - **Updated:** ${relativeTime(updated)}`,
            ]
            if (issue.discussionReason) bullets.push(`  - **Why:** ${issue.discussionReason}`)
            if (issue.overdue) bullets.push('  - 🔴 OVERDUE')
            if (issue.stale) bullets.push('  - ⏰ STALE')
            if (issue.atRisk) bullets.push('  - ⚡ AT RISK')
            return bullets.join('\n')
        })
        return `#### ${title}\n${lines.join('\n\n')}\n`
    }

    const blockedSection = (issues: CategorizedIssue[]) => {
        const list = issues.filter((i) => i.category === 'blocked')
        if (list.length === 0) return ''
        const lines = list.map((issue) => {
            const updated = issue.updatedAt instanceof Date ? issue.updatedAt : new Date(issue.updatedAt)
            const bullets: string[] = [
                `- **[${issue.identifier}]** ${issue.title}`,
                `  - **Blocked by:** ${issue.blockedBy.map((id) => `[${id}]`).join(', ')}`,
                `  - **Status:** ${issue.stateName}`,
            ]
            if (issue.discussionReason) bullets.push(`  - **Why:** ${issue.discussionReason}`)
            return bullets.join('\n')
        })
        return `#### ⏸️ Blocked\n${lines.join('\n\n')}\n`
    }

    const inProgressSection = (issues: CategorizedIssue[]) =>
        section(issues, '🚧 In Progress', (i) => i.category === 'in_progress')
    const otherSection = (issues: CategorizedIssue[]) =>
        section(issues, 'Other', (i) => i.category === 'other')
    const needsDiscussionSection = (issues: CategorizedIssue[]) =>
        section(issues, '🚨 Needs Discussion', (i) => i.category === 'needs_discussion')

    const groupMd = groups.map((g) => {
        const needs = needsDiscussionSection(g.issues)
        const blocked = blockedSection(g.issues)
        const inProgress = inProgressSection(g.issues)
        const other = otherSection(g.issues)
        const total = g.issues.length
        const header =
            g.assigneeName === 'Unassigned'
                ? `### Unassigned Items\n**Total: ${total}**\n`
                : `### ${g.assigneeName}\n**Active Issues: ${total}**\n`
        return header + (needs || blocked || inProgress || other || '- No items.')
    })

    return `# Daily Standup Notes - ${dayLabel}

## Summary
${summary}

## Team Member Updates

${groupMd.join('\n')}

---
*Generated on ${iso}*
`
}
