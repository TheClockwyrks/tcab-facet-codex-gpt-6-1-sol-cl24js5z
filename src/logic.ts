import * as C from "./constants";
import type {
  FacetState,
  GemState,
  GemKind,
  CellRef,
  BoardState,
  Cut,
} from "./game";
import type { DeepReadonly } from "ts-essentials";
export type State = DeepReadonly<FacetState>;
export const x = (col: number) =>
  C.BOARD_CX - ((C.GRID_COLS - 1) * C.CELL_PITCH) / 2 + col * C.CELL_PITCH;
export const y = (row: number) =>
  C.BOARD_CY - ((C.GRID_ROWS - 1) * C.CELL_PITCH) / 2 + row * C.CELL_PITCH;
export const index = (p: CellRef) => p.row * C.GRID_COLS + p.col;
export const ref = (i: number): CellRef => ({
  col: i % C.GRID_COLS,
  row: Math.floor(i / C.GRID_COLS),
});
export const adjacent = (a: CellRef, b: CellRef) =>
  Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
export const empty = (): BoardState => ({ cols: 0, rows: 0, cells: [] });
export function initial(): FacetState {
  return {
    screen: "title",
    menuIndex: 0,
    board: empty(),
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    score: 0,
    level: 1,
    levelScore: 0,
    lastCleared: 0,
    lastPoints: 0,
    lastWaves: 0,
    moveScore: 0,
    bestMove: 0,
    bestChain: 0,
    selection: null,
    offer: null,
    refusal: null,
    armedTarget: null,
    pointer: { x: 0, y: 0, down: false, device: "mouse" },
    simTime: 0,
    muted: false,
    refillKinds: Array<string>(C.GRID_COLS).fill(""),
  };
}
export function runs(cells: readonly GemState[]): number[][] {
  const out: number[][] = [];
  for (const vertical of [false, true])
    for (let a = 0; a < C.GRID_COLS; a++) {
      let line: number[] = [];
      const flush = () => {
        if (line.length >= C.MATCH_MIN) out.push(line);
        line = [];
      };
      for (let b = 0; b < C.GRID_ROWS; b++) {
        const i = vertical ? b * C.GRID_COLS + a : a * C.GRID_COLS + b;
        const g = cells[i];
        if (!g?.kind) {
          flush();
          continue;
        }
        if (line.length && cells[line[0]].kind !== g.kind) flush();
        line.push(i);
      }
      flush();
    }
  return out;
}
export function exchanged(
  cells: readonly GemState[],
  a: CellRef,
  b: CellRef,
): GemState[] {
  return cells.map((g, i) =>
    i === index(a)
      ? { ...cells[index(b)], ...a, fell: 0 }
      : i === index(b)
        ? { ...cells[index(a)], ...b, fell: 0 }
        : { ...g },
  );
}
export function productive(cells: readonly GemState[], a: CellRef, b: CellRef) {
  return (
    !!cells[index(a)] &&
    !!cells[index(b)] &&
    adjacent(a, b) &&
    (cells[index(a)].cut === "prism" ||
      cells[index(b)].cut === "prism" ||
      runs(exchanged(cells, a, b)).length > 0)
  );
}
export function legal(board: BoardState) {
  return board.cells.some((g) =>
    [
      { col: g.col + 1, row: g.row },
      { col: g.col, row: g.row + 1 },
    ].some(
      (p) =>
        p.col < C.GRID_COLS &&
        p.row < C.GRID_ROWS &&
        productive(board.cells, g, p),
    ),
  );
}
export function deal(): BoardState {
  for (;;) {
    const cells: GemState[] = [];
    for (let i = 0; i < C.GRID_COLS * C.GRID_ROWS; i++) {
      const p = ref(i);
      let kind: GemKind;
      do {
        kind = C.GEM_KINDS[Math.floor(Math.random() * C.GEM_KIND_COUNT)];
      } while (
        (p.col >= 2 &&
          cells[i - 1].kind === kind &&
          cells[i - 2].kind === kind) ||
        (p.row >= 2 &&
          cells[i - C.GRID_COLS].kind === kind &&
          cells[i - C.GRID_COLS * 2].kind === kind)
      );
      cells.push({ ...p, kind, cut: "plain", strain: 0, fell: p.row + 1 });
    }
    const board = { cols: C.GRID_COLS, rows: C.GRID_ROWS, cells };
    if (legal(board)) return board;
  }
}
export function swap(s: State, a: CellRef, b: CellRef): FacetState {
  if (s.phase !== "idle" || !productive(s.board.cells, a, b))
    return { ...s, refusal: { a, b, timer: 0 } };
  return {
    ...s,
    board: { ...s.board, cells: exchanged(s.board.cells, a, b) },
    phase: "swapping",
    swapTimer: 0,
    chainStep: 0,
    stepTimer: 0,
    moveScore: 0,
    refusal: null,
    motion: { a, b },
    previous: s.board.cells.map((g) => ({ ...g })),
    cleared: [],
    created: [],
  };
}
export const lastFall = (s: State) =>
  Math.max(0, ...s.board.cells.map((g) => g.fell));
export const hold = (s: State) =>
  s.lastWaves * C.WAVE_SECONDS +
  lastFall(s) * C.FALL_SECONDS_PER_ROW +
  C.STEP_SECONDS;
export interface StepEvents {
  clear: boolean;
  flaw: boolean;
  cut: boolean;
}
/** Resolve a single R5–R9 step. The wave queue is breadth-first, so its
 * first visit to a cell also supplies that cell's minimum shatter wave. */
export function resolve(s: State, first: boolean): [FacetState, StepEvents] {
  const cells = s.board.cells,
    rr = runs(cells);
  let seed = rr.flat();
  if (first && s.motion) {
    const a = cells[index(s.motion.a)],
      b = cells[index(s.motion.b)];
    if (a.cut === "prism" || b.cut === "prism") {
      const kind = a.cut === "prism" ? b.kind : a.kind;
      seed = cells.flatMap((g, i) =>
        kind === null ||
        g.kind === kind ||
        ((i === index(s.motion!.a) || i === index(s.motion!.b)) &&
          g.cut === "prism")
          ? [i]
          : [],
      );
    }
  }
  if (!seed.length)
    return [
      {
        ...s,
        phase: "idle",
        chainStep: 0,
        stepTimer: 0,
        bestMove: Math.max(s.bestMove, s.moveScore),
      },
      { clear: false, flaw: false, cut: false },
    ];
  const waves = new Map<number, number>(seed.map((i) => [i, 0]));
  const queue = [...new Set(seed)];
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q],
      g = cells[i],
      p = ref(i);
    for (let j = 0; j < cells.length; j++) {
      const h = cells[j],
        d = ref(j);
      const near = adjacent(p, d);
      if (
        (g.cut === "brilliant" &&
          Math.max(Math.abs(p.col - d.col), Math.abs(p.row - d.row)) <= 1) ||
        (g.cut === "star" && (p.col === d.col || p.row === d.row)) ||
        (h.strain === C.MAX_STRAIN && near)
      ) {
        if (!waves.has(j)) {
          waves.set(j, waves.get(i)! + 1);
          queue.push(j);
        }
      }
    }
  }
  // Creation is decided from the original runs, before strain or gravity.
  const created = new Map<number, Cut>();
  const rank: Record<Cut, number> = {
    plain: 0,
    brilliant: 1,
    star: 2,
    prism: 3,
  };
  const put = (i: number, cut: Cut) => {
    if (rank[cut] > rank[created.get(i) ?? "plain"]) created.set(i, cut);
  };
  const prismSeed =
    first &&
    s.motion &&
    [cells[index(s.motion.a)], cells[index(s.motion.b)]].some(
      (g) => g.cut === "prism",
    );
  if (!prismSeed) {
    for (const run of rr) {
      if (run.length >= 4) {
        const choices = s.motion
          ? [index(s.motion.a), index(s.motion.b)]
              .filter((i) => run.includes(i))
              .sort((a, b) => a - b)
          : [];
        put(
          choices[0] ?? run[Math.floor((run.length - 1) / 2)],
          run.length >= 5 ? "prism" : "brilliant",
        );
      }
      for (const other of rr)
        if (run !== other)
          for (const i of run) if (other.includes(i)) put(i, "star");
    }
  }
  const mult = Math.min(s.chainStep, C.MAX_MULTIPLIER);
  const points = queue.reduce(
    (v, i) =>
      v +
      (cells[i].strain === C.MAX_STRAIN ? C.FLAWED_SCORE : C.BASE_SCORE) * mult,
    0,
  );
  let flaw = false;
  const work: (GemState | null)[] = cells.map((g, i) => {
    if (waves.has(i)) return null;
    const strained = queue.some((j) => adjacent(g, ref(j)));
    const strain = Math.min(C.MAX_STRAIN, g.strain + (strained ? 1 : 0));
    if (strain === C.MAX_STRAIN && g.strain < C.MAX_STRAIN) flaw = true;
    return { ...g, strain, fell: 0 };
  });
  for (const [i, cut] of created)
    work[i] = {
      ...cells[i],
      kind: cut === "prism" ? null : cells[i].kind,
      cut,
      strain: 0,
      fell: 0,
    };
  const result: GemState[] = Array(C.GRID_COLS * C.GRID_ROWS);
  for (let col = 0; col < C.GRID_COLS; col++) {
    let row = C.GRID_ROWS - 1;
    for (let r = C.GRID_ROWS - 1; r >= 0; r--) {
      const g = work[r * C.GRID_COLS + col];
      if (g) {
        result[row * C.GRID_COLS + col] = { ...g, row, fell: row - r };
        row--;
      }
    }
    for (; row >= 0; row--) {
      const letter = s.refillKinds[col][row];
      const kind = letter
        ? C.GEM_KINDS["RACJBSM".indexOf(letter)]
        : C.GEM_KINDS[Math.floor(Math.random() * C.GEM_KIND_COUNT)];
      result[row * C.GRID_COLS + col] = {
        col,
        row,
        kind,
        cut: "plain",
        strain: 0,
        fell: row + 1,
      };
    }
  }
  return [
    {
      ...s,
      board: { ...s.board, cells: result },
      phase: "resolving",
      swapTimer: 0,
      stepTimer: 0,
      score: s.score + points,
      levelScore: s.levelScore + points,
      moveScore: s.moveScore + points,
      bestChain: Math.max(s.bestChain, s.chainStep),
      lastCleared: queue.length,
      lastPoints: points,
      lastWaves: Math.max(...waves.values()),
      previous: cells.map((g) => ({ ...g })),
      cleared: queue.map((i) => ({ i, wave: waves.get(i)! })),
      created: [...created.keys()],
    },
    { clear: true, flaw, cut: created.size > 0 },
  ];
}
/** Spend the entire delta across boundaries rather than dropping the remainder
 * at a swap, landing, or chain boundary. Menus freeze every board timer. */
export function tick(
  state: State,
  dt: number,
  onEvent: (name: string) => void = () => {},
): FacetState {
  let s: FacetState = { ...state };
  if (s.screen !== "playing") return s;
  if (s.refusal)
    s = {
      ...s,
      refusal:
        s.refusal.timer + dt >= C.REFUSAL_SECONDS
          ? null
          : { ...s.refusal, timer: s.refusal.timer + dt },
    };
  let remaining = dt;
  while (remaining > 1e-10 && s.phase !== "idle") {
    const duration = s.phase === "swapping" ? C.SWAP_SECONDS : hold(s),
      timer = s.phase === "swapping" ? s.swapTimer : s.stepTimer;
    const used = Math.min(remaining, Math.max(0, duration - timer));
    if (s.phase === "resolving") {
      const land =
        s.lastWaves * C.WAVE_SECONDS + lastFall(s) * C.FALL_SECONDS_PER_ROW;
      if (timer < land && timer + used >= land && lastFall(s) > C.LAND_MIN_ROWS)
        onEvent(C.CUES.land);
    }
    s =
      s.phase === "swapping"
        ? { ...s, swapTimer: timer + used }
        : { ...s, stepTimer: timer + used };
    remaining -= used;
    if (timer + used + 1e-9 < duration) break;
    const first = s.phase === "swapping";
    s = { ...s, chainStep: first ? 1 : s.chainStep + 1 };
    const [next, ev] = resolve(s, first);
    s = next;
    for (const [key, v] of Object.entries(ev)) if (v) onEvent(key);
    if (s.phase === "idle") {
      s = { ...s, swapTimer: 0 };
      if (s.levelScore >= s.level * C.LEVEL_TARGET_STEP) {
        s = { ...s, screen: "levelclear", menuIndex: 0, armedTarget: null };
        onEvent(C.CUES.levelUp);
      } else if (!legal(s.board)) {
        s = { ...s, screen: "gameover", menuIndex: 0, armedTarget: null };
        onEvent(C.CUES.gameOver);
      }
      break;
    }
  }
  return s;
}
