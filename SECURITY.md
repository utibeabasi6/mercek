# Security Policy

Mercek is a local-first desktop app: it runs on your machine, uses the AWS credentials
already in your `~/.aws` configuration, and talks to AWS directly. There is no Mercek
server in the path. Because it operates against real cloud infrastructure, we take
security seriously.

## Security posture

- **Read-only by default.** Browsing, metrics, logs, and topology are reads. Every
  write (scale, force-deploy, stop task, update service, rollback) is shown as a diff
  and requires explicit confirmation.
- **No credentials stored.** Mercek uses your existing AWS credential chain. Resolved
  secrets are masked to their ARNs in the UI and are never written to disk.
- **Read-only agent.** The optional agent panel can read and explain ECS state but
  cannot mutate AWS; any change it proposes goes through the same human confirmation.
- **No telemetry.** Mercek connects to your AWS account and nothing else.

## Supported versions

Only the latest minor release receives security updates.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Preferred: use GitHub's private reporting —
[Report a vulnerability](https://github.com/utibeabasi6/mercek/security/advisories/new).

Alternatively, email **utibeabasiumanah6@gmail.com**.

Please include:

- A description of the vulnerability and its impact
- Steps to reproduce
- The affected version(s)
- Your name / handle for credit (optional)

We will acknowledge receipt within 3 business days and aim to provide a fix or
mitigation plan within 14 days for confirmed vulnerabilities.
