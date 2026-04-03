# EcclesiaCast Web

A browser-based rebuild of the EcclesiaCast AI overlay dashboard.

## Features

- Live microphone streaming to Gemini Live
- Backend-issued ephemeral tokens so the long-lived Gemini key stays off the client
- Real-time transcript display
- Automatic scripture overlay trigger via tool calls
- Manual verse search with free public Bible API lookup
- Sermon keyword note overlays
- Browser-source overlay mode for OBS using `?view=overlay`

## Setup

1. Install dependencies with `npm install`
2. Create `.env.local` from `.env.example`
3. Put your Gemini key in `GEMINI_API_KEY`
4. Start the token server with `npm run server`
5. Start the frontend with `npm run dev`

## API key

Use your own Gemini API key from Google AI Studio. The browser now requests short-lived Live API tokens from the local backend, so the main key stays server-side.
