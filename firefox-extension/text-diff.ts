export interface TextDiff {
  added: string;
  removed: number;
  delta: number;
}

const MAX_DIFF_CELLS = 250_000;

export function diffText(baseline: string, current: string): TextDiff {
  const before = baseline.split("\n");
  const after = current.split("\n");

  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  ) {
    prefix++;
  }

  const ahead = new Map<string, number>();
  for (let i = prefix; i < after.length; i++) {
    ahead.set(after[i], (ahead.get(after[i]) ?? 0) + 1);
  }

  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    const line = after[after.length - 1 - suffix];
    const left = (ahead.get(line) ?? 1) - 1;
    // The page may have said this line again. Pairing the last one off against the old copy
    // would leave the earlier one looking new, so stop and let the alignment decide.
    if (left > 0) {
      break;
    }
    ahead.set(line, left);
    suffix++;
  }

  const oldMiddle = before.slice(prefix, before.length - suffix);
  const newMiddle = after.slice(prefix, after.length - suffix);
  const { addedLines, removedLines } = alignMiddle(oldMiddle, newMiddle);

  if (
    removedLines.length === 1 &&
    addedLines.length === 1 &&
    addedLines[0].startsWith(removedLines[0])
  ) {
    const grown = addedLines[0].slice(removedLines[0].length);
    return { added: grown.trim(), removed: 0, delta: grown.length };
  }

  const gone = removedLines.join("\n");
  return {
    added: addedLines.join("\n").replace(/^\n+|\n+$/g, ""),
    removed: gone.length,
    delta: charDelta(gone, addedLines.join("\n")),
  };
}

export function charDelta(before: string, after: string): number {
  const shortest = Math.min(before.length, after.length);
  let prefix = 0;
  while (
    prefix < shortest &&
    before.charCodeAt(prefix) === after.charCodeAt(prefix)
  ) {
    prefix++;
  }
  const room = shortest - prefix;
  let suffix = 0;
  while (
    suffix < room &&
    before.charCodeAt(before.length - 1 - suffix) ===
      after.charCodeAt(after.length - 1 - suffix)
  ) {
    suffix++;
  }
  return after.length - prefix - suffix + (before.length - prefix - suffix);
}

function alignMiddle(
  before: string[],
  after: string[]
): { addedLines: string[]; removedLines: string[]; separators: number } {
  if (before.length === 0 || after.length === 0) {
    return { addedLines: after, removedLines: before, separators: 0 };
  }
  if (before.length * after.length > MAX_DIFF_CELLS) {
    return { addedLines: after, removedLines: before, separators: 0 };
  }

  const width = after.length + 1;
  const table = new Uint32Array((before.length + 1) * width);
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      table[i * width + j] =
        before[i] === after[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const addedLines: string[] = [];
  const removedLines: string[] = [];
  let separators = 0;
  let lastAdded = -2;
  const add = (j: number) => {
    if (addedLines.length > 0 && j > lastAdded + 1 && addedLines[addedLines.length - 1] !== "") {
      addedLines.push("");
      separators++;
    }
    addedLines.push(after[j]);
    lastAdded = j;
  };
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      removedLines.push(before[i]);
      i++;
    } else {
      add(j);
      j++;
    }
  }
  removedLines.push(...before.slice(i));
  for (; j < after.length; j++) {
    add(j);
  }

  return { addedLines, removedLines, separators };
}
