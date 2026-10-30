import { kanbanStatuses } from "./kanban";
import { sidePanelViewportGutter, sidePanelWidth } from "@/shared/lib/side-panel-layout";

const defaultPanelWidth = sidePanelWidth;
const oppositePanelWidth = sidePanelWidth;
const panelGap = 16;
const viewportEdgeSpace = 2;
const kanbanPanelStageBySnapPoint = [1, 2, 4, 5];

export const getKanbanPanelWidthLimits = (viewportWidth: number) => {
	const minWidth = Math.max(0, Math.min(defaultPanelWidth, viewportWidth - sidePanelViewportGutter));
	const maxWidth = Math.max(minWidth, viewportWidth - oppositePanelWidth - panelGap - viewportEdgeSpace);
	return { minWidth, maxWidth };
};

export const clampKanbanPanelWidth = (width: number, viewportWidth: number): number => {
	const { minWidth, maxWidth } = getKanbanPanelWidthLimits(viewportWidth);
	return Math.max(minWidth, Math.min(maxWidth, width));
};

export const resizeKanbanPanelForViewport = (
	width: number,
	stage: number,
	previousViewportWidth: number,
	viewportWidth: number,
): { width: number; stage: number } => {
	const currentWidth = clampKanbanPanelWidth(width, previousViewportWidth);
	const currentStageIndex = Math.max(0, kanbanPanelStageBySnapPoint.indexOf(stage));
	if (viewportWidth >= previousViewportWidth) return { width: currentWidth, stage };

	const nextLimits = getKanbanPanelWidthLimits(viewportWidth);
	const nextPoints = getKanbanPanelSnapPoints(nextLimits.minWidth, nextLimits.maxWidth);
	if (currentWidth <= nextLimits.maxWidth && currentStageIndex < nextPoints.length) return { width: currentWidth, stage };

	const previousStageIndex = Math.max(0, currentStageIndex - 1);
	const nextStageIndex = Math.min(previousStageIndex, nextPoints.length - 1);
	return { width: nextPoints[nextStageIndex], stage: kanbanPanelStageBySnapPoint[nextStageIndex] };
};

export const getKanbanPanelSnapPoints = (minWidth: number, maxWidth: number): number[] => {
	const range = Math.max(0, maxWidth - minWidth);
	if (range === 0) return [minWidth];
	// Each additional base-panel width of expansion makes room for one more session, up to session 5.
	const stageCount = Math.min(kanbanPanelStageBySnapPoint.length, 2 + Math.floor(range / sidePanelWidth));
	return Array.from({ length: stageCount }, (_, index) => index === stageCount - 1
		? maxWidth
		: Math.round(minWidth + range * index / (stageCount - 1)),
	);
};

const nearestPointIndex = (width: number, points: number[]): number =>
	points.reduce((nearest, point, index) =>
		Math.abs(point - width) < Math.abs(points[nearest] - width) ? index : nearest,
		0,
	);

export const getKanbanPanelStage = (width: number, viewportWidth: number): number => {
	const { minWidth, maxWidth } = getKanbanPanelWidthLimits(viewportWidth);
	const clamped = Math.max(minWidth, Math.min(maxWidth, width));
	return kanbanPanelStageBySnapPoint[nearestPointIndex(clamped, getKanbanPanelSnapPoints(minWidth, maxWidth))];
};

export const getKanbanLayoutColumnCount = (stage: number): number => {
	if (stage <= 2) return 1;
	return kanbanStatuses.length;
};

export const snapKanbanPanelWidth = (width: number, viewportWidth: number): number => {
	const { minWidth, maxWidth } = getKanbanPanelWidthLimits(viewportWidth);
	const clamped = Math.max(minWidth, Math.min(maxWidth, width));
	const points = getKanbanPanelSnapPoints(minWidth, maxWidth);
	return points[nearestPointIndex(clamped, points)];
};
