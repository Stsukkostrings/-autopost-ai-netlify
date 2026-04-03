import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GoogleGenAI } from '@google/genai';

loadEnvFile();

const PORT = Number(process.env.PORT || 8787);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-12-2025';

if (!GEMINI_API_KEY) {
  console.error('Missing GEMINI_API_KEY in the server environment.');
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
  httpOptions: { apiVersion: 'v1alpha' }
});

function loadEnvFile() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^"(.*)"$/, '$1');
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(payload));
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    writeJson(response, 400, { success: false, error: 'Missing request URL.' });
    return;
  }

  if (request.method === 'OPTIONS') {
    writeJson(response, 204, {});
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === 'GET' && url.pathname === '/api/live-token') {
    try {
      const token = await ai.authTokens.create({
        config: {
          uses: 1,
          expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
          httpOptions: { apiVersion: 'v1alpha' }
        }
      });

      writeJson(response, 200, {
        success: true,
        token: token.name,
        model: LIVE_MODEL,
        apiVersion: 'v1alpha'
      });
      return;
    } catch (error) {
      console.error('Failed to create Gemini ephemeral token', error);
      writeJson(response, 500, {
        success: false,
        error: 'Could not create a Live API token.'
      });
      return;
    }
  }

  writeJson(response, 404, { success: false, error: 'Not found.' });
});

server.listen(PORT, () => {
  console.log(`EcclesiaCast token server listening on http://localhost:${PORT}`);
});
