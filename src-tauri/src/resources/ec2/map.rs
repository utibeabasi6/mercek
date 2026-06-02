use aws_sdk_ec2::types as ec2;

use crate::domain;

pub fn eni(n: &ec2::NetworkInterface) -> domain::EniDetail {
    domain::EniDetail {
        eni_id: n.network_interface_id().unwrap_or_default().to_string(),
        status: n.status().map(|s| s.as_str().to_string()),
        interface_type: n.interface_type().map(|t| t.as_str().to_string()),
        description: n.description().map(str::to_string),
        private_ip: n.private_ip_address().map(str::to_string),
        public_ip: n.association().and_then(|a| a.public_ip()).map(str::to_string),
        subnet_id: n.subnet_id().map(str::to_string),
        vpc_id: n.vpc_id().map(str::to_string),
        availability_zone: n.availability_zone().map(str::to_string),
        security_groups: n
            .groups()
            .iter()
            .map(|g| domain::SecurityGroupRef {
                id: g.group_id().unwrap_or_default().to_string(),
                name: g.group_name().map(str::to_string),
            })
            .collect(),
    }
}
