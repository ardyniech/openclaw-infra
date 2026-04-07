# OpenClaw Autonomous System — Feature Inventory

Last updated: 2026-04-08

## Core Infrastructure

- **Health Monitoring** (`monitoring/health_check.py`)
  - CPU, RAM, Disk, Temperature, Process count, Ollama API liveness
  - Logs to `~/logs/health/health_<timestamp>.json`

- **Self-Healing** (`monitoring/self_heal.py`)
  - Auto-actions: high CPU kill, RAM cache clear, disk cleanup, service restart, zombie reap, AI abuse kill
  - Integrated with health cycle

- **Cron Jobs** (system-wide)
  - `*/5 * * * *` health_cycle.sh
  - `0 */2 * * *` daily_report.py
  - `0 */6 * * *` sample_ml_agent.py (ML training)
  - `0 2 * * *` backup_config.sh
  - `0 3 * * *` log_rotate.sh

## Autonomous Layer (Node)

Modules run under systemd user timer + persistent event watcher:

1. **Predictor** (`predictor.js`)
   - Reads health logs from last 7 days
   - Detects trends in disk/CPU/memory
   - Outputs predictions (disk_critical, cpu_saturation, memory_pressure)
   - Notifies high-risk (≥80%) immediately

2. **Tuner** (`tuner.js`)
   - Adjusts resource limits based on predictions
   - Renices ML jobs (sample_ml_agent.py, torch, transformers) to nice 19
   - Sets ionice for gateway
   - Creates systemd user overrides for openclaw-gateway (CPUQuota, MemoryMax)
   - Runs max once per 24h (configurable)

3. **Logger** (`logger.js`)
   - Daily markdown reports in `~/logs/reports/report-<date>.md`
   - Decision log: `~/logs/decisions.log`
   - Summary of tuning actions and predictions

4. **Event Watcher** (`event_watcher.js`)
   - Real-time polling of latest health JSON (every 10s)
   - Triggers self-heal immediately on CRITICAL alerts
   - Runs as a persistent systemd service

5. **Capacity Planner** (`capacity_planner.js`)
   - Forecasts disk growth using linear regression on health data
   - Computes 0–100 health score (weighted CPU/RAM/disk)
   - Auto-enqueues urgent tasks when disk fills in ≤3 days or health score <50
   - Runs every 2 hours (configurable)

6. **Profile Learner** (`profile_learner.js`)
   - Analyzes chat history to learn user preferences (formality, tone, working hours)
   - Adjusts notification quiet hours accordingly
   - Runs once per day

7. **Queue Enricher** (`queue_enricher.js`)
   - Consumes predictions + capacity forecasts
   - Automatically adds preventive tasks to `~/workspace/queue.md`
   - Priority tags: `[!]` for urgent, `[ ]` for normal

8. **Queue Processor** (`queue_processor.js`)
   - Batch-executes tasks from `~/workspace/queue.md`
   - Supports manual user tasks and system-enqueued tasks
   - Marks tasks as `[x]` (success) or `[!]` (failed)
   - Notification on completion summary

9. **Orchestrator** (`orchestrator.js`)
   - Runs: predictor → tuner → logger → capacity → profile → enricher → queue
   - Triggered by `openclaw-autonomous.timer` every 5 minutes
   - Sends notifications (to `~/logs/notifications.log` for now)

## Notifications

Current: file-based (`~/logs/notifications.log`) with types:
- `orchestrator`: cycle status (healthy/degraded)
- `tuner`: action failures
- `predictor`: high-risk predictions
- `event`: auto-heal triggered/success/failure
- `logger`: new report generated
- `queue`: batch task summary

Telegram integration optional (requires bot token & channel setup).

## Task Queue

File: `~/workspace/queue.md`

Format:
```markdown
## Pending
- [ ] sudo apt update && apt upgrade -y
- [ ] /some/command

## Completed
- [x] previous task
```

System can auto-enqueue tasks from internal modules (future).

## Systemd User Units

- `openclaw-autonomous.timer` → oneshot service every 5 min
- `openclaw-autonomous.service` → runs orchestrator
- `openclaw-eventwatcher.service` → persistent real-time watcher

Location: `~/.config/systemd/user/`

## Backup Strategy

- Daily tar.gz created by `backup_config.sh` (cron @2 AM) to `~/openclaw-backup/`
- Includes: `~/.openclaw/`, `~/.config/systemd/user/`, `~/nullclaw/`, `crontab`, `sudoers` snippet
- Migration scripts: `backup-and-migrate.sh` (create), `restore-from-backup.sh` (restore)

---

**This document auto-updates** when new features are added by Deina.