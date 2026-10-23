import { style } from "@vanilla-extract/css";

const edge = { position: "absolute" as const, zIndex: 0, pointerEvents: "auto" as const, touchAction: "none" as const };
const corner = { ...edge, zIndex: 1, width: 10, height: 10 };

export const styles = {
	container: style({ position: "absolute", inset: 0, zIndex: 200, pointerEvents: "none" }),
	north: style({ ...edge, top: 0, left: 10, right: 10, height: 5, cursor: "n-resize" }),
	south: style({ ...edge, bottom: 0, left: 10, right: 10, height: 5, cursor: "s-resize" }),
	east: style({ ...edge, top: 10, right: 0, bottom: 10, width: 5, cursor: "e-resize" }),
	west: style({ ...edge, top: 10, left: 0, bottom: 10, width: 5, cursor: "w-resize" }),
	northWest: style({ ...corner, top: 0, left: 0, cursor: "nwse-resize" }),
	northEast: style({ ...corner, top: 0, right: 0, cursor: "nesw-resize" }),
	southWest: style({ ...corner, bottom: 0, left: 0, cursor: "nesw-resize" }),
	southEast: style({ ...corner, right: 0, bottom: 0, cursor: "nwse-resize" }),
};
