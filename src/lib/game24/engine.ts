// Pure, dependency-free 24 Game logic shared by the single-player tool and
// the multiplayer server. Nothing here touches the DOM or Node APIs so it can
// run in the browser and on the server.

export type Fraction = { n: number; d: number };
export type Difficulty = "easy" | "normal" | "hard";
export type Operator = "+" | "-" | "*" | "/";

/** A single combine step, recorded as it happens so the server can replay it. */
export interface Move {
  a: Fraction;
  b: Fraction;
  op: Operator;
}

export interface Puzzle {
  tiles: number[];
  solution: string | null;
}

export const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

export const fraction = (n: number, d = 1): Fraction => {
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const divisor = gcd(n, d) || 1;
  return { n: n / divisor, d: d / divisor };
};

export const addFractions = (a: Fraction, b: Fraction) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
export const subtractFractions = (a: Fraction, b: Fraction) => fraction(a.n * b.d - b.n * a.d, a.d * b.d);
export const multiplyFractions = (a: Fraction, b: Fraction) => fraction(a.n * b.n, a.d * b.d);
export const divideFractions = (a: Fraction, b: Fraction) => fraction(a.n * b.d, a.d * b.n);
export const equalFractions = (a: Fraction, b: Fraction) => a.n * b.d === b.n * a.d;

export const formatFraction = (value: Fraction) => (value.d === 1 ? String(value.n) : `${value.n}/${value.d}`);

export const operatorSymbols: Record<Operator, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };

const TARGET = fraction(24);

/** Apply an operator, returning null when the result would be undefined (÷0). */
export function applyOperator(op: Operator, a: Fraction, b: Fraction): Fraction | null {
  if (op === "+") return addFractions(a, b);
  if (op === "-") return subtractFractions(a, b);
  if (op === "*") return multiplyFractions(a, b);
  if (b.n === 0) return null;
  return divideFractions(a, b);
}

/** Find one expression that combines every value to make exactly 24. */
export function findSolution(values: number[]): string | null {
  type Item = { value: Fraction; expr: string };
  const items: Item[] = values.map((value) => ({ value: fraction(value), expr: String(value) }));

  const recurse = (list: Item[]): string | null => {
    if (list.length === 1) return equalFractions(list[0].value, TARGET) ? list[0].expr : null;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const rest = list.filter((_, index) => index !== i && index !== j);
        const candidates: Item[] = [
          { value: addFractions(a.value, b.value), expr: `(${a.expr} + ${b.expr})` },
          { value: subtractFractions(a.value, b.value), expr: `(${a.expr} - ${b.expr})` },
          { value: subtractFractions(b.value, a.value), expr: `(${b.expr} - ${a.expr})` },
          { value: multiplyFractions(a.value, b.value), expr: `(${a.expr} × ${b.expr})` }
        ];
        if (b.value.n !== 0)
          candidates.push({ value: divideFractions(a.value, b.value), expr: `(${a.expr} ÷ ${b.expr})` });
        if (a.value.n !== 0)
          candidates.push({ value: divideFractions(b.value, a.value), expr: `(${b.expr} ÷ ${a.expr})` });
        for (const candidate of candidates) {
          const found = recurse([...rest, candidate]);
          if (found) return found;
        }
      }
    }
    return null;
  };

  return recurse(items);
}

export function maxFor(difficulty: Difficulty): number {
  if (difficulty === "easy") return 6;
  if (difficulty === "hard") return 13;
  return 9;
}

export function generatePuzzle(max: number): Puzzle {
  for (let attempt = 0; attempt < 300; attempt++) {
    const tiles = Array.from({ length: 4 }, () => Math.floor(Math.random() * max) + 1);
    const solution = findSolution(tiles);
    if (solution) return { tiles, solution };
  }
  return { tiles: [4, 6, 2, 3], solution: findSolution([4, 6, 2, 3]) };
}

export function generatePuzzleFor(difficulty: Difficulty): Puzzle {
  return generatePuzzle(maxFor(difficulty));
}

/**
 * Replay a sequence of combine moves against the puzzle's starting numbers and
 * report whether it ends on exactly 24. This deliberately avoids parsing an
 * expression: the arithmetic is identical to the client's, so a valid solution
 * is verified exactly.
 */
export function verifyMoves(numbers: number[], moves: Move[]): boolean {
  if (!Array.isArray(moves) || moves.length === 0) return false;

  let current = numbers.map((value) => fraction(value));
  for (const move of moves) {
    if (!move || typeof move !== "object") return false;
    const a = fraction(move.a.n, move.a.d);
    const b = fraction(move.b.n, move.b.d);

    const aIndex = current.findIndex((value) => equalFractions(value, a));
    if (aIndex === -1) return false;
    const withoutA = [...current.slice(0, aIndex), ...current.slice(aIndex + 1)];

    const bIndex = withoutA.findIndex((value) => equalFractions(value, b));
    if (bIndex === -1) return false;

    const result = applyOperator(move.op, a, b);
    if (!result) return false;

    current = [...withoutA.slice(0, bIndex), result, ...withoutA.slice(bIndex + 1)];
  }

  return current.length === 1 && equalFractions(current[0], TARGET);
}