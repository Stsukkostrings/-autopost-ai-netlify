import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  Type,
  type FunctionDeclaration
} from '@google/genai';
import { useEffect, useMemo, useRef, useState } from 'react';
import AudioVisualizer from './components/AudioVisualizer';
import BroadcastOverlay from './components/BroadcastOverlay';
import { fetchVerse } from './services/bibleService';
import { ConnectionStatus, type OverlayState, type SermonNote, type TranscriptionLog } from './types';

const CHANNEL_NAME = 'ecclesiacast_sync';
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim();
const LIVE_MODEL_FALLBACK = 'gemini-2.5-flash-native-audio-preview-12-2025';

const NOTES: SermonNote[] = [
  {
    id: '1',
    keyword: 'faith',
    title: 'The Power of Faith',
    content: 'Faith is being sure of what we hope for and certain of what we do not see.'
  },
  {
    id: '2',
    keyword: 'grace',
    title: 'Unmerited Favor',
    content: 'Grace is the unmerited favor of God, as manifested in the salvation of sinners.'
  },
  {
    id: '3',
    keyword: 'love',
    title: 'The Greatest Commandment',
    content: 'Love the Lord your God with all your heart and with all your soul and with all your mind.'
  }
];

const triggerScriptureFunction: FunctionDeclaration = {
  name: 'triggerScripture',
  parameters: {
    type: Type.OBJECT,
    description: 'Trigger a Bible verse overlay when the speaker references a specific passage.',
    properties: {
      reference: {
        type: Type.STRING,
        description: 'The Bible reference, for example John 3:16 or Psalm 23.'
      }
    },
    required: ['reference']
  }
};

function encodePcm(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [logs, setLogs] = useState<TranscriptionLog[]>([]);
  const [overlay, setOverlay] = useState<OverlayState>({ type: 'none', data: null, visible: false });
  const [currentText, setCurrentText] = useState('');
  const [bibleVersion, setBibleVersion] = useState('kjv');
  const [isOverlayView, setIsOverlayView] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [manualReference, setManualReference] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const sessionRef = useRef<any>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const syncChannelRef = useRef<BroadcastChannel | null>(null);
  const overlayTimerRef = useRef<number | null>(null);

  const overlayUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    const url = new URL(window.location.href);
    url.searchParams.set('view', 'overlay');
    return url.toString();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'overlay') {
      setIsOverlayView(true);
      document.body.classList.add('overlay-page');
    }

    const channel = new BroadcastChannel(CHANNEL_NAME);
    syncChannelRef.current = channel;
    channel.onmessage = (event: MessageEvent<OverlayState>) => {
      if (event.data) {
        setOverlay(event.data);
      }
    };

    return () => {
      channel.close();
      syncChannelRef.current = null;
      document.body.classList.remove('overlay-page');
    };
  }, []);

  useEffect(() => () => stopBroadcast(), []);

  const syncOverlay = (nextState: OverlayState) => {
    setOverlay(nextState);
    syncChannelRef.current?.postMessage(nextState);
  };

  const queueOverlayHide = (timeoutMs: number) => {
    if (overlayTimerRef.current !== null) {
      window.clearTimeout(overlayTimerRef.current);
    }

    overlayTimerRef.current = window.setTimeout(() => {
      syncOverlay({ type: 'none', data: null, visible: false });
    }, timeoutMs);
  };

  const appendLog = (entry: Omit<TranscriptionLog, 'timestamp'>) => {
    setLogs((previous) => [{ timestamp: new Date(), ...entry }, ...previous].slice(0, 12));
  };

  const fetchLiveToken = async () => {
    const endpoint = `${API_BASE_URL || ''}/api/live-token`;
    const response = await fetch(endpoint);
    const payload = await response.json();

    if (!response.ok || !payload?.success || !payload?.token) {
      throw new Error(payload?.error || 'Failed to fetch Live API token.');
    }

    return {
      token: String(payload.token),
      model: String(payload.model || LIVE_MODEL_FALLBACK),
      apiVersion: String(payload.apiVersion || 'v1alpha')
    };
  };

  const displayScripture = async (reference: string) => {
    const verseData = await fetchVerse(reference, bibleVersion);

    if (!verseData) {
      appendLog({ text: `Verse not found: ${reference}` });
      return;
    }

    syncOverlay({ type: 'scripture', data: verseData, visible: true });
    appendLog({ text: `Detected scripture: ${reference}`, detectedRef: reference });
    queueOverlayHide(15000);
  };

  const displayNote = (note: SermonNote) => {
    syncOverlay({ type: 'note', data: note, visible: true });
    appendLog({ text: `Note triggered: ${note.keyword}` });
    queueOverlayHide(10000);
  };

  const cleanupAudio = async () => {
    scriptProcessorRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    sourceNodeRef.current = null;
    scriptProcessorRef.current = null;
    setAnalyser(null);

    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const stopBroadcast = async () => {
    try {
      sessionRef.current?.close?.();
    } catch (error) {
      console.error('Failed to close session cleanly', error);
    }

    sessionRef.current = null;
    sessionPromiseRef.current = null;
    await cleanupAudio();
    setStatus(ConnectionStatus.DISCONNECTED);
  };

  const startBroadcast = async () => {
    setErrorMessage('');
    setStatus(ConnectionStatus.CONNECTING);

    try {
      const liveToken = await fetchLiveToken();
      const ai = new GoogleGenAI({
        apiKey: liveToken.token,
        httpOptions: { apiVersion: liveToken.apiVersion }
      });
      const audioContext = new window.AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const source = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      const analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 256;
      source.connect(analyserNode);
      setAnalyser(analyserNode);

      const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = scriptProcessor;

      const sessionPromise = ai.live.connect({
        model: liveToken.model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction:
            "You are an AI church broadcast assistant. When the speaker references a Bible passage, call the 'triggerScripture' tool with the clearest reference you can infer.",
          tools: [{ functionDeclarations: [triggerScriptureFunction] }],
          inputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
            setStatus(ConnectionStatus.CONNECTED);
            appendLog({ text: 'Broadcast connected' });
          },
          onmessage: async (message: LiveServerMessage) => {
            const transcript = message.serverContent?.inputTranscription?.text?.trim();

            if (transcript) {
              setCurrentText((previous) => `${previous} ${transcript}`.trim().slice(-1200));
              const lowerTranscript = transcript.toLowerCase();
              NOTES.forEach((note) => {
                if (lowerTranscript.includes(note.keyword.toLowerCase())) {
                  displayNote(note);
                }
              });
            }

            if (message.toolCall?.functionCalls?.length) {
              for (const call of message.toolCall.functionCalls) {
                if (call.name === 'triggerScripture') {
                  const reference = String(call.args?.reference ?? '').trim();
                  if (reference) {
                    await displayScripture(reference);
                  }

                  sessionPromiseRef.current?.then((session) =>
                    session.sendToolResponse({
                      functionResponses: [
                        {
                          id: call.id,
                          name: call.name,
                          response: { result: 'ok' }
                        }
                      ]
                    })
                  );
                }
              }
            }
          },
          onerror: (error: unknown) => {
            console.error('Gemini Live error', error);
            setErrorMessage('Gemini Live connection failed. Check your key, browser permissions, or model access.');
            setStatus(ConnectionStatus.ERROR);
          },
          onclose: () => {
            setStatus(ConnectionStatus.DISCONNECTED);
          }
        }
      });

      sessionPromiseRef.current = sessionPromise;
      sessionRef.current = await sessionPromise;

      scriptProcessor.onaudioprocess = (event) => {
        const sessionCandidate = sessionRef.current;
        if (!sessionCandidate) {
          return;
        }

        const inputData = event.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(inputData.length);
        for (let index = 0; index < inputData.length; index += 1) {
          const sample = Math.max(-1, Math.min(1, inputData[index]));
          int16[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        }

        sessionCandidate.sendRealtimeInput({
          media: {
            mimeType: 'audio/pcm;rate=16000',
            data: encodePcm(new Uint8Array(int16.buffer))
          }
        });
      };

      source.connect(scriptProcessor);
      scriptProcessor.connect(audioContext.destination);
    } catch (error) {
      console.error('Failed to start broadcast', error);
      setErrorMessage('Could not start the broadcast. Make sure microphone access is allowed and your key is valid.');
      setStatus(ConnectionStatus.ERROR);
      await cleanupAudio();
    }
  };

  const copyOverlayUrl = async () => {
    if (!overlayUrl) {
      return;
    }

    await navigator.clipboard.writeText(overlayUrl);
    appendLog({ text: 'Overlay URL copied to clipboard' });
  };

  if (isOverlayView) {
    return <BroadcastOverlay state={overlay} onClose={() => syncOverlay({ ...overlay, visible: false })} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Church Broadcast Overlay</p>
          <h1>EcclesiaCast Web</h1>
        </div>
        <div className="topbar-actions">
          <button type="button" className="secondary-button" onClick={copyOverlayUrl}>
            Copy OBS URL
          </button>
          <div className={`status-pill status-${status.toLowerCase()}`}>{status}</div>
          {status === ConnectionStatus.CONNECTED ? (
            <button type="button" className="danger-button" onClick={() => void stopBroadcast()}>
              Stop Broadcast
            </button>
          ) : (
            <button type="button" className="primary-button" onClick={() => void startBroadcast()}>
              Start Broadcast
            </button>
          )}
        </div>
      </header>

      <main className="dashboard-grid">
        <section className="panel span-8">
          <div className="panel-header">
            <div>
              <p className="section-label">Live Transcription</p>
              <h2>Realtime sermon feed</h2>
            </div>
            <div className="visualizer-wrap">
              <AudioVisualizer analyser={analyser} isActive={status === ConnectionStatus.CONNECTED} />
            </div>
          </div>
          <div className="transcript-box">{currentText || 'Start the broadcast to begin listening.'}</div>
        </section>

        <section className="panel span-4">
          <div className="panel-header compact">
            <div>
              <p className="section-label">Live Security</p>
              <h2>Server-issued session tokens</h2>
            </div>
          </div>
          <div className="stack">
            <p className="muted">
              The browser no longer stores your Gemini key. Click start and the app will request a short-lived Live API token from the backend.
            </p>
            <p className="muted">
              Set `GEMINI_API_KEY` on the token server and keep `VITE_API_BASE_URL` pointed at that backend when needed.
            </p>
            {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
          </div>
        </section>

        <section className="panel span-8">
          <div className="panel-header compact">
            <div>
              <p className="section-label">Keyword Triggers</p>
              <h2>Manual sermon note overlays</h2>
            </div>
          </div>
          <div className="notes-grid">
            {NOTES.map((note) => (
              <button key={note.id} type="button" className="note-card" onClick={() => displayNote(note)}>
                <span>{note.keyword}</span>
                <strong>{note.title}</strong>
                <small>{note.content}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="panel span-4">
          <div className="panel-header compact">
            <div>
              <p className="section-label">Quick Display</p>
              <h2>Verse lookup</h2>
            </div>
          </div>
          <div className="stack">
            <input
              className="input"
              type="text"
              placeholder="John 3:16"
              value={manualReference}
              onChange={(event) => setManualReference(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && manualReference.trim()) {
                  void displayScripture(manualReference.trim());
                }
              }}
            />
            <select
              className="input"
              value={bibleVersion}
              onChange={(event) => setBibleVersion(event.target.value)}
            >
              <option value="kjv">KJV</option>
              <option value="web">WEB</option>
              <option value="asv">ASV</option>
            </select>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                if (manualReference.trim()) {
                  void displayScripture(manualReference.trim());
                }
              }}
            >
              Show Verse
            </button>
          </div>
        </section>

        <section className="panel span-12">
          <div className="panel-header compact">
            <div>
              <p className="section-label">Broadcast Log</p>
              <h2>Recent activity</h2>
            </div>
          </div>
          <div className="log-list">
            {logs.length ? (
              logs.map((log, index) => (
                <div className="log-item" key={`${log.timestamp.toISOString()}-${index}`}>
                  <span>{log.text}</span>
                  <time>{log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                </div>
              ))
            ) : (
              <p className="muted">No activity yet.</p>
            )}
          </div>
        </section>
      </main>

      <BroadcastOverlay state={overlay} onClose={() => syncOverlay({ ...overlay, visible: false })} />
    </div>
  );
}
