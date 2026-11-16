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
 * Dictation in Mexican Spanish with a live audio level meter.
 * `onTranscript` receives interim text while speaking and the final text at the end.
 */
export function useVoice(onTranscript: (text: string, final: boolean) => void) {
  const [listening, setListening] = useState(false);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.15));
  const [error, setError] = useState<string | null>(null);

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
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => Boolean(getRecognition()),
    () => false,
  );

  const stopMeter = useCallback(() => {
    const meter = meterRef.current;
    if (!meter) return;
    cancelAnimationFrame(meter.frame);
    meter.stream.getTracks().forEach((track) => track.stop());
    void meter.context.close();
    meterRef.current = null;
    setLevels(Array(BARS).fill(0.15));
  }, []);

  const startMeter = useCallback(async () => {
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
      if (event.error === "not-allowed") setError("Permite el micrófono para dictar.");
      else if (event.error !== "no-speech" && event.error !== "aborted")
        setError("No te escuché bien, intenta otra vez.");
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

  return { supported, listening, levels, error, start, stop };
}
