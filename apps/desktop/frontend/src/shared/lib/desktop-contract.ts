export interface DesktopApi {
	invoke<T>(command: string, args: Record<string, unknown>): Promise<T>;
	onEvent(callback: (name: string, payload: unknown) => void): (() => void) | Promise<() => void>;
	onChannel(callback: (id: string, payload: unknown) => void): (() => void) | Promise<() => void>;
	pathForFile(file: File): string | Promise<string>;
}

declare global {
	interface Window {
		omegaDesktop?: DesktopApi;
	}
}
