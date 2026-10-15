/// <reference types="node" />
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import {
  createEngine,
  ConstantClock,
  type Engine,
} from "@clockwyrks/simple-2d";
import { game, BACKGROUND, type FacetState, type FacetDebugApi } from "./game";
import { debug } from "./debug";
import { deal, initial, runs, legal, tick, resolve, x, y, hold } from "./logic";
import { action, targets } from "./interaction";
import * as C from "./constants";
const rows = Array.from({ length: C.GRID_ROWS }, (_, r) =>
  Array.from(
    { length: C.GRID_COLS },
    (_, c) => "RACJBSM"[(r * 2 + c) % 7] + "0",
  ).join(" "),
);
function board() {
  return debug.loadBoard({ ...initial(), screen: "playing" }, rows);
}
function match(length = 3): FacetState {
  let s = board();
  for (let i = 0; i < length; i++) s = debug.setGem(s, i, 4, "R0");
  for (const [col, kind] of ["A", "C", "J"].entries())
    s = debug.setRefillKinds(s, col, kind);
  return { ...s, phase: "resolving" as const, chainStep: 1 };
}
let engine: Engine<FacetState, FacetDebugApi>;
beforeAll(async () => {
  vi.stubGlobal("fetch", async (url: string) => {
    const bytes = await readFile("public/" + url);
    return new Response(bytes);
  });
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      async decodeAudioData(data: ArrayBuffer) {
        return { duration: data.byteLength / 44100 };
      }
    },
  );
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    background: BACKGROUND,
    clock: new ConstantClock(10),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => new EventTarget(),
    },
  });
  await engine.initialize();
});
afterAll(() => {
  engine.destroy();
  vi.unstubAllGlobals();
});
describe("engine integration", () => {
  it("loads real production assets before exposing the surface", () => {
    expect(engine.debug.version).toBe(C.FACET_DEBUG_VERSION);
    expect(Object.keys(engine.state.images ?? {})).toHaveLength(85);
    expect(Object.keys(engine.state.systems ?? {})).toHaveLength(4);
  });
  it("poses and advances a swap over counted engine frames", async () => {
    engine.apply((s) => engine.debug.loadBoard(s, rows));
    engine.apply((s) => engine.debug.setScreen(s, "playing"));
    for (const [c, r, t] of [
      [0, 4, "R0"],
      [1, 4, "R0"],
      [2, 4, "A0"],
      [2, 3, "R0"],
    ] as const)
      engine.apply((s) => engine.debug.setGem(s, c, r, t));
    engine.apply((s) => engine.debug.requestSwap(s, 2, 3, 2, 4));
    await engine.advance(17);
    expect(engine.state.phase).toBe("swapping");
    expect(engine.state.score).toBe(0);
    await engine.advance(1);
    expect(engine.state.phase).toBe("resolving");
    expect(engine.state.score).toBeGreaterThanOrEqual(30);
    const snapshot = engine.debug.snapshot(engine.state);
    engine.apply((s) => engine.debug.setScreen(s, "paused"));
    await engine.advance(20);
    expect(engine.state.stepTimer).toBe(snapshot.stepTimer);
    expect(engine.state.simTime).toBeCloseTo(0.38);
  });
  it("renders each screen without changing the state", async () => {
    for (const screen of [
      "title",
      "howto",
      "playing",
      "paused",
      "levelclear",
      "gameover",
    ] as const) {
      engine.apply((s) => engine.debug.setScreen(s, screen));
      await engine.advance(1);
      expect(engine.state.screen).toBe(screen);
    }
  });
});
describe("rules and immutable transitions", () => {
  it("deals settled boards with a legal move and all seven kinds", () => {
    for (let n = 0; n < 20; n++) {
      const b = deal();
      expect(runs(b.cells)).toEqual([]);
      expect(legal(b)).toBe(true);
      expect(b.cells).toHaveLength(64);
      expect(
        b.cells.every(
          (g) => g.cut === "plain" && g.strain === 0 && g.fell >= g.row + 1,
        ),
      ).toBe(true);
    }
  });
  it("rejects nonadjacent and unproductive swaps without changing the board", () => {
    const s = board();
    const n = debug.requestSwap(s, 0, 0, 7, 7);
    expect(n.board).toBe(s.board);
    expect(n.refusal?.a).toEqual({ col: 0, row: 0 });
    expect(debug.requestSwap(s, 0, 0, 1, 0).phase).toBe("idle");
    expect(s.refusal).toBeNull();
  });
  it("counts maximal runs only", () => {
    expect(runs(match(5).board.cells).some((r) => r.length === 5)).toBe(true);
    const s = debug.setGem(match(5), 2, 4, "X0");
    expect(runs(s.board.cells)).toEqual([]);
  });
  it("scores a three, strains its neighbors once and preserves untouched gems", () => {
    const s = match();
    const [n] = resolve(s, false);
    expect(n.lastCleared).toBe(3);
    expect(n.lastPoints).toBe(30);
    expect(n.board.cells[5 * 8 + 1].strain).toBe(1);
    expect(n.board.cells[7 * 8 + 7]).toEqual({
      ...s.board.cells[7 * 8 + 7],
      fell: 0,
    });
    expect(s.score).toBe(0);
  });
  it("creates a brilliant for four and a kindless prism for five", () => {
    for (const [length, cut] of [
      [4, "brilliant"],
      [5, "prism"],
    ] as const) {
      const [n] = resolve(match(length), false);
      const g = n.board.cells.find((g) => g.cut === cut);
      expect(g).toBeDefined();
      expect(g?.strain).toBe(0);
      expect(g?.kind).toBe(cut === "prism" ? null : "ruby");
    }
  });
  it("creates a star at intersecting lines", () => {
    let s = match();
    s = debug.setGem(s, 1, 3, "R0");
    s = debug.setGem(s, 1, 5, "R0");
    const [n] = resolve(s, false);
    expect(n.board.cells.some((g) => g.cut === "star")).toBe(true);
  });
  it("expands flawed chains in waves and doubles their points", () => {
    let s = match();
    s = debug.setGem(s, 2, 5, "J3");
    s = debug.setGem(s, 3, 5, "B3");
    const [n] = resolve(s, false);
    expect(n.lastCleared).toBe(5);
    expect(n.lastWaves).toBe(2);
    expect(n.lastPoints).toBe(70);
  });
  it("expands brilliant rings and star rows and columns", () => {
    for (const cut of ["b", "s"]) {
      const s = debug.setGem(match(), 1, 4, "R0" + cut);
      const [n] = resolve(s, false);
      expect(n.lastCleared).toBe(cut === "b" ? 9 : 15);
      expect(n.lastWaves).toBe(1);
    }
  });
  it("caps strain and multiplier", () => {
    const s = { ...debug.setGem(match(), 1, 5, "J2"), chainStep: 99 };
    const [n, events] = resolve(s, false);
    expect(n.lastPoints).toBe(3 * C.BASE_SCORE * C.MAX_MULTIPLIER);
    expect(n.board.cells[5 * 8 + 1].strain).toBe(3);
    expect(events.flaw).toBe(true);
  });
  it("trades a prism for a kind and two prisms for the whole board", () => {
    let s = debug.setGem(board(), 0, 0, "X0");
    s = debug.setGem(s, 1, 0, "X0");
    s = debug.requestSwap(s, 0, 0, 1, 0);
    const n = tick(s, C.SWAP_SECONDS);
    expect(n.lastCleared).toBe(64);
    expect(n.lastPoints).toBe(640);
    expect(n.board.cells.every((g) => g.cut === "plain")).toBe(true);
  });
  it("uses posed refill by destination row while preserving surviving order", () => {
    const s = debug.setRefillKinds(match(), 0, "MBS");
    const [n] = resolve(s, false);
    expect(n.board.cells[0].kind).toBe("amethyst");
    expect(n.board.cells[8].kind).toBe(s.board.cells[0].kind);
    expect(n.board.cells[8].fell).toBe(1);
  });
  it("keeps fell after settling and reports it from the board", () => {
    const [s] = resolve(match(), false);
    const n = tick(s, hold(s));
    expect(n.board.cells.map((g) => g.fell)).toEqual(
      s.board.cells.map((g) => g.fell),
    );
    expect(debug.snapshot(n).lastFall).toBe(
      Math.max(...s.board.cells.map((g) => g.fell)),
    );
  });
  it("is independent of frame partitioning", () => {
    const s = debug.requestSwap(debug.setGem(board(), 0, 0, "X0"), 0, 0, 1, 0);
    vi.spyOn(Math, "random").mockReturnValue(0.42);
    const a = tick(s, 0.42);
    let b = s;
    for (let i = 0; i < 42; i++) b = tick(b, 0.01);
    expect(a.score).toBe(b.score);
    expect(a.board).toEqual(b.board);
    expect(a.stepTimer).toBeCloseTo(b.stepTimer);
    vi.restoreAllMocks();
  });
  it("evaluates the level target only when a chain settles", () => {
    const [s] = resolve(match(), false);
    const n = tick({ ...s, levelScore: C.LEVEL_TARGET_STEP }, hold(s));
    expect(n.screen).toBe("levelclear");
    expect(n.bestMove).toBe(n.moveScore);
    expect(action(n, "confirm").level).toBe(2);
  });
  it("ages refusal only during playing", () => {
    const s = debug.requestSwap(board(), 0, 0, 7, 7);
    expect(tick({ ...s, screen: "paused" }, 1).refusal).toEqual(s.refusal);
    expect(tick(s, C.REFUSAL_SECONDS).refusal).toBeNull();
  });
});
describe("pointer, menus and poses", () => {
  it("previews a touch drag and cancels when returned", () => {
    let s = board();
    s = debug.pointerDown(s, x(0), y(0), "touch");
    s = debug.pointerMove(s, x(1), y(0), "touch");
    expect(s.offer).toEqual({ col: 1, row: 0 });
    s = debug.pointerMove(s, x(0), y(0), "touch");
    s = debug.pointerUp(s, "touch");
    expect(s.offer).toBeNull();
    expect(s.selection).toEqual({ col: 0, row: 0 });
  });
  it("offers with two presses and requests only at release", () => {
    let s = board();
    s = debug.setGem(s, 0, 0, "X0");
    s = debug.pointerDown(s, x(0), y(0));
    s = debug.pointerUp(s);
    s = debug.pointerDown(s, x(1), y(0));
    expect(s.phase).toBe("idle");
    s = debug.pointerUp(s);
    expect(s.phase).toBe("swapping");
    expect(s.selection).toBeNull();
  });
  it("clears selection on an empty press and keeps an offer over unrelated cells", () => {
    let s = debug.setSelection(board(), 0, 0);
    s = debug.pointerDown(s, x(1), y(0));
    s = debug.pointerMove(s, x(7), y(7));
    expect(s.offer).toEqual({ col: 1, row: 0 });
    s = debug.pointerDown(s, 0, 0);
    expect(s.selection).toBeNull();
  });
  it("uses the same menu targets for mouse, pen and touch", () => {
    for (const device of ["mouse", "pen", "touch"] as const) {
      let s = initial();
      const t = targets(s)[1];
      s = debug.pointerDown(s, t.x + 5, t.y + 5, device);
      expect(s.armedTarget).toBe("menu-1");
      s = debug.pointerUp(s, device);
      expect(s.screen).toBe("howto");
      expect(action(s, "back").menuIndex).toBe(1);
    }
  });
  it("disarms releases outside targets and wraps keyboard menus", () => {
    let s = debug.pointerDown(initial(), 500, 440);
    s = debug.pointerMove(s, 0, 0);
    s = debug.pointerUp(s);
    expect(s.screen).toBe("title");
    expect(s.armedTarget).toBeNull();
    expect(action(s, "up").menuIndex).toBe(1);
  });
  it("pause freezes and quit drops the board, preserving scores", () => {
    let s = { ...board(), score: 123 };
    s = action(s, "pause");
    expect(s.screen).toBe("paused");
    expect(action(s, "pause").screen).toBe("playing");
    s = action(action(s, "down"), "confirm");
    expect(s.board.cells).toEqual([]);
    expect(s.score).toBe(123);
  });
  it("poses only what was named and reset preserves mute", () => {
    let s = board();
    s = debug.setScore(s, 34);
    s = debug.setBestChain(s, 4);
    s = debug.setBestMove(s, 90);
    s = debug.setMoveScore(s, 70);
    s = debug.setLevel(s, 2);
    s = debug.setLevelScore(s, 20);
    const n = debug.reconcile(s);
    expect(n).toEqual(s);
    expect(debug.snapshot(s).levelTarget).toBe(4000);
    expect(debug.clearBoard(s).score).toBe(34);
    expect(debug.reset({ ...s, muted: true })).toEqual({
      ...initial(),
      muted: true,
    });
  });
  it("fails loudly for invalid domains", () => {
    expect(() => debug.loadBoard(initial(), [])).toThrow();
    expect(() => debug.setGem(board(), 0, 0, "R7")).toThrow();
    expect(() => debug.setLevel(initial(), 0)).toThrow();
    expect(() => debug.setSelection(initial(), 8, 0)).toThrow();
    expect(() => debug.setRefillKinds(initial(), 0, "X")).toThrow();
    expect(() => debug.setMenuIndex(initial(), -1)).toThrow();
  });
});

describe("end conditions and posed state", () => {
  it("ends a round when the settled board has no legal swap", () => {
    const s = { ...board(), phase: "resolving" as const, chainStep: 1 };
    expect(legal(s.board)).toBe(false);
    expect(tick(s, hold(s)).screen).toBe("gameover");
  });
  it("gives level completion priority over a board with no move", () => {
    const s = {
      ...board(),
      phase: "resolving" as const,
      chainStep: 1,
      levelScore: C.LEVEL_TARGET_STEP,
    };
    expect(tick(s, hold(s)).screen).toBe("levelclear");
  });
  it("keeps finished boards on back but drops them on quit", () => {
    const s = { ...board(), screen: "gameover" as const };
    expect(action(s, "back").board).toEqual(s.board);
    expect(action({ ...s, menuIndex: 1 }, "confirm").board.cells).toEqual([]);
  });
  it("withdraws and clears independent poses without advancing time", () => {
    let s = debug.setSelection(board(), 0, 0);
    s = debug.setOffer(s, 1, 0);
    s = debug.clearSelection(s);
    expect(s.offer).toEqual({ col: 1, row: 0 });
    s = debug.clearOffer(s);
    s = debug.clearRefusal(s);
    s = debug.clearChain(s);
    s = debug.clearRefillKinds(s);
    expect(s.simTime).toBe(0);
    expect(s.phase).toBe("idle");
    expect(s.offer).toBeNull();
    expect(s.refillKinds).toEqual(Array(8).fill(""));
  });
});
