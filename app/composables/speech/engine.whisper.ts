import type { SpeechEngine, SpeechEngineOptions } from './types';
import { useSpeechStore } from '@/app/stores/speech';

export function createWhisperEngine(): SpeechEngine {
  const speechStore = useSpeechStore();
  let finalCb: ((t: string) => void) | null = null;
  let partialCb: ((t: string) => void) | null = null;
  let mediaStream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let silenceTimer: any = null;
  let silenceMs = 10000;

  const resetSilence = () => {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(stop, silenceMs);
  };

  async function start(opts?: SpeechEngineOptions) {
    if (speechStore.isListening) return;
    silenceMs = opts?.silenceMs ?? silenceMs;

    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'audio/webm' });
    chunks = [];
    mediaRecorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mediaRecorder.onstop = onStop;
    mediaRecorder.start();

    speechStore.isListening = true;
    resetSilence();
  }

  async function onStop() {
    const blob = new Blob(chunks, { type: 'audio/webm' });
    chunks = [];
    const fd = new FormData();
    fd.append('file', blob, 'audio.webm');
    try {
      const res = await $fetch<{ text: string }>('/api/stt/whisper', {
        method: 'POST',
        body: fd as any,
      });
      finalCb?.(res.text?.trim() || '');
    } catch {
      finalCb?.('');
    }
  }

  async function stop() {
    clearTimeout(silenceTimer);
    if (!speechStore.isListening) return;
    speechStore.isListening = false;
    if (mediaRecorder && mediaRecorder.state !== 'inactive')
      mediaRecorder.stop();
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
  }

  return {
    start,
    stop,
    onPartial(cb) {
      partialCb = cb;
    },
    onFinal(cb) {
      finalCb = cb;
    },
    isAvailable() {
      return !!navigator.mediaDevices;
    },
  };
}
