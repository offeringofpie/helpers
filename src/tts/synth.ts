let frame: HTMLIFrameElement | null = null;

const pageSynth = (): SpeechSynthesis | null => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return null;
  }

  return window.speechSynthesis;
};

const synth = (): SpeechSynthesis | null => {
  if (!pageSynth()) {
    return null;
  }

  if (!frame?.isConnected) {
    frame = document.createElement('iframe');
    frame.hidden = true;
    document.body.append(frame);
  }

  return frame.contentWindow?.speechSynthesis ?? null;
};

const clicksBetweenUtterances = (): boolean => {
  const { userAgent } = navigator;
  return userAgent.includes('Firefox') && userAgent.includes('Macintosh');
};

const resetSynth = () => {
  frame?.contentWindow?.speechSynthesis.cancel();
  frame?.remove();
  frame = null;
};

export { pageSynth, synth, resetSynth, clicksBetweenUtterances };
