export interface SoundTone {
    frequency: number;
    endFrequency: number;
    duration: number;
    volume: number;
    type?: OscillatorType;
    delay?: number;
}

const SAMPLE_RATE = 44100;
const SOUND_GAIN = 10;
const LEAD = 0.015;
const TAIL = 0.08;

// Generate mono PCM once; playback reuses these samples without media seeking.
export const createSoundSamples = (tones: readonly SoundTone[]): { samples: Float32Array; sampleRate: number } => {
    const duration = LEAD + Math.max(...tones.map((tone) => (tone.delay ?? 0) + tone.duration)) + TAIL;
    const samples = new Float32Array(Math.ceil(duration * SAMPLE_RATE));
    for (const tone of tones) {
        const offset = Math.round((LEAD + (tone.delay ?? 0)) * SAMPLE_RATE);
        const length = Math.ceil(tone.duration * SAMPLE_RATE);
        const sweep = Math.log(tone.endFrequency / tone.frequency) / tone.duration;
        for (let index = 0; index < length; index += 1) {
            const time = index / SAMPLE_RATE;
            const phase = 2 * Math.PI * tone.frequency * (Math.abs(sweep) < 1e-8 ? time : Math.expm1(sweep * time) / sweep);
            const sine = Math.sin(phase);
            const cycle = ((phase / (2 * Math.PI)) % 1 + 1) % 1;
            const signal = tone.type === "triangle" ? 2 / Math.PI * Math.asin(sine)
                : tone.type === "square" ? (sine >= 0 ? 1 : -1)
                : tone.type === "sawtooth" ? 2 * cycle - 1 : sine;
            const attack = Math.min(1, time / 0.003);
            const decay = Math.pow(0.0001 / tone.volume, Math.max(0, time - 0.003) / (tone.duration - 0.006));
            const release = Math.max(0, Math.min(1, (tone.duration - time) / 0.003));
            samples[offset + index] += signal * tone.volume * attack * decay * release;
        }
    }

    let peak = 0;
    for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    // Preserve the requested gain while preventing flat, clipped wave peaks.
    const gain = peak > 0 ? Math.min(SOUND_GAIN, 0.98 / peak) : SOUND_GAIN;
    for (let index = 0; index < samples.length; index += 1) samples[index] *= gain;
    return { samples, sampleRate: SAMPLE_RATE };
};
