import { Cycle, LinearClient } from '@linear/sdk'
import { withConsoleLoader } from './consoleUtils.ts'
import { LINEAR_TEAM_KEYS } from './constants.ts'

const getLinearClient = (): LinearClient => {
    const apiKey = process.env.LINEAR_API_KEY
    if (!apiKey) {
        throw new Error('LINEAR_API_KEY is required. Set it in .env or the environment.')
    }
    return new LinearClient({ apiKey })
}

/**
 * Fetch the organization's URL key via viewer → organization and return the base URL for issue links.
 * Returns e.g. https://linear.app/yourworkspace. Use when LINEAR_ISSUE_URL_BASE env is unset (zero config).
 */
export async function getLinearIssueUrlBase(): Promise<string> {
    const client = getLinearClient()
    const user = await client.viewer
    const organization = await user.organization
    const urlKey = organization.urlKey
    return `https://linear.app/${urlKey}`
}

/** Normalized issue for standup (read-only view from Linear). */
export interface EnrichedIssue {
    id: string
    identifier: string
    title: string
    assigneeName: string | null
    stateName: string
    stateType: string
    teamKey: string
    priority: number
    dueDate: string | null
    updatedAt: Date
    estimate: number | null
    blockedBy: string[]
    hasRecentComment: boolean
}

/** Fetch all open issues for configured teams (excludes completed/canceled). */
export const fetchOpenIssues = async (): Promise<EnrichedIssue[]> => {
    const client = getLinearClient()
    return withConsoleLoader(async () => {
        const allIssues: EnrichedIssue[] = []
        const filter = {
            team: { name: { in: [...LINEAR_TEAM_KEYS] } },
            cycle: { isActive: { eq: true } },
            state: { type: { nin: ['completed', 'canceled'] } },
        }
        let connection = await client.issues({
            filter,
            first: 100,
            includeArchived: false,
        })
        while (connection.pageInfo.hasNextPage) {
            await connection.fetchNext()
        }
        for (const issue of connection.nodes) {
            const [assignee, state, team] = await Promise.all([
                issue.assignee,
                issue.state,
                issue.team,
            ])
            const dueDate = issue.dueDate ?? null
            allIssues.push({
                id: issue.id,
                identifier: issue.identifier,
                title: issue.title,
                assigneeName: assignee?.name ?? null,
                stateName: state?.name ?? 'Unknown',
                stateType: state?.type ?? 'unstarted',
                teamKey: team?.key ?? '',
                priority: issue.priority,
                dueDate: typeof dueDate === 'string' ? dueDate : dueDate ?? null,
                updatedAt: issue.updatedAt,
                estimate: issue.estimate ?? null,
                blockedBy: [],
                hasRecentComment: false,
            })
        }
        return allIssues
    }, { message: 'Fetching open issues from Linear...' })
}

/** Enrich issues with blocking relations (blockedBy). */
export const enrichIssueRelations = async (issues: EnrichedIssue[]): Promise<void> => {
    const client = getLinearClient()
    await withConsoleLoader(async () => {
        for (const issue of issues) {
            const linearIssue = await client.issue(issue.id)
            if (!linearIssue) continue
            const relationConnection = await linearIssue.inverseRelations()
            const nodes = relationConnection.nodes
            const blockedByIdentifiers: string[] = []
            for (const rel of nodes) {
                if (rel.type !== 'blocks') continue
                const blocker = await rel.issue
                if (blocker) blockedByIdentifiers.push(blocker.identifier)
            }
            issue.blockedBy = blockedByIdentifiers
        }
    }, { message: 'Fetching blocking relations...' })
}

/** Enrich issues with recent comment flag (comments in last 24h). */
export const enrichRecentComments = async (issues: EnrichedIssue[]): Promise<void> => {
    const client = getLinearClient()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    await withConsoleLoader(async () => {
        for (const issue of issues) {
            const linearIssue = await client.issue(issue.id)
            if (!linearIssue) continue
            const commentConnection = await linearIssue.comments()
            const nodes = commentConnection.nodes
            const hasRecent = nodes.some((c) => c.updatedAt >= since)
            issue.hasRecentComment = hasRecent
        }
    }, { message: 'Checking recent comments...' })
}
