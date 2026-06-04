//! ECS Exec terminal host: spawn `aws ecs execute-command --interactive` inside a
//! pseudo-terminal so the user gets a real interactive shell, streaming the PTY
//! output to the webview. Write path — real AWS only; relies on the AWS CLI and the
//! `session-manager-plugin` being installed on the machine.

use std::io::{Read, Write};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::ipc::Channel;

use crate::error::{AppError, AppResult};

/// A live exec session: the PTY master (for resize), its writer (stdin), and the
/// spawned child (to kill on close). Held in `AppState`'s exec registry.
pub struct ExecSession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

impl ExecSession {
    pub fn write(&mut self, data: &[u8]) -> AppResult<()> {
        self.writer
            .write_all(data)
            .and_then(|()| self.writer.flush())
            .map_err(|e| AppError::internal(e.to_string()))
    }

    pub fn resize(&self, rows: u16, cols: u16) -> AppResult<()> {
        self.master
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| AppError::internal(e.to_string()))
    }

    pub fn kill(&mut self) {
        let _ = self.child.kill();
    }
}

/// Spawn the exec command under a PTY and pump its output to `channel` on a thread.
/// `path` is the user's login-shell PATH so `aws` + `session-manager-plugin` resolve
/// even when the app was launched from the Dock.
#[allow(clippy::too_many_arguments)]
pub fn spawn_exec(
    profile: &str,
    region: &str,
    cluster: &str,
    task: &str,
    container: &str,
    command: &str,
    path: &str,
    rows: u16,
    cols: u16,
    channel: Channel<String>,
) -> AppResult<ExecSession> {
    let pty = native_pty_system();
    let pair = pty
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| AppError::internal(e.to_string()))?;

    let mut cmd = CommandBuilder::new("aws");
    cmd.args([
        "ecs",
        "execute-command",
        "--cluster",
        cluster,
        "--task",
        task,
        "--container",
        container,
        "--interactive",
        "--command",
        command,
        "--profile",
        profile,
        "--region",
        region,
    ]);
    cmd.env("PATH", path);

    let child = pair.slave.spawn_command(cmd).map_err(|e| {
        AppError::internal(format!(
            "failed to start `aws ecs execute-command` (is the AWS CLI and session-manager-plugin \
             installed, and ECS Exec enabled on the task?): {e}"
        ))
    })?;
    // Drop the slave so the master sees EOF when the child exits.
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| AppError::internal(e.to_string()))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| AppError::internal(e.to_string()))?;

    // Pump PTY output to the webview until the child exits or the channel closes.
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if channel.send(String::from_utf8_lossy(&buf[..n]).into_owned()).is_err() {
                        break;
                    }
                }
            }
        }
    });

    Ok(ExecSession { master: pair.master, writer, child })
}
