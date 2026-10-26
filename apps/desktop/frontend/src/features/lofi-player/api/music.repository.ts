import { invoke } from "@/shared/lib/desktop";

export const getMusicStreamUrl = (url: string): Promise<string> =>
	invoke<string>("music_stream_url", { url });
