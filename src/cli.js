#!/usr/bin/env node
// Interactive terminal chat with a local model. Usage: npm run dev -- [--dir <project>] [--model <name>]
import readline from 'node:readline';
import path from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { config, SYSTEM_PROMPT } from './config.js';
import { chat, listModelsWithFallback, tokensPerSecond, OllamaError } from './ollama.js';
import { listProjectFiles, readContextFile, buildMessages } from './context.js';
import { saveConversation, listConversations, loadConversation } from './conversations.js';
import { stripThinking, createThinkingFilter, withNoThink } from './thinking.js';

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
  /add <file...>     add files to the context (relative to the project dir)
  /drop <file>       remove a file from the context (/drop all to clear)
  /files             list files currently in context
  /tree              list the project's files
  /model [name]      show or switch the model
  /models            list models installed in Ollama
  /think             toggle showing the model's <think> reasoning (off by default)
  /nothink           toggle sending /no_think (Qwen3: skip reasoning entirely)
  /clear             forget the conversation (keeps files)
  /save [title]      save the current conversation to disk (records the model used)
  /conversations     list saved conversations
  /load <index|id>   load a saved conversation (see /conversations)
  /help              show this help
  /exit              quit
Anything else is sent to the model. Press Ctrl+C while a reply is streaming
to stop it — your question stays, so you can follow up right away.`;

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log('Usage: npm run dev -- [--dir <project>] [--model <name>]\n\n' + HELP);
  process.exit(0);
}

const state = { model: args.model, root: args.dir, files: [], history: [], showThinking: false, noThink: false, conversationId: null };
let activeAbort = null;
let lastConversationList = [];

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
    case 'models': {
      const { models, offline } = await listModelsWithFallback();
      console.log(models.map((m) => `  ${m}`).join('\n') || color.dim('No models installed.'));
      if (offline) console.log(color.dim('(Ollama unreachable — showing a fallback list, not what\'s actually installed)'));
      break;
    }
    case 'think':
      state.showThinking = !state.showThinking;
      console.log(color.dim(`Show <think> reasoning: ${state.showThinking ? 'on' : 'off'}`));
      break;
    case 'nothink':
      state.noThink = !state.noThink;
      console.log(color.dim(`/no_think (skip reasoning, Qwen3): ${state.noThink ? 'on' : 'off'}`));
      break;
    case 'clear':
      state.history = [];
      state.conversationId = null; // next /save starts a new conversation, not an update
      console.log(color.dim('Conversation cleared.'));
      break;
    case 'save':
      try {
        // Already saved this one before (loaded it, or saved it earlier in
        // this session)? Update that same file instead of making a copy.
        const saved = await saveConversation(state.root, {
          id: state.conversationId,
          title: rest.join(' '),
          model: state.model,
          messages: state.history,
        });
        state.conversationId = saved.id;
        console.log(color.green(`Saved "${saved.title}" (${saved.id}, model: ${state.model})`));
      } catch (err) {
        console.log(color.red(err.message));
      }
      break;
    case 'conversations':
      lastConversationList = await listConversations(state.root);
      if (!lastConversationList.length) {
        console.log(color.dim('No saved conversations.'));
      } else {
        lastConversationList.forEach((c, i) => {
          console.log(`  [${i}] ${c.title} ${color.dim(`— ${c.messageCount} msgs, ${new Date(c.createdAt).toLocaleString()}`)}`);
        });
      }
      break;
    case 'load': {
      if (!lastConversationList.length) lastConversationList = await listConversations(state.root);
      const idx = Number(rest[0]);
      const target = Number.isInteger(idx) && lastConversationList[idx]
        ? lastConversationList[idx]
        : lastConversationList.find((c) => c.id === rest[0]);
      if (!target) {
        console.log(color.red('Not found. Run /conversations first, then /load <index>.'));
      } else {
        const data = await loadConversation(state.root, target.id);
        state.history = data.messages;
        state.conversationId = data.id; // further /save updates this conversation, not a new one
        if (data.model) state.model = data.model;
        console.log(color.green(`Loaded "${data.title}" (${data.messages.length} messages${data.model ? `, model: ${data.model}` : ''})`));
      }
      break;
    }
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
  const outgoing = buildMessages(SYSTEM_PROMPT, state.files, state.history);
  if (state.noThink) {
    const last = outgoing[outgoing.length - 1];
    outgoing[outgoing.length - 1] = { ...last, content: withNoThink(last.content) };
  }

  const controller = new AbortController();
  activeAbort = controller;
  let partial = '';
  const thinkFilter = createThinkingFilter({ showThinking: state.showThinking });
  try {
    const { reply, stats } = await chat({
      model: state.model,
      messages: outgoing,
      onToken: (t) => {
        partial += t;
        const visible = thinkFilter(t);
        if (visible) output.write(visible);
      },
      signal: controller.signal,
    });
    // What goes back into history (and gets re-sent as context next turn) is
    // always the clean answer, regardless of whether /think is showing it —
    // old reasoning tokens shouldn't be replayed into the model.
    state.history.push({ role: 'assistant', content: stripThinking(reply) });
    const tps = tokensPerSecond(stats);
    output.write('\n' + (tps ? color.dim(`[${stats.evalCount} tokens, ${tps.toFixed(1)} tok/s]\n`) : ''));
  } catch (err) {
    if (err.name === 'AbortError') {
      // Ctrl+C: keep the question (and whatever the model had said so far) so
      // the conversation can continue right away instead of starting over.
      const visiblePartial = stripThinking(partial);
      if (visiblePartial) state.history.push({ role: 'assistant', content: visiblePartial });
      output.write(color.dim('\n[stopped — type your next message]\n'));
    } else {
      state.history.pop();
      throw err;
    }
  } finally {
    activeAbort = null;
  }
}

async function main() {
  console.log(color.cyan('Local AI Coding Assistant') + color.dim(` — model: ${state.model}, project: ${state.root}`));
  const { models, offline } = await listModelsWithFallback();
  if (offline) {
    console.log(color.red(`Could not reach Ollama at ${config.ollamaHost}. Is it running? (start it with "ollama serve")`));
  } else if (!models.some((m) => m === state.model || m.startsWith(`${state.model}:`))) {
    console.log(color.red(`Model "${state.model}" is not installed. Run: ollama pull ${state.model}`));
  }
  console.log(color.dim('Type /help for commands.\n'));

  const rl = readline.createInterface({ input, output, prompt: color.cyan('> ') });
  // Ctrl+C stops a streaming reply if one is running; otherwise it quits, as usual.
  rl.on('SIGINT', () => {
    if (activeAbort) activeAbort.abort();
    else rl.close();
  });
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
