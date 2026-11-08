# M0 demo: FreeDuet on a free model

The M0 check (issue M0.9): `bash scripts/start.sh` opens FreeDuet, Iris answers in the main channel and every member answers in its own channel. Until the subscription router arrives in M1, the members need a model the server can call. This page runs them on a **free** one: a local model with Ollama, or a free model on OpenRouter. No paid API key is needed.

Written for Windows 11 with WSL2 (Ubuntu), Ollama on Windows and a GPU. Linux and macOS skip step 1.

## 1. Prepare WSL (once)

In `%USERPROFILE%\.wslconfig` on Windows (create it if missing), so Ubuntu can reach Ollama on Windows' `localhost`:

```ini
[wsl2]
networkingMode=mirrored
```

In Ubuntu, switch on systemd, which Docker needs (on the maintainer's computer it was off):

```bash
printf '[boot]\nsystemd=true\n' | sudo tee -a /etc/wsl.conf
```

Then, in PowerShell: `wsl --shutdown`, and open Ubuntu again. Two checks: `ps -p 1 -o comm=` prints `systemd`, and `curl -s http://localhost:11434/api/version` answers.

## 2. Install the tools inside Ubuntu (once)

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2 git unzip nodejs npm
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"          # then close and reopen the Ubuntu window
curl -fsSL https://bun.sh/install | bash # Bun, the JavaScript runtime FreeDuet uses
```

Docker Engine from Ubuntu's own packages is free and open source; Docker Desktop is not needed. All five packages are in Ubuntu 26.04 (checked 2026-11-08).

## 3. Get FreeDuet (private repository)

Use the GitHub sign-in already on Windows, then clone:

```bash
git config --global credential.helper "/mnt/c/Program\ Files/Git/mingw64/bin/git-credential-manager.exe"
git clone https://github.com/MarcoDeliaBot/freeduet.git ~/freeduet
cd ~/freeduet && git checkout m0-fork   # until the M0 pull request is merged
cp .env.example .env
```

## 4. CopilotKit Intelligence (free plan, required)

OpenDuet keeps conversations and memory in CopilotKit Intelligence; the server does not start without its key. From `~/freeduet`:

```bash
npx --yes copilotkit@latest login            # opens the browser: sign in or create the account
npx --yes copilotkit@latest project select   # writes the key into .env
bun openbot/scripts/setup-learning.ts        # copies it where the server reads it
```

## 5. Choose the model: add one block at the end of `.env`

**A. Ollama, on your own computer.** Free; nothing leaves the machine except what Intelligence stores. Use Ollama's **Anthropic-format** endpoint: Ollama's OpenAI Responses endpoint refuses the `item_reference` items that built-in members send from the second step of a turn on (found in the maintainer's demo, 2026-11-08).

```bash
BOT_PROVIDER=anthropic
ANTHROPIC_BASE_URL=http://localhost:11434
ANTHROPIC_API_KEY=ollama
BOT_MODEL=qwen3.6:35b
```

`qwen3.6:35b` is the strongest model already pulled on the maintainer's computer: on an RX 7900 XTX one answer takes about 1 to 3 minutes, and Ollama answers one request at a time. `qwen3.5:9b` answers faster. Any Ollama model that calls tools works.

**B. A free model on OpenRouter.** Free within OpenRouter's limits; the requests go to OpenRouter and the model's provider.

```bash
BOT_PROVIDER=openai
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=<your OpenRouter key>
BOT_MODEL=<a model id ending in :free that supports tools>
```

Pick the model on [openrouter.ai/models](https://openrouter.ai/models) filtered by "free" and "tools". OpenRouter offers the Responses API with tool calling ([docs](https://openrouter.ai/docs/api/reference/responses/overview.md)).

Only one block at a time. To switch, replace the block and restart.

## 6. Start and check

```bash
bash scripts/start.sh
```

Open `http://localhost:3010`, go through the short onboarding, then check and note the result in issue M0.9. To talk to one member: menu, Manage, Bots, the member, then "Message <name>".

| Check | Expected |
|---|---|
| Settings, at the bottom | An About section naming FreeDuet and the not-affiliated line |
| The FreeDuet channel | Iris answers |
| Each of the other 9 members, from its page | It answers |
| A conversation's name in the sidebar | Appears after a short while |

Notes:

- `start.sh` also starts OpenDuet's two sample Bots (`agent-bot`, `agent-langgraph`). FreeDuet's members do not use them; with profile A they cannot reach Ollama from their containers, and that does not affect the check.
- A small local model may not use every tool well. For M0 the members only need to answer.
- `CLAUDE_CODE_OAUTH_TOKEN` is ignored on purpose (docs/PROVIDERS.md). Your Claude plan joins in M1, through Claude Code signed in by you.

## If something does not work

Found while running this demo on the maintainer's computer on 2026-11-08.

| Symptom | Cause | Fix |
|---|---|---|
| `curl` of the Bun installer answers 504 | GitHub's download was unavailable | `sudo npm install -g bun` |
| `agent-computer never became ready`, while `docker compose ps` says healthy | Another WSL distribution has outbound firewall rules that reject private addresses; all WSL2 distributions share one network, so Docker's 172.16.0.0/12 bridges are unreachable | Put Docker on another range in `/etc/docker/daemon.json`: `{"bip": "198.19.255.1/24", "default-address-pools": [{"base": "198.18.0.0/16", "size": 24}]}`, then `docker compose down`, `docker network prune -f`, `sudo systemctl restart docker`. The other distribution's rules stay as they are |
| Ollama is not reachable from Ubuntu and `wsl --shutdown` is not an option (it would stop other distributions' services) | Mirrored networking needs a WSL restart | Run a small stdin/stdout bridge from Windows into Ubuntu on a free local port, and point `ANTHROPIC_BASE_URL` at it. The maintainer's demo used one on port 11437 |
| A member stops after its first step with `unknown input item type: "item_reference"` in `server.log` | Profile A was set to the OpenAI format | Use the Anthropic-format block above |
| `wsl: Failed to start the systemd user session` | Harmless warning | None |
