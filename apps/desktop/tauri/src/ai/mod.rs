pub(crate) mod cli_commands;
pub(crate) mod commands;
mod instructions;
pub(crate) mod link_requests;
mod mcp;
mod providers;
mod repository;
mod state;
mod tools;

pub(crate) use mcp::run_if_requested;

pub(crate) use state::AiState;
