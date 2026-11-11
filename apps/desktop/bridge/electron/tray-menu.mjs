export const dynamicTrayLabels = (labels, { visible, pomodoroRunning, musicPlaying }) => ({
    visibility: visible ? labels.hide : labels.show,
    pomodoro: pomodoroRunning ? labels.pause : labels.start,
    music: musicPlaying ? labels.musicPause : labels.musicPlay,
});

export const trayIconVariant = ({ pomodoroRunning, musicPlaying }) => {
    if (pomodoroRunning && musicPlaying) return 'both';
    if (pomodoroRunning) return 'pomodoro';
    if (musicPlaying) return 'music';
    return 'idle';
};
