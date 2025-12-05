import fs from 'fs'
import { getLatestAudioFile, compressAudioFile, readFileContent, writeFileContent, ensureDirectoryExists, sanitizeFilename } from './modules/fileUtils.ts'
import { INPUT_DIRECTORY, PROCESSING_DIRECTORY, OUTPUT_DIRECTORY } from './modules/constants.ts'
import { transcribeAudio, generateSummary } from './modules/openaiUtils.ts'

const main = async (): Promise<void> => {
    ensureDirectoryExists(INPUT_DIRECTORY)
    ensureDirectoryExists(PROCESSING_DIRECTORY)
    ensureDirectoryExists(OUTPUT_DIRECTORY)

    const originalFilename = getLatestAudioFile(INPUT_DIRECTORY)
    const sanitizedFilename = sanitizeFilename(originalFilename)

    const audioFilepath = `${INPUT_DIRECTORY}/${originalFilename}.webm`
    const textFilepath = `${INPUT_DIRECTORY}/${originalFilename}.txt`
    const compressedAudioFilepath = `${PROCESSING_DIRECTORY}/${sanitizedFilename}-compressed.webm`
    const transcriptFilePath = `${PROCESSING_DIRECTORY}/${sanitizedFilename}-transcription.txt`

    const clientsOrganizations = 'Clients: Staycity, Amano, Dalata, Ostello Bello, McDreams, Bicycle Street, Cranleigh'

    const people = 'People: Jason, Laura, Lina, Gaurav, Monasha, Raunaq, Selwyn, Mike, Ram, Bhaskar, Abhishek'

    const pmsHousekeepingMessagingSystems = 'PMS/Housekeeping/Messaging Systems: Optii, Flexkeeping, Mews (frequently mistaken as muse/Muse), Cloudbeds, LikeMagic, Bookboost, Apaleo, Freshwork, Freshdesk, Freshchat, Goki'

    const technologiesFrameworks = 'Technologies/Frameworks: LiteLLM, Langfuse, JOI validation, NextJS, Claude, Anthropic, Gemini'

    const platformsServices = 'Platforms/Services: Hookdeck, LiveKit, CTA, Crowdin, Twilio, BetterAuth, D3x, D3x.ai, Platform'

    const microservices = 'Microservices: api-services, ai-services, chat-services, voice-services'

    const conceptsTerms = 'Concepts/Terms: GDPR, CRUD, HLD, tenant, subtenant, evals (frequently mistaken as email), BR - business rules, HCR (Human connect request), CTH (Connect to Human)'


    const domainSpecificTerms = [
        clientsOrganizations,
        people,
        pmsHousekeepingMessagingSystems,
        technologiesFrameworks,
        platformsServices,
        microservices,
        conceptsTerms
    ].join(',\n')

    const prompt = `The following list contains domain-specific terms, tools, and names that are crucial for accurate transcription which we are using and might be transcribed wrongly:\n${domainSpecificTerms}`

    let processedAudioFilepath = audioFilepath

    if (fs.existsSync(compressedAudioFilepath)) {
        console.log('Using existing compressed audio file...')
        processedAudioFilepath = compressedAudioFilepath
    } else {
        const stats = fs.statSync(audioFilepath)
        const fileSizeInMB = stats.size / (1024 * 1024)

        if (fileSizeInMB > 3) {
            await compressAudioFile({ inputPath: audioFilepath, outputPath: compressedAudioFilepath })
            processedAudioFilepath = compressedAudioFilepath
        }
    }


    let transcriptionText: string
    if (fs.existsSync(transcriptFilePath)) {
        console.log('Using existing transcription file...')
        transcriptionText = readFileContent(transcriptFilePath)
    } else {
        transcriptionText = await transcribeAudio({ filePath: processedAudioFilepath, prompt })
        writeFileContent({ filePath: transcriptFilePath, content: transcriptionText })
    }

    const googleMeetTranscript = readFileContent(textFilepath)
    const { summary, deeperInsights } = await generateSummary({ googleMeetTranscript, accurateTranscript: transcriptionText, toolsAndTech: domainSpecificTerms })
    writeFileContent({ filePath: `${OUTPUT_DIRECTORY}/${sanitizedFilename}-summary.md`, content: summary })
    writeFileContent({ filePath: `${OUTPUT_DIRECTORY}/${sanitizedFilename}-deeper-insights.md`, content: deeperInsights })
}

main().catch(error => console.error(error))
