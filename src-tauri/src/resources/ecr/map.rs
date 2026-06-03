use aws_sdk_ecr::types as ecr;
use aws_smithy_types::date_time::Format;

use crate::domain::ImageScan;

pub fn image_scan(repository: &str, reference: &str, detail: Option<&ecr::ImageDetail>) -> ImageScan {
    let mut scan = ImageScan {
        repository: repository.to_string(),
        reference: reference.to_string(),
        ..Default::default()
    };
    let Some(d) = detail else { return scan };

    scan.registry_id = d.registry_id().map(str::to_string);
    scan.scan_status = d
        .image_scan_status()
        .and_then(|s| s.status())
        .map(|s| s.as_str().to_string());

    if let Some(summary) = d.image_scan_findings_summary() {
        scan.scanned_at = summary
            .image_scan_completed_at()
            .and_then(|t| t.fmt(Format::DateTime).ok());
        if let Some(counts) = summary.finding_severity_counts() {
            for (sev, n) in counts {
                let n = (*n).max(0) as u32;
                match sev.as_str() {
                    "CRITICAL" => scan.critical = n,
                    "HIGH" => scan.high = n,
                    "MEDIUM" => scan.medium = n,
                    "LOW" => scan.low = n,
                    "INFORMATIONAL" => scan.informational = n,
                    _ => scan.undefined += n,
                }
            }
        }
    }
    scan
}
