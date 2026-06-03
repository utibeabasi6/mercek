pub mod client;
pub mod map;

pub use client::{CloudwatchApi, MetricQuery, SdkCloudwatch};
#[cfg(feature = "mock")]
pub use client::MockCloudwatch;
