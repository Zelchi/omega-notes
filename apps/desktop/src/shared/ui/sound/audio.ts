import processorUrl from "./processor?worker&url";
import { SOUND_PROCESSOR_NAME, type SoundProcessorMessage } from "./processor-messages";
import { createSoundSamples, type SoundTone } from "./wave";

export type { SoundTone } from "./wave";

type Sound = { id: number; samples: Float32Array; sampleRate: number; revision: number };
type Session = {
    context: AudioContext;
    output: GainNode;
    processor?: AudioWorkletNode;
    ready?: Promise<void>;
    resume?: Promise<void>;
    resumeStartedAt: number;
    registered: Set<number>;
    clock: number;
    clockObservedAt: number;
};
const sounds = new Map<readonly SoundTone[], Sound>();
const FADE_SECONDS = 0.003;
let nextSoundId = 0;
let session: Session | undefined;
let volume = 1;
let reportedError = false;

const reportError = (error: unknown): void => {
    if (reportedError) return;
    reportedError = true;
    console.warn("Could not play an interface sound:", error);
};

const send = (audio: Session, message: SoundProcessorMessage, transfer: Transferable[] = []): void => {
    audio.processor?.port.postMessage(message, transfer);
};

const stopAllSounds = (audio: Session): void => {
    for (const sound of sounds.values()) sound.revision += 1;
    send(audio, { type: "stop-all" });
};

const closeSession = (): void => {
    const current = session;
    session = undefined;
    if (!current) return;
    for (const sound of sounds.values()) sound.revision += 1;
    current.context.onstatechange = null;
    if (current.processor) {
        current.processor.onprocessorerror = null;
        current.processor.port.close();
        current.processor.disconnect();
    }
    current.output.disconnect();
    if (current.context.state !== "closed") void current.context.close().catch(reportError);
};

const getSession = (): Session | undefined => {
    if (typeof window === "undefined" || !window.AudioContext) return;
    const now = performance.now();
    if (session) {
        const { context } = session;
        if (context.state !== "running" || context.currentTime > session.clock) {
            session.clock = context.currentTime;
            session.clockObservedAt = now;
        }
        const stalledClock = context.state === "running" && now - session.clockObservedAt > 500;
        if (context.state === "running") session.resume = undefined;
        const stalledResume = context.state !== "running" && session.resume && now - session.resumeStartedAt > 1500;
        if (context.state === "closed" || stalledClock || stalledResume) closeSession();
    }
    if (!session) {
        const context = new AudioContext({ latencyHint: "interactive" });
        const output = context.createGain();
        output.gain.value = volume;
        output.connect(context.destination);
        session = { context, output, registered: new Set(), clock: context.currentTime, clockObservedAt: now, resumeStartedAt: 0 };
        context.onstatechange = () => {
            if (session?.context === context && context.state !== "running") {
                // Clear paused playback, without cancelling requests waiting for resume.
                send(session, { type: "stop-all", immediate: true });
            }
        };
    }
    return session;
};

const getSound = (tones: readonly SoundTone[]): Sound => {
    let sound = sounds.get(tones);
    if (!sound) {
        sound = { id: ++nextSoundId, ...createSoundSamples(tones), revision: 0 };
        sounds.set(tones, sound);
    }
    return sound;
};

const registerSound = (audio: Session, sound: Sound): void => {
    if (!audio.processor || audio.registered.has(sound.id)) return;
    const samples = sound.samples.slice();
    send(audio, { type: "register", id: sound.id, samples, sampleRate: sound.sampleRate }, [samples.buffer]);
    audio.registered.add(sound.id);
};

const prepareProcessor = (audio: Session): Promise<void> => {
    if (!audio.ready) {
        audio.ready = audio.context.audioWorklet.addModule(processorUrl).then(() => {
            if (session !== audio || audio.context.state === "closed") return;
            const processor = new AudioWorkletNode(audio.context, SOUND_PROCESSOR_NAME, {
                numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
            });
            processor.connect(audio.output);
            audio.processor = processor;
            processor.onprocessorerror = () => {
                if (session === audio) closeSession();
                reportError(new Error("The interface audio processor stopped unexpectedly."));
            };
            for (const sound of sounds.values()) registerSound(audio, sound);
        }).catch((error: unknown) => {
            if (session === audio) closeSession();
            throw error;
        });
    }
    return audio.ready;
};

const resumeSession = (audio: Session): Promise<void> => {
    if (!audio.resume) {
        audio.resumeStartedAt = performance.now();
        const pending = audio.context.resume().finally(() => {
            if (audio.resume === pending) audio.resume = undefined;
        });
        audio.resume = pending;
    }
    return audio.resume;
};

export const setSoundVolume = (value: number): void => {
    if (!Number.isFinite(value)) return;
    volume = Math.max(0, Math.min(1, value));
    if (session && session.context.state !== "closed") {
        const now = session.context.currentTime;
        const gain = session.output.gain;
        const previous = gain.value;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(previous, now);
        gain.linearRampToValueAtTime(volume, now + FADE_SECONDS);
        if (volume === 0) stopAllSounds(session);
    }
};

export const prepareSounds = (definitions: readonly (readonly SoundTone[])[]): void => {
    try {
        for (const tones of definitions) getSound(tones);
        const audio = getSession();
        if (audio) void prepareProcessor(audio).catch(reportError);
    } catch (error) { reportError(error); }
};

export const playTones = (tones: readonly SoundTone[]): void => {
    if (volume === 0 || tones.length === 0) return;
    try {
        const audio = getSession();
        if (!audio) return;
        const sound = getSound(tones);
        const revision = ++sound.revision;
        const play = (): void => {
            if (session !== audio || sound.revision !== revision || volume === 0 || audio.context.state !== "running" || !audio.processor) return;
            registerSound(audio, sound);
            send(audio, { type: "play", id: sound.id });
            reportedError = false;
        };
        if (audio.processor && audio.context.state === "running") play();
        else {
            // Resume inside the component gesture, while the processor loads.
            const resumed = audio.context.state === "running" ? Promise.resolve() : resumeSession(audio);
            void Promise.all([prepareProcessor(audio), resumed]).then(play).catch(reportError);
        }
    } catch (error) { reportError(error); }
};

export const disposeSounds = (): void => {
    closeSession();
    sounds.clear();
};

if (import.meta.hot) import.meta.hot.dispose(disposeSounds);
