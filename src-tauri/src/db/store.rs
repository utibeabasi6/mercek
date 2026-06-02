use std::path::Path;

use redb::{Database, TableDefinition};

use crate::domain::{ResourceGraph, Scope};
use crate::error::{AppError, AppResult};

const KV: TableDefinition<&str, &[u8]> = TableDefinition::new("kv");
const SCOPES_KEY: &str = "scopes";

fn db_err<E: std::fmt::Display>(e: E) -> AppError {
    AppError::internal(format!("db: {e}"))
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
