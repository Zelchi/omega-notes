import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { listen as tauriListen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { confirm as tauriConfirm, open as tauriOpen } from '@tauri-apps/plugin-dialog';
import { openUrl as tauriOpenUrl } from '@tauri-apps/plugin-opener';
import type { DesktopApi } from './desktop-contract';

const webviewWindow = getCurrentWebviewWindow();
const filePaths = new Map<string, string[]>();
const filePathWaiters = new Map<string, Array<(path: string) => void>>();

const addDroppedPath = (path: string) => {
	const name = path.split(/[\\/]/).at(-1) || path;
	const waiter = filePathWaiters.get(name)?.shift();
	if (waiter) waiter(path);
	else filePaths.set(name, [...(filePaths.get(name) || []), path]);
};

void webviewWindow.onDragDropEvent(({ payload }) => {
	if (payload.type === 'enter') filePaths.clear();
	if (payload.type === 'drop') {
		payload.paths.forEach(addDroppedPath);
		void webviewWindow.scaleFactor().then(scale => {
			globalThis.window.dispatchEvent(new CustomEvent('omega-files-dropped', {
				detail: {
					paths: payload.paths,
					x: payload.position.x / scale,
					y: payload.position.y / scale,
				},
			}));
		});
	}
});

const invoke = async <T>(command: string, args: Record<string, unknown>): Promise<T> => {
	const options = (args.options || {}) as Record<string, unknown>;
	switch (command) {
		case 'storage_import_snapshot': return null as T;
		case 'storage_import_complete':
		case 'storage_import_backup': return undefined as T;
		case 'configure_tray_menu':
			return await tauriInvoke('configure_tray_menu', {
				labels: args.labels,
				pomodoroRunning: args.pomodoroRunning,
			}) as T;
		case 'window_is_maximized': return await webviewWindow.isMaximized() as T;
		case 'window_toggle_maximize': return await webviewWindow.toggleMaximize() as T;
		case 'window_minimize': return await webviewWindow.minimize() as T;
		case 'window_close': return await webviewWindow.close() as T;
		case 'window_destroy': return await webviewWindow.destroy() as T;
		case 'hide_main_window': return await webviewWindow.hide() as T;
		case 'show_main_window': return await webviewWindow.show() as T;
		case 'exit_main_app': return await tauriInvoke('exit_app') as T;
		case 'is_gnome_desktop': return false as T;
		case 'set_window_background_color': {
			const color = args.color;
			if (typeof color !== 'string' || !/^#[\da-f]{6}([\da-f]{2})?$/i.test(color)) throw new Error('Invalid window color');
			return await webviewWindow.setBackgroundColor(color) as T;
		}
		case 'dialog_confirm': {
			if (typeof args.message !== 'string' || args.message.length > 32_000) throw new Error('Invalid dialog message');
			const kind = options.kind === 'error' || options.kind === 'warning' ? options.kind : 'info';
			return await tauriConfirm(args.message, {
				title: typeof options.title === 'string' ? options.title : 'Ômega Notes',
				kind,
				okLabel: typeof options.okLabel === 'string' ? options.okLabel : 'OK',
				cancelLabel: typeof options.cancelLabel === 'string' ? options.cancelLabel : 'Cancel',
			}) as T;
		}
		case 'dialog_open':
			return await tauriOpen({
				title: typeof options.title === 'string' ? options.title : undefined,
				multiple: options.multiple === true,
				directory: options.directory === true,
				filters: Array.isArray(options.filters) ? options.filters as { name: string; extensions: string[] }[] : undefined,
			}) as T;
		case 'open_url': {
			if (typeof args.url !== 'string' || args.url.length > 16_384) throw new Error('Invalid external URL');
			const url = new URL(args.url);
			if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) throw new Error('Unsupported external URL');
			return await tauriOpenUrl(url.href) as T;
		}
		default:
			return await tauriInvoke<T>('desktop_dispatch', { command, args });
	}
};

const api: DesktopApi = {
	invoke,
	onEvent(callback) {
		return tauriListen<{ event: string; payload: unknown }>('omega:event', ({ payload }) => {
			callback(payload.event, payload.payload);
		});
	},
	onChannel(callback) {
		return tauriListen<{ id: string; payload: unknown }>('omega:channel', ({ payload }) => {
			callback(payload.id, payload.payload);
		});
	},
	async pathForFile(file) {
		const path = (file as File & { path?: unknown }).path;
		if (typeof path === 'string' && path) return path;
		const name = file.name;
		const queued = filePaths.get(name);
		if (queued?.length) return queued.shift()!;
		return new Promise<string>((resolve, reject) => {
			const waiters = filePathWaiters.get(name) || [];
			const timer = setTimeout(() => {
				filePathWaiters.set(name, waiters.filter(waiter => waiter !== receive));
				reject(new Error('FILE_PATH_UNAVAILABLE'));
			}, 1_000);
			const receive = (value: string) => { clearTimeout(timer); resolve(value); };
			waiters.push(receive);
			filePathWaiters.set(name, waiters);
		});
	},
};

export const installTauriDesktopApi = (): void => {
	globalThis.window.omegaDesktop = api;
};
