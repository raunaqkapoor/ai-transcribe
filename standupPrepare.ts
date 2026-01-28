import { ensureDirectoryExists, writeFileContent } from './modules/fileUtils.ts'
import { STANDUP_OUTPUT_DIRECTORY } from './modules/constants.ts'
import {
    fetchOpenIssues,
    enrichIssueRelations,
    enrichRecentComments,
} from './modules/linearUtils.ts'
import {
    groupIssuesByAssignee,
    categorizeIssues,
    analyzeDiscussionItems,
    generateStandupMarkdown,
    generateStandupSummary,
} from './modules/standupUtils.ts'

const formatDateTag = (date: Date): string => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}_${m}_${d}`
}

const main = async (): Promise<void> => {
    ensureDirectoryExists(STANDUP_OUTPUT_DIRECTORY)

    const issues = await fetchOpenIssues()
    if (issues.length === 0) {
        console.log('No open issues found for the configured teams.')
        const dateTag = formatDateTag(new Date())
        const path = `${STANDUP_OUTPUT_DIRECTORY}/${dateTag}-standup-notes.md`
        const content = `# Daily Standup Notes - ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

## Summary
No open issues found for the configured Linear teams.

---
*Generated on ${new Date().toISOString()}*
`
        writeFileContent({ filePath: path, content })
        console.log('Wrote:', path)
        return
    }

    await enrichIssueRelations(issues)
    await enrichRecentComments(issues)

    const categorized = categorizeIssues(issues)
    const groups = groupIssuesByAssignee(categorized)
    await analyzeDiscussionItems(categorized)
    const summary = await generateStandupSummary(groups)
    const markdown = generateStandupMarkdown(groups, {
        summary,
        generatedAt: new Date(),
    })

    const dateTag = formatDateTag(new Date())
    const outputPath = `${STANDUP_OUTPUT_DIRECTORY}/${dateTag}-standup-notes.md`
    writeFileContent({ filePath: outputPath, content: markdown })
    console.log('Wrote:', outputPath)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
