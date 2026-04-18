"use client";

// Combined media recorder + browser speech recognition for PTT-style capture.
// stop() returns the audio blob plus the best-effort transcript.

export interface PTTResult {
  blob: Blob;
  mimeType: string;
  extension: string;
  transcript: string;
}

export interface PTTHandle {
  stop: () => Promise<PTTResult>;
}

export async function startPTT(options?: {
  onInterim?: (text: string) => void;
  // Optional existing stream (e.g. from the WebRTC mesh) to reuse so we don't
  // prompt for mic twice. When provided, its tracks are NOT stopped on finish.
  stream?: MediaStream;
}): Promise<PTTHandle> {
  const providedStream = options?.stream;
  const stream = providedStream ?? (await navigator.mediaDevices.getUserMedia({ audio: true }));
  const ownsStream = !providedStream;
  const mimeType = pickMimeType();
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];

  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  rec.start();

  // Parallel: browser speech recognition for live transcript (Chromium only).
  const recognizer = createSpeechRecognizer();
  let finalTranscript = "";

  if (recognizer) {
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.onresult = (ev) => {
      let interim = "";
      const results = ev.results;
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.isFinal) {
          finalTranscript += r[0].transcript;
        } else {
          interim += r[0].transcript;
        }
      }
      options?.onInterim?.((finalTranscript + interim).trim());
    };
    recognizer.onerror = () => {};
    try {
      recognizer.start();
    } catch {
      /* already started */
    }
  }

  return {
    stop: () =>
      new Promise<PTTResult>((resolve) => {
        rec.onstop = () => {
          if (ownsStream) stream.getTracks().forEach((t) => t.stop());
          if (recognizer) {
            try {
              recognizer.stop();
            } catch {
              /* noop */
            }
          }
          const type = rec.mimeType || "audio/webm";
          resolve({
            blob: new Blob(chunks, { type }),
            mimeType: type,
            extension: extFor(type),
            transcript: finalTranscript.trim() || "[no transcript]",
          });
        };
        rec.stop();
      }),
  };
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const preferred = [
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  for (const mt of preferred) {
    if (MediaRecorder.isTypeSupported(mt)) return mt;
  }
  return undefined;
}

function extFor(mime: string): string {
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

// --- SpeechRecognition shims (not in default TS lib) ---

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

export interface MinimalSpeechRecognizer {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onend: (() => void) | null;
}

type RecognitionCtor = new () => MinimalSpeechRecognizer;
type AnyWin = Window & {
  SpeechRecognition?: RecognitionCtor;
  webkitSpeechRecognition?: RecognitionCtor;
};

export function createSpeechRecognizer(): MinimalSpeechRecognizer | null {
  if (typeof window === "undefined") return null;
  const w = window as AnyWin;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.continuous = false;
  rec.interimResults = false;
  rec.lang = "en-US";
  return rec;
}
