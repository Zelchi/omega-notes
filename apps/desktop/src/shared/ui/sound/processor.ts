import { SOUND_PROCESSOR_NAME, type SoundProcessorMessage } from "./processor-messages";

declare const sampleRate: number;
declare class AudioWorkletProcessor { readonly port: MessagePort; }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

type Voice = {
    samples: Float32Array;
    step: number;
    position: number;
    lastOutput: number;
    releaseSample: number;
    releaseFrames: number;
};

class InterfaceSoundsProcessor extends AudioWorkletProcessor {
    private readonly voices = new Map<number, Voice>();
    private readonly voiceList: Voice[] = [];
    private readonly fadeFrames = Math.max(1, Math.ceil(sampleRate * 0.003));

    constructor() {
        super();
        this.port.onmessage = (event: MessageEvent<SoundProcessorMessage>) => {
            const message = event.data;
            if (message.type === "register") {
                const voice: Voice = {
                    samples: message.samples, step: message.sampleRate / sampleRate,
                    position: -1, lastOutput: 0, releaseSample: 0, releaseFrames: 0,
                };
                const previous = this.voices.get(message.id);
                if (previous) this.voiceList[this.voiceList.indexOf(previous)] = voice;
                else this.voiceList.push(voice);
                this.voices.set(message.id, voice);
            } else if (message.type === "play") {
                const voice = this.voices.get(message.id);
                if (!voice) return;
                voice.releaseSample = voice.lastOutput;
                voice.releaseFrames = voice.lastOutput === 0 ? 0 : this.fadeFrames;
                voice.position = 0;
            } else {
                for (const voice of this.voiceList) {
                    voice.position = -1;
                    voice.releaseSample = message.immediate ? 0 : voice.lastOutput;
                    voice.releaseFrames = voice.releaseSample === 0 ? 0 : this.fadeFrames;
                    if (message.immediate) voice.lastOutput = 0;
                }
            }
        };
    }

    process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
        const output = outputs[0]?.[0];
        if (!output) return true;
        output.fill(0);
        for (let index = 0; index < this.voiceList.length; index += 1) {
            const voice = this.voiceList[index];
            if (voice.position < 0 && voice.releaseFrames === 0) {
                voice.lastOutput = 0;
                continue;
            }
            for (let frame = 0; frame < output.length; frame += 1) {
                let value = 0;
                if (voice.position >= 0) {
                    const index = Math.floor(voice.position);
                    const fraction = voice.position - index;
                    const first = voice.samples[index] ?? 0;
                    const second = voice.samples[index + 1] ?? 0;
                    value = first + (second - first) * fraction;
                    voice.position += voice.step;
                    if (voice.position >= voice.samples.length) voice.position = -1;
                }
                if (voice.releaseFrames > 0) {
                    value += voice.releaseSample * voice.releaseFrames / this.fadeFrames;
                    voice.releaseFrames -= 1;
                }
                voice.lastOutput = value;
                output[frame] += value;
            }
        }
        return true;
    }
}

registerProcessor(SOUND_PROCESSOR_NAME, InterfaceSoundsProcessor);
