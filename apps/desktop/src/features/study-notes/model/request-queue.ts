import { createEffect, createSignal, onCleanup } from "solid-js";
import type { StudyEnvironment } from "./environment";
import type { StudyContext, AiTaskPurpose } from "@/entities/ai";
import type { StudyKind } from "@/entities/study";

type Request = {
	vaultId: string; prompt: string; controller: AbortController; settled: boolean;
	context?: StudyContext;
	purpose?: Exclude<AiTaskPurpose, "chat">;
	kind?: StudyKind;
	resolve: (value: string) => void; reject: (failure: unknown) => void; cleanup: () => void;
};

/** All study methods share FIFO admission to the provider, including generation retries. */
export const useStudyRequestQueue = (options: StudyEnvironment) => {
	const waiting: Request[] = [];
	const [revision, setRevision] = createSignal(0);
	const [activeKind, setActiveKind] = createSignal<StudyKind>();
	let active: Request | undefined, disposed = false;
	const changed = () => setRevision(value => value + 1);
	const settle = (request: Request, failure?: unknown, output?: string) => {
		if (request.settled) return;
		request.settled = true; request.cleanup();
		if (failure !== undefined) request.reject(failure);
		else request.resolve(output!);
	};
	const cancel = (request: Request) => {
		if (request.settled) return;
		settle(request, Error("AI_CANCELLED"));
		request.controller.abort();
		const index = waiting.indexOf(request);
		if (index >= 0) waiting.splice(index, 1);
		changed();
	};
	const pump = () => {
		if (disposed || active || !waiting.length || !options.canGenerate()) return;
		const request = waiting.shift()!;
		active = request;
		setActiveKind(request.kind);
		let response: Promise<string>;
		try { response = options.requestText(request.prompt, request.controller.signal, request.context, request.purpose); }
		catch (failure) { response = Promise.reject(failure); }
		void response.then(output => settle(request, undefined, output), failure => settle(request, failure)).finally(() => {
			if (active === request) { active = undefined; if (!disposed) setActiveKind(undefined); }
			if (!disposed) changed();
		});
	};
	createEffect(() => {
		revision();
		const vaultId = options.vaultId(), enabled = options.aiEnabled();
		for (const request of [...waiting, ...(active ? [active] : [])]) {
			if (!enabled || request.vaultId !== vaultId) cancel(request);
		}
		pump();
	});
	onCleanup(() => {
		disposed = true;
		setActiveKind(undefined);
		for (const request of [...waiting, ...(active ? [active] : [])]) cancel(request);
	});
	const enqueue = (prompt: string, signal: AbortSignal, context?: StudyContext, purpose?: Exclude<AiTaskPurpose, "chat">, kind?: StudyKind) => new Promise<string>((resolve, reject) => {
		const vaultId = options.vaultId();
		if (disposed || signal.aborted || !options.aiEnabled()) { reject(Error("AI_CANCELLED")); return; }
		if (!vaultId || !options.aiConnected()) { reject(Error("AI_DISCONNECTED")); return; }
		const controller = new AbortController();
		const request: Request = { vaultId, prompt, context, purpose, kind, controller, settled: false, resolve, reject, cleanup: () => signal.removeEventListener("abort", abort) };
		const abort = () => cancel(request);
		signal.addEventListener("abort", abort, { once: true });
		waiting.push(request); changed();
	});
	return Object.assign(enqueue, {
		activeKind,
		forStudy: (kind: StudyKind): StudyEnvironment["requestText"] =>
			(prompt, signal, context, purpose) => enqueue(prompt, signal, context, purpose, kind),
	});
};
