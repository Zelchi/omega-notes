import { createEffect, onCleanup, untrack } from "solid-js";

type ChatMessageView = { scrollTop: number; follow: boolean };
type ChatScrollViewport = { scrollTop: number; scrollHeight: number };

export const observeChatMessageScroll = (options: {
	readMessages: () => unknown;
	readBusy: () => boolean;
	readView: () => ChatMessageView;
	getViewport: () => ChatScrollViewport | undefined;
	requestFrame: (callback: FrameRequestCallback) => number;
	cancelFrame: (frame: number) => void;
}) => {
	let frame = 0;
	createEffect(() => {
		options.readMessages();
		options.readBusy();
		const view = untrack(options.readView);
		options.cancelFrame(frame);
		frame = options.requestFrame(() => {
			const viewport = options.getViewport();
			if (viewport) viewport.scrollTop = view.follow ? viewport.scrollHeight : view.scrollTop;
		});
	});
	onCleanup(() => options.cancelFrame(frame));
};
