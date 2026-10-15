import { playTones, prepareSounds as prepareAudio, type SoundTone } from "./audio";
import { noteCreateSound } from "./note-create";
import { noteDeleteSound } from "./note-delete";
import { typingSound } from "./typing";
import { clickSound } from "./click";

export { setSoundVolume, disposeSounds } from "./audio";

export type SoundName = "note-create" | "typing" | "note-delete" | "click";

const sounds: Record<SoundName, readonly SoundTone[]> = {
    "note-create": noteCreateSound,
    "typing": typingSound,
    "note-delete": noteDeleteSound,
    "click": clickSound,
};

export const prepareSounds = (): void => prepareAudio(Object.values(sounds));

export const playSound = (name: SoundName): void => {
    playTones(sounds[name]);
};
