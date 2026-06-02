use std::collections::HashMap;
use std::path::PathBuf;

use crate::domain::{AwsProfile, ProfileKind, ProfileStatus};

type Section = HashMap<String, String>;

fn parse_ini(text: &str) -> Vec<(String, Section)> {
    let mut sections: Vec<(String, Section)> = Vec::new();
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
            continue;
        }
        if let Some(inner) = line.strip_prefix('[').and_then(|l| l.strip_suffix(']')) {
            sections.push((inner.trim().to_string(), Section::new()));
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            if let Some((_, section)) = sections.last_mut() {
                section.insert(key.trim().to_lowercase(), value.trim().to_string());
            }
        }
    }
    sections
}

fn profile_name(section_header: &str) -> Option<String> {
    if section_header == "default" {
        Some("default".to_string())
    } else {
        section_header
            .strip_prefix("profile ")
            .map(|rest| rest.trim().to_string())
    }
}

fn classify(section: &Section) -> ProfileKind {
    let has = |k: &str| section.contains_key(k);
    if has("credential_process") {
        ProfileKind::CredentialProcess
    } else if has("sso_session") || has("sso_start_url") || has("sso_account_id") {
        ProfileKind::Sso
    } else if has("role_arn") {
        ProfileKind::AssumeRole
    } else if has("mfa_serial") {
        ProfileKind::Mfa
    } else if has("aws_access_key_id") {
        ProfileKind::Static
    } else {
        ProfileKind::Unknown
    }
}

fn absorb(
    merged: &mut HashMap<String, Section>,
    order: &mut Vec<String>,
    header: &str,
    section: Section,
) {
    let Some(name) = profile_name(header) else {
        return;
    };
    let entry = merged.entry(name.clone()).or_insert_with(|| {
        order.push(name.clone());
        Section::new()
    });
    entry.extend(section);
}

pub fn parse_profiles(config: &str, credentials: &str) -> Vec<AwsProfile> {
    let mut merged: HashMap<String, Section> = HashMap::new();
    let mut order: Vec<String> = Vec::new();

    for (header, section) in parse_ini(config) {
        absorb(&mut merged, &mut order, &header, section);
    }
    // Credentials sections are raw profile names (no "profile " prefix).
    for (header, section) in parse_ini(credentials) {
        absorb(&mut merged, &mut order, &format!("profile {header}"), section);
    }

    order
        .into_iter()
        .map(|name| {
            let section = &merged[&name];
            AwsProfile {
                name,
                kind: classify(section),
                region_default: section.get("region").cloned(),
                account_id: section.get("sso_account_id").cloned(),
                status: ProfileStatus::Unresolved,
            }
        })
        .collect()
}

fn config_path() -> PathBuf {
    if let Ok(path) = std::env::var("AWS_CONFIG_FILE") {
        return PathBuf::from(path);
    }
    home_dir().join(".aws").join("config")
}

fn credentials_path() -> PathBuf {
    if let Ok(path) = std::env::var("AWS_SHARED_CREDENTIALS_FILE") {
        return PathBuf::from(path);
    }
    home_dir().join(".aws").join("credentials")
}

fn home_dir() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_default()
}

pub fn discover_profiles() -> Vec<AwsProfile> {
    let config = std::fs::read_to_string(config_path()).unwrap_or_default();
    let credentials = std::fs::read_to_string(credentials_path()).unwrap_or_default();
    parse_profiles(&config, &credentials)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn by_name<'a>(profiles: &'a [AwsProfile], name: &str) -> &'a AwsProfile {
        profiles.iter().find(|p| p.name == name).expect("profile present")
    }

    #[test]
    fn classifies_sso_session() {
        let config = "\
[profile prod]
sso_session = corp
sso_account_id = 111111111111
sso_role_name = Admin
region = us-east-1
";
        let profiles = parse_profiles(config, "");
        let prod = by_name(&profiles, "prod");
        assert!(matches!(prod.kind, ProfileKind::Sso));
        assert_eq!(prod.region_default.as_deref(), Some("us-east-1"));
        assert_eq!(prod.account_id.as_deref(), Some("111111111111"));
    }

    #[test]
    fn classifies_legacy_sso() {
        let config = "\
[profile legacy]
sso_start_url = https://example.awsapps.com/start
sso_region = us-east-1
sso_account_id = 222222222222
sso_role_name = Dev
";
        let profiles = parse_profiles(config, "");
        assert!(matches!(by_name(&profiles, "legacy").kind, ProfileKind::Sso));
    }

    #[test]
    fn classifies_assume_role() {
        let config = "\
[profile staging]
role_arn = arn:aws:iam::333333333333:role/Deployer
source_profile = default
region = us-west-2
";
        let profiles = parse_profiles(config, "");
        assert!(matches!(by_name(&profiles, "staging").kind, ProfileKind::AssumeRole));
    }

    #[test]
    fn classifies_credential_process() {
        let config = "\
[profile vault]
credential_process = /usr/local/bin/vault-creds
";
        let profiles = parse_profiles(config, "");
        assert!(matches!(by_name(&profiles, "vault").kind, ProfileKind::CredentialProcess));
    }

    #[test]
    fn classifies_mfa() {
        let config = "\
[profile secure]
mfa_serial = arn:aws:iam::444444444444:mfa/user
region = eu-west-1
";
        let profiles = parse_profiles(config, "");
        assert!(matches!(by_name(&profiles, "secure").kind, ProfileKind::Mfa));
    }

    #[test]
    fn static_from_credentials_file_merges_with_config() {
        let config = "\
[profile dev]
region = eu-central-1
";
        let credentials = "\
[dev]
aws_access_key_id = AKIAEXAMPLE
aws_secret_access_key = secret
";
        let profiles = parse_profiles(config, credentials);
        let dev = by_name(&profiles, "dev");
        assert!(matches!(dev.kind, ProfileKind::Static));
        assert_eq!(dev.region_default.as_deref(), Some("eu-central-1"));
    }

    #[test]
    fn default_profile_and_sso_session_block_handling() {
        let config = "\
[default]
region = us-east-1
aws_access_key_id = AKIADEFAULT

[sso-session corp]
sso_start_url = https://corp.awsapps.com/start
sso_region = us-east-1
";
        let profiles = parse_profiles(config, "");
        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].name, "default");
        assert!(matches!(profiles[0].kind, ProfileKind::Static));
    }

    #[test]
    fn ignores_comments_and_blank_lines() {
        let config = "\
# a comment
; another comment

[profile p]
  region = us-east-1

role_arn = arn:aws:iam::555555555555:role/R
";
        let profiles = parse_profiles(config, "");
        let p = by_name(&profiles, "p");
        assert!(matches!(p.kind, ProfileKind::AssumeRole));
        assert_eq!(p.region_default.as_deref(), Some("us-east-1"));
    }

    #[test]
    fn malformed_input_yields_no_panic() {
        let profiles = parse_profiles("[[[garbage", "= no key\nrandom text");
        assert!(profiles.is_empty());
    }
}
