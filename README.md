# Local AI Coding Assistant

A coding assistant that runs entirely on your own machine, using a local LLM instead of a cloud API. Works fully offline.

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
npm run dev
```
