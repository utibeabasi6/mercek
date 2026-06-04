use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::sync::Mutex;

use tokio::sync::Mutex as AsyncMutex;
use tokio::task::AbortHandle;

use crate::agent::session::AcpSession;
use crate::aws::client_pool::ClientPool;
use crate::db::Store;
use crate::error::{AppError, AppResult};

/// Interrupts the current agent turn (ACP `session/cancel`) without the agent mutex.
pub type AgentCanceller = Arc<dyn Fn() -> crate::error::AppResult<()> + Send + Sync>;

pub struct AppState {
    /// `Arc` so the agent's long-lived ACP task + MCP tool handlers can hold the
    /// pool/store past a single command.
    pub pool: Arc<ClientPool>,
    pub store: Arc<Store>,
    /// The single live agent session, if connected. An async mutex because
    /// driving a turn awaits across the harness round-trip.
    pub agent: AsyncMutex<Option<Box<dyn AcpSession>>>,
    /// Interrupts the current turn WITHOUT taking `agent` (which a running prompt
    /// holds). Set on connect, cleared on disconnect.
    pub agent_canceller: Mutex<Option<AgentCanceller>>,
    /// The active turn's sink, so navigate/propose intents emitted by the
    /// out-of-process MCP tools (over the IPC socket) reach the live channel. Set by
    /// `agent_prompt` for the turn's duration.
    pub agent_intent_sink: crate::agent::ipc::IntentSink,
    tails: Mutex<HashMap<u64, AbortHandle>>,
    tail_seq: AtomicU64,
    /// Live ECS Exec terminal sessions (PTY master + stdin writer + child).
    exec_sessions: Mutex<HashMap<u64, crate::streaming::exec::ExecSession>>,
    exec_seq: AtomicU64,
}

impl AppState {
    pub fn new(store: Store) -> Self {
        Self {
            pool: Arc::new(ClientPool::default()),
            store: Arc::new(store),
            agent: AsyncMutex::new(None),
            agent_canceller: Mutex::new(None),
            agent_intent_sink: Arc::new(Mutex::new(None)),
            tails: Mutex::new(HashMap::new()),
            tail_seq: AtomicU64::new(1),
            exec_sessions: Mutex::new(HashMap::new()),
            exec_seq: AtomicU64::new(1),
        }
    }

    pub fn register_tail(&self, handle: AbortHandle) -> u64 {
        let id = self.tail_seq.fetch_add(1, Ordering::Relaxed);
        if let Ok(mut tails) = self.tails.lock() {
            tails.insert(id, handle);
        }
        id
    }

    pub fn stop_tail(&self, id: u64) {
        if let Ok(mut tails) = self.tails.lock() {
            if let Some(handle) = tails.remove(&id) {
                handle.abort();
            }
        }
    }

    pub fn register_exec(&self, session: crate::streaming::exec::ExecSession) -> u64 {
        let id = self.exec_seq.fetch_add(1, Ordering::Relaxed);
        if let Ok(mut m) = self.exec_sessions.lock() {
            m.insert(id, session);
        }
        id
    }

    pub fn exec_write(&self, id: u64, data: &[u8]) -> AppResult<()> {
        let mut m = self
            .exec_sessions
            .lock()
            .map_err(|_| AppError::internal("exec registry poisoned"))?;
        m.get_mut(&id)
            .ok_or_else(|| AppError::internal("no such exec session"))?
            .write(data)
    }

    pub fn exec_resize(&self, id: u64, rows: u16, cols: u16) -> AppResult<()> {
        let m = self
            .exec_sessions
            .lock()
            .map_err(|_| AppError::internal("exec registry poisoned"))?;
        m.get(&id)
            .ok_or_else(|| AppError::internal("no such exec session"))?
            .resize(rows, cols)
    }

    pub fn exec_stop(&self, id: u64) {
        if let Ok(mut m) = self.exec_sessions.lock() {
            if let Some(mut session) = m.remove(&id) {
                session.kill();
            }
        }
    }
}
