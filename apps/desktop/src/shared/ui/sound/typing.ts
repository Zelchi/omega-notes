import type { SoundTone } from "./wave";

// A quiet, short click rather than a sustained musical note.
export const typingSound: readonly SoundTone[] = [
    { frequency: 260, endFrequency: 110, duration: 0.025, volume: 0.045, type: "triangle" },
];
