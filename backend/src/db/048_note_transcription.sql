-- =====================================================================
-- Meeting-note transcription (self-hosted, free).
--
-- A meeting note can have a recording uploaded; a background job transcribes
-- it (Whisper) and, if a local LLM is available, summarises it into
-- important points + next steps. These columns hold that pipeline's state
-- and results, kept separate from the note body so the transcription worker
-- never clobbers what the user is typing.
-- =====================================================================

ALTER TABLE organic_notes
    ADD COLUMN transcribe_status TEXT NOT NULL DEFAULT 'idle'
        CHECK (transcribe_status IN ('idle', 'processing', 'done', 'error')),
    ADD COLUMN transcribe_error  TEXT,
    -- Path (under UPLOAD_ROOT) of the uploaded audio, cleared after processing.
    ADD COLUMN audio_path        TEXT,
    -- Raw transcript text.
    ADD COLUMN transcript        TEXT,
    -- Generated summary HTML (Summary / Decisions / Next steps).
    ADD COLUMN summary           TEXT,
    -- The extracted next-step lines, so they can become tasks with one click.
    ADD COLUMN next_steps        JSONB NOT NULL DEFAULT '[]'::jsonb;
