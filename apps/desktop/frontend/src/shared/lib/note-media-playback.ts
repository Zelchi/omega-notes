import { createSignal } from "solid-js";

const activeMedia = new Set<HTMLMediaElement>();
const [activeMediaCount, setActiveMediaCount] = createSignal(0);

export const isNoteMediaPlaying = (): boolean => activeMediaCount() > 0;

export const setNoteMediaPlaying = (media: HTMLMediaElement, playing: boolean): void => {
	const wasPlaying = activeMedia.has(media);
	if (wasPlaying === playing) return;
	if (playing) activeMedia.add(media);
	else activeMedia.delete(media);
	setActiveMediaCount(activeMedia.size);
};
