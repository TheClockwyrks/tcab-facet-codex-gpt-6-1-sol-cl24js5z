import type { Game } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";

export type GemKind =
  "ruby" | "amber" | "citrine" | "jade" | "beryl" | "sapphire" | "amethyst";

export type Cut = "plain" | "brilliant" | "star" | "prism";

export type Screen =
  "title" | "howto" | "playing" | "paused" | "levelclear" | "gameover";

export type Phase = "idle" | "swapping" | "resolving";

export type PointerDevice = "mouse" | "pen" | "touch";

export interface CellRef {
  readonly col: number;
  readonly row: number;
}

export interface GemState {
  readonly col: number;
  readonly row: number;
  readonly kind: GemKind | null;
  readonly cut: Cut;
  readonly strain: number;
  readonly fell: number;
}

export interface BoardState {
  readonly cols: number;
  readonly rows: number;
  readonly cells: readonly GemState[];
}

export interface RefusalState {
  readonly a: CellRef;
  readonly b: CellRef;
  readonly timer: number;
}

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
  readonly device: PointerDevice;
}

export interface FacetState {
  readonly screen: Screen;
  readonly menuIndex: number;

  readonly board: BoardState;
  readonly phase: Phase;
  readonly chainStep: number;
  readonly swapTimer: number;
  readonly stepTimer: number;

  readonly score: number;
  readonly level: number;
  readonly levelScore: number;
  readonly lastCleared: number;
  readonly lastPoints: number;
  readonly lastWaves: number;

  readonly moveScore: number;
  readonly bestMove: number;
  readonly bestChain: number;

  readonly selection: CellRef | null;
  readonly offer: CellRef | null;
  readonly refusal: RefusalState | null;
  readonly armedTarget: string | null;

  readonly pointer: PointerState;
  readonly simTime: number;
  readonly muted: boolean;
  readonly refillKinds: readonly string[];
  readonly arrival?: number;
  readonly motion?: { readonly a: CellRef; readonly b: CellRef };
  readonly previous?: readonly GemState[];
  readonly cleared?: readonly { readonly i: number; readonly wave: number }[];
  readonly created?: readonly number[];
  readonly images?: Readonly<Record<string, ImageBitmap>>;
  readonly systems?: Readonly<Record<string, string>>;
}

import { debug } from "./debug";
import { initial, tick } from "./logic";
import { action, pointer } from "./interaction";
import { render } from "./render";
export type FacetDebugApi = typeof debug;
export const BACKGROUND = "#07121b";
export const game: Game<FacetState, FacetDebugApi> = {
  async initialize(api) {
    for (const a of C.ACTIONS)
      api.input.register(a, { keys: [...C.BINDINGS[a]] });
    const paths = [
      "board.png",
      ...C.GEM_KINDS.flatMap((k) => [
        ...Array.from({ length: 4 }, (_, i) => `gems/${k}-${i}.png`),
        ...Array.from({ length: 6 }, (_, i) => `gems/break/${k}/${i}.png`),
      ]),
      ...Array.from({ length: 4 }, (_, i) => `gems/prism-${i}.png`),
      ...Array.from({ length: 8 }, (_, i) => `gems/prism-turn/${i}.png`),
      "gems/brilliant.png",
      "gems/star.png",
    ];
    const images = Object.fromEntries(
      await Promise.all(
        paths.map(async (p) => [p, await api.assets.loadImage(p)]),
      ),
    );
    const systems = Object.fromEntries(
      await Promise.all(
        ["clear", "flawed", "cut", "aura"].map(async (p) => [
          p,
          await (await api.assets.load(`fx/${p}/system.json`)).text(),
        ]),
      ),
    );
    await Promise.all(
      Object.values(C.CUES).map((c) =>
        api.audio.load(c, `audio/${c === C.CUES.clear ? "shatter" : c}.wav`),
      ),
    );
    await Promise.all(
      [
        "title",
        "play",
        ...Array.from({ length: C.MAX_MULTIPLIER }, (_, i) => `clear-${i + 1}`),
      ].map((c) => api.audio.load(c, `audio/${c}.wav`)),
    );
    for (const key of [
      "screen",
      "phase",
      "score",
      "level",
      "levelScore",
      "chainStep",
      "lastCleared",
      "lastPoints",
      "lastWaves",
      "bestMove",
      "bestChain",
    ] as const)
      api.diagnostics.register(key, (s) => s[key]);
    api.diagnostics.register(
      "board",
      (s) => `${s.board.cols} × ${s.board.rows}`,
    );
    api.diagnostics.register(
      "pressure",
      (s) =>
        `fall ${debug.snapshot(s).lastFall} / ×${Math.min(s.chainStep, C.MAX_MULTIPLIER)}`,
    );
    api.diagnostics.register("selection", (s) => JSON.stringify(s.selection));
    api.diagnostics.register("offer", (s) => JSON.stringify(s.offer));
    api.diagnostics.register("legal swap", (s) => debug.snapshot(s).legalSwap);
    api.diagnostics.register(
      "pointer",
      (s) =>
        `${s.pointer.x.toFixed(0)},${s.pointer.y.toFixed(0)} ${s.pointer.device}`,
    );
    api.diagnostics.register("target", (s) => s.level * C.LEVEL_TARGET_STEP);
    return [{ ...initial(), images, systems }, debug];
  },
  update(state: DeepReadonly<FacetState>, api, dt) {
    let s: FacetState = { ...state };
    const cues = new Set<string>();
    if (api.input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
    for (const a of C.ACTIONS)
      if (a !== "mute" && api.input.pressed(a)) s = action(s, a);
    for (const sample of api.input.pointerSamples()) {
      if (!sample.primary) continue;
      const old = s;
      const type =
        sample.type === "down" ? "down" : sample.type === "up" ? "up" : "move";
      s = pointer(s, type, sample.x, sample.y, sample.device);
      if (s.phase === "swapping" && old.phase !== "swapping")
        cues.add(C.CUES.swap);
      if (s.refusal && s.refusal !== old.refusal) cues.add(C.CUES.refuse);
      if (
        s.selection &&
        JSON.stringify(s.selection) !== JSON.stringify(old.selection)
      )
        cues.add(C.CUES.select);
    }
    s = tick(s, dt, (c) => cues.add(c));
    if (s.screen === "playing" && s.arrival !== undefined)
      s = { ...s, arrival: Math.min(1, s.arrival + dt) };
    for (const c of cues) {
      if (c === C.CUES.clear) {
        api.audio.play(C.CUES.clear);
        api.audio.play(
          `clear-${Math.max(1, Math.min(s.chainStep, C.MAX_MULTIPLIER))}`,
        );
      } else api.audio.play(c);
    }
    const theme =
      s.screen === "title" || s.screen === "howto" ? "title" : "play";
    api.audio.stop(theme === "title" ? "play" : "title");
    api.audio.loop(theme);
    return {
      ...s,
      simTime: state.simTime + dt,
      pointer: api.input.pointer(),
      muted: api.audio.muted(),
    };
  },
  render(s, api) {
    render(s, api.ctx);
  },
};
