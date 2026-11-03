export const dynamicTrayLabels = (labels, { visible, pomodoroRunning, musicPlaying }) => ({
    visibility: visible ? labels.hide : labels.show,
    pomodoro: pomodoroRunning ? labels.pause : labels.start,
    music: musicPlaying ? labels.musicPause : labels.musicPlay,
});
