use aws_config::retry::RetryConfig;

pub fn retry_config() -> RetryConfig {
    RetryConfig::adaptive().with_max_attempts(8)
}
