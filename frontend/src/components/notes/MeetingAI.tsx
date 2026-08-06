'use client';

/**
 * Meeting AI panel — self-hosted, free.
 *
 * Record with the mic (in-person) or upload a recording (Zoom/Meet). The
 * server transcribes it (Whisper) and, if a local LLM is available, writes a
 * Summary / Decisions / Next steps. While it runs (minutes, on CPU) this polls
 * the note until it's done. Then: insert the summary into the note, and turn
 * the next steps into tasks.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, Mic, Upload, Square, Loader2, FileText, ListPlus, RotateCcw, AlertTriangle } from 'lucide-react';
import { organicNotes, type Note } from '@/lib/api';

export function MeetingAI({
  note,
  onNoteUpdate,
  onInsertSummary,
  onCreateTasks,
}: {
  note: Note;
  onNoteUpdate: (n: Note) => void;
  onInsertSummary: (summaryHtml: string) => void;
  onCreateTasks: (steps: string[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [tasksAdded, setTasksAdded] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const status = note.transcribeStatus;

  // Poll while a transcription is running.
  useEffect(() => {
    if (status !== 'processing') return;
    let cancelled = false;
    const tick = () => {
      organicNotes
        .get(note.id)
        .then((r) => { if (!cancelled) onNoteUpdate(r.note); })
        .catch(() => {});
    };
    const iv = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [status, note.id, onNoteUpdate]);

  const send = useCallback(
    async (file: File) => {
      setUploading(true);
      setTasksAdded(false);
      try {
        const { note: updated } = await organicNotes.transcribe(note.id, file);
        onNoteUpdate(updated);
      } catch {
        // A failed upload leaves status unchanged; surfaced by the note state.
      } finally {
        setUploading(false);
      }
    },
    [note.id, onNoteUpdate]
  );

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        const ext = (rec.mimeType || 'audio/webm').includes('ogg') ? 'ogg' : 'webm';
        void send(new File([blob], `recording.${ext}`, { type: blob.type }));
      };
      mediaRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      alert('Could not access the microphone. Check the browser permission.');
    }
  }

  function stopRecording() {
    mediaRef.current?.stop();
    setRecording(false);
  }

  const busy = uploading || status === 'processing';

  return (
    <div className="mt-4 rounded-2xl bg-surface-alt/50 p-4 ring-1 ring-line">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles size={15} className="text-cherry" />
        <h3 className="text-sm font-bold text-ink">Meeting AI</h3>
        <span className="lab ml-auto text-ink-subtle">self-hosted · free</span>
      </div>

      {/* Idle: record or upload */}
      {(status === 'idle' || status === 'error') && !busy && (
        <>
          <p className="mb-3 text-xs text-ink-muted">
            Record the meeting or upload a recording. It’s transcribed on your server, then
            summarised into key points and next steps.
          </p>
          <div className="flex flex-wrap gap-2">
            {recording ? (
              <button onClick={stopRecording} className="btn-primary btn-sm">
                <Square size={13} /> Stop &amp; transcribe
              </button>
            ) : (
              <button onClick={startRecording} className="btn-primary btn-sm">
                <Mic size={14} /> Record
              </button>
            )}
            <button onClick={() => fileRef.current?.click()} className="btn-secondary btn-sm">
              <Upload size={14} /> Upload recording
            </button>
          </div>
          {status === 'error' && note.transcribeError && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-danger">
              <AlertTriangle size={13} /> {note.transcribeError}
            </p>
          )}
        </>
      )}

      {/* Processing */}
      {busy && (
        <div className="flex items-center gap-2 py-1 text-sm text-ink-muted">
          <Loader2 size={15} className="animate-spin text-cherry" />
          {uploading ? 'Uploading…' : 'Transcribing… this runs on your server and can take a few minutes.'}
        </div>
      )}

      {/* Done */}
      {status === 'done' && !busy && (
        <div>
          {note.summary ? (
            <>
              <div
                className="note-prose rounded-xl bg-surface p-3 ring-1 ring-line"
                dangerouslySetInnerHTML={{ __html: note.summary }}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => onInsertSummary(note.summary!)} className="btn-secondary btn-sm">
                  <FileText size={14} /> Insert into note
                </button>
                {note.nextSteps.length > 0 && (
                  <button
                    onClick={() => { onCreateTasks(note.nextSteps); setTasksAdded(true); }}
                    disabled={tasksAdded}
                    className="btn-secondary btn-sm disabled:opacity-50"
                  >
                    <ListPlus size={14} /> {tasksAdded ? `Added ${note.nextSteps.length} tasks` : `Add ${note.nextSteps.length} next steps to Tasks`}
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="text-xs text-ink-muted">
              Transcript ready. The AI summary was skipped — the local summary model isn’t
              running. See the transcript below.
            </p>
          )}

          {note.transcript && (
            <div className="mt-3">
              <button
                onClick={() => setShowTranscript((v) => !v)}
                className="lab text-ink-subtle hover:text-ink"
              >
                {showTranscript ? 'Hide' : 'Show'} full transcript
              </button>
              {showTranscript && (
                <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-surface p-3 text-xs leading-relaxed text-ink-muted ring-1 ring-line">
                  {note.transcript}
                </p>
              )}
            </div>
          )}

          <button
            onClick={() => fileRef.current?.click()}
            className="mt-3 flex items-center gap-1.5 text-xs text-ink-subtle hover:text-ink"
          >
            <RotateCcw size={12} /> Replace recording
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="audio/*,video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void send(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
