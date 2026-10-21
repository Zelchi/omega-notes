pub(crate) mod cli_commands;
pub(crate) mod commands;
mod instructions;
pub(crate) mod link_requests;
pub(crate) mod markdown_segments;
mod mcp;
mod providers;
mod repository;
mod state;
pub(crate) mod studies;
pub(crate) mod study_context;
pub(crate) mod task;
mod tools;
pub(crate) use tools::invalidate_cache as invalidate_tool_cache;

pub(crate) use mcp::run_if_requested;
pub(crate) use providers::antigravity_profile_directory;
pub(crate) use providers::terminal_command;
pub(crate) use providers::terminal_opencode_session_id;

pub(crate) use state::AiState;

pub(crate) use tools::resolve_vault as terminal_vault_directory;
