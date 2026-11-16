import { Marked } from './vendor/marked/marked.esm.js';

const marked = new Marked();
const { Lexer, Parser, Tokenizer } = marked;

// Each guard is a necessary first character of the original grammar.
// Keep emphasis methods intact: Marked uses their identity for mask handling.
class FastTokenizer extends Tokenizer {
  list(src) {
    const ch = src.charCodeAt(0);
    if (ch === 32 || ch === 42 || ch === 43 || ch === 45 || (ch >= 48 && ch <= 57)) {
      return super.list(src);
    }
  }
  escape(src) {
    if (src.charCodeAt(0) === 92) return super.escape(src);
  }
  tag(src) {
    if (src.charCodeAt(0) === 60) return super.tag(src);
  }
  link(src) {
    const ch = src.charCodeAt(0);
    if (ch === 91 || ch === 33) return super.link(src);
  }
  reflink(src, links) {
    const ch = src.charCodeAt(0);
    if (ch === 91 || ch === 33) return super.reflink(src, links);
  }
  codespan(src) {
    if (src.charCodeAt(0) !== 96) return;
    const match = this.rules.inline.code.exec(src);
    if (!match) return;
    let text = match[2];
    if (text.includes('\n')) text = text.replace(/\n/g, ' ');
    if (text.charCodeAt(0) === 32 && text.charCodeAt(text.length - 1) === 32
      && /[^ ]/.test(text)) text = text.slice(1, -1);
    return { type: 'codespan', raw: match[0], text };
  }
  br(src) {
    const ch = src.charCodeAt(0);
    if (ch === 32 || ch === 92) return super.br(src);
  }
  autolink(src) {
    if (src.charCodeAt(0) === 60) return super.autolink(src);
  }
  inlineText(src) {
    // No email can match without @. Removing its repeated lookaheads prevents
    // scanning the same long word again at each possible text boundary.
    if (src.includes('@')) return super.inlineText(src);
    const match = noEmailText.exec(src);
    if (!match) return;
    const raw = match[0];
    const escaped = this.lexer.state.inRawBlock;
    let text = raw;
    const rules = this.rules.other;
    if (!escaped && rules.numericCharacterReference.test(raw)) {
      text = raw.replace(rules.numericCharacterReferenceOrAmpersand,
        (entity, decimal, hex) => {
          if (decimal === undefined && hex === undefined) return '&amp;';
          const code = Number.parseInt(decimal ?? hex, decimal === undefined ? 16 : 10);
          if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '\uFFFD';
          return code === 38 ? '&amp;' : String.fromCodePoint(code);
        });
    }
    return { type: 'text', raw, text, escaped };
  }
}

// Same GFM boundaries as Marked, with the two email branches omitted.
const noEmailText = /^(?:[^a-zA-Z0-9](?=(?:mailto|xmpp):)|(`+|~+|[^`~])(?:(?=[`~])|(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*~_]|[hH][tT][tT][pP][sS]?|[fF][tT][pP]:\/\/|(?<![^\s*_~(])www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9](?=(?:mailto|xmpp):))))/;
// Exclude all inline syntax, numeric entities and possible GFM autolinks.
const inlineSyntax = /[\\`*_[\]~<&\n:@]|www\./i;
const emphasisSyntax = /[*_~]/;
class FastLexer extends Lexer {
  inlineTokens(src, tokens = []) {
    if (!inlineSyntax.test(src)) {
      if (src) {
        tokens.push({
          type: 'text', raw: src, text: src,
          escaped: this.state.inRawBlock,
        });
      }
      return tokens;
    }
    // Emphasis needs Marked's delimiter masks and previous-character tracking.
    // Other inline forms can dispatch directly without constructing those masks.
    if (emphasisSyntax.test(src)) return super.inlineTokens(src, tokens);
    const tokenizer = this.tokenizer;
    tokenizer.lexer = this;
    const parens = this.state.linkParenPossible;
    this.state.linkParenPossible = parens && src.includes(')');
    try {
      while (src) {
        const ch = src.charCodeAt(0);
        let token;
        let merge = false;
        if (ch === 92) token = tokenizer.escape(src);
        if (!token && ch === 60) token = tokenizer.tag(src);
        if (!token && (ch === 91 || ch === 33)) {
          token = tokenizer.link(src);
          if (!token) {
            token = tokenizer.reflink(src, this.tokens.links);
            merge = token?.type === 'text';
          }
        }
        if (!token && ch === 96) token = tokenizer.codespan(src);
        if (!token && (ch === 32 || ch === 92)) token = tokenizer.br(src);
        if (!token && ch === 60) token = tokenizer.autolink(src);
        if (!token && !this.state.inLink) token = tokenizer.url(src);
        if (!token) {
          token = tokenizer.inlineText(src);
          merge = true;
        }
        if (!token || !token.raw.length) {
          this.infiniteLoopError(ch);
          break;
        }
        src = src.slice(token.raw.length);
        const previous = tokens[tokens.length - 1];
        if (merge && previous?.type === 'text') {
          previous.raw += token.raw;
          previous.text += token.text;
        } else {
          tokens.push(token);
        }
      }
      return tokens;
    } finally {
      this.state.linkParenPossible = parens;
    }
  }
}

const options = { ...marked.defaults, tokenizer: new FastTokenizer() };
const lexer = new FastLexer(options);
const parser = new Parser(options);

// There are five list marker grammars in default mode. Compile them once;
// this table contains grammar only, never source text or rendered output.
const otherRules = lexer.tokenizer.rules.other;
const listMarkers = Object.create(null);
for (const marker of ['\\*', '\\+', '\\-', '\\d{1,9}\\.', '\\d{1,9}\\)']) {
  listMarkers[marker] = otherRules.listItemRegex(marker);
}
lexer.tokenizer.rules = {
  ...lexer.tokenizer.rules,
  other: {
    ...otherRules,
    listItemRegex(marker) {
      return listMarkers[marker] ?? otherRules.listItemRegex(marker);
    },
  },
};

export function parse(md) {
  if (typeof md !== 'string') return marked.parse(md);
  // Reuse machinery, never document data. Reference definitions and all lexer
  // state start fresh for each call, including calls following an exception.
  lexer.tokens = [];
  lexer.tokens.links = Object.create(null);
  lexer.state.inLink = false;
  lexer.state.inRawBlock = false;
  lexer.state.linkEmitted = false;
  lexer.state.linkParenPossible = true;
  lexer.state.top = true;
  try {
    return parser.parse(lexer.lex(md));
  } finally {
    lexer.tokens = [];
    lexer.inlineQueue = [];
  }
}
