# Local AI Coding Assistant

[![Test](https://github.com/Tgalao/local-ai-coding-assistant/actions/workflows/test.yml/badge.svg)](https://github.com/Tgalao/local-ai-coding-assistant/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**100% offline.** A coding assistant that runs entirely on your own machine, using a local LLM instead of a cloud API — no internet connection needed at any point, no data ever leaves the machine.

## Stack

- Ollama (or llama.cpp) for local model inference
- A code-focused model (e.g. Qwen2.5-Coder, DeepSeek-Coder)
- CLI, desktop app (Electron), and a local web interface

## Features

- Chat with a local model about your code
- Read local project files for context
- Works without an internet connection
- No API keys, no usage costs, no data leaving the machine
- Desktop app window, or a terminal CLI, or a browser tab — same assistant, three ways in

## What this project demonstrates

Local LLM inference, prompt engineering without a cloud dependency, working with CLI tools and local APIs

## Development roadmap

1. Idea
2. Planning
3. Set up local model (Ollama) and test inference speed/quality
4. Build CLI interface
5. Add file/context reading
6. Git / Branches
7. Testing
8. README
9. Screenshots
10. Demo

## Running locally

Prerequisites: Ollama installed, with a code model pulled (e.g. `ollama pull qwen2.5-coder`).

```bash
npm install
npm run app                                # desktop app window
npm run dev                                # CLI chat in the current folder
npm run dev -- --dir ../my-project         # point it at another project
npm run web -- --dir ../my-project         # local web UI at http://127.0.0.1:3000
npm test                                   # run the tests (no Ollama needed)
```

Runtime dependencies: only Node.js 18+ and Ollama. Electron is a dev-only dependency, used just for the desktop app window (`npm run app`); the CLI and web UI don't need it.

### Desktop app

`npm run app` opens the assistant in its own window instead of a browser tab or a terminal. For a one-click launch, there's a `Local AI Coding Assistant.vbs` file in the project root — double-click it (or make a shortcut to it, e.g. on the Desktop) to start the app with no console window. It opens the project folder it's launched from; pass a path as an argument to point it at a different project.

### Switching models

The model is never fixed to one value: `LAC_MODEL`/`--model` just set the starting default. Pick any other installed model at any time:

- **CLI**: `/model <name>` to switch, `/models` to list what's installed (e.g. `/model huihui_ai/qwen3-abliterated:8b`).
- **Web UI / desktop app**: the dropdown at the top of the sidebar lists every model Ollama has installed.

If Ollama can't be reached, both fall back to showing `qwen2.5-coder` and `huihui_ai/qwen3-abliterated:8b` so the picker isn't empty — you just can't chat until Ollama's back up.

Each saved conversation records which model answered it (shown in `/conversations` and restored when you `/load` one, or click one in the web sidebar).

### Reasoning models (Qwen3 and similar)

Some models wrap their chain-of-thought in `<think>...</think>` before the real answer. It's hidden by default:

- **CLI**: `/think` toggles showing it; `/nothink` toggles sending `/no_think` (Qwen3's own flag to skip reasoning entirely, when the model supports it).
- **Web UI / desktop app**: the "🧠 Show thinking" and "⚡ /no_think" checkboxes above the file list do the same. Shown reasoning renders as a collapsible "🧠 Thinking" block.

Whatever was reasoned is never sent back as context on the next turn, whether or not it was shown.

### CLI commands

| Command | What it does |
| --- | --- |
| `/add <file...>` | Add project files to the model's context |
| `/drop <file>` / `/drop all` | Remove files from the context |
| `/files` | Show the files in context |
| `/tree` | List the project's files |
| `/model [name]` / `/models` | Show/switch the model, list installed models |
| `/think` / `/nothink` | Toggle showing `<think>` reasoning / sending `/no_think` |
| `/clear` | Forget the conversation (keeps files) |
| `/save [title]` | Save the current conversation (and which model answered it) |
| `/conversations` / `/load <index\|id>` | List / resume a saved conversation |
| `/exit` | Quit |

Press Ctrl+C while a reply is streaming to stop it.

### Configuration

| Variable | Default |
| --- | --- |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` |
| `LAC_MODEL` | `qwen2.5-coder` |
| `LAC_PORT` (web UI) | `3000` |
| `LAC_MAX_FILE_BYTES` | `100000` |
| `LAC_NUM_CTX` | `8192` (context window requested from Ollama) |

## Project structure

```
src/ollama.js          streaming client for the local Ollama API
src/context.js         reads project files (skips node_modules, binaries, paths outside the project)
src/conversations.js   save/list/load/delete conversations as JSON (.lac-conversations/)
src/thinking.js        hides/reveals <think>...</think> reasoning, streaming-safe
src/cli.js             interactive terminal chat
src/server.js          local web server (binds to 127.0.0.1 only)
public/                web UI (no CDN, works offline)
electron/              desktop app shell (npm run app)
test/                  node:test tests, including a fake Ollama server
```
