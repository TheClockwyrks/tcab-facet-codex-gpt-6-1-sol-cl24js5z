import * as C from "./constants";
import type { CellRef, FacetState, PointerDevice, Screen } from "./game";
import {
  adjacent,
  deal,
  empty,
  initial,
  swap,
  x,
  y,
  type State,
} from "./logic";
export function items(screen: Screen): readonly string[] {
  switch (screen) {
    case "title":
      return C.TITLE_ITEMS;
    case "paused":
      return C.PAUSED_ITEMS;
    case "levelclear":
      return C.LEVELCLEAR_ITEMS;
    case "gameover":
      return C.GAMEOVER_ITEMS;
    default:
      return [];
  }
}
export function targets(s: State) {
  if (s.screen === "playing")
    return [{ id: "pause", x: 1072, y: 28, w: 152, h: C.TARGET_MIN_H }];
  if (s.screen === "howto")
    return [{ id: "back", x: 1072, y: 610, w: 152, h: C.TARGET_MIN_H }];
  return items(s.screen).map((_, i) => ({
    id: `menu-${i}`,
    x: 480,
    y: 414 + i * 88,
    w: 320,
    h: 76,
  }));
}
export function screen(s: State, to: Screen, menuIndex = 0): FacetState {
  return { ...s, screen: to, menuIndex, armedTarget: null };
}
export function choose(s: State): FacetState {
  if (s.screen === "title")
    return s.menuIndex === 0
      ? {
          ...initial(),
          images: s.images,
          systems: s.systems,
          muted: s.muted,
          simTime: s.simTime,
          screen: "playing",
          board: deal(),
          arrival: 0,
        }
      : screen(s, "howto");
  if (s.screen === "paused" && s.menuIndex === 0) return screen(s, "playing");
  if (s.screen === "levelclear" && s.menuIndex === 0)
    return {
      ...screen(s, "playing"),
      level: s.level + 1,
      levelScore: 0,
      bestMove: 0,
      bestChain: 0,
      board: deal(),
      arrival: 0,
      selection: null,
      offer: null,
    };
  if (s.screen === "gameover" && s.menuIndex === 0)
    return {
      ...initial(),
      images: s.images,
      systems: s.systems,
      muted: s.muted,
      simTime: s.simTime,
      screen: "playing",
      board: deal(),
      arrival: 0,
    };
  return {
    ...screen(s, "title"),
    board: empty(),
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    selection: null,
    offer: null,
    refusal: null,
  };
}
export function action(s: State, a: string): FacetState {
  if (a === "pause" && (s.screen === "playing" || s.screen === "paused"))
    return screen(s, s.screen === "playing" ? "paused" : "playing");
  if (a === "back" && (s.screen === "howto" || s.screen === "gameover"))
    return screen(s, "title", s.screen === "howto" ? 1 : 0);
  const n = items(s.screen).length;
  if (n) {
    if (a === "up" || a === "down")
      return { ...s, menuIndex: (s.menuIndex + (a === "up" ? -1 : 1) + n) % n };
    if (a === "confirm") return choose(s);
  }
  return { ...s };
}
export function cellAt(px: number, py: number): CellRef | null {
  let found: CellRef | null = null,
    best = C.GEM_HIT_R ** 2;
  for (let row = 0; row < C.GRID_ROWS; row++)
    for (let col = 0; col < C.GRID_COLS; col++) {
      const d = (px - x(col)) ** 2 + (py - y(row)) ** 2;
      if (d <= best) {
        if (d < best || !found) {
          best = d;
          found = { col, row };
        }
      }
    }
  return found;
}
export function pointer(
  s: State,
  type: "down" | "move" | "up",
  px: number,
  py: number,
  device: PointerDevice = "mouse",
): FacetState {
  if (
    !Number.isFinite(px) ||
    !Number.isFinite(py) ||
    !["mouse", "pen", "touch"].includes(device)
  )
    throw new RangeError("Facet: invalid pointer");
  let n: FacetState = {
    ...s,
    pointer: {
      x: px,
      y: py,
      device,
      down: type === "up" ? false : type === "down" ? true : s.pointer.down,
    },
  };
  const target = targets(s).find(
    (t) => px >= t.x && px <= t.x + t.w && py >= t.y && py <= t.y + t.h,
  );
  if (target?.id.startsWith("menu-") && (type !== "move" || !s.pointer.down))
    n = { ...n, menuIndex: Number(target.id.slice(5)) };
  if (type === "down") n = { ...n, armedTarget: target?.id ?? null };
  if (type === "up") {
    n = { ...n, armedTarget: null };
    if (target && s.armedTarget === target.id)
      return action(
        n,
        target.id === "pause"
          ? "pause"
          : target.id === "back"
            ? "back"
            : "confirm",
      );
  }
  if (s.screen !== "playing" || target || s.armedTarget) return n;
  const cell = cellAt(px, py);
  if (type === "down") {
    if (!cell) n = { ...n, selection: null, offer: null };
    else if (s.selection && adjacent(s.selection, cell))
      n = { ...n, offer: cell };
    else n = { ...n, selection: cell, offer: null };
  } else if (type === "move" && s.pointer.down && s.selection && cell) {
    if (cell.col === s.selection.col && cell.row === s.selection.row)
      n = { ...n, offer: null };
    else if (adjacent(s.selection, cell)) n = { ...n, offer: cell };
  } else if (type === "up" && s.selection && s.offer)
    n = { ...swap(n, s.selection, s.offer), selection: null, offer: null };
  return n;
}
