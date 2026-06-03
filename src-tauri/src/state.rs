use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::sync::Mutex;

use tokio::sync::Mutex as AsyncMutex;
use tokio::task::AbortHandle;

use crate::agent::session::AcpSession;
use crate::aws::client_pool::ClientPool;
use crate::db::Store;

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
}
