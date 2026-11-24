type PdfReaderSize = { width: number; height: number };

type TimeoutHandle = ReturnType<typeof setTimeout>;
type Scheduler = {
	setTimeout: (callback: () => void, delay: number) => TimeoutHandle;
	clearTimeout: (handle: TimeoutHandle) => void;
};
type PdfReaderResizeObserver = {
	observe: (element: Element) => void;
	disconnect: () => void;
};
type PdfReaderResizeObserverFactory = (
	onResize: (size: PdfReaderSize | undefined) => void,
) => PdfReaderResizeObserver;

const browserScheduler: Scheduler = {
	setTimeout: (callback, delay) => setTimeout(callback, delay),
	clearTimeout: handle => clearTimeout(handle),
};

const resizeDebounceMs = 50;

export const createPdfReaderResizeReporter = (
	onResize: (size: PdfReaderSize) => void,
	scheduler: Scheduler = browserScheduler,
) => {
	let hasInitialSize = false;
	let timeout: TimeoutHandle | undefined;

	const report = (size: PdfReaderSize) => {
		if (!hasInitialSize) {
			hasInitialSize = true;
			onResize(size);
			return;
		}
		if (timeout !== undefined) scheduler.clearTimeout(timeout);
		timeout = scheduler.setTimeout(() => {
			timeout = undefined;
			onResize(size);
		}, resizeDebounceMs);
	};

	const cancel = () => {
		if (timeout === undefined) return;
		scheduler.clearTimeout(timeout);
		timeout = undefined;
	};

	return { report, cancel };
};

const createBrowserResizeObserver: PdfReaderResizeObserverFactory = onResize =>
	new ResizeObserver(entries => {
		const bounds = entries[0]?.contentRect;
		onResize(bounds ? { width: bounds.width, height: bounds.height } : undefined);
	});

export const observePdfReaderResize = (
	element: Element | undefined,
	onResize: (size: PdfReaderSize) => void,
	options: { createObserver?: PdfReaderResizeObserverFactory; scheduler?: Scheduler } = {},
) => {
	if (!element) return () => {};
	const reporter = createPdfReaderResizeReporter(onResize, options.scheduler);
	const observer = (options.createObserver ?? createBrowserResizeObserver)(size => {
		if (size) reporter.report(size);
	});
	observer.observe(element);

	let active = true;
	return () => {
		if (!active) return;
		active = false;
		observer.disconnect();
		reporter.cancel();
	};
};
