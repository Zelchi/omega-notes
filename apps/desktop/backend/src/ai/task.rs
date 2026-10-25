use serde::Deserialize;

const LINK_RECOVERY_INSTRUCTIONS: &str = "After any recoverable link_note_mentions error (stale note/editor revision, mention-text mismatch, protected span, or invalid range), you MUST NOT give the user a failure answer or speculate about the cause yet. The user's explicit link request remains authorization: reread the current source note and relevant target note(s), then reassess whether each requested link is still relevant, unambiguous, and safe. If the requested link is already present, do not apply it again. Otherwise, if it still makes sense, recompute the revision and all Unicode-character offsets from the fresh reads and retry. You MUST perform this recovery instead of stopping after the first error; make at most three retries after the initial failed mutation, rereading and reassessing before every retry. Stop early only if the change is no longer appropriate, the target is unavailable, or applying it cannot be done safely. Never reuse stale arguments, bypass protected text, or guess a replacement target. Do not show raw tool errors or codes to the user; if recovery is impossible or the retry limit is reached, explain the result naturally in the assistant response.";

#[derive(Clone, Copy, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum Purpose {
    #[default]
    Chat,
    StudyGeneration,
    StudyEvaluation,
}

impl Purpose {
    pub(crate) fn is_study(self) -> bool {
        self != Self::Chat
    }
    pub(crate) fn name(self) -> &'static str {
        match self {
            Self::Chat => "chat",
            Self::StudyGeneration => "study-generation",
            Self::StudyEvaluation => "study-evaluation",
        }
    }
    pub(crate) fn instructions(self) -> String {
        match self {
            Self::Chat => format!(
                "{}\n\n{}",
                super::instructions::VAULT_INSTRUCTIONS,
                LINK_RECOVERY_INSTRUCTIONS
            ),
            Self::StudyGeneration => super::instructions::STUDY_GENERATION_INSTRUCTIONS.into(),
            Self::StudyEvaluation => super::instructions::STUDY_EVALUATION_INSTRUCTIONS.into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Purpose;

    #[test]
    fn chat_instructions_define_bounded_safe_link_recovery() {
        let instructions = Purpose::Chat.instructions();
        assert!(instructions.contains("you MUST NOT give the user a failure answer"));
        assert!(instructions
            .contains("MUST perform this recovery instead of stopping after the first error"));
        assert!(instructions.contains("at most three retries after the initial failed mutation"));
        assert!(instructions.contains("reread the current source note and relevant target note(s)"));
        assert!(instructions.contains("Do not show raw tool errors or codes to the user"));
    }
}
