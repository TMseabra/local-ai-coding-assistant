# Local AI Coding Assistant

**100% offline.** A coding assistant that runs entirely on your own machine, using a local LLM instead of a cloud API — no internet connection needed at any point, no data ever leaves the machine.

## Stack

- Ollama (or llama.cpp) for local model inference
- A code-focused model (e.g. Qwen2.5-Coder, DeepSeek-Coder)
- CLI and/or simple local web interface (Node.js / Python)

## Features

- Chat with a local model about your code
- Read local project files for context
- Works without an internet connection
- No API keys, no usage costs, no data leaving the machine

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
npm run dev                                # CLI chat in the current folder
npm run dev -- --dir ../my-project         # point it at another project
npm run web -- --dir ../my-project         # local web UI at http://127.0.0.1:3000
npm test                                   # run the tests (no Ollama needed)
```

There are no runtime dependencies: only Node.js 18+ and Ollama.

### CLI commands

| Command | What it does |
| --- | --- |
| `/add <file...>` | Add project files to the model's context |
| `/drop <file>` / `/drop all` | Remove files from the context |
| `/files` | Show the files in context |
| `/tree` | List the project's files |
| `/model [name]` / `/models` | Show/switch the model, list installed models |
| `/clear` | Forget the conversation (keeps files) |
| `/exit` | Quit |

Press Ctrl+C while a reply is streaming to stop it.

### Configuration

| Variable | Default |
| --- | --- |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` |
| `LAC_MODEL` | `qwen2.5-coder` |
| `LAC_PORT` (web UI) | `3000` |
| `LAC_MAX_FILE_BYTES` | `100000` |

## Project structure

```
src/ollama.js    streaming client for the local Ollama API
src/context.js   reads project files (skips node_modules, binaries, paths outside the project)
src/cli.js       interactive terminal chat
src/server.js    local web server (binds to 127.0.0.1 only)
public/          web UI (no CDN, works offline)
test/            node:test tests, including a fake Ollama server
```
