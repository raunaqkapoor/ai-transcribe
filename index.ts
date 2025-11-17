import fs from 'fs'
import { getLatestAudioFile, compressAudioFile, readFileContent, writeFileContent, ensureDirectoryExists } from './modules/fileUtils.ts'
import { INPUT_DIRECTORY, OUTPUT_DIRECTORY } from './modules/constants.ts'
import { transcribeAudio, generateSummary } from './modules/openaiUtils.ts'

const main = async (): Promise<void> => {
    ensureDirectoryExists(INPUT_DIRECTORY)
    ensureDirectoryExists(OUTPUT_DIRECTORY)

    const commonFilename = getLatestAudioFile(INPUT_DIRECTORY)

    const audioFilepath = `${INPUT_DIRECTORY}/${commonFilename}.webm`
    const textFilepath = `${INPUT_DIRECTORY}/${commonFilename}.txt`
    const compressedAudioFilepath = `${INPUT_DIRECTORY}/${commonFilename}-compressed.webm`

    const clientsOrganizations = 'Clients: Staycity, Amano, Dalata, Ostello Bello, McDreams, Bicycle Street, Cranleigh'

    const people = 'People: Jason, Laura, Lina, Gaurav, Monasha, Raunaq, Selwyn, Mike, Ram, Bhaskar, Abhishek'

    const pmsHousekeepingMessagingSystems = 'PMS/Housekeeping/Messaging Systems: Optii, Flexkeeping, Mews (frequently mistaken as muse), Cloudbeds, LikeMagic, Apaleo, Freshwork, Freshdesk, Freshchat'

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
        processedAudioFilepath = compressedAudioFilepath
    } else {
        const stats = fs.statSync(audioFilepath)
        const fileSizeInMB = stats.size / (1024 * 1024)

        if (fileSizeInMB > 3) {
            compressAudioFile({ inputPath: audioFilepath, outputPath: compressedAudioFilepath })
            processedAudioFilepath = compressedAudioFilepath
        }
    }

    const transcriptionText = await transcribeAudio({ filePath: processedAudioFilepath, prompt })
    writeFileContent({ filePath: `${OUTPUT_DIRECTORY}/${commonFilename}-transcription.txt`, content: transcriptionText })

    const googleMeetTranscript = readFileContent(textFilepath)
    const summary = await generateSummary({ googleMeetTranscript, accurateTranscript: transcriptionText, toolsAndTech: domainSpecificTerms })
    writeFileContent({ filePath: `${OUTPUT_DIRECTORY}/${commonFilename}-summary.md`, content: summary })
}

main().catch(error => console.error(error))
