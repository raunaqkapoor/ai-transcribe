# AI Transcribe

AI Transcribe is a Node.js application designed to process audio files, transcribe them using OpenAI's Whisper model, and generate a structured summary of meeting transcripts. This tool is particularly useful for meetings conducted over platforms like Google Meet, where it can cross-reference live captions with accurate transcriptions to produce a comprehensive summary.

## Features

- **Audio Processing**: Automatically selects the latest `.webm` audio file from the `inputFiles` directory for processing.
- **Audio Compression**: Compresses audio files larger than 3 MB to ensure efficient processing.
- **Transcription**: Utilizes OpenAI's Whisper model to transcribe audio files accurately.
- **Summary Generation**: Cross-references Google Meet live captions with accurate transcriptions to generate a detailed meeting summary.
- **Output**: Saves both the transcription and the summary in the `outputFiles` directory.

## Installation

1. **Install FFmpeg**:
   - macOS: `brew install ffmpeg`
   - Ubuntu/Debian: `sudo apt-get install ffmpeg`
   - Windows: Download from the [official FFmpeg website](https://ffmpeg.org/download.html) and follow the installation instructions.

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   - Create a `.env` file in the root directory.
   - Add your OpenAI API key:
     ```
     OPENAI_API_KEY=your_openai_api_key
     ```
   - For **standup prep** (`npm run standup:prepare`): set `LINEAR_API_KEY`. Issue IDs in standup notes are resolved from the Linear API and rendered as clickable links when available.

## Usage

1. **Prepare your audio files**:
   - Place your `.webm` audio files in the `inputFiles` directory.

2. **Run the application**:
   ```bash
   npm start
   ```

3. **Check the output**:
   - Transcriptions will be saved as `-transcription.txt` files in the `outputFiles` directory.
   - Summaries will be saved as `-summary.md` files in the same directory.

## Configuration

- **Node Version**: Ensure you are using Node.js version 24.8.0 or higher.
- **Environment Variables**: The application requires an OpenAI API key, which should be stored in a `.env` file. For standup preparation, `LINEAR_API_KEY` is required; issue identifiers in standup notes are turned into Linear hyperlinks using the workspace URL from the API.