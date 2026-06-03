use std::path::Path;

use redb::{Database, TableDefinition};

use crate::domain::{ResourceGraph, Scope};
use crate::error::{AppError, AppResult};

const KV: TableDefinition<&str, &[u8]> = TableDefinition::new("kv");
const SCOPES_KEY: &str = "scopes";
const AGENT_THREADS_KEY: &str = "agent_threads";
const MAX_AGENT_THREADS: usize = 100;

fn db_err<E: std::fmt::Display>(e: E) -> AppError {
    AppError::internal(format!("db: {e}"))
}

/// Metadata for one saved agent conversation. The transcript items themselves are
/// stored opaquely (the frontend owns their shape), keyed by `id`.
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentThreadMeta {
    pub id: String,
    pub title: String,
    pub created_at: f64,
    pub updated_at: f64,
}

fn agent_thread_key(id: &str) -> String {
    format!("agentthread:{id}")
}

pub struct Store {
    db: Database,
}

impl Store {
    pub fn open(path: impl AsRef<Path>) -> AppResult<Self> {
        let db = Database::create(path).map_err(db_err)?;
        let txn = db.begin_write().map_err(db_err)?;
        txn.open_table(KV).map_err(db_err)?;
        txn.commit().map_err(db_err)?;
        Ok(Self { db })
    }

    pub fn get_scopes(&self) -> AppResult<Vec<Scope>> {
        let txn = self.db.begin_read().map_err(db_err)?;
        let table = txn.open_table(KV).map_err(db_err)?;
        match table.get(SCOPES_KEY).map_err(db_err)? {
            Some(value) => serde_json::from_slice(value.value()).map_err(db_err),
            None => Ok(Vec::new()),
        }
    }

    pub fn set_scopes(&self, scopes: &[Scope]) -> AppResult<()> {
        self.put(SCOPES_KEY, &serde_json::to_vec(scopes).map_err(db_err)?)
    }

    pub fn save_snapshot(&self, graph: &ResourceGraph) -> AppResult<()> {
        let key = snapshot_key(&graph.scope);
        self.put(&key, &serde_json::to_vec(graph).map_err(db_err)?)
    }

    pub fn load_snapshot(&self, scope: &Scope) -> AppResult<Option<ResourceGraph>> {
        let key = snapshot_key(scope);
        let txn = self.db.begin_read().map_err(db_err)?;
        let table = txn.open_table(KV).map_err(db_err)?;
        match table.get(key.as_str()).map_err(db_err)? {
            Some(value) => Ok(Some(serde_json::from_slice(value.value()).map_err(db_err)?)),
            None => Ok(None),
        }
    }

    /// Saved agent conversations, newest first.
    pub fn list_agent_threads(&self) -> AppResult<Vec<AgentThreadMeta>> {
        let txn = self.db.begin_read().map_err(db_err)?;
        let table = txn.open_table(KV).map_err(db_err)?;
        match table.get(AGENT_THREADS_KEY).map_err(db_err)? {
            Some(value) => serde_json::from_slice(value.value()).map_err(db_err),
            None => Ok(Vec::new()),
        }
    }

    /// The transcript items for one conversation (opaque JSON owned by the UI).
    pub fn load_agent_thread(&self, id: &str) -> AppResult<Option<serde_json::Value>> {
        let txn = self.db.begin_read().map_err(db_err)?;
        let table = txn.open_table(KV).map_err(db_err)?;
        match table.get(agent_thread_key(id).as_str()).map_err(db_err)? {
            Some(value) => Ok(Some(serde_json::from_slice(value.value()).map_err(db_err)?)),
            None => Ok(None),
        }
    }

    /// Upsert one conversation's items + metadata, returning the trimmed index
    /// (oldest beyond the cap are evicted so the store can't grow unbounded).
    pub fn save_agent_thread(
        &self,
        meta: AgentThreadMeta,
        items: &serde_json::Value,
    ) -> AppResult<Vec<AgentThreadMeta>> {
        let mut list = self.list_agent_threads()?;
        list.retain(|m| m.id != meta.id);
        list.push(meta.clone());
        list.sort_by(|a, b| b.updated_at.total_cmp(&a.updated_at));
        let evicted: Vec<String> = if list.len() > MAX_AGENT_THREADS {
            list.split_off(MAX_AGENT_THREADS)
                .into_iter()
                .map(|m| agent_thread_key(&m.id))
                .collect()
        } else {
            Vec::new()
        };

        let items_bytes = serde_json::to_vec(items).map_err(db_err)?;
        let index_bytes = serde_json::to_vec(&list).map_err(db_err)?;
        let txn = self.db.begin_write().map_err(db_err)?;
        {
            let mut table = txn.open_table(KV).map_err(db_err)?;
            table
                .insert(agent_thread_key(&meta.id).as_str(), items_bytes.as_slice())
                .map_err(db_err)?;
            table.insert(AGENT_THREADS_KEY, index_bytes.as_slice()).map_err(db_err)?;
            for key in &evicted {
                table.remove(key.as_str()).map_err(db_err)?;
            }
        }
        txn.commit().map_err(db_err)?;
        Ok(list)
    }

    pub fn delete_agent_thread(&self, id: &str) -> AppResult<Vec<AgentThreadMeta>> {
        let mut list = self.list_agent_threads()?;
        list.retain(|m| m.id != id);
        let index_bytes = serde_json::to_vec(&list).map_err(db_err)?;
        let txn = self.db.begin_write().map_err(db_err)?;
        {
            let mut table = txn.open_table(KV).map_err(db_err)?;
            table.remove(agent_thread_key(id).as_str()).map_err(db_err)?;
            table.insert(AGENT_THREADS_KEY, index_bytes.as_slice()).map_err(db_err)?;
        }
        txn.commit().map_err(db_err)?;
        Ok(list)
    }

    fn put(&self, key: &str, bytes: &[u8]) -> AppResult<()> {
        let txn = self.db.begin_write().map_err(db_err)?;
        {
            let mut table = txn.open_table(KV).map_err(db_err)?;
            table.insert(key, bytes).map_err(db_err)?;
        }
        txn.commit().map_err(db_err)?;
        Ok(())
    }
}

fn snapshot_key(scope: &Scope) -> String {
    format!("snapshot:{}:{}", scope.profile, scope.region)
}
