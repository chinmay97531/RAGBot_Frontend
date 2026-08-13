import { useEffect, useMemo, useRef, useState } from 'react';
import './index.css';

type AiState = 'idle' | 'thinking' | 'responding';

type ThemeId = 'white' | 'dark-blue' | 'brown' | 'pink' | 'blue-red' | 'forest' | 'black';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  sources?: string[];
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const THEME_KEY = 'vidmind-theme';

const THEMES: { id: ThemeId; label: string; swatch: string }[] = [
  { id: 'white', label: 'White', swatch: '#f4f1ea' },
  { id: 'black', label: 'Black', swatch: '#111111' },
  { id: 'dark-blue', label: 'Dark Blue', swatch: '#1b3a6b' },
  { id: 'brown', label: 'Brown', swatch: '#e0a85c' },
  { id: 'pink', label: 'Pink', swatch: '#e89bb5' },
  { id: 'blue-red', label: 'Blue-Red', swatch: 'linear-gradient(135deg,#3b82f6,#ef4444)' },
  { id: 'forest', label: 'Forest', swatch: '#3d8f6a' },
];

function getInitialTheme(): ThemeId {
  const saved = localStorage.getItem(THEME_KEY);
  if (THEMES.some((theme) => theme.id === saved)) return saved as ThemeId;
  return 'brown';
}

function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[0-9A-Za-z_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const fromQuery = url.searchParams.get('v');
    if (fromQuery) return fromQuery;
    if (url.hostname.includes('youtu.be')) return url.pathname.slice(1);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts.pop() ?? null;
  } catch {
    return null;
  }
}

function extractSources(text: string): string[] {
  const stamps = text.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g) ?? [];
  const ids = text.match(/\b[0-9A-Za-z_-]{11}\b/g) ?? [];
  return [...new Set([...stamps.slice(0, 4), ...ids.slice(0, 2)])];
}

function CoreViz({ state }: { state: AiState }) {
  const bars = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  return (
    <div className={`core-viz state-${state}`} aria-hidden="true">
      <div className="core-glow" />
      <svg className="core-svg" viewBox="0 0 240 240">
        <circle className="ring ring-outer" cx="120" cy="120" r="102" />
        <circle className="ring ring-mid" cx="120" cy="120" r="84" />
        <circle className="ring ring-inner" cx="120" cy="120" r="62" />
        <g className="wave">
          {bars.map((i) => {
            const angle = (i / bars.length) * Math.PI * 2;
            const x1 = 120 + Math.cos(angle) * 48;
            const y1 = 120 + Math.sin(angle) * 48;
            const x2 = 120 + Math.cos(angle) * 70;
            const y2 = 120 + Math.sin(angle) * 70;
            return (
              <line
                key={i}
                className="wave-bar"
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                style={{ animationDelay: `${i * 0.05}s` }}
              />
            );
          })}
        </g>
        <circle className="core-dot" cx="120" cy="120" r="10" />
      </svg>
    </div>
  );
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [analyzed, setAnalyzed] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [aiState, setAiState] = useState<AiState>('idle');
  const [statusNote, setStatusNote] = useState('Ready');
  const [theme, setTheme] = useState<ThemeId>(getInitialTheme);
  const [threadId, setThreadId] = useState(() => String(Date.now()));
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (isLoading) setAiState('thinking');
  }, [isLoading]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const ask = async (query: string, options?: { markAnalyzed?: boolean }) => {
    const text = query.trim();
    if (!text || isLoading) return false;

    setMessages((prev) => [...prev, { id: Date.now(), role: 'user', text }]);
    setInputText('');
    setIsLoading(true);
    setAiState('thinking');
    setStatusNote(options?.markAnalyzed ? 'Analyzing video…' : 'Retrieving context…');

    try {
      const response = await fetch(`${API_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text, thread_id: threadId }),
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.text();
      setAiState('responding');
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          text: data,
          sources: extractSources(data),
        },
      ]);

      if (options?.markAnalyzed) {
        setAnalyzed(true);
        setStatusNote('Ready to answer');
      } else {
        setStatusNote(analyzed || options?.markAnalyzed ? 'Ready to answer' : 'Response ready');
      }

      window.setTimeout(() => setAiState('idle'), 1200);
      return true;
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          text: 'I could not complete that request. Check that the backend is running and try again.',
        },
      ]);
      setStatusNote('Request failed');
      setAiState('idle');
      return false;
    } finally {
      setIsLoading(false);
      setAnalyzing(false);
    }
  };

  const analyzeVideo = async () => {
    const id = extractVideoId(videoUrl);
    if (!id || isLoading) {
      setStatusNote('Enter a valid YouTube URL');
      return;
    }

    setVideoId(id);
    setAnalyzed(false);
    setAnalyzing(true);
    const prompt = `Please analyze this YouTube video and index its transcript for Q&A: https://www.youtube.com/watch?v=${id}. Confirm when the transcript is ready.`;
    await ask(prompt, { markAnalyzed: true });
  };

  const resetSession = () => {
    setMessages([]);
    setThreadId(String(Date.now()));
    setAnalyzed(false);
    setAnalyzing(false);
    setVideoId(null);
    setVideoUrl('');
    setStatusNote('Ready');
    setAiState('idle');
  };

  const stateLabel =
    aiState === 'thinking' ? 'Thinking' : aiState === 'responding' ? 'Responding' : 'Idle';

  return (
    <div className="shell">
      <div className="bg-grid" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          <h1>VidMind</h1>
        </div>
        <div className="top-actions">
          <div className="theme-picker" role="group" aria-label="Theme">
            {THEMES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`theme-swatch ${theme === item.id ? 'active' : ''}`}
                title={item.label}
                aria-label={item.label}
                aria-pressed={theme === item.id}
                onClick={() => setTheme(item.id)}
                style={{ background: item.swatch }}
              />
            ))}
          </div>
          <button type="button" className="ghost-btn" onClick={resetSession}>
            New chat
          </button>
          <div className="online">
            <span className="online-dot" />
            Online
          </div>
        </div>
      </header>

      <main className="stage">
        <aside className="side-rail">
          <div className="rail-core">
            <CoreViz state={aiState} />
            <p className="prompt-line">How can I help you?</p>
            <p className="state-line">{stateLabel}</p>
          </div>

          <div className="video-block">
            <label className="field-label" htmlFor="youtube-url">
              YouTube URL
            </label>
            <input
              id="youtube-url"
              className="video-input"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="Paste YouTube URL…"
              disabled={isLoading}
            />
            <button
              type="button"
              className="analyze-btn"
              onClick={() => void analyzeVideo()}
              disabled={isLoading || !videoUrl.trim()}
            >
              Analyze
            </button>
          </div>

          <div className="rail-status">
            <div className={`pipeline ${analyzed || analyzing ? 'visible' : ''}`}>
              <span className={analyzed || analyzing ? 'on' : ''}>● Video analyzed</span>
              <span className={analyzed ? 'on' : ''}>● Transcript indexed</span>
              <span className={analyzed ? 'on' : ''}>● Ready to answer</span>
            </div>

            {videoId && (
              <p className="video-meta">
                Active: <code>{videoId}</code>
              </p>
            )}
          </div>
        </aside>

        <section className="chat-panel">
          <div className="panel-head">
            <h2>Conversation</h2>
            <span>{statusNote}</span>
          </div>

          <div className="chat-scroll">
            {messages.length === 0 ? (
              <div className="chat-empty">
                Analyze a YouTube video, then ask VidMind anything about it.
              </div>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={`bubble ${message.role === 'user' ? 'user' : 'assistant'}`}
                >
                  <header>{message.role === 'user' ? 'You' : 'VidMind'}</header>
                  <p>{message.text}</p>
                  {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                    <div className="sources">
                      <strong>Sources</strong>
                      <ul>
                        {message.sources.map((source) => (
                          <li key={source}>{source}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              ))
            )}
            {isLoading && (
              <article className="bubble assistant loading">
                <header>VidMind</header>
                <p>Processing…</p>
              </article>
            )}
            <div ref={chatEndRef} />
          </div>
        </section>
      </main>

      <footer className="composer">
        <input
          className="ask-input"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void ask(inputText);
            }
          }}
          placeholder="Ask about the video…"
          disabled={isLoading}
        />
        <button
          type="button"
          className="send-btn"
          onClick={() => void ask(inputText)}
          disabled={isLoading || !inputText.trim()}
        >
          Send
        </button>
      </footer>
    </div>
  );
}

export default App;
