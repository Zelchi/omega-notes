import type { Component } from "solid-js";

export type IconName =
	| "study"
	| "recall"
	| "random"
	| "flashcards"
	| "quiz"
	| "cloze"
	| "correction"
	| "chevronDown"
	| "chat"
	| "send"
	| "stop"
	| "disconnect"
	| "back"
	| "undo"
	| "reset"
	| "search"
	| "settings"
	| "minimize"
	| "maximize"
	| "restore"
	| "close"
	| "edit"
	| "delete"
	| "check"
	| "link"
	| "resizeDiagonal"
	| "resizeDiagonalReverse"
	| "resizeHorizontal"
	| "add"
	| "view"
	| "attachment"
	| "exportPdf"
	| "bulletList"
	| "orderedList"
	| "quote"
	| "code"
	| "codeBlock"
	| "strike"
	| "highlight"
	| "task"
	| "heading"
	| "textFormatting"
	| "table-row-add"
	| "table-row-remove"
	| "table-column-add"
	| "table-column-remove"
	| "table"
	| "alignLeft"
	| "alignCenter"
	| "alignJustify"
	| "alignRight"
	| "alignMixed";

const paths: Record<IconName, Component> = {
	study: () => <><path d="M12 5C8 2 4 3 2 4v15c3-2 7-1 10 1 3-2 7-3 10-1V4c-2-1-6-2-10 1Zm0 0v15" /></>,
	recall: () => <><path d="M9 18H7a3 3 0 0 1-3-3 3 3 0 0 1 0-6 3 3 0 0 1 3-4 3 3 0 0 1 5 0 3 3 0 0 1 5 0 3 3 0 0 1 3 4 3 3 0 0 1 0 6 3 3 0 0 1-3 3h-2M12 5v10m-4-5 4 2 4-2M9 21h6" /></>,
	random: () => <><path d="M3 6h3c4 0 8 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 4-3 6-6s4-6 6-6h3m-4-4 4 4-4 4" /></>,
	flashcards: () => <><path d="m5 5 12-3 4 16-4 1" /><rect x="3" y="6" width="13" height="15" rx="2" /><path d="M6 11h7M6 15h5" /></>,
	correction: () => <><path d="M4 5h16M4 10h9M4 15h5M13 17l3 3 5-6" /><path d="m16 8 5 5m0-5-5 5" /></>,
	cloze: () => <><path d="M3 5h18M3 19h18M3 12h3m12 0h3" /><rect x="9" y="9" width="6" height="6" rx="1" stroke-dasharray="2 2" /></>,
	quiz: () => <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="m7 8 1 1 2-2M12 8h5m-10 6 1 1 2-2M12 14h5" /></>,
	bulletList: () => <><circle cx="4" cy="5" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="19" r="1" fill="currentColor" /><path d="M9 5h12M9 12h12M9 19h12" /></>,
	orderedList: () => <><path d="M9 5h12M9 12h12M9 19h12M3 3v4M2 4l1-1M2 10h2v2l-2 2h2M2 17h2v4H2M2 19h2" /></>,
	quote: () => <><path d="M4 6h6v7H4V6Zm0 7v2a3 3 0 0 0 3 3M14 6h6v7h-6V6Zm0 7v2a3 3 0 0 0 3 3" /></>,
	code: () => <path d="m7 7-5 5 5 5M17 7l5 5-5 5M14 4l-4 16" />,
	codeBlock: () => <><rect x="2" y="3" width="20" height="18" rx="2" /><path d="M2 7h20m6 4-3 3 3 3m8-6 3 3-3 3" /></>,
	strike: () => <path d="M17 6c-1-2-3-3-5-3-3 0-5 2-5 4 0 3 3 4 5 5M4 12h16M7 18c1 2 3 3 5 3 3 0 5-2 5-4 0-1-.4-2-1-2.5" />,
	highlight: () => <><path d="m10 13 7-9 4 4-9 7-2-2Zm0 0-3 1-2 4 4-2 3-1M3 21h18" /></>,
	task: () => <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="m7 12 3 3 7-7" /></>,
	"table-row-add": () => <><rect x="3" y="3" width="18" height="11" rx="1" /><path d="M3 8h18M9 3v11M15 3v11M8 20h8M12 16v8" /></>,
	"table-row-remove": () => <><rect x="3" y="3" width="18" height="11" rx="1" /><path d="M3 8h18M9 3v11M15 3v11M8 20h8" /></>,
	"table-column-add": () => <><rect x="3" y="3" width="11" height="18" rx="1" /><path d="M8 3v18M3 9h11M3 15h11M20 8v8M16 12h8" /></>,
	"table-column-remove": () => <><rect x="3" y="3" width="11" height="18" rx="1" /><path d="M8 3v18M3 9h11M3 15h11M16 12h8" /></>,
	chevronDown: () => <path d="m6 9 6 6 6-6" />,
	chat: () => <path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2ZM7 9h10M7 13h7" />,
	send: () => <path d="m3 3 19 9-19 9 4-9-4-9Zm4 9h15" />,
	stop: () => <rect x="6" y="6" width="12" height="12" rx="1" />,
	disconnect: () => <path d="m3 3 18 18M9 8l-3 3a4 4 0 0 0 5 6l2-2M11 7l2-2a4 4 0 0 1 6 5l-3 3" />,
	heading: () => <path d="M6 5v14M18 5v14M6 12h12" />,
	textFormatting: () => <path d="M4 5h16M12 5v14M8 19h8" />,
	table: () => <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 9h18M3 14h18M9 4v16M15 4v16" /></>,
	back: () => <path d="m14.5 5-7 7 7 7M8 12h12" />,
	undo: () => <path d="M3 10h11a6 6 0 0 1 0 12M3 10l5-5M3 10l5 5" />,
	reset: () => <path d="M3 11a9 9 0 1 1 2.6 7.4M3 4v7h7" />,
	minimize: () => <path d="M5 12h14" />,
	maximize: () => <rect x="5" y="5" width="14" height="14" rx="1" />,
	restore: () => (
		<>
			<path d="M8 8V5h11v11h-3" />
			<rect x="5" y="8" width="11" height="11" rx="1" />
		</>
	),
	close: () => <path d="m6 6 12 12M18 6 6 18" />,
	edit: () => <path d="m15 5 4 4M4 20l4.5-1 10.2-10.2a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z" />,
	delete: () => (
		<>
			<path d="M3 6h18M8 6V4h8v2m3 0-.8 14H5L4 6" />
			<path d="M10 11v5m4-5v5" />
		</>
	),
	check: () => <path d="m5 12 4 4L19 6" />,
	link: () => <path d="m10 13 4-4M8 15l-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0M16 9l1-1a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0" />,
	resizeDiagonal: () => <path d="M5 10V5h5M5 5l14 14M14 19h5v-5" />,
	resizeDiagonalReverse: () => <path d="M14 5h5v5M19 5 5 19M5 14v5h5" />,
	resizeHorizontal: () => <path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" />,
	add: () => <path d="M12 5v14M5 12h14" />,
	view: () => (
		<>
			<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" />
			<circle cx="12" cy="12" r="3" />
		</>
	),
	settings: () => (
		<>
			<path d="M10 2.5h4l.6 2.6a7.2 7.2 0 0 1 1.8 1l2.5-.8 2 3.5-1.9 1.9a7.5 7.5 0 0 1 0 2.6l1.9 1.9-2 3.5-2.5-.8a7.2 7.2 0 0 1-1.8 1l-.6 2.6h-4l-.6-2.6a7.2 7.2 0 0 1-1.8-1l-2.5.8-2-3.5L5 13.3a7.5 7.5 0 0 1 0-2.6L3.1 8.8l2-3.5 2.5.8a7.2 7.2 0 0 1 1.8-1L10 2.5Z" />
			<circle cx="12" cy="12" r="3" />
		</>
	),
	search: () => (
		<>
			<circle cx="10.8" cy="10.8" r="6.8" />
			<path d="m16 16 4.5 4.5" />
		</>
	),
	attachment: () => <path d="m8.5 12.5 6.8-6.8a3.2 3.2 0 0 1 4.5 4.5l-8.5 8.5a5 5 0 0 1-7.1-7.1l8.5-8.5" />,
	exportPdf: () => <>
		<path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10l-7-7Z" />
		<path d="M13 3v7h7M12 12v6m-3-3 3 3 3-3" />
	</>,
	alignLeft: () => <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />,
	alignCenter: () => <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />,
	alignJustify: () => <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />,
	alignRight: () => <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />,
	alignMixed: () => <path d="M4 6h16M4 10h10M7 14h13M4 18h12" />,
};

const Icon: Component<{ name: IconName; size?: number }> = (props) => (
	<svg
		aria-hidden="true"
		width={props.size ?? 18}
		height={props.size ?? 18}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.7"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		{paths[props.name]({})}
	</svg>
);

export default Icon;
