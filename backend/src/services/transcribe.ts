/**
 * Meeting transcription — fully self-hosted, free.
 *
 *   1. Whisper (faster-whisper ASR web service) turns the audio into text.
 *   2. Ollama (a local LLM) turns the transcript into a summary + decisions +
 *      next steps. This step is OPTIONAL: if Ollama isn't reachable or the
 *      model isn't pulled, we keep the transcript and skip the summary.
 *
 * Runs inside the transcribe BullMQ worker, never in a request — CPU
 * transcription can take minutes.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { Agent } from 'undici';
import { env } from '../utils/env';
import * as notes from './notes';

const UPLOAD_ROOT = process.env.UPLOAD_ROOT ?? '/uploads';

// CPU transcription/inference can run for minutes — undici's default 5-minute
// header/body timeouts would abort a long meeting. A dedicated dispatcher with
// long timeouts, scoped to these calls only (global fetch keeps its defaults).
const longAgent = new Agent({
  headersTimeout: 30 * 60 * 1000,
  bodyTimeout: 30 * 60 * 1000,
  connectTimeout: 10 * 1000,
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** POST the audio to Whisper and return the transcript text. */
async function transcribe(absPath: string): Promise<string> {
  const bytes = await fs.readFile(absPath);
  const form = new FormData();
  form.append('audio_file', new Blob([bytes]), path.basename(absPath));

  const url = `${env.WHISPER_URL}/asr?encode=true&task=transcribe&output=txt`;
  const res = await fetch(url, {
    method: 'POST',
    body: form,
    dispatcher: longAgent,
  } as RequestInit & { dispatcher: Agent });
  if (!res.ok) throw new Error(`Whisper returned ${res.status}`);
  const text = (await res.text()).trim();
  if (!text) throw new Error('Transcript was empty — was there audible speech?');
  return text;
}

interface Summary {
  summary: string;
  decisions: string[];
  nextSteps: string[];
}

/** Ask the local LLM for a structured summary. Returns null (not throws) if the
 *  LLM is unavailable, so a missing/optional Ollama never fails the job. */
async function summarize(transcript: string): Promise<Summary | null> {
  const system =
    'You are a meeting-notes assistant. Read the transcript and produce a concise, ' +
    'accurate summary. Reply ONLY with JSON of the shape ' +
    '{"summary": string, "decisions": string[], "nextSteps": string[]}. ' +
    '"summary" is 2–4 sentences of the key points. "decisions" are concrete decisions made. ' +
    '"nextSteps" are action items, each a short imperative line. ' +
    'Write in the same language as the transcript. If a section has nothing, use an empty array.';

  try {
    const res = await fetch(`${env.OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.SUMMARY_MODEL,
        stream: false,
        format: 'json',
        options: { temperature: 0.2 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: transcript.slice(0, 24000) },
        ],
      }),
      dispatcher: longAgent,
    } as RequestInit & { dispatcher: Agent });
    if (!res.ok) return null;
    const data = (await res.json()) as { message?: { content?: string } };
    const raw = data.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Summary>;
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions.filter((x) => typeof x === 'string') : [],
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps.filter((x) => typeof x === 'string') : [],
    };
  } catch {
    return null; // Ollama down / model not pulled / bad JSON → skip summary
  }
}

/** Build the summary HTML written into the note's `summary` field. */
function summaryHtml(s: Summary): string {
  const list = (items: string[]) =>
    `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
  let html = '';
  if (s.summary) html += `<h2>Summary</h2><p>${escapeHtml(s.summary)}</p>`;
  if (s.decisions.length) html += `<h2>Decisions</h2>${list(s.decisions)}`;
  if (s.nextSteps.length) html += `<h2>Next steps</h2>${list(s.nextSteps)}`;
  return html;
}

/** The worker entry point: transcribe a note's audio, summarise, store. */
export async function runTranscription(noteId: string): Promise<void> {
  const audioPath = await notes.getAudioPath(noteId);
  if (!audioPath) return; // nothing to do (deleted / already processed)
  const absPath = path.join(UPLOAD_ROOT, audioPath);

  try {
    const transcript = await transcribe(absPath);
    const summary = await summarize(transcript);
    await notes.finishTranscription(noteId, {
      transcript,
      summary: summary ? summaryHtml(summary) : null,
      nextSteps: summary?.nextSteps ?? [],
    });
  } catch (err) {
    await notes.failTranscription(noteId, err instanceof Error ? err.message : 'Transcription failed');
  } finally {
    // Best-effort cleanup of the uploaded audio.
    fs.unlink(absPath).catch(() => {});
  }
}
