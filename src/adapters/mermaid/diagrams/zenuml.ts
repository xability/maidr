/**
 * ZenUML sequence diagrams, drawn by Mermaid's `@mermaid-js/mermaid-zenuml`
 * plugin.
 *
 * The plugin hands Mermaid an empty parser -- ZenUML parses its own text
 * inside `@zenuml/core` -- so there is no database to read. The text is read
 * here instead, into the same `sequence` layer a Mermaid sequence diagram
 * becomes. The grammar read is the one Mermaid documents for ZenUML:
 * participants with annotators and aliases; sync, async, creation and reply
 * messages, nested in blocks; and the fragments (`while`, `for`, `loop`,
 * `if` / `else`, `opt`, `par`, `try` / `catch` / `finally`, `critical`,
 * `section`).
 */

import type { MaidrLayer, SequenceMessage, SequenceParticipant } from '@type/grammar';
import type { DiagramContext, DiagramConversion } from '../types';
import { TraceType } from '@type/grammar';
import { all, plain, selectorsFor } from '../read';

/** The participant a top-level sync message comes from, as ZenUML names it. */
const STARTER = '_STARTER_';

/** The fragment keywords, and the word each is announced with. */
const FRAGMENTS: Record<string, string> = {
  while: 'loop',
  for: 'loop',
  foreach: 'loop',
  loop: 'loop',
  if: 'alt',
  opt: 'opt',
  par: 'par',
  try: 'try',
  critical: 'critical',
  section: 'section',
  ref: 'ref',
};

/** The keywords that open the next section of the fragment just closed. */
const SECTION_WORDS = ['else if', 'else', 'catch', 'finally'];

/** One frame of the block stack: a call whose body is open, or a fragment. */
type Frame
  = | { kind: 'call'; caller: string; callee: string; reply?: string }
    | { kind: 'fragment'; label: string; base: string }
    | { kind: 'group' };

/**
 * Splits ZenUML text into statements and braces, dropping comments.
 *
 * A statement ends at a newline, a `;` or a brace; quotes protect all three,
 * so a message label may hold any of them.
 *
 * @param text - The diagram's text, without the `zenuml` keyword
 * @returns The statements, with `{` and `}` as tokens of their own
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: string | null = null;
  const flush = (): void => {
    const statement = current.trim();
    if (statement !== '') {
      tokens.push(statement);
    }
    current = '';
  };
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (quote !== null) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"') {
      quote = char;
      current += char;
    } else if (char === '/' && text[at + 1] === '/') {
      while (at < text.length && text[at] !== '\n') {
        at++;
      }
      flush();
    } else if (char === '\n' || char === ';') {
      flush();
    } else if (char === '{' || char === '}') {
      flush();
      tokens.push(char);
    } else {
      current += char;
    }
  }
  flush();
  return tokens;
}

/**
 * A name with its quotes removed.
 *
 * @param name - The name as written
 * @returns The name
 */
function unquote(name: string): string {
  return name.trim().replace(/^"(.*)"$/, '$1');
}

/**
 * Where a string occurs outside double quotes and brackets, or -1.
 *
 * @param text - Where to look
 * @param what - What to find
 * @returns Its index
 */
function indexOutside(text: string, what: string): number {
  let quoted = false;
  let depth = 0;
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (!quoted && depth === 0 && text.startsWith(what, at)) {
      return at;
    }
    if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && (char === '(' || char === '[' || char === '<')) {
      depth++;
    } else if (!quoted && (char === ')' || char === ']' || char === '>') && depth > 0 && text[at - 1] !== '-') {
      depth--;
    }
  }
  return -1;
}

/**
 * A keyword and its parenthesised condition: `while(ready)` or `opt`.
 *
 * @param statement - The statement
 * @returns The lower-cased keyword and the condition, when the statement is one
 */
function keywordOf(statement: string): { keyword: string; condition: string } | null {
  const lower = statement.toLowerCase();
  for (const word of [...SECTION_WORDS, ...Object.keys(FRAGMENTS)]) {
    if (!lower.startsWith(word)) {
      continue;
    }
    const rest = statement.slice(word.length).trim();
    if (rest === '') {
      return { keyword: word, condition: '' };
    }
    if (rest.startsWith('(') && rest.endsWith(')')) {
      return { keyword: word, condition: plain(rest.slice(1, -1)) };
    }
  }
  return null;
}

/** A message read off a statement. */
interface Call {
  /** The variable its reply is assigned to, when there is one. */
  assigned?: string;
  caller?: string;
  target: string;
  text: string;
  creates: boolean;
}

/**
 * Reads a sync or creation message:
 * `[Type] [var =] [Caller->] Target.method(args)` or `[var =] new Target(args)`.
 *
 * @param statement - The statement
 * @returns The message, or null when the statement is not one
 */
function callOf(statement: string): Call | null {
  let rest = statement;
  let assigned: string | undefined;
  const equals = indexOutside(rest, '=');
  if (equals > 0 && rest[equals + 1] !== '=' && !rest.slice(0, equals).includes('->')) {
    const left = rest.slice(0, equals).trim().split(/\s+/);
    assigned = left[left.length - 1];
    rest = rest.slice(equals + 1).trim();
  }
  let caller: string | undefined;
  const arrow = indexOutside(rest, '->');
  if (arrow > 0) {
    caller = unquote(rest.slice(0, arrow));
    rest = rest.slice(arrow + 2).trim();
  }
  if (/^new\s/i.test(rest)) {
    const body = rest.slice(3).trim();
    const paren = body.indexOf('(');
    const target = unquote(paren < 0 ? body : body.slice(0, paren));
    return target ? { assigned, caller, target, text: `new ${body}`, creates: true } : null;
  }
  const paren = indexOutside(rest, '(');
  const head = paren < 0 ? rest : rest.slice(0, paren);
  const dot = head.lastIndexOf('.');
  if (dot <= 0 || /\s/.test(head.slice(dot + 1)) || (paren >= 0 && !rest.endsWith(')'))) {
    return null;
  }
  const target = unquote(head.slice(0, dot));
  const method = head.slice(dot + 1);
  if (!target || !method || /\s/.test(target.replace(/^".*"$/, ''))) {
    return null;
  }
  return { assigned, caller, target, text: `${method}${paren < 0 ? '' : rest.slice(paren)}`, creates: false };
}

/**
 * Reads an async message: `[Caller->] Target: text`.
 *
 * @param statement - The statement
 * @returns The ends and text, or null when the statement is not one
 */
function asyncOf(statement: string): { caller?: string; target: string; text: string } | null {
  const colon = indexOutside(statement, ':');
  if (colon <= 0) {
    return null;
  }
  const head = statement.slice(0, colon);
  const arrow = indexOutside(head, '->');
  const target = unquote(arrow < 0 ? head : head.slice(arrow + 2));
  const caller = arrow < 0 ? undefined : unquote(head.slice(0, arrow));
  if (!target || /\s/.test(target) || target.includes('.')) {
    return null;
  }
  return { caller, target, text: statement.slice(colon + 1).trim() };
}

/**
 * Reads a participant declaration: `[@Annotator] Name [as Label]`.
 *
 * @param statement - The statement
 * @returns The participant, or null when the statement is not one
 */
function participantOf(statement: string): { id: string; kind?: string; label?: string } | null {
  let rest = statement;
  let kind: string | undefined;
  if (rest.startsWith('@')) {
    const space = rest.search(/\s/);
    if (space < 0) {
      return null;
    }
    kind = rest.slice(1, space).toLowerCase();
    rest = rest.slice(space).trim();
  }
  const as = rest.search(/\sas\s/);
  const id = unquote(as < 0 ? rest : rest.slice(0, as));
  if (!id || (/\s/.test(id) && !rest.startsWith('"')) || /[(){}:=]/.test(id)) {
    return null;
  }
  const label = as < 0 ? undefined : unquote(rest.slice(as + 4));
  return { id, ...(kind ? { kind } : {}), ...(label ? { label } : {}) };
}

/**
 * Reads ZenUML text into participants and messages.
 *
 * @param source - The diagram's text, `zenuml` keyword included
 * @returns The diagram's title, participants and messages
 */
export function parseZenUml(source: string): {
  title?: string;
  participants: SequenceParticipant[];
  messages: SequenceMessage[];
} {
  const text = source.replace(/^\s*zenuml\b/, '');
  const tokens = tokenize(text);
  const participants: SequenceParticipant[] = [];
  const messages: SequenceMessage[] = [];
  const stack: Frame[] = [];
  let title: string | undefined;
  let replyNext = false;
  let starter = STARTER;
  let lastClosed: { label: string; base: string } | null = null;

  const declare = (id: string, extra: Partial<SequenceParticipant> = {}): string => {
    const key = unquote(id);
    const existing = participants.find(one => String(one.id) === key);
    if (existing) {
      Object.assign(existing, extra);
    } else {
      participants.push({ id: key, ...extra });
    }
    return key;
  };
  const fragments = (): string[] =>
    stack.filter((frame): frame is Extract<Frame, { kind: 'fragment' }> => frame.kind === 'fragment')
      .map(frame => frame.label);
  const current = (): string => {
    for (let at = stack.length - 1; at >= 0; at--) {
      const frame = stack[at];
      if (frame.kind === 'call') {
        return frame.callee;
      }
    }
    return starter;
  };
  const push = (message: SequenceMessage): void => {
    const inside = fragments();
    messages.push(inside.length > 0 ? { ...message, fragments: inside } : message);
  };

  for (let at = 0; at < tokens.length; at++) {
    const token = tokens[at];
    if (token === '}') {
      const frame = stack.pop();
      lastClosed = frame?.kind === 'fragment' ? { label: frame.label, base: frame.base } : null;
      if (frame?.kind === 'call' && frame.reply) {
        push({ from: frame.callee, to: frame.caller, text: frame.reply, kind: 'reply' });
      }
      continue;
    }
    if (token === '{') {
      // A brace on a line of its own opens a block for nothing named.
      stack.push({ kind: 'group' });
      continue;
    }
    const opens = tokens[at + 1] === '{';
    if (opens) {
      at++;
    }
    const closed = lastClosed;
    lastClosed = null;

    const keyword = opens ? keywordOf(token) : null;
    if (keyword && SECTION_WORDS.includes(keyword.keyword)) {
      const base = closed?.base ?? 'alt';
      const condition = keyword.condition ? ` ${keyword.condition}` : '';
      stack.push({ kind: 'fragment', label: `${base}, ${keyword.keyword}${condition}`, base });
      continue;
    }
    if (keyword) {
      const base = FRAGMENTS[keyword.keyword];
      const condition = keyword.condition ? ` ${keyword.condition}` : '';
      stack.push({ kind: 'fragment', label: `${base}${condition}`, base });
      continue;
    }
    const lower = token.toLowerCase();
    if (opens && (lower === 'group' || lower.startsWith('group '))) {
      stack.push({ kind: 'group' });
      continue;
    }
    if (lower.startsWith('title ')) {
      title = plain(token.slice('title '.length));
      continue;
    }
    if (lower.startsWith('@starter(') && token.endsWith(')')) {
      starter = declare(token.slice('@starter('.length, -1));
      continue;
    }
    if (lower === '@return' || lower === '@reply') {
      replyNext = true;
      continue;
    }
    if (lower === 'return' || lower.startsWith('return ')) {
      const frame = [...stack].reverse().find((one): one is Extract<Frame, { kind: 'call' }> => one.kind === 'call');
      push({ from: current(), to: frame?.caller ?? starter, text: plain(unquote(token.slice('return'.length))), kind: 'reply' });
      continue;
    }

    const asyncMessage = token.startsWith('@') ? null : asyncOf(token);
    if (asyncMessage) {
      const from = asyncMessage.caller ? declare(asyncMessage.caller) : current();
      const to = declare(asyncMessage.target);
      push({ from, to, text: plain(unquote(asyncMessage.text)), kind: replyNext ? 'reply' : 'async' });
      replyNext = false;
      continue;
    }

    const call = token.startsWith('@') ? null : callOf(token);
    if (call) {
      const from = call.caller ? declare(call.caller) : current();
      const to = declare(call.target);
      push({ from, to, text: plain(call.text), kind: call.creates ? 'create' : 'sync' });
      if (opens) {
        stack.push({ kind: 'call', caller: from, callee: to, ...(call.assigned ? { reply: call.assigned } : {}) });
      } else if (call.assigned) {
        push({ from: to, to: from, text: call.assigned, kind: 'reply' });
      }
      replyNext = false;
      continue;
    }

    const participant = opens ? null : participantOf(token);
    if (participant) {
      declare(participant.id, {
        ...(participant.kind ? { kind: participant.kind } : {}),
        ...(participant.label ? { label: participant.label } : {}),
      });
      continue;
    }
    if (opens) {
      stack.push({ kind: 'group' });
    }
  }

  // The starter is drawn only when a message comes from it.
  const starterUsed = messages.some(message => message.from === STARTER || message.to === STARTER);
  if (starterUsed) {
    participants.unshift({ id: STARTER, label: 'Starter' });
  }
  return { ...(title ? { title } : {}), participants, messages };
}

/**
 * ZenUML diagrams, read from their text into a sequence layer.
 *
 * @param context - The diagram
 * @returns The conversion
 */
export function zenuml(context: DiagramContext): DiagramConversion {
  const { title, participants, messages } = parseZenUml(context.text ?? '');
  if (messages.length === 0 && participants.length === 0) {
    return { layers: [] };
  }
  // The plugin draws each message and each reply as a group, in the order
  // they happen; fragments and occurrences are drawn apart from them.
  const drawn = all(context.svg, 'g.message, g.return, g.creation');
  const selectors = drawn.length === messages.length ? selectorsFor(drawn) : undefined;
  const layer: MaidrLayer = {
    id: context.layerId('sequence'),
    type: TraceType.SEQUENCE,
    ...(selectors ? { selectors } : {}),
    data: { participants, messages },
  };
  return { layers: [layer], ...(title ? { title } : {}) };
}
