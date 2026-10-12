import type { FormattedFragment } from "@/features/format-text";
import type { NotePositionedElement } from "@/entities/note";

export type TextFlowFragment = {
	format?: FormattedFragment;
	fontScale?: number;
	lineHeight?: number;
	start: number;
	end: number;
	text: string;
	left: number;
	top: number;
	width: number;
};

export type TextFlowLayout = {
	fragments: TextFlowFragment[];
	lineCount: number;
	height: number;
};

type Interval = { left: number; right: number };
type TextToken = { end: number; text: string; hardBreak: boolean; atomic: boolean };
const MAX_TEXT_TOKEN_LENGTH = 256;

type Options = {
	text: string;
	textX: number;
	textY: number;
	width: number;
	lineHeight: number;
	elements: NotePositionedElement[];
	measureText: (text: string, start?: number) => number;
	displayText: (text: string) => string;
	imageMargin: number;
};

const readToken = (text: string, start: number): TextToken => {
	if (text[start] === "\n") return { end: start + 1, text: "\n", hardBreak: true, atomic: false };
	if (text.startsWith("[[", start)) {
		const closing = text.indexOf("]]", start + 2);
		const newline = text.indexOf("\n", start + 2);
		if (closing >= 0 && (newline < 0 || closing < newline)) {
			const end = closing + 2;
			return { end, text: text.slice(start, end), hardBreak: false, atomic: true };
		}
	}

	const whitespace = /\s/u.test(text[start] ?? "");
	let end = start;
	while (end < text.length) {
		if (end > start) {
			if (text[end] === "\n" || text.startsWith("[[", end)) break;
			if (/\s/u.test(text[end] ?? "") !== whitespace) break;
		}
		const codePoint = text.codePointAt(end) ?? 0;
		end += codePoint > 0xffff ? 2 : 1;
		if (end - start >= MAX_TEXT_TOKEN_LENGTH) break;
	}
	return { end, text: text.slice(start, end), hardBreak: false, atomic: false };
};

const splitByOccupiedIntervals = (width: number, occupied: Interval[]): Interval[] => {
	const sorted = occupied
		.map((interval) => ({ left: Math.max(0, interval.left), right: Math.min(width, interval.right) }))
		.filter((interval) => interval.right > interval.left)
		.sort((first, second) => first.left - second.left);
	const merged: Interval[] = [];
	for (const interval of sorted) {
		const previous = merged.at(-1);
		if (previous && interval.left <= previous.right) previous.right = Math.max(previous.right, interval.right);
		else merged.push({ ...interval });
	}

	const available: Interval[] = [];
	let cursor = 0;
	for (const interval of merged) {
		if (interval.left > cursor) available.push({ left: cursor, right: interval.left });
		cursor = Math.max(cursor, interval.right);
	}
	if (cursor < width) available.push({ left: cursor, right: width });
	return available;
};

const imageWrapMode = (
	element: NotePositionedElement,
	textX: number,
	textWidth: number,
): "left" | "center" | "right" => {
	const center = (element.x + element.width / 2 - textX) / textWidth;
	if (center < 0.35) return "left";
	if (center > 0.65) return "right";
	return "center";
};

const occupiedIntervalsAt = (options: Options, lineTop: number): Interval[] => {
	const { elements, textX, textY, width, lineHeight, imageMargin } = options;
	const occupied: Interval[] = [];
	for (const element of elements) {
		if (element.height <= 0) continue;
		const top = element.y - textY - imageMargin;
		const bottom = element.y + element.height - textY + imageMargin;
		if (lineTop + lineHeight <= top || lineTop >= bottom) continue;

		const imageLeft = Math.max(0, element.x - textX - imageMargin);
		const imageRight = Math.min(width, element.x + element.width - textX + imageMargin);
		const mode = imageWrapMode(element, textX, width);
		if (mode === "left") occupied.push({ left: 0, right: imageRight });
		else if (mode === "right") occupied.push({ left: imageLeft, right: width });
		else occupied.push({ left: imageLeft, right: imageRight });
	}
	return occupied;
};

const nextLineAfterOccupiedTextArea = (options: Options, lineIndex: number): number => {
	const lineTop = lineIndex * options.lineHeight;
	let nextBoundary = Number.POSITIVE_INFINITY;
	for (const element of options.elements) {
		if (element.height <= 0) continue;
		const top = element.y - options.textY - options.imageMargin;
		const bottom = element.y + element.height - options.textY + options.imageMargin;
		if (lineTop + options.lineHeight <= top || lineTop >= bottom) continue;

		nextBoundary = Math.min(
			nextBoundary,
			Math.max(lineIndex + 1, Math.ceil(bottom / options.lineHeight)),
		);
	}

	return Number.isFinite(nextBoundary) ? nextBoundary : lineIndex + 1;
};

const takePrefix = (token: string, maxWidth: number, options: Options, start: number): number => {
	let used = 0;
	let consumed = 0;
	for (const character of token) {
		const width = options.measureText(options.displayText(character), start + consumed);
		if (consumed > 0 && used + width > maxWidth) break;
		if (consumed === 0 && width > maxWidth) return character.length;
		used += width;
		consumed += character.length;
	}
	return consumed;
};

export const layoutTextFlow = (options: Options): TextFlowLayout => {
	const { text, width, lineHeight } = options;
	const fragments: TextFlowFragment[] = [];
	let cursor = 0;
	let lineIndex = 0;
	let trailingEmptyLine = text.length === 0;
	let finalEmptyLinePending = text.endsWith("\n");

	while (cursor < text.length || trailingEmptyLine || finalEmptyLinePending) {
		const lineTop = lineIndex * lineHeight;
		if (trailingEmptyLine || (finalEmptyLinePending && cursor === text.length)) {
			const available = splitByOccupiedIntervals(width, occupiedIntervalsAt(options, lineTop));
			if (!available.length) {
				lineIndex = nextLineAfterOccupiedTextArea(options, lineIndex);
				continue;
			}
			const interval = available[0]!;
			fragments.push({ start: cursor, end: cursor, text: "", left: interval.left, top: lineTop, width: interval.right - interval.left });
			trailingEmptyLine = false;
			finalEmptyLinePending = false;
			lineIndex += 1;
			continue;
		}

		const occupiedIntervals = occupiedIntervalsAt(options, lineTop);
		const hasActiveElements = occupiedIntervals.length > 0;
		const intervals = splitByOccupiedIntervals(width, occupiedIntervals);
		const lineStart = cursor;
		if (!intervals.length && text[cursor] !== "\n") {
			lineIndex = nextLineAfterOccupiedTextArea(options, lineIndex);
			continue;
		}
		let hardBreak = false;
		for (const [intervalIndex, interval] of intervals.entries()) {
			const fragmentStart = cursor;
			let measuredWidth = 0;
			while (cursor < text.length) {
				const token = readToken(text, cursor);
				if (token.hardBreak) {
					cursor = token.end;
					hardBreak = true;
					break;
				}

				const tokenWidth = options.measureText(options.displayText(token.text), cursor);
				const remainingWidth = interval.right - interval.left - measuredWidth;
				if (tokenWidth <= remainingWidth + 0.01) {
					cursor = token.end;
					measuredWidth += tokenWidth;
					continue;
				}

				if (measuredWidth > 0) break;
				if (intervalIndex < intervals.length - 1) break;

				if (token.atomic && !hasActiveElements) {
					cursor = token.end;
					measuredWidth += tokenWidth;
				} else if (!token.atomic) {
					const consumed = takePrefix(token.text, remainingWidth, options, cursor);
					if (consumed > 0) {
						cursor += consumed;
						measuredWidth += options.measureText(options.displayText(token.text.slice(0, consumed)), cursor - consumed);
					}
				}
				break;
			}

			if (cursor > fragmentStart) {
				fragments.push({
					start: fragmentStart,
					end: cursor,
					text: text.slice(fragmentStart, cursor),
					left: interval.left,
					top: lineTop,
					width: interval.right - interval.left,
				});
			}
			if (hardBreak) break;
		}

		if (cursor === lineStart && cursor < text.length && text[cursor] === "\n") {
			fragments.push({
				start: cursor,
				end: cursor + 1,
				text: "\n",
				left: 0,
				top: lineTop,
				width: 0,
			});
			cursor += 1;
			hardBreak = true;
		}
		if (cursor === lineStart && cursor < text.length && text[cursor] !== "\n") {
			lineIndex = nextLineAfterOccupiedTextArea(options, lineIndex);
			continue;
		}
		if (cursor === text.length && hardBreak) finalEmptyLinePending = true;
		lineIndex += 1;
	}
	if (!fragments.length) {
		fragments.push({
			start: cursor,
			end: cursor,
			text: "",
			left: 0,
			top: lineIndex * lineHeight,
			width,
		});
		lineIndex += 1;
	}

	return {
		fragments,
		lineCount: Math.max(1, lineIndex),
		height: Math.max(lineHeight, lineIndex * lineHeight),
	};
};
