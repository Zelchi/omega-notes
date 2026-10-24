export type SoundProcessorMessage =
    | { type: "register"; id: number; samples: Float32Array; sampleRate: number }
    | { type: "play"; id: number }
    | { type: "stop-all"; immediate?: boolean };

export const SOUND_PROCESSOR_NAME = "omega-interface-sounds";
