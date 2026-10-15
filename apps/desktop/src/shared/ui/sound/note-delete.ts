import type { SoundTone } from "./wave";

// A lower bubble that falls in pitch and fades away.
export const noteDeleteSound: readonly SoundTone[] = [
    { frequency: 620, endFrequency: 160, duration: 0.18, volume: 0.06 },
    { frequency: 310, endFrequency: 100, duration: 0.1, volume: 0.02, delay: 0.035 },
];
