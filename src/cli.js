#!/usr/bin/env node
// Interactive terminal chat with a local model. Usage: npm run dev -- [--dir <project>] [--model <name>]
import readline from 'node:readline';
import path from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { config, SYSTEM_PROMPT } from './config.js';
import { chat, listModels, tokensPerSecond, OllamaError } from './ollama.js';
import { listProjectFiles, readContextFile, buildMessages } from './context.js';

const color = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

function parseArgs(argv) {
  const args = { dir: process.cwd(), model: config.model };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir') args.dir = path.resolve(argv[++i]);
    else if (argv[i] === '--model') args.model = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
  }
  return args;
}

const HELP = `Commands:
  /add <file...>   add files to the context (relative to the project dir)
  /drop <file>     remove a file from the context (/drop all to clear)
  /files           list files currently in context
  /tree            list the project's files
  /model [name]    show or switch the model
  /models          list models installed in Ollama
  /clear           forget the conversation (keeps files)
  /help            show this help
  /exit            quit
Anything else is sent to the model.`;

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log('Usage: npm run dev -- [--dir <project>] [--model <name>]\n\n' + HELP);
  process.exit(0);
}

const state = { model: args.model, root: args.dir, files: [], history: [] };

async function addFiles(paths) {
  for (const p of paths) {
    try {
      const file = await readContextFile(state.root, p);
      state.files = state.files.filter((f) => f.path !== file.path).concat(file);
      console.log(color.green(`+ ${file.path}`) + (file.truncated ? color.dim(' (truncated)') : ''));
    } catch (err) {
      console.log(color.red(`! ${err.code === 'ENOENT' ? `File not found: ${p}` : err.message}`));
    }
  }
}

async function handleCommand(line) {
  const [cmd, ...rest] = line.slice(1).split(/\s+/).filter(Boolean);
  switch (cmd) {
    case 'add':
      if (!rest.length) console.log('Usage: /add <file...>');
      else await addFiles(rest);
      break;
    case 'drop':
      if (rest[0] === 'all') state.files = [];
      else state.files = state.files.filter((f) => f.path !== rest[0]);
      console.log(color.dim(`${state.files.length} file(s) in context`));
      break;
    case 'files':
      console.log(state.files.length ? state.files.map((f) => `  ${f.path}`).join('\n') : color.dim('No files in context.'));
      break;
    case 'tree': {
      const files = await listProjectFiles(state.root);
      console.log(files.map((f) => `  ${f}`).join('\n') || color.dim('No files found.'));
      break;
    }
    case 'model':
      if (rest[0]) state.model = rest[0];
      console.log(`Model: ${state.model}`);
      break;
    case 'models':
      console.log((await listModels()).map((m) => `  ${m}`).join('\n') || color.dim('No models installed.'));
      break;
    case 'clear':
      state.history = [];
      console.log(color.dim('Conversation cleared.'));
      break;
    case 'help':
      console.log(HELP);
      break;
    case 'exit':
    case 'quit':
      return false;
    default:
      console.log(color.red(`Unknown command: /${cmd}. Type /help.`));
  }
  return true;
}

async function ask(question) {
  state.history.push({ role: 'user', content: question });
  const controller = new AbortController();
  const onSigint = () => controller.abort();
  process.once('SIGINT', onSigint);
  try {
    const { reply, stats } = await chat({
      model: state.model,
      messages: buildMessages(SYSTEM_PROMPT, state.files, state.history),
      onToken: (t) => output.write(t),
      signal: controller.signal,
    });
    state.history.push({ role: 'assistant', content: reply });
    const tps = tokensPerSecond(stats);
    output.write('\n' + (tps ? color.dim(`[${stats.evalCount} tokens, ${tps.toFixed(1)} tok/s]\n`) : ''));
  } catch (err) {
    state.history.pop();
    if (err.name === 'AbortError') console.log(color.dim('\n[interrupted]'));
    else throw err;
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
}

async function main() {
  console.log(color.cyan('Local AI Coding Assistant') + color.dim(` — model: ${state.model}, project: ${state.root}`));
  try {
    const models = await listModels();
    if (!models.some((m) => m === state.model || m.startsWith(`${state.model}:`))) {
      console.log(color.red(`Model "${state.model}" is not installed. Run: ollama pull ${state.model}`));
    }
  } catch (err) {
    console.log(color.red(err.message));
  }
  console.log(color.dim('Type /help for commands.\n'));

  const rl = readline.createInterface({ input, output, prompt: color.cyan('> ') });
  rl.on('SIGINT', () => rl.close());
  rl.prompt();
  // The async iterator buffers lines typed (or piped) while a reply is streaming.
  for await (const raw of rl) {
    const line = raw.trim();
    try {
      if (line.startsWith('/')) {
        if (!(await handleCommand(line))) break;
      } else if (line) {
        await ask(line);
      }
    } catch (err) {
      console.log(color.red(err instanceof OllamaError ? err.message : `Error: ${err.message}`));
    }
    rl.prompt();
  }
  rl.close();
}

main();
