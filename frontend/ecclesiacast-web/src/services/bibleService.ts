import type { BibleVerse } from '../types';

export async function fetchVerse(reference: string, version = 'kjv'): Promise<BibleVerse | null> {
  try {
    const response = await fetch(
      `https://bible-api.com/${encodeURIComponent(reference)}?translation=${encodeURIComponent(version)}`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return {
      reference: data.reference,
      text: String(data.text ?? '').trim(),
      version: version.toUpperCase()
    };
  } catch (error) {
    console.error('Failed to fetch verse', error);
    return null;
  }
}
