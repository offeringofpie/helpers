import { clicksBetweenUtterances, pageSynth, resetSynth, synth } from './synth.js';

type TtsState = 'idle' | 'speaking' | 'paused';

type TtsSettings = {
  readonly voice: string | null;
  readonly rate: number;
  readonly pitch: number;
  readonly volume: number;
};

type TtsSnapshot = {
  readonly state: TtsState;
  readonly block: Element | null;
};

type TtsOptions = {
  readonly rootSelector?: string;
  readonly blockSelector?: string;
  readonly activeClass?: string;
  readonly settings?: Partial<TtsSettings>;
};

type Tts = {
  start: (fromIndex?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  skip: (delta: number) => void;
  setSettings: (next: Partial<TtsSettings>) => void;
  subscribe: (callback: (snapshot: TtsSnapshot) => void) => () => void;
  destroy: () => void;
};

const defaultRootSelector = 'article';
const defaultBlockSelector = 'h1, h2, h3, h4, h5, h6, p, li, blockquote';
const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
const cancelErrors: readonly SpeechSynthesisErrorCode[] = ['canceled', 'interrupted'];
const blockGap = 50;
const startDelay = 100;
const sentenceEnd = /[.!?:]\W*$/;

const defaultSettings: TtsSettings = {
  voice: null,
  rate: 1,
  pitch: 1,
  volume: 1,
};

const toSentence = (el: Element) => {
  const text = el.textContent?.trim() ?? '';
  return sentenceEnd.test(text) ? text : `${text}.`;
};

const scrollIntoViewIfNeeded = (el: Element) => {
  const rect = el.getBoundingClientRect();
  if (rect.top >= 0 && rect.bottom <= window.innerHeight) {
    return;
  }

  const reduced = window.matchMedia(reducedMotionQuery).matches;
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
};

const createTts = (options: TtsOptions = {}): Tts => {
  const rootSelector = options.rootSelector ?? defaultRootSelector;
  const blockSelector = options.blockSelector ?? defaultBlockSelector;
  const subscribers = new Set<(snapshot: TtsSnapshot) => void>();
  let settings: TtsSettings = { ...defaultSettings, ...options.settings };
  let state: TtsState = 'idle';
  let block: Element | null = null;
  let index = 0;
  let session = 0;
  let restartOnResume = false;

  const getBlocks = () => {
    const root = document.querySelector(rootSelector) ?? document.body;

    return [...root.querySelectorAll(blockSelector)].filter((el) => {
      const hasNestedBlock = el.querySelector(blockSelector) !== null;
      const hasText = Boolean(el.textContent?.trim());
      return hasText && !hasNestedBlock;
    });
  };

  const update = (nextState: TtsState, nextBlock: Element | null) => {
    if (options.activeClass) {
      block?.classList.remove(options.activeClass);
      nextBlock?.classList.add(options.activeClass);
    }

    state = nextState;
    block = nextBlock;
    subscribers.forEach((callback) => callback({ state, block }));
  };

  const findVoice = () => {
    return pageSynth()
      ?.getVoices()
      .find((option) => option.name === settings.voice);
  };

  const applySettings = (utterance: SpeechSynthesisUtterance) => {
    const voice = findVoice();
    if (voice) {
      utterance.voice = voice;
    }

    utterance.rate = settings.rate;
    utterance.pitch = settings.pitch;
    utterance.volume = settings.volume;
  };

  const speakNext = (id: number) => {
    if (id !== session) {
      return;
    }

    const blocks = getBlocks();
    const run = clicksBetweenUtterances() ? blocks.slice(index) : blocks.slice(index, index + 1);
    const first = run[0];
    if (!first) {
      update('idle', null);
      return;
    }

    const texts = run.map(toSentence);
    const ends: number[] = [];
    let length = 0;
    for (const text of texts) {
      length += text.length + 1;
      ends.push(length);
    }

    const runStart = index;
    const utterance = new SpeechSynthesisUtterance(texts.join(' '));
    applySettings(utterance);
    update(state, first);
    scrollIntoViewIfNeeded(first);

    const advance = (nextIndex: number) => {
      index = nextIndex;
      setTimeout(() => speakNext(id), blockGap);
    };

    utterance.onboundary = (event) => {
      const reached = ends.findIndex((end) => event.charIndex < end);
      const current = run[reached];
      if (id !== session || !current || current === block) {
        return;
      }

      index = runStart + reached;
      update(state, current);
      scrollIntoViewIfNeeded(current);
    };

    utterance.onend = () => {
      if (id === session) {
        advance(runStart + run.length);
      }
    };

    utterance.onerror = (event) => {
      if (id !== session) {
        return;
      }

      if (cancelErrors.includes(event.error)) {
        stop();
        return;
      }

      advance(index + 1);
    };

    synth()?.speak(utterance);
  };

  const start = (fromIndex = 0) => {
    const blocks = getBlocks();
    if (!pageSynth() || blocks.length === 0) {
      return;
    }

    session++;
    restartOnResume = false;
    resetSynth();
    index = Math.min(Math.max(fromIndex, 0), blocks.length - 1);
    update('speaking', block);

    const id = session;
    setTimeout(() => speakNext(id), startDelay);
  };

  const pause = () => {
    if (state !== 'speaking') {
      return;
    }

    if (findVoice()?.localService === false) {
      session++;
      resetSynth();
      restartOnResume = true;
    } else {
      synth()?.pause();
    }

    update('paused', block);
  };

  const resume = () => {
    if (state !== 'paused') {
      return;
    }

    if (restartOnResume) {
      start(index);
      return;
    }

    synth()?.resume();
    update('speaking', block);
  };

  const stop = () => {
    session++;
    restartOnResume = false;
    resetSynth();
    update('idle', null);
  };

  const skip = (delta: number) => {
    if (state === 'idle') {
      return;
    }

    start(index + delta);
  };

  const setSettings = (next: Partial<TtsSettings>) => {
    settings = { ...settings, ...next };

    if (state === 'speaking') {
      start(index);
      return;
    }

    if (state === 'paused') {
      restartOnResume = true;
    }
  };

  const subscribe = (callback: (snapshot: TtsSnapshot) => void) => {
    subscribers.add(callback);
    return () => {
      subscribers.delete(callback);
    };
  };

  const destroy = () => {
    stop();
    subscribers.clear();
  };

  return { start, pause, resume, stop, skip, setSettings, subscribe, destroy };
};

export { createTts };
export type { Tts, TtsOptions, TtsSettings, TtsSnapshot, TtsState };
