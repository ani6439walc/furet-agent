# Furet

Personal assistant Discord bot powered by Claude.

## Prerequisites

- Node.js >= 24
- npm

## Quick Start

```bash
git clone <repo-url> && cd furet

# install dependencies, register CLI, setup systemd service
npx tsx bin/furet.ts install
```

Install will:
1. `npm install`
2. Copy `config.example.yaml` → `config.yaml` and `.env.example` → `.env` (if not exist)
3. `npm link` to register the global `furet` command
4. Generate and enable a systemd service (`furet.service`)

After install, fill in your settings:

```bash
vim .env          # API keys, Discord token
vim config.yaml   # model, Discord options, journal, skills
```

Then start:

```bash
# manual
furet gateway

# or via systemd (auto-start on boot)
sudo systemctl start furet
```

## Commands

| Command | Description |
|---------|------------|
| `furet gateway` | Start Discord bot |
| `furet install` | Install dependencies + register systemd service |
| `furet` | Interactive CLI mode |

## Service Management

```bash
sudo systemctl status furet    # check status
sudo systemctl restart furet   # restart
sudo systemctl stop furet      # stop
journalctl -u furet -f         # view logs
```
