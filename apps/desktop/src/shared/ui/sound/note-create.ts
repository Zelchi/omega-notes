import type { SoundTone } from "./wave";

export const noteCreateSound: readonly SoundTone[] = [
    { frequency: 420, endFrequency: 1250, duration: 0.13, volume: 0.12 },
    { frequency: 850, endFrequency: 580, duration: 0.12, volume: 0.055, delay: 0.065 },
];
