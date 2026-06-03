pub mod client;
pub mod map;

pub use client::{Ec2Api, SdkEc2};
#[cfg(feature = "mock")]
pub use client::MockEc2;
