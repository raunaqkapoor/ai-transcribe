import fs from 'fs'
import { execSync } from 'child_process'

export const getLatestAudioFile = (directory: string): string => {
    const inputFiles = fs.readdirSync(directory).filter(file => file.endsWith('.webm'))
    if (inputFiles.length === 0) {
        throw new Error('No audio files found in the inputFiles directory.')
    }
    inputFiles.sort((a, b) => fs.statSync(`${directory}/${b}`).mtime.getTime() - fs.statSync(`${directory}/${a}`).mtime.getTime())
    return inputFiles[0].replace('.webm', '')
}

export const compressAudioFile = (params: { inputPath: string; outputPath: string }): void => {
    const { inputPath, outputPath } = params
    console.log('Compressing audio file...')
    console.time('Audio Compression')
    execSync(`ffmpeg -i ${inputPath} -c:a libopus -b:a 64k ${outputPath}`)
    console.timeEnd('Audio Compression')
}

export const readFileContent = (filePath: string): string => {
    if (!fs.existsSync(filePath)) {
        return '';
    }
    return fs.readFileSync(filePath, 'utf8');
}

export const writeFileContent = (params: { filePath: string; content: string }): void => {
    const { filePath, content } = params
    fs.writeFileSync(filePath, content, 'utf8')
}

export const ensureDirectoryExists = (directoryPath: string): void => {
    if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath, { recursive: true })
    }
}

export const sanitizeFilename = (filename: string): string => {
    // Strip 'beesy_recording-' prefix if present
    let sanitized = filename.replace(/^beesy_recording-/, '')

    // Strip time and meeting code after date (assumes format: YYYY_MM_DD_HH_MM_SS-MEETINGCODE)
    // The time portion is always followed by a hyphen, which distinguishes it from the date
    // Keeps only the date portion (YYYY_MM_DD)
    sanitized = sanitized.replace(/(_\d{2}_\d{2}_\d{2}-.*)$/, '')

    return sanitized
}

