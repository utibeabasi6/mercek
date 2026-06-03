pub mod client;
pub mod map;

pub use client::{AutoscalingApi, SdkAutoscaling};
#[cfg(feature = "mock")]
pub use client::MockAutoscaling;
