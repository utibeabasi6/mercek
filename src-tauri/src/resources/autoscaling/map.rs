use aws_sdk_applicationautoscaling::types as aas;

use crate::domain;

pub fn scalable_target(t: &aas::ScalableTarget) -> domain::ScalingTarget {
    domain::ScalingTarget {
        resource_id: t.resource_id().to_string(),
        service_namespace: t.service_namespace().as_str().to_string(),
        scalable_dimension: t.scalable_dimension().as_str().to_string(),
        min_capacity: t.min_capacity().max(0) as u32,
        max_capacity: t.max_capacity().max(0) as u32,
        role_arn: Some(t.role_arn().to_string()),
    }
}

pub fn scaling_policy(p: &aas::ScalingPolicy) -> domain::ScalingPolicy {
    let tt = p.target_tracking_scaling_policy_configuration();
    domain::ScalingPolicy {
        name: p.policy_name().to_string(),
        policy_arn: p.policy_arn().to_string(),
        kind: p.policy_type().as_str().to_string(),
        resource_id: p.resource_id().to_string(),
        scalable_dimension: p.scalable_dimension().as_str().to_string(),
        predefined_metric: tt
            .and_then(|c| c.predefined_metric_specification())
            .map(|m| m.predefined_metric_type().as_str().to_string()),
        target_value: tt.map(|c| c.target_value()),
        scale_in_cooldown: tt.and_then(|c| c.scale_in_cooldown()),
        scale_out_cooldown: tt.and_then(|c| c.scale_out_cooldown()),
    }
}
