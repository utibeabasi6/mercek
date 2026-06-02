use aws_sdk_elasticloadbalancingv2::types as elb;

use crate::domain;

pub fn target_health(d: &elb::TargetHealthDescription) -> domain::TargetHealth {
    let target = d.target();
    let health = d.target_health();
    domain::TargetHealth {
        target_id: target.and_then(|t| t.id()).unwrap_or_default().to_string(),
        port: target.and_then(|t| t.port()).map(|p| p.max(0) as u32),
        availability_zone: target.and_then(|t| t.availability_zone()).map(str::to_string),
        state: health
            .and_then(|h| h.state())
            .map(|s| s.as_str().to_string())
            .unwrap_or_default(),
        reason: health.and_then(|h| h.reason()).map(|r| r.as_str().to_string()),
        description: health.and_then(|h| h.description()).map(str::to_string),
    }
}
