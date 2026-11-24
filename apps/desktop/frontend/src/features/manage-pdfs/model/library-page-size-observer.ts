import { getPdfLibraryPageSize } from "./library-pagination";

type ResizeObserverHandle = Pick<ResizeObserver, "observe" | "disconnect">;
type ResizeObserverFactory = (callback: () => void) => ResizeObserverHandle;

const createBrowserResizeObserver: ResizeObserverFactory = callback => new ResizeObserver(callback);

export const observePdfLibraryPageSize = (
	list: Element & Pick<HTMLDivElement, "clientHeight">,
	onPageSize: (pageSize: number) => void,
	createObserver: ResizeObserverFactory = createBrowserResizeObserver,
) => {
	const update = () => onPageSize(getPdfLibraryPageSize(list.clientHeight));
	update();
	const observer = createObserver(update);
	observer.observe(list);
	return () => observer.disconnect();
};
