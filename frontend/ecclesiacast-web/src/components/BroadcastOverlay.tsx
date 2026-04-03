import type { BibleVerse, OverlayState, SermonNote } from '../types';

interface BroadcastOverlayProps {
  state: OverlayState;
  onClose: () => void;
}

export default function BroadcastOverlay({ state, onClose }: BroadcastOverlayProps) {
  if (!state.visible || !state.data) {
    return null;
  }

  const isScripture = state.type === 'scripture';
  const content = state.data;

  return (
    <div className="overlay-shell">
      <div className={`overlay-card ${isScripture ? 'overlay-scripture' : 'overlay-note'}`}>
        <button type="button" className="overlay-close" onClick={onClose} aria-label="Close overlay">
          ×
        </button>
        <div className="overlay-label">
          {isScripture ? `Scripture • ${(content as BibleVerse).version}` : 'Sermon Point'}
        </div>
        <h2 className="overlay-title">
          {isScripture ? (content as BibleVerse).reference : (content as SermonNote).title}
        </h2>
        <p className="overlay-text">
          {isScripture ? (content as BibleVerse).text : (content as SermonNote).content}
        </p>
      </div>
    </div>
  );
}
