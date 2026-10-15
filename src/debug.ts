import * as C from "./constants";
import type { FacetState, GemState, Screen, PointerDevice } from "./game";
import {
  initial,
  empty,
  deal,
  swap,
  legal,
  hold,
  lastFall,
  x,
  y,
  type State,
} from "./logic";
import { pointer, targets } from "./interaction";
function integer(v: number, min = 0, max = Infinity) {
  if (!Number.isInteger(v) || v < min || v > max)
    throw new RangeError("Facet: invalid number");
  return v;
}
function position(col: number, row: number) {
  integer(col, 0, C.GRID_COLS - 1);
  integer(row, 0, C.GRID_ROWS - 1);
  return { col, row };
}
function token(t: string, col: number, row: number): GemState {
  if (!/^(?:[RACJBSM][0-3][bs]?|X[0-3])$/.test(t))
    throw new Error("Facet: invalid gem token");
  return {
    col,
    row,
    kind: t[0] === "X" ? null : C.GEM_KINDS["RACJBSM".indexOf(t[0])],
    cut:
      t[0] === "X"
        ? "prism"
        : t[2] === "b"
          ? "brilliant"
          : t[2] === "s"
            ? "star"
            : "plain",
    strain: Number(t[1]),
    fell: 0,
  };
}
function numberPose(
  key:
    "score" | "level" | "levelScore" | "bestChain" | "bestMove" | "moveScore",
  min = 0,
) {
  return (s: State, n: number): FacetState => ({
    ...s,
    [key]: integer(n, min),
  });
}
export const debug = {
  version: C.FACET_DEBUG_VERSION,
  reset: (s: State): FacetState => ({
    ...initial(),
    muted: s.muted,
    images: s.images,
    systems: s.systems,
  }),
  reconcile: (s: State): FacetState => ({ ...s }),
  snapshot: (s: State) => ({
    version: C.FACET_DEBUG_VERSION,
    screen: s.screen,
    menuIndex: s.menuIndex,
    score: s.score,
    level: s.level,
    levelScore: s.levelScore,
    levelTarget: s.level * C.LEVEL_TARGET_STEP,
    phase: s.phase,
    chainStep: s.chainStep,
    multiplier: Math.min(s.chainStep, C.MAX_MULTIPLIER),
    swapTimer: s.swapTimer,
    stepTimer: s.stepTimer,
    stepHold: hold(s),
    board: {
      ...s.board,
      cells: s.board.cells.map((g) => ({ ...g, x: x(g.col), y: y(g.row) })),
    },
    selection: s.selection,
    offer: s.offer,
    refusal: s.refusal ? { a: s.refusal.a, b: s.refusal.b } : null,
    lastCleared: s.lastCleared,
    lastPoints: s.lastPoints,
    lastWaves: s.lastWaves,
    lastFall: lastFall(s),
    moveScore: s.moveScore,
    bestMove: s.bestMove,
    bestChain: s.bestChain,
    legalSwap: legal(s.board),
    refillKinds: [...s.refillKinds],
    pointer: { ...s.pointer },
    armedTarget: s.armedTarget,
    targets: targets(s),
    muted: s.muted,
    simTime: s.simTime,
  }),
  setScreen: (s: State, value: Screen): FacetState => {
    if (
      ![
        "title",
        "howto",
        "playing",
        "paused",
        "levelclear",
        "gameover",
      ].includes(value)
    )
      throw new Error("Invalid screen");
    return { ...s, screen: value };
  },
  setMenuIndex: (s: State, index: number): FacetState => ({
    ...s,
    menuIndex: integer(index),
  }),
  loadBoard: (s: State, rows: readonly string[]): FacetState => {
    if (rows.length !== C.GRID_ROWS) throw new Error("Invalid rows");
    const cells = rows.flatMap((line, row) => {
      const ts = line.trim().split(/\s+/);
      if (ts.length !== C.GRID_COLS) throw new Error("Invalid columns");
      return ts.map((t, col) => token(t, col, row));
    });
    return { ...s, board: { cols: C.GRID_COLS, rows: C.GRID_ROWS, cells } };
  },
  dealBoard: (s: State): FacetState => ({ ...s, board: deal(), arrival: 0 }),
  clearBoard: (s: State): FacetState => ({ ...s, board: empty() }),
  setGem: (s: State, col: number, row: number, t: string): FacetState => {
    position(col, row);
    if (!s.board.cells[row * C.GRID_COLS + col]) throw new Error("No board");
    const gem = token(t, col, row);
    return {
      ...s,
      board: {
        ...s.board,
        cells: s.board.cells.map((g) =>
          g.col === col && g.row === row ? gem : g,
        ),
      },
    };
  },
  setRefillKinds: (s: State, col: number, kinds: string): FacetState => {
    integer(col, 0, C.GRID_COLS - 1);
    if (!/^[RACJBSM]*$/.test(kinds)) throw new Error("Invalid refill");
    return {
      ...s,
      refillKinds: s.refillKinds.map((k, i) => (i === col ? kinds : k)),
    };
  },
  clearRefillKinds: (s: State): FacetState => ({
    ...s,
    refillKinds: Array<string>(C.GRID_COLS).fill(""),
  }),
  setScore: numberPose("score"),
  setLevel: numberPose("level", 1),
  setLevelScore: numberPose("levelScore"),
  setBestChain: numberPose("bestChain"),
  setBestMove: numberPose("bestMove"),
  setMoveScore: numberPose("moveScore"),
  setSelection: (s: State, col: number, row: number): FacetState => ({
    ...s,
    selection: position(col, row),
  }),
  clearSelection: (s: State): FacetState => ({ ...s, selection: null }),
  setOffer: (s: State, col: number, row: number): FacetState => ({
    ...s,
    offer: position(col, row),
  }),
  clearOffer: (s: State): FacetState => ({ ...s, offer: null }),
  clearRefusal: (s: State): FacetState => ({ ...s, refusal: null }),
  clearChain: (s: State): FacetState => ({
    ...s,
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
  }),
  requestSwap: (s: State, ca: number, ra: number, cb: number, rb: number) => {
    const a = position(ca, ra),
      b = position(cb, rb);
    if (!s.board.cells.length) throw new Error("No board");
    return swap(s, a, b);
  },
  pointerDown: (
    s: State,
    px: number,
    py: number,
    device: PointerDevice = "mouse",
  ) => pointer(s, "down", px, py, device),
  pointerMove: (
    s: State,
    px: number,
    py: number,
    device: PointerDevice = "mouse",
  ) => pointer(s, "move", px, py, device),
  pointerUp: (s: State, device: PointerDevice = "mouse") =>
    pointer(s, "up", s.pointer.x, s.pointer.y, device),
};
