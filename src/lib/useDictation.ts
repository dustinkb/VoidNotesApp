import { useState, useEffect, useCallback, useRef } from 'react';

interface UseDictationOptions {
  onFinalTranscript?: (text: string) => void;
}

interface SpeechRecognitionAlternative {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
  error?: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export const useDictation = (options: UseDictationOptions = {}) => {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onFinalTranscriptRef = useRef(options.onFinalTranscript);
  const lastFinalTranscriptRef = useRef('');

  useEffect(() => {
    onFinalTranscriptRef.current = options.onFinalTranscript;
  }, [options.onFinalTranscript]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let currentInterim = '';
      let currentFinal = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0]?.transcript ?? '';
        if (event.results[i].isFinal) {
          currentFinal += transcript;
        } else {
          currentInterim += transcript;
        }
      }

      setInterimText(currentInterim.trim());

      const normalizedFinal = currentFinal.trim();
      if (normalizedFinal && normalizedFinal !== lastFinalTranscriptRef.current) {
        lastFinalTranscriptRef.current = normalizedFinal;
        onFinalTranscriptRef.current?.(normalizedFinal);
      }
    };

    recognition.onerror = (event) => {
      const errorCode = event.error ?? 'unknown';
      console.error('Speech recognition error', errorCode);
      setIsListening(false);
      setInterimText('');

      if (errorCode === 'not-allowed' || errorCode === 'service-not-allowed') {
        setError('Microphone permission denied');
        return;
      }

      if (errorCode === 'audio-capture') {
        setError('Microphone unavailable');
        return;
      }

      if (errorCode === 'no-speech') {
        setError('No speech detected');
        return;
      }

      if (errorCode === 'network') {
        setError('Network error while dictating');
        return;
      }

      if (errorCode === 'aborted') {
        return;
      }

      setError(errorCode);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText('');
      lastFinalTranscriptRef.current = '';
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch {
        // Ignore shutdown errors during unmount.
      }
      recognitionRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    if (!recognitionRef.current || isListening) return;

    if (!isSupported) {
      setError('Speech dictation is not supported in this browser');
      return;
    }

    setError(null);
    setInterimText('');
    lastFinalTranscriptRef.current = '';
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch (e) {
      console.warn('Speech recognition already started:', e);
      setError('Unable to start dictation');
    }
  }, [isListening, isSupported]);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
      setIsListening(false);
    } catch {
      // Ignore stop errors when recognition has already ended.
    }
  }, []);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  return {
    isSupported,
    isListening,
    interimText,
    error,
    start,
    stop,
    toggle
  };
};
