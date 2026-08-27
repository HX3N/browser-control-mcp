const INDENT = "  ";
const HUG_AFTER_BREAK = [")", "]", ",", ";", ".", ":"];
const CONTINUATION = ["else", "catch", "finally", "while"];
const NO_SPACE_BEFORE = [".", ",", ";", ")", "]", ":"];
const NO_SPACE_AFTER = [".", "(", "["];
const REGEX_AFTER_PUNCT = "(,=:[!&|?{};+-*%~^<>";
const REGEX_AFTER_WORD = [
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
  "case", "do", "else", "yield", "await", "throw",
];

function isWordChar(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}

function readString(source: string, start: number): number {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) {
      return i + 1;
    }
    i++;
  }
  return source.length;
}

function readTemplate(source: string, start: number): number {
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "`") {
      return i + 1;
    }
    if (ch === "$" && source[i + 1] === "{") {
      i = skipBraced(source, i + 1);
      continue;
    }
    i++;
  }
  return source.length;
}

function skipBraced(source: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "'" || ch === '"') {
      i = readString(source, i);
      continue;
    }
    if (ch === "`") {
      i = readTemplate(source, i);
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      i = readLineComment(source, i);
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      i = readBlockComment(source, i);
      continue;
    }
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return i + 1;
      }
    }
    i++;
  }
  return source.length;
}

function readLineComment(source: string, start: number): number {
  let i = start + 2;
  while (i < source.length && source[i] !== "\n") {
    i++;
  }
  return i;
}

function readBlockComment(source: string, start: number): number {
  const end = source.indexOf("*/", start + 2);
  return end === -1 ? source.length : end + 2;
}

function readRegex(source: string, start: number): number {
  let i = start + 1;
  let inClass = false;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    // A regex cannot span a line, so an unclosed one was a division after all: give back
    // the slash alone rather than swallowing the rest of the script.
    if (ch === "\n") {
      return start + 1;
    }
    if (ch === "[") {
      inClass = true;
    } else if (ch === "]") {
      inClass = false;
    } else if (ch === "/" && !inClass) {
      i++;
      while (i < source.length && /[a-z]/.test(source[i])) {
        i++;
      }
      return i;
    }
    i++;
  }
  return start + 1;
}

function regexAllowed(lastToken: string): boolean {
  if (!lastToken) {
    return true;
  }
  if (REGEX_AFTER_WORD.indexOf(lastToken) !== -1) {
    return true;
  }
  const tail = lastToken[lastToken.length - 1];
  return REGEX_AFTER_PUNCT.indexOf(tail) !== -1;
}

function nextMeaningful(source: string, from: number): string {
  let i = from;
  while (i < source.length && /\s/.test(source[i])) {
    i++;
  }
  return source[i] ?? "";
}

export function formatScript(source: string): string {
  const lines: string[] = [];
  let line = "";
  let indent = 0;
  let parens = 0;
  let pendingBreak = false;
  let pendingBlank = false;
  let lastToken = "";
  let spaced = false;

  const pad = (): string => INDENT.repeat(Math.max(0, indent));

  const newLine = (): void => {
    lines.push(line.replace(/\s+$/, ""));
    line = "";
  };

  const write = (text: string, hug: boolean): void => {
    if (pendingBreak) {
      pendingBreak = false;
      if (!hug && line.trim() !== "") {
        newLine();
        if (pendingBlank) {
          lines.push("");
        }
      }
    }
    pendingBlank = false;
    const glued =
      NO_SPACE_BEFORE.indexOf(text) !== -1 || NO_SPACE_AFTER.indexOf(lastToken) !== -1;
    const opensBlock =
      (text === "{" || text === "{}") &&
      (lastToken === ")" || isWordChar(lastToken[lastToken.length - 1] ?? ""));
    const followsBlock = lastToken === "}" && CONTINUATION.indexOf(text) !== -1;
    if (line === "") {
      line = pad();
    } else if (!glued && (spaced || opensBlock || followsBlock || lastToken === ",")) {
      line += " ";
    }
    line += text;
    lastToken = text;
    spaced = false;
  };

  const breakLine = (): void => {
    if (line.trim() !== "") {
      newLine();
    }
    pendingBreak = false;
  };

  let i = 0;
  while (i < source.length) {
    const ch = source[i];

    if (/\s/.test(ch)) {
      let newlines = 0;
      while (i < source.length && /\s/.test(source[i])) {
        if (source[i] === "\n") {
          newlines++;
        }
        i++;
      }
      spaced = true;
      if (newlines > 1) {
        pendingBlank = true;
      }
      continue;
    }

    if (ch === "/" && source[i + 1] === "/") {
      const end = readLineComment(source, i);
      write(source.slice(i, end), false);
      pendingBreak = true;
      i = end;
      continue;
    }

    if (ch === "/" && source[i + 1] === "*") {
      const end = readBlockComment(source, i);
      write(source.slice(i, end), false);
      pendingBreak = true;
      i = end;
      continue;
    }

    if (ch === "'" || ch === '"') {
      const end = readString(source, i);
      write(source.slice(i, end), false);
      i = end;
      continue;
    }

    if (ch === "`") {
      const end = readTemplate(source, i);
      write(source.slice(i, end), false);
      i = end;
      continue;
    }

    if (ch === "/" && regexAllowed(lastToken)) {
      const end = readRegex(source, i);
      write(source.slice(i, end), false);
      i = end;
      continue;
    }

    if (isWordChar(ch)) {
      let end = i;
      while (end < source.length && isWordChar(source[end])) {
        end++;
      }
      const word = source.slice(i, end);
      write(word, CONTINUATION.indexOf(word) !== -1);
      i = end;
      continue;
    }

    if (ch === "{") {
      if (nextMeaningful(source, i + 1) === "}") {
        write("{}", false);
        i = source.indexOf("}", i + 1) + 1;
        continue;
      }
      write("{", false);
      indent++;
      pendingBreak = true;
      i++;
      continue;
    }

    if (ch === "}") {
      indent--;
      breakLine();
      write("}", false);
      pendingBreak = true;
      i++;
      continue;
    }

    if (ch === "(" || ch === "[") {
      write(ch, false);
      parens++;
      i++;
      continue;
    }

    if (ch === ")" || ch === "]") {
      parens = Math.max(0, parens - 1);
      write(ch, true);
      i++;
      continue;
    }

    if (ch === ";") {
      write(";", true);
      if (parens === 0) {
        pendingBreak = true;
      }
      i++;
      continue;
    }

    write(ch, HUG_AFTER_BREAK.indexOf(ch) !== -1);
    i++;
  }

  if (line.trim() !== "") {
    newLine();
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
