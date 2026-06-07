//! Lifecycle of the spawned harness process *tree*.
//!
//! The harness is `npx … claude-code-acp`, which forks a `node` grandchild. The ACP
//! SDK would spawn-and-hide the child and only SIGKILL the direct process on drop —
//! which (a) never runs on a GUI hard-exit (`std::process::exit` skips destructors)
//! and (b) orphans the `node` grandchild even when it does. So we spawn the harness
//! ourselves into its OWN process group (`process_group(0)` → pgid == child pid) and
//! signal the whole group here, on disconnect and on app quit alike.

/// Kill the harness process group `pgid` (the pid of the group leader we spawned).
/// SIGTERM the group, then SIGKILL it, so a well-behaved harness can flush first but
/// a stuck one still dies. A no-op on non-unix (we don't ship those builds yet) and
/// for a non-positive pgid (nothing was spawned).
#[cfg(unix)]
pub fn kill_group(pgid: i32) {
    if pgid <= 1 {
        return; // 0/1 would broadcast to our own group / init — never our child
    }
    // Negative pid => "every process in this group". SIGTERM first (let node exit
    // cleanly), then SIGKILL as the backstop. We don't wait between them: this runs
    // on the exit path too, where blocking would stall quit; the group leader is in
    // its own group, so the SIGKILL can't outlive into a reused pgid in practice.
    unsafe {
        libc::kill(-pgid, libc::SIGTERM);
        libc::kill(-pgid, libc::SIGKILL);
    }
}

#[cfg(not(unix))]
pub fn kill_group(_pgid: i32) {}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    /// The whole point: signalling only the direct child would orphan its grandchildren
    /// (the real harness is npx → node). Spawn a shell leader that forks two grandchild
    /// `sleep`s into a fresh group, then prove `kill_group` empties the *entire* group.
    #[tokio::test]
    async fn kill_group_reaps_the_whole_tree() {
        let mut cmd = tokio::process::Command::new("sh");
        cmd.args(["-c", "sleep 60 & sleep 60 & wait"]);
        cmd.process_group(0); // own group: pgid == leader pid
        cmd.kill_on_drop(true);
        let mut child = cmd.spawn().expect("spawn sh");
        let pgid = child.id().expect("leader pid") as i32;

        // Let the grandchildren actually start, then confirm the group is populated.
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        assert_eq!(unsafe { libc::kill(-pgid, 0) }, 0, "group should be alive");

        kill_group(pgid);
        let _ = child.wait().await; // reap the leader so it isn't a lingering zombie

        // Grandchildren reparent to init and are reaped; poll until the group is empty.
        let mut gone = false;
        for _ in 0..100 {
            if unsafe { libc::kill(-pgid, 0) } == -1 {
                gone = true;
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
        assert!(gone, "process group {pgid} still alive after kill_group");
    }
}
