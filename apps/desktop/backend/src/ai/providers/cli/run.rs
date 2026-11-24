use super::super::process;
use crate::ai::link_requests::Bridge;
use std::{
    process::Child,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::Sender,
        Mutex,
    },
    thread::JoinHandle,
};

pub(super) struct Run {
    bridge: Option<Bridge>,
    pub(super) request_id: String,
    pub(super) child: Option<Mutex<Child>>,
    pub(super) cancelled: AtomicBool,
    pub(super) timed_out: AtomicBool,
    pub(super) worker: Mutex<Option<JoinHandle<()>>>,
    pub(super) timer_cancel: Mutex<Option<Sender<()>>>,
}

impl Run {
    pub(super) fn new(request_id: &str, bridge: Option<Bridge>, child: Option<Child>) -> Self {
        Self {
            bridge,
            request_id: request_id.into(),
            child: child.map(Mutex::new),
            cancelled: AtomicBool::new(false),
            timed_out: AtomicBool::new(false),
            worker: Mutex::new(None),
            timer_cancel: Mutex::new(None),
        }
    }

    pub(super) fn cancel(&self) {
        if let Some(bridge) = &self.bridge {
            bridge.stop();
        }
        self.cancelled.store(true, Ordering::SeqCst);
        if let Some(child) = &self.child {
            if let Ok(mut child) = child.lock() {
                process::stop(&mut child);
            }
        }
        self.stop_timer();
    }

    pub(super) fn stop_timer(&self) {
        if let Ok(mut cancel) = self.timer_cancel.lock() {
            if let Some(cancel) = cancel.take() {
                let _ = cancel.send(());
            }
        }
    }

    pub(super) fn join(&self) -> bool {
        if let Ok(mut worker) = self.worker.lock() {
            if let Some(worker) = worker.take() {
                return worker.join().is_ok();
            }
            return true;
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{mpsc, Arc};

    #[test]
    fn cancel_signals_the_timer_once_and_marks_the_run_interrupted() {
        let run = Run::new("request", None, None);
        let (sender, receiver) = mpsc::channel();
        *run.timer_cancel.lock().unwrap() = Some(sender);
        run.cancel();
        assert!(run.cancelled.load(Ordering::SeqCst));
        assert!(!run.timed_out.load(Ordering::SeqCst));
        assert_eq!(receiver.try_recv(), Ok(()));
        run.cancel();
        assert_eq!(receiver.try_recv(), Err(mpsc::TryRecvError::Disconnected));
        assert!(run.join());
    }

    #[test]
    fn stopping_timer_without_cancelling_keeps_the_run_active() {
        let run = Run::new("request", None, None);
        let (sender, receiver) = mpsc::channel();
        *run.timer_cancel.lock().unwrap() = Some(sender);
        run.stop_timer();
        assert_eq!(receiver.try_recv(), Ok(()));
        assert!(!run.cancelled.load(Ordering::SeqCst));
        run.stop_timer();
    }

    #[test]
    fn join_waits_for_worker_and_reports_panics_once() {
        let run = Arc::new(Run::new("request", None, None));
        let (release, wait) = mpsc::channel();
        let (finished, completed) = mpsc::channel();
        *run.worker.lock().unwrap() = Some(std::thread::spawn(move || {
            wait.recv().unwrap();
        }));
        let joining = Arc::clone(&run);
        let joiner = std::thread::spawn(move || {
            finished.send(joining.join()).unwrap();
        });
        assert!(matches!(
            completed.try_recv(),
            Err(mpsc::TryRecvError::Empty)
        ));
        release.send(()).unwrap();
        assert!(completed.recv().unwrap());
        joiner.join().unwrap();
        *run.worker.lock().unwrap() = Some(std::thread::spawn(|| panic!("worker failure")));
        assert!(!run.join());
        assert!(run.join());
    }

    #[test]
    fn child_process_fixture() {
        if std::env::var_os("OMEGA_RUN_CHILD_FIXTURE").is_some() {
            println!("OMEGA_RUN_CHILD_READY");
            loop {
                std::thread::park();
            }
        }
    }

    #[test]
    fn cancellation_stops_and_reaps_the_child_process() {
        use std::io::BufRead;

        let mut command = std::process::Command::new(std::env::current_exe().unwrap());
        command
            .args([
                "--exact",
                "ai::providers::cli::run::tests::child_process_fixture",
                "--nocapture",
            ])
            .env("OMEGA_RUN_CHILD_FIXTURE", "1")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null());
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        let mut child = command.spawn().unwrap();
        let stdout = child.stdout.take().unwrap();
        let mut reader = std::io::BufReader::new(stdout);
        let mut line = String::new();
        loop {
            line.clear();
            assert_ne!(
                reader.read_line(&mut line).unwrap(),
                0,
                "child exited before starting"
            );
            if line.contains("OMEGA_RUN_CHILD_READY") {
                break;
            }
        }
        let run = Run::new("request", None, Some(child));
        run.cancel();
        assert!(run.cancelled.load(Ordering::SeqCst));
        assert!(run
            .child
            .as_ref()
            .unwrap()
            .lock()
            .unwrap()
            .try_wait()
            .unwrap()
            .is_some());
    }
}
