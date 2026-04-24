import { useCallback } from 'react';

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function synthesizeClick(context: AudioContext) {
  const t = context.currentTime;

  // White noise burst — body of the click
  const bufferSize = Math.ceil(context.sampleRate * 0.012);
  const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  const noiseGain = context.createGain();
  noiseGain.gain.setValueAtTime(0.035, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.016);
  noiseGain.gain.linearRampToValueAtTime(0, t + 0.018);
  noise.connect(noiseGain);
  noiseGain.connect(context.destination);
  noise.start(t);
  noise.stop(t + 0.018);

  // High-freq oscillator — attack transient
  const osc = context.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(4200, t);
  osc.frequency.exponentialRampToValueAtTime(800, t + 0.008);
  const oscGain = context.createGain();
  oscGain.gain.setValueAtTime(0.015, t);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.006);
  oscGain.gain.linearRampToValueAtTime(0, t + 0.008);
  osc.connect(oscGain);
  oscGain.connect(context.destination);
  osc.start(t);
  osc.stop(t + 0.008);
}

export function useClickSound() {
  const playClick = useCallback(() => {
    try {
      synthesizeClick(getCtx());
    } catch {}
  }, []);
  return { playClick };
}
