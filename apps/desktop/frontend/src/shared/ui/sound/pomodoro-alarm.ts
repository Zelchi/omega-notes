import type { SoundTone } from "./wave";

export const pomodoroAlarmSound: readonly SoundTone[] = [
	{ frequency: 659, endFrequency: 659, duration: 0.16, volume: 0.12, type: "triangle" },
	{ frequency: 784, endFrequency: 784, duration: 0.16, volume: 0.12, type: "triangle", delay: 0.18 },
	{ frequency: 988, endFrequency: 988, duration: 0.22, volume: 0.12, type: "triangle", delay: 0.36 },
];
