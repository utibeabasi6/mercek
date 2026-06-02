use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use tokio::sync::Mutex as AsyncMutex;
use tokio::task::AbortHandle;

use crate::agent::session::AcpSession;
use crate::aws::client_pool::ClientPool;
use crate::db::Store;

pub struct AppState {
    pub pool: ClientPool,
    pub store: Store,
    /// The single live agent session, if connected (agent-panel spec §3). An
    /// async mutex because driving a turn awaits across the harness round-trip.
    pub agent: AsyncMutex<Option<Box<dyn AcpSession>>>,
    tails: Mutex<HashMap<u64, AbortHandle>>,
    tail_seq: AtomicU64,
}

impl AppState {
    pub fn new(store: Store) -> Self {
        Self {
            pool: ClientPool::default(),
            store,
            agent: AsyncMutex::new(None),
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
