use super::*;
use std::process::Stdio;
use std::sync::mpsc;

fn session() -> Arc<PersistentSession> {
    let temp = tempfile::tempdir().unwrap();
    let app = AppContext::new(
        temp.path().to_path_buf(),
        temp.path().to_path_buf(),
        Box::new(std::io::sink()),
    );
    let bridge = crate::ai::link_requests::Bridge::start(app.clone()).unwrap();
    let mut command = std::process::Command::new(std::env::current_exe().unwrap());
    command
        .args([
            "--exact",
            "ai::providers::cli::run::tests::child_process_fixture",
        ])
        .env("OMEGA_RUN_CHILD_FIXTURE", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command.spawn().unwrap();
    let stdin = child.stdin.take().unwrap();
    Arc::new(PersistentSession {
        provider: Provider::Claude,
        vault_id: "vault".into(),
        model: None,
        effort: None,
        app,
        connection_id: "connection".into(),
        bridge,
        child: Mutex::new(child),
        stdin: Mutex::new(stdin),
        active: Mutex::new(None),
        alive: AtomicBool::new(true),
        lifecycle: Mutex::new(()),
    })
}

#[test]
fn stale_cancel_cannot_terminate_a_replacement_turn() {
    let session = session();
    session.begin_turn("old").unwrap();
    let (matched, observed) = mpsc::channel();
    let (resume, wait) = mpsc::channel();
    let cancelling = Arc::clone(&session);
    let worker = std::thread::spawn(move || {
        cancelling.cancel_with_hook(Some("old"), || {
            matched.send(()).unwrap();
            wait.recv().unwrap();
        });
    });
    observed.recv().unwrap();
    session.finish("old", None, false);
    let (started, started_rx) = mpsc::channel();
    let (replacement_result, replacement_rx) = mpsc::channel();
    let replacement = Arc::clone(&session);
    let replacement_worker = std::thread::spawn(move || {
        started.send(()).unwrap();
        replacement_result
            .send(replacement.begin_turn("new"))
            .unwrap();
    });
    started_rx.recv().unwrap();
    assert!(matches!(
        replacement_rx.recv_timeout(std::time::Duration::from_millis(100)),
        Err(mpsc::RecvTimeoutError::Timeout)
    ));
    resume.send(()).unwrap();
    worker.join().unwrap();
    assert!(matches!(replacement_rx.recv().unwrap(), Err(error) if error == "AI_DISCONNECTED"));
    replacement_worker.join().unwrap();
    assert!(!session.alive.load(Ordering::SeqCst));
    assert!(persistent_turn::matching_request(&session.active, None).is_none());
}

#[test]
fn cancellation_for_an_old_request_leaves_a_replacement_running() {
    let session = session();
    session.begin_turn("old").unwrap();
    session.finish("old", None, false);
    session.begin_turn("new").unwrap();
    assert!(!session.cancel(Some("old")));
    assert!(session.alive.load(Ordering::SeqCst));
    assert_eq!(
        persistent_turn::matching_request(&session.active, None).as_deref(),
        Some("new")
    );
    assert!(session.cancel(Some("new")));
    assert!(!session.alive.load(Ordering::SeqCst));
}

#[test]
fn delayed_timeout_or_reader_error_does_not_kill_a_replacement_turn() {
    for error in ["AI_PROTOCOL_ERROR", "AI_TIMEOUT"] {
        let session = session();
        session.begin_turn("old").unwrap();
        let (finished, observed) = mpsc::channel();
        let (resume, wait) = mpsc::channel();
        let terminating = Arc::clone(&session);
        let worker = std::thread::spawn(move || {
            let hook = || {
                finished.send(()).unwrap();
                wait.recv().unwrap();
            };
            if error == "AI_PROTOCOL_ERROR" {
                terminating.fail_current_protocol_with_hook(hook)
            } else {
                terminating.finish_and_terminate_with_hook("old", Some(error), hook)
            }
        });
        observed.recv().unwrap();
        let (started, started_rx) = mpsc::channel();
        let (replacement_result, replacement_rx) = mpsc::channel();
        let replacement = Arc::clone(&session);
        let replacement_worker = std::thread::spawn(move || {
            started.send(()).unwrap();
            replacement_result
                .send(replacement.begin_turn("new"))
                .unwrap();
        });
        started_rx.recv().unwrap();
        assert!(matches!(
            replacement_rx.recv_timeout(std::time::Duration::from_millis(100)),
            Err(mpsc::RecvTimeoutError::Timeout)
        ));
        resume.send(()).unwrap();
        assert!(worker.join().unwrap());
        assert!(matches!(replacement_rx.recv().unwrap(), Err(error) if error == "AI_DISCONNECTED"));
        replacement_worker.join().unwrap();
        assert!(!session.alive.load(Ordering::SeqCst));
        assert!(persistent_turn::matching_request(&session.active, None).is_none());
    }
}

#[test]
fn stale_timeout_or_write_error_leaves_the_replacement_running() {
    for error in ["AI_TIMEOUT", "AI_SEND_FAILED"] {
        let session = session();
        session.begin_turn("old").unwrap();
        session.finish("old", None, false);
        session.begin_turn("new").unwrap();
        assert!(!session.finish_and_terminate("old", Some(error)));
        assert!(session.alive.load(Ordering::SeqCst));
        assert_eq!(
            persistent_turn::matching_request(&session.active, None).as_deref(),
            Some("new")
        );
    }
}

#[test]
fn reader_protocol_error_without_an_active_turn_does_not_stop_session() {
    let session = session();
    assert!(!session.fail_current_protocol());
    assert!(session.alive.load(Ordering::SeqCst));
    session.begin_turn("new").unwrap();
    assert!(session.fail_current_protocol());
    assert!(!session.alive.load(Ordering::SeqCst));
    assert!(persistent_turn::matching_request(&session.active, None).is_none());
}
