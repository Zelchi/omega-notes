use serde::Deserialize;

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
    pub(crate) fn instructions(self) -> &'static str {
        match self {
            Self::Chat => super::instructions::VAULT_INSTRUCTIONS,
            Self::StudyGeneration => super::instructions::STUDY_GENERATION_INSTRUCTIONS,
            Self::StudyEvaluation => super::instructions::STUDY_EVALUATION_INSTRUCTIONS,
        }
    }
}
