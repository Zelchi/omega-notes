export async function installAndRelaunch(install, relaunch, quit) {
    await install();
    relaunch();
    await quit();
}
