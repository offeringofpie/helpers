import { synth } from './synth.js';

type VoiceQuality = 'premium' | 'enhanced' | 'standard';

const qualityOrder: Record<VoiceQuality, number> = {
  premium: 0,
  enhanced: 1,
  standard: 2,
};

const getQuality = (voice: SpeechSynthesisVoice): VoiceQuality => {
  const name = voice.name.toLowerCase();
  if (name.includes('premium')) {
    return 'premium';
  }

  if (name.includes('enhanced') || name.includes('neural')) {
    return 'enhanced';
  }

  return 'standard';
};

const byQuality = (a: SpeechSynthesisVoice, b: SpeechSynthesisVoice) => {
  return qualityOrder[getQuality(a)] - qualityOrder[getQuality(b)];
};

const groupVoices = (
  voices: readonly SpeechSynthesisVoice[],
  preferredLang?: string,
): Map<string, SpeechSynthesisVoice[]> => {
  const isPreferred = (lang: string) => {
    return preferredLang !== undefined && lang.startsWith(preferredLang);
  };

  const sorted = [...voices].sort(byQuality);
  const langs = [...new Set(sorted.map((voice) => voice.lang))].sort((a, b) => {
    if (isPreferred(a) !== isPreferred(b)) {
      return isPreferred(a) ? -1 : 1;
    }

    return a.localeCompare(b);
  });

  return new Map(
    langs.map((lang) => [lang, sorted.filter((voice) => voice.lang === lang)]),
  );
};

const pickVoice = (
  voices: readonly SpeechSynthesisVoice[],
  savedName?: string | null,
): SpeechSynthesisVoice | null => {
  const saved = voices.find((voice) => voice.name === savedName);
  if (saved) {
    return saved;
  }

  const defaultVoice = voices.find((voice) => voice.default);
  if (defaultVoice) {
    return defaultVoice;
  }

  const userLang = navigator.language.split('-')[0] ?? '';
  const local = voices
    .filter((voice) => voice.lang.startsWith(userLang))
    .sort(byQuality);

  return local[0] ?? voices[0] ?? null;
};

const loadVoices = async (): Promise<SpeechSynthesisVoice[]> => {
  const speech = synth();
  if (!speech) {
    return [];
  }

  const voices = speech.getVoices();
  if (voices.length > 0) {
    return voices;
  }

  return new Promise((resolve) => {
    const onChange = () => resolve(speech.getVoices());
    speech.addEventListener('voiceschanged', onChange, { once: true });
  });
};

export { getQuality, groupVoices, pickVoice, loadVoices };
export type { VoiceQuality };
