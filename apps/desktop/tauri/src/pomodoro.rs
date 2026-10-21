use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    sync::{Mutex, MutexGuard},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, State};

const FILE_NAME: &str = ".pomodoro-state.json";
const MAX_STATE_BYTES: u64 = 4_096;
const MAX_DURATION_MINUTES: u32 = 1_440;
const MAX_DURATION_SECONDS: u64 = 86_400;
const MAX_CYCLES: u32 = 100;

#[derive(Default)]
pub(crate) struct PomodoroTimer(Mutex<TimerState>);

#[derive(Clone, Copy, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Phase {
    Focus,
    ShortBreak,
    LongBreak,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TimerSnapshot {
    phase: Phase,
    remaining_seconds: u64,
    duration_seconds: u64,
    running: bool,
    focus_minutes: u32,
    short_break_minutes: u32,
    long_break_minutes: u32,
    cycles_before_long_break: u32,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedTimer {
    phase: Phase,
    focus_minutes: u32,
    short_break_minutes: u32,
    long_break_minutes: u32,
    cycles_before_long_break: u32,
    completed_focus_cycles: u32,
    remaining_seconds: u64,
    deadline_unix_ms: Option<u64>,
}

struct TimerState {
    phase: Phase,
    focus_seconds: u64,
    short_break_seconds: u64,
    long_break_seconds: u64,
    cycles_before_long_break: u32,
    completed_focus_cycles: u32,
    deadline: Option<Instant>,
    deadline_unix_ms: Option<u64>,
    remaining_seconds: u64,
    loaded: bool,
}

impl Default for TimerState {
    fn default() -> Self {
        Self {
            phase: Phase::Focus,
            focus_seconds: 25 * 60,
            short_break_seconds: 5 * 60,
            long_break_seconds: 15 * 60,
            cycles_before_long_break: 4,
            completed_focus_cycles: 0,
            deadline: None,
            deadline_unix_ms: None,
            remaining_seconds: 25 * 60,
            loaded: false,
        }
    }
}

impl TimerState {
    fn duration(&self) -> u64 {
        match self.phase {
            Phase::Focus => self.focus_seconds,
            Phase::ShortBreak => self.short_break_seconds,
            Phase::LongBreak => self.long_break_seconds,
        }
    }

    fn advance(&mut self) {
        self.phase = match self.phase {
            Phase::Focus => {
                self.completed_focus_cycles += 1;
                if self.completed_focus_cycles >= self.cycles_before_long_break {
                    self.completed_focus_cycles = 0;
                    Phase::LongBreak
                } else {
                    Phase::ShortBreak
                }
            }
            Phase::ShortBreak | Phase::LongBreak => Phase::Focus,
        };
        self.remaining_seconds = self.duration();
        self.deadline = None;
        self.deadline_unix_ms = None;
    }

    fn update_clock(&mut self) -> bool {
        let Some(deadline) = self.deadline else {
            return false;
        };
        let remaining = deadline.saturating_duration_since(Instant::now());
        self.remaining_seconds = remaining
            .as_secs()
            .saturating_add(u64::from(remaining.subsec_nanos() > 0));
        if self.remaining_seconds == 0 {
            self.advance();
            true
        } else {
            false
        }
    }

    fn snapshot(&self) -> TimerSnapshot {
        TimerSnapshot {
            phase: self.phase,
            remaining_seconds: self.remaining_seconds,
            duration_seconds: self.duration(),
            running: self.deadline.is_some(),
            focus_minutes: (self.focus_seconds / 60) as u32,
            short_break_minutes: (self.short_break_seconds / 60) as u32,
            long_break_minutes: (self.long_break_seconds / 60) as u32,
            cycles_before_long_break: self.cycles_before_long_break,
        }
    }

    fn persisted(&self) -> PersistedTimer {
        PersistedTimer {
            phase: self.phase,
            focus_minutes: (self.focus_seconds / 60) as u32,
            short_break_minutes: (self.short_break_seconds / 60) as u32,
            long_break_minutes: (self.long_break_seconds / 60) as u32,
            cycles_before_long_break: self.cycles_before_long_break,
            completed_focus_cycles: self.completed_focus_cycles,
            remaining_seconds: self.remaining_seconds,
            deadline_unix_ms: self.deadline_unix_ms,
        }
    }

    fn from_persisted(saved: PersistedTimer) -> Result<Self, String> {
        validate_settings(
            saved.focus_minutes,
            saved.short_break_minutes,
            saved.long_break_minutes,
            saved.cycles_before_long_break,
        )?;
        if saved.completed_focus_cycles >= saved.cycles_before_long_break {
            return Err("POMODORO_STORAGE_FAILED".into());
        }

        let mut state = Self {
            phase: saved.phase,
            focus_seconds: u64::from(saved.focus_minutes) * 60,
            short_break_seconds: u64::from(saved.short_break_minutes) * 60,
            long_break_seconds: u64::from(saved.long_break_minutes) * 60,
            cycles_before_long_break: saved.cycles_before_long_break,
            completed_focus_cycles: saved.completed_focus_cycles,
            deadline: None,
            deadline_unix_ms: None,
            remaining_seconds: saved.remaining_seconds,
            loaded: true,
        };

        if let Some(deadline_unix_ms) = saved.deadline_unix_ms {
            let now = unix_time_ms()?;
            if deadline_unix_ms <= now {
                state.advance();
            } else {
                let remaining_ms = deadline_unix_ms - now;
                if remaining_ms > MAX_DURATION_SECONDS * 1_000 {
                    return Err("POMODORO_STORAGE_FAILED".into());
                }
                state.remaining_seconds = remaining_ms.div_ceil(1_000);
                state.deadline = Some(Instant::now() + Duration::from_millis(remaining_ms));
                state.deadline_unix_ms = Some(deadline_unix_ms);
            }
        } else if state.remaining_seconds == 0 || state.remaining_seconds > state.duration() {
            return Err("POMODORO_STORAGE_FAILED".into());
        }

        Ok(state)
    }
}

fn lock(timer: &PomodoroTimer) -> Result<MutexGuard<'_, TimerState>, String> {
    timer.0.lock().map_err(|_| "POMODORO_TIMER_FAILED".into())
}

fn validate_settings(
    focus_minutes: u32,
    short_break_minutes: u32,
    long_break_minutes: u32,
    cycles_before_long_break: u32,
) -> Result<(), String> {
    if [focus_minutes, short_break_minutes, long_break_minutes]
        .into_iter()
        .any(|minutes| !(1..=MAX_DURATION_MINUTES).contains(&minutes))
        || !(1..=MAX_CYCLES).contains(&cycles_before_long_break)
    {
        return Err("POMODORO_TIMER_FAILED".into());
    }
    Ok(())
}

fn unix_time_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "POMODORO_TIMER_FAILED")?
        .as_millis()
        .try_into()
        .map_err(|_| "POMODORO_TIMER_FAILED".into())
}

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let path = crate::app::runtime::app_directory(app)
        .map_err(|_| "POMODORO_STORAGE_FAILED")?
        .join(FILE_NAME);
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        _ => return Err("POMODORO_STORAGE_FAILED".into()),
    }
    Ok(path)
}

fn load_state(app: &AppHandle, state: &mut TimerState) -> Result<bool, String> {
    if state.loaded {
        return Ok(false);
    }
    let path = state_path(app)?;
    let saved = match fs::metadata(&path) {
        Ok(metadata) if metadata.len() <= MAX_STATE_BYTES => {
            let contents = fs::read(path).map_err(|_| "POMODORO_STORAGE_FAILED")?;
            let saved: PersistedTimer =
                serde_json::from_slice(&contents).map_err(|_| "POMODORO_STORAGE_FAILED")?;
            Some(TimerState::from_persisted(saved)?)
        }
        Ok(_) => return Err("POMODORO_STORAGE_FAILED".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(_) => return Err("POMODORO_STORAGE_FAILED".into()),
    };
    if let Some(saved) = saved {
        *state = saved;
        Ok(false)
    } else {
        state.loaded = true;
        Ok(true)
    }
}

fn save_state(app: &AppHandle, state: &TimerState) -> Result<(), String> {
    let contents =
        serde_json::to_vec_pretty(&state.persisted()).map_err(|_| "POMODORO_STORAGE_FAILED")?;
    if contents.len() as u64 > MAX_STATE_BYTES {
        return Err("POMODORO_STORAGE_FAILED".into());
    }
    crate::storage::atomic_write(&state_path(app)?, &contents, None)
        .map_err(|_| "POMODORO_STORAGE_FAILED".into())
}

#[tauri::command]
pub(crate) fn initialize_pomodoro_timer(
    app: AppHandle,
    timer: State<'_, PomodoroTimer>,
    focus_minutes: u32,
    short_break_minutes: u32,
    long_break_minutes: u32,
    cycles_before_long_break: u32,
) -> Result<TimerSnapshot, String> {
    validate_settings(
        focus_minutes,
        short_break_minutes,
        long_break_minutes,
        cycles_before_long_break,
    )?;
    let mut state = lock(&timer)?;
    if load_state(&app, &mut state)? {
        state.focus_seconds = u64::from(focus_minutes) * 60;
        state.short_break_seconds = u64::from(short_break_minutes) * 60;
        state.long_break_seconds = u64::from(long_break_minutes) * 60;
        state.cycles_before_long_break = cycles_before_long_break;
        state.remaining_seconds = state.duration();
    }
    save_state(&app, &state)?;
    Ok(state.snapshot())
}

#[tauri::command]
pub(crate) fn set_pomodoro_settings(
    app: AppHandle,
    timer: State<'_, PomodoroTimer>,
    focus_minutes: u32,
    short_break_minutes: u32,
    long_break_minutes: u32,
    cycles_before_long_break: u32,
) -> Result<TimerSnapshot, String> {
    validate_settings(
        focus_minutes,
        short_break_minutes,
        long_break_minutes,
        cycles_before_long_break,
    )?;
    let mut state = lock(&timer)?;
    load_state(&app, &mut state)?;
    state.update_clock();
    if state.deadline.is_some() {
        return Err("POMODORO_TIMER_RUNNING".into());
    }
    state.focus_seconds = u64::from(focus_minutes) * 60;
    state.short_break_seconds = u64::from(short_break_minutes) * 60;
    state.long_break_seconds = u64::from(long_break_minutes) * 60;
    state.cycles_before_long_break = cycles_before_long_break;
    state.completed_focus_cycles %= cycles_before_long_break;
    state.remaining_seconds = state.duration();
    save_state(&app, &state)?;
    Ok(state.snapshot())
}

#[tauri::command]
pub(crate) fn read_pomodoro_timer(
    app: AppHandle,
    timer: State<'_, PomodoroTimer>,
) -> Result<TimerSnapshot, String> {
    let mut state = lock(&timer)?;
    load_state(&app, &mut state)?;
    if state.update_clock() {
        save_state(&app, &state)?;
    }
    Ok(state.snapshot())
}

#[tauri::command]
pub(crate) fn start_pomodoro_timer(
    app: AppHandle,
    timer: State<'_, PomodoroTimer>,
) -> Result<TimerSnapshot, String> {
    let mut state = lock(&timer)?;
    load_state(&app, &mut state)?;
    state.update_clock();
    if state.deadline.is_none() {
        if state.remaining_seconds == 0 {
            state.remaining_seconds = state.duration();
        }
        let deadline = unix_time_ms()?
            .checked_add(state.remaining_seconds * 1_000)
            .ok_or("POMODORO_TIMER_FAILED")?;
        state.deadline = Some(Instant::now() + Duration::from_secs(state.remaining_seconds));
        state.deadline_unix_ms = Some(deadline);
    }
    state.update_clock();
    save_state(&app, &state)?;
    Ok(state.snapshot())
}

#[tauri::command]
pub(crate) fn pause_pomodoro_timer(
    app: AppHandle,
    timer: State<'_, PomodoroTimer>,
) -> Result<TimerSnapshot, String> {
    let mut state = lock(&timer)?;
    load_state(&app, &mut state)?;
    state.update_clock();
    state.deadline = None;
    state.deadline_unix_ms = None;
    save_state(&app, &state)?;
    Ok(state.snapshot())
}

#[tauri::command]
pub(crate) fn reset_pomodoro_timer(
    app: AppHandle,
    timer: State<'_, PomodoroTimer>,
) -> Result<TimerSnapshot, String> {
    let mut state = lock(&timer)?;
    load_state(&app, &mut state)?;
    state.update_clock();
    state.deadline = None;
    state.deadline_unix_ms = None;
    state.remaining_seconds = state.duration();
    save_state(&app, &state)?;
    Ok(state.snapshot())
}

#[tauri::command]
pub(crate) fn next_pomodoro_phase(
    app: AppHandle,
    timer: State<'_, PomodoroTimer>,
) -> Result<TimerSnapshot, String> {
    let mut state = lock(&timer)?;
    load_state(&app, &mut state)?;
    if !state.update_clock() {
        state.phase = match state.phase {
            Phase::Focus => Phase::ShortBreak,
            Phase::ShortBreak => Phase::LongBreak,
            Phase::LongBreak => Phase::Focus,
        };
        state.remaining_seconds = state.duration();
        state.deadline = None;
        state.deadline_unix_ms = None;
    }
    save_state(&app, &state)?;
    Ok(state.snapshot())
}
