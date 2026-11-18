"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/** Minimal Web Speech API typings (not in every TS DOM lib). */
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognition(): SpeechRecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const BARS = 5;
const noopSubscribe = () => () => {};

/**
 * Brave exposes webkitSpeechRecognition but blocks the cloud service behind it (privacy), so
 * it always fails with a "network" error. Treat it as unsupported instead of offering a mic
 * that can't work. Same after any service-level failure in this session.
 */
const UNAVAILABLE_KEY = "retorno:voice-unavailable";
function isBrave(): boolean {
  return Boolean((navigator as Navigator & { brave?: unknown }).brave);
}
function markUnavailable() {
  try {
    sessionStorage.setItem(UNAVAILABLE_KEY, "1");
  } catch {
    // Private mode: just hide it for this page view.
  }
}
function isAvailable(): boolean {
  if (!getRecognition() || isBrave()) return false;
  try {
    return sessionStorage.getItem(UNAVAILABLE_KEY) !== "1";
  } catch {
    return true;
  }
}

/** iOS: opening the mic a second time (for the level meter) can cut off dictation. */
function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * Dictation in Mexican Spanish with a live audio level meter.
 * `onTranscript` receives interim text while speaking and the final text at the end.
 */
export function useVoice(onTranscript: (text: string, final: boolean) => void) {
  const [listening, setListening] = useState(false);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.15));
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [metered, setMetered] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const meterRef = useRef<{ stream: MediaStream; context: AudioContext; frame: number } | null>(
    null,
  );
  const transcriptRef = useRef("");
  const callbackRef = useRef(onTranscript);
  useEffect(() => {
    callbackRef.current = onTranscript;
  });

  // false on the server, real value on the client, without a hydration mismatch.
  const available = useSyncExternalStore(noopSubscribe, isAvailable, () => false);
  const supported = available && !disabled;

  const stopMeter = useCallback(() => {
    const meter = meterRef.current;
    if (!meter) return;
    cancelAnimationFrame(meter.frame);
    meter.stream.getTracks().forEach((track) => track.stop());
    void meter.context.close();
    meterRef.current = null;
    setMetered(false);
    setLevels(Array(BARS).fill(0.15));
  }, []);

  const startMeter = useCallback(async () => {
    if (isIOS()) return; // bars animate on their own instead (see `simulated`)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 64;
      context.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const chunk = Math.floor(data.length / BARS);
        setLevels(
          Array.from({ length: BARS }, (_, i) => {
            const slice = data.slice(i * chunk, (i + 1) * chunk);
            const avg = slice.reduce((a, b) => a + b, 0) / (slice.length || 1) / 255;
            return Math.max(0.12, Math.min(1, avg * 1.8));
          }),
        );
        if (meterRef.current) meterRef.current.frame = requestAnimationFrame(tick);
      };
      meterRef.current = { stream, context, frame: requestAnimationFrame(tick) };
      setMetered(true);
    } catch {
      // The meter is decoration: dictation still works without it.
    }
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Recognition = getRecognition();
    if (!Recognition || recognitionRef.current) return;
    setError(null);
    transcriptRef.current = "";

    const recognition = new Recognition();
    recognition.lang = "es-MX";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      let finalText = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]!;
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      transcriptRef.current = (finalText || interim).trim();
      callbackRef.current(transcriptRef.current, false);
    };
    recognition.onerror = (event) => {
      switch (event.error) {
        case "no-speech":
        case "aborted":
          return;
        case "not-allowed":
          setError(
            isIOS()
              ? "Sin permiso de micrófono. Actívalo en Ajustes → tu navegador → Micrófono y Reconocimiento de voz, o escríbelo."
              : "Sin permiso de micrófono. Actívalo en el candado junto a la dirección, o escríbelo.",
          );
          return;
        case "audio-capture":
          setError("No encontramos un micrófono. Escríbelo o elige los datos abajo.");
          return;
        case "network":
        case "service-not-allowed":
        case "language-not-supported":
          // The browser can't reach (or doesn't allow) its speech service: it won't work on retry.
          markUnavailable();
          setDisabled(true);
          setError(
            "Tu navegador no permite dictado por voz. Usa Chrome o Safari, o escríbelo aquí.",
          );
          return;
        default:
          setError("No te escuché bien, intenta otra vez.");
      }
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      stopMeter();
      if (transcriptRef.current) callbackRef.current(transcriptRef.current, true);
    };

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
    void startMeter();
  }, [startMeter, stopMeter]);

  useEffect(
    () => () => {
      recognitionRef.current?.stop();
      stopMeter();
    },
    [stopMeter],
  );

  /** True when the bars should animate on their own (no real level meter, e.g. on iOS). */
  const simulated = listening && !metered;
  return { supported, listening, levels, simulated, error, start, stop };
}
