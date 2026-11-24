use super::super::protocol::Stream;
use crate::ai::repository::Provider;
use serde_json::{json, Value};
use std::sync::{mpsc::Sender, Mutex};

pub(super) struct ActiveTurn {
    pub(super) request_id: String,
    pub(super) stream: Stream,
    timer_cancel: Option<Sender<()>>,
}

pub(super) fn begin(
    active: &Mutex<Option<ActiveTurn>>,
    request_id: &str,
    model: Option<&str>,
) -> Result<(), String> {
    let mut active = active.lock().map_err(|_| "AI_DISCONNECTED")?;
    if active.is_some() {
        return Err("AI_BUSY".into());
    }
    *active = Some(ActiveTurn {
        request_id: request_id.into(),
        stream: Stream::for_model(model),
        timer_cancel: None,
    });
    Ok(())
}

pub(super) fn attach_timer(
    active: &Mutex<Option<ActiveTurn>>,
    request_id: &str,
    timer_cancel: Sender<()>,
) {
    if let Ok(mut active) = active.lock() {
        if let Some(turn) = active.as_mut().filter(|turn| turn.request_id == request_id) {
            turn.timer_cancel = Some(timer_cancel);
        }
    }
}

pub(super) fn take_matching(
    active: &Mutex<Option<ActiveTurn>>,
    request_id: &str,
) -> Option<ActiveTurn> {
    let turn = {
        let mut active = active.lock().ok()?;
        if active
            .as_ref()
            .is_none_or(|turn| turn.request_id != request_id)
        {
            return None;
        }
        active.take()
    };
    let mut turn = turn?;
    if let Some(cancel) = turn.timer_cancel.take() {
        let _ = cancel.send(());
    }
    Some(turn)
}

pub(super) fn matching_request(
    active: &Mutex<Option<ActiveTurn>>,
    request_id: Option<&str>,
) -> Option<String> {
    active
        .lock()
        .ok()
        .and_then(|active| active.as_ref().map(|turn| turn.request_id.clone()))
        .filter(|active| request_id.is_none_or(|id| id == active))
}

pub(super) fn completion_event(
    provider: Provider,
    stream: &Stream,
    forced_error: Option<&str>,
    interrupted: bool,
) -> Value {
    let error = if interrupted {
        None
    } else {
        forced_error
            .or(stream.error_code)
            .or_else(|| (stream.failed && !stream.answered).then_some("AI_REQUEST_FAILED"))
            .or_else(|| {
                (!stream.answered).then_some(match provider {
                    Provider::Claude => "AI_CLAUDE_EMPTY_RESPONSE",
                    Provider::Antigravity => "AI_ANTIGRAVITY_EMPTY_RESPONSE",
                    _ => "AI_REQUEST_FAILED",
                })
            })
    };
    let failed = error.is_some() || (!interrupted && stream.failed);
    json!({
        "kind":"completed",
        "failed":failed,
        "status":if interrupted { "interrupted" } else if failed { "failed" } else { "completed" },
        "errorCode":error,
        "errorDetail":stream.error_detail
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{mpsc, Arc, Barrier};

    #[test]
    fn stale_requests_cannot_take_or_cancel_the_current_turn() {
        let active = Mutex::new(None);
        begin(&active, "new", None).unwrap();
        let (timer, receiver) = mpsc::channel();
        attach_timer(&active, "new", timer);
        assert!(matching_request(&active, Some("old")).is_none());
        assert!(take_matching(&active, "old").is_none());
        assert_eq!(receiver.try_recv(), Err(mpsc::TryRecvError::Empty));
        assert_eq!(matching_request(&active, None).as_deref(), Some("new"));
        assert!(take_matching(&active, "new").is_some());
        assert_eq!(receiver.try_recv(), Ok(()));
        assert!(take_matching(&active, "new").is_none());
        assert!(matching_request(&active, None).is_none());
    }

    #[test]
    fn old_timers_and_completions_cannot_affect_a_replacement_turn() {
        let active = Mutex::new(None);
        begin(&active, "first", None).unwrap();
        assert!(take_matching(&active, "first").is_some());
        begin(&active, "second", None).unwrap();
        let (stale_timer, stale_receiver) = mpsc::channel();
        attach_timer(&active, "first", stale_timer);
        assert_eq!(
            stale_receiver.try_recv(),
            Err(mpsc::TryRecvError::Disconnected)
        );
        assert!(take_matching(&active, "first").is_none());
        assert_eq!(
            matching_request(&active, Some("second")).as_deref(),
            Some("second")
        );
        assert!(take_matching(&active, "second").is_some());
    }

    #[test]
    fn only_one_concurrent_begin_can_claim_the_active_slot() {
        let active = Arc::new(Mutex::new(None));
        let barrier = Arc::new(Barrier::new(3));
        let workers = ["first", "second"].map(|id| {
            let active = Arc::clone(&active);
            let barrier = Arc::clone(&barrier);
            std::thread::spawn(move || {
                barrier.wait();
                begin(&active, id, None)
            })
        });
        barrier.wait();
        let results = workers.map(|worker| worker.join().unwrap());
        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        assert_eq!(
            results
                .iter()
                .filter(|result| matches!(result, Err(error) if error == "AI_BUSY"))
                .count(),
            1
        );
        let winner = matching_request(&active, None).unwrap();
        assert!(take_matching(&active, &winner).is_some());
    }

    #[test]
    fn successful_claude_and_antigravity_streams_emit_completed() {
        for (provider, event) in [
            (
                Provider::Claude,
                json!({"type":"assistant","parent_tool_use_id":null,"message":{"id":"answer","content":[{"type":"text","text":"ok"}]}}),
            ),
            (
                Provider::Antigravity,
                json!({"event":"result","result":{"status":"SUCCESS","response":"ok"}}),
            ),
        ] {
            let mut stream = Stream::for_model(None);
            stream.receive(provider, &event);
            assert_eq!(
                completion_event(provider, &stream, None, false),
                json!({"kind":"completed","failed":false,"status":"completed","errorCode":null,"errorDetail":null})
            );
        }
    }

    #[test]
    fn empty_response_errors_are_specific_to_the_provider() {
        let stream = Stream::for_model(None);
        for (provider, code) in [
            (Provider::Claude, "AI_CLAUDE_EMPTY_RESPONSE"),
            (Provider::Antigravity, "AI_ANTIGRAVITY_EMPTY_RESPONSE"),
            (Provider::Opencode, "AI_REQUEST_FAILED"),
        ] {
            let event = completion_event(provider, &stream, None, false);
            assert_eq!(event["status"], "failed");
            assert_eq!(event["failed"], true);
            assert_eq!(event["errorCode"], code);
        }
    }

    #[test]
    fn forced_errors_take_precedence_and_interruption_suppresses_failures() {
        let mut stream = Stream::for_model(None);
        stream.failed = true;
        stream.error_code = Some("AI_CLAUDE_MCP_FAILED");
        stream.error_detail = Some("provider detail".into());
        let event = completion_event(Provider::Claude, &stream, Some("AI_TIMEOUT"), false);
        assert_eq!(event["errorCode"], "AI_TIMEOUT");
        assert_eq!(event["errorDetail"], "provider detail");
        assert_eq!(event["status"], "failed");
        let interrupted = completion_event(Provider::Claude, &stream, Some("AI_TIMEOUT"), true);
        assert_eq!(interrupted["status"], "interrupted");
        assert_eq!(interrupted["failed"], false);
        assert!(interrupted["errorCode"].is_null());
        assert_eq!(interrupted["errorDetail"], "provider detail");
    }

    #[test]
    fn failure_without_response_or_error_uses_generic_code() {
        let mut stream = Stream::for_model(None);
        stream.failed = true;
        let event = completion_event(Provider::Antigravity, &stream, None, false);
        assert_eq!(event["errorCode"], "AI_REQUEST_FAILED");
        stream.answered = true;
        let event = completion_event(Provider::Antigravity, &stream, None, false);
        assert_eq!(event["status"], "failed");
        assert!(event["errorCode"].is_null());
    }
}
