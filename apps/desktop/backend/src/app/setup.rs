use crate::runtime::AppContext;

use crate::vaults;

use super::runtime;

#[derive(Debug)]
pub(crate) struct SetupFailure(String);

impl std::fmt::Display for SetupFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for SetupFailure {}

pub(crate) fn initialize(app: AppContext) -> Result<(), SetupFailure> {
    vaults::initialize_active_vault(&|| runtime::app_directory(&app), &|directory, message| {
        runtime::set_active_vault(&app, directory, message)
    })
    .map_err(SetupFailure)?;

    Ok(())
}
