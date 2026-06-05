use aws_sdk_ec2::types as ec2;

use crate::domain;

// The `Name` tag, if present — what the console shows as a VPC/subnet's friendly name.
fn name_tag(tags: &[ec2::Tag]) -> Option<String> {
    tags.iter()
        .find(|t| t.key() == Some("Name"))
        .and_then(|t| t.value())
        .map(str::to_string)
}

pub fn vpc(v: &ec2::Vpc) -> domain::Vpc {
    domain::Vpc {
        id: v.vpc_id().unwrap_or_default().to_string(),
        cidr: v.cidr_block().map(str::to_string),
        is_default: v.is_default().unwrap_or(false),
        name: name_tag(v.tags()),
    }
}

pub fn subnet(s: &ec2::Subnet) -> domain::Subnet {
    domain::Subnet {
        id: s.subnet_id().unwrap_or_default().to_string(),
        vpc_id: s.vpc_id().unwrap_or_default().to_string(),
        availability_zone: s.availability_zone().map(str::to_string),
        cidr: s.cidr_block().map(str::to_string),
        name: name_tag(s.tags()),
    }
}

pub fn security_group(g: &ec2::SecurityGroup) -> domain::SecurityGroup {
    domain::SecurityGroup {
        id: g.group_id().unwrap_or_default().to_string(),
        vpc_id: g.vpc_id().unwrap_or_default().to_string(),
        name: g.group_name().map(str::to_string),
        description: g.description().map(str::to_string),
    }
}

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
