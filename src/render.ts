import * as C from "./constants";
import { ParticleSimulator } from "@clockwyrks/particle-runtime";
import type { GemState } from "./game";
import { x, y, index, lastFall, type State } from "./logic";
import { items, targets } from "./interaction";
const ink = "#e9e5d3",
  gold = "#c2af7e",
  dim = "#809398";
function text(
  ctx: CanvasRenderingContext2D,
  str: string,
  px: number,
  py: number,
  size = 16,
  color = ink,
  font = "monospace",
  align: CanvasTextAlign = "left",
) {
  ctx.fillStyle = color;
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = align;
  ctx.fillText(str, px, py);
}
function rule(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color = "#29404a",
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function sprite(
  ctx: CanvasRenderingContext2D,
  s: State,
  key: string,
  px: number,
  py: number,
  size = 64,
) {
  const image = s.images?.[key];
  if (image)
    ctx.drawImage(
      image,
      Math.round(px - size / 2),
      Math.round(py - size / 2),
      size,
      size,
    );
}
function fx(
  ctx: CanvasRenderingContext2D,
  s: State,
  name: string,
  px: number,
  py: number,
  age: number,
  seed: number,
) {
  const system = s.systems?.[name];
  if (!system || age < 0 || (name !== "aura" && age > 1)) return;
  const sim = new ParticleSimulator(JSON.parse(system), { seed });
  for (let t = 0; t < age; t += 1 / 60)
    sim.step(Math.min(1 / 60, age - t) * 1000);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of sim.capture()) {
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = `rgb(${p.color.map((c) => Math.round(Math.pow(c, 1 / 2.2) * 255)).join(",")})`;
    const r = Math.max(0.5, p.size);
    ctx.fillRect(px + p.position[0] - r / 2, py - p.position[1] - r / 2, r, r);
  }
  ctx.restore();
}
function stone(
  ctx: CanvasRenderingContext2D,
  s: State,
  g: GemState,
  px: number,
  py: number,
  animate = true,
) {
  sprite(ctx, s, `gems/${g.kind ?? "prism"}-${g.strain}.png`, px, py);
  if (g.cut === "prism" && animate) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    sprite(
      ctx,
      s,
      `gems/prism-turn/${Math.floor(s.simTime * 8) % 8}.png`,
      px,
      py,
    );
    ctx.restore();
  }
  if (g.cut === "brilliant" || g.cut === "star")
    sprite(ctx, s, `gems/${g.cut}.png`, px, py);
  if (g.cut !== "plain" && animate)
    fx(ctx, s, "aura", px, py, 1 + (s.simTime % 1), index(g) + 19);
}
function field(ctx: CanvasRenderingContext2D) {
  const grad = ctx.createRadialGradient(640, 335, 80, 640, 335, 780);
  grad.addColorStop(0, "#142b35");
  grad.addColorStop(0.6, "#0c1b25");
  grad.addColorStop(1, "#07121b");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  for (let i = 0; i < 16; i++) {
    const px = 40 + i * 84;
    rule(ctx, px, 0, px - 280, 720, "#12242d");
  }
  rule(ctx, 38, 36, 206, 36);
  rule(ctx, 1074, 684, 1242, 684);
  text(ctx, "F / 07", 40, 28, 11, dim);
  text(
    ctx,
    "THE LAPIDARY COLLECTION",
    1240,
    704,
    10,
    dim,
    "monospace",
    "right",
  );
}
function button(
  ctx: CanvasRenderingContext2D,
  t: { x: number; y: number; w: number; h: number },
  label: string,
  selected: boolean,
) {
  ctx.fillStyle = selected ? "#c8b787" : "#112631";
  ctx.fillRect(t.x, t.y, t.w, t.h);
  ctx.strokeStyle = selected ? "#efe6c8" : "#37505b";
  ctx.strokeRect(t.x + 0.5, t.y + 0.5, t.w - 1, t.h - 1);
  text(ctx, label, t.x + 26, t.y + t.h / 2 + 6, 18, selected ? "#11202b" : ink);
  text(
    ctx,
    selected ? "↗" : "·",
    t.x + t.w - 28,
    t.y + t.h / 2 + 7,
    22,
    selected ? "#11202b" : dim,
    "monospace",
    "right",
  );
}
function board(ctx: CanvasRenderingContext2D, s: State) {
  ctx.fillStyle = "#07131b";
  ctx.fillRect(340, 96, 600, 600);
  sprite(ctx, s, "board.png", 640, 396, 600);
  for (let row = 0; row < C.GRID_ROWS; row++)
    for (let col = 0; col < C.GRID_COLS; col++) {
      ctx.fillStyle = (row + col) % 2 ? "#142832" : "#172d36";
      ctx.fillRect(x(col) - 34, y(row) - 34, 68, 68);
      ctx.fillStyle = "#28404a";
      ctx.fillRect(x(col) - 1, y(row) + 29, 2, 2);
    }
  ctx.save();
  ctx.beginPath();
  ctx.rect(350, 106, 580, 580);
  ctx.clip();
  const shatter = s.lastWaves * C.WAVE_SECONDS;
  for (const g of s.board.cells) {
    let px = x(g.col),
      py = y(g.row);
    if (s.selection && s.offer) {
      if (index(g) === index(s.selection)) {
        px = x(s.offer.col);
        py = y(s.offer.row);
      } else if (index(g) === index(s.offer)) {
        px = x(s.selection.col);
        py = y(s.selection.row);
      }
    }
    if (s.phase === "swapping" && s.motion) {
      let from = null;
      if (index(g) === index(s.motion.a)) from = s.motion.b;
      if (index(g) === index(s.motion.b)) from = s.motion.a;
      if (from) {
        const p = s.swapTimer / C.SWAP_SECONDS;
        const ease = p * p * (3 - 2 * p);
        px = x(from.col) + (px - x(from.col)) * ease;
        py = y(from.row) + (py - y(from.row)) * ease;
      }
    }
    if (s.phase === "resolving" && g.fell) {
      const elapsed = Math.max(0, s.stepTimer - shatter);
      const duration = g.fell * C.FALL_SECONDS_PER_ROW;
      const p = Math.min(1, elapsed / duration);
      py -= g.fell * C.CELL_PITCH * (1 - p * p);
    }
    if (
      s.phase === "idle" &&
      s.arrival !== undefined &&
      s.arrival < 1 &&
      g.fell
    ) {
      const progress = Math.min(
        1,
        s.arrival / (g.fell * C.FALL_SECONDS_PER_ROW),
      );
      py -= g.fell * C.CELL_PITCH * (1 - progress * progress);
    }
    stone(ctx, s, g, px, py, s.screen === "playing");
  }
  if (s.phase === "resolving" && s.previous) {
    for (const c of s.cleared ?? []) {
      const g = s.previous[c.i],
        age = s.stepTimer - c.wave * C.WAVE_SECONDS;
      const px = x(g.col),
        py = y(g.row);
      if (age < 0) stone(ctx, s, g, px, py, false);
      else if (age < 0.3) {
        sprite(
          ctx,
          s,
          `gems/break/${g.kind ?? "beryl"}/${Math.min(5, Math.floor(age * 20))}.png`,
          px,
          py,
        );
        fx(
          ctx,
          s,
          g.strain === C.MAX_STRAIN ? "flawed" : "clear",
          px,
          py,
          age,
          c.i + 7,
        );
      }
    }
    for (const i of s.created ?? [])
      fx(
        ctx,
        s,
        "cut",
        x(i % C.GRID_COLS),
        y(Math.floor(i / C.GRID_COLS)),
        s.stepTimer,
        i + 31,
      );
  }
  ctx.restore();
  if (s.selection) {
    ctx.strokeStyle = "#fff0b5";
    ctx.lineWidth = 2;
    ctx.strokeRect(x(s.selection.col) - 33, y(s.selection.row) - 33, 66, 66);
  }
  if (s.refusal) {
    ctx.strokeStyle = "#f87b88";
    ctx.lineWidth = 3;
    for (const p of [s.refusal.a, s.refusal.b])
      ctx.strokeRect(x(p.col) - 31, y(p.row) - 31, 62, 62);
  }
  text(ctx, C.HUD_SCORE_LABEL, 352, 40, 11, dim);
  text(ctx, s.score.toLocaleString(), 352, 75, 30, ink, "Georgia");
  text(
    ctx,
    `${C.HUD_LEVEL_LABEL}  ${String(s.level).padStart(2, "0")}`,
    640,
    34,
    13,
    gold,
    "monospace",
    "center",
  );
  ctx.fillStyle = "#283c43";
  ctx.fillRect(546, 48, 188, 5);
  ctx.fillStyle = gold;
  ctx.fillRect(
    546,
    48,
    188 * Math.min(1, s.levelScore / (s.level * C.LEVEL_TARGET_STEP)),
    5,
  );
  text(
    ctx,
    `${s.levelScore} / ${s.level * C.LEVEL_TARGET_STEP}`,
    640,
    76,
    11,
    dim,
    "monospace",
    "center",
  );
  if (s.phase === "resolving")
    text(
      ctx,
      `${C.HUD_CHAIN_LABEL} ×${Math.min(s.chainStep, C.MAX_MULTIPLIER)}`,
      928,
      66,
      23,
      gold,
      "Georgia",
      "right",
    );
  text(ctx, "FACET", 52, 126, 35, ink, "Georgia");
  text(ctx, "PRESSURE / POTENTIAL", 54, 153, 10, gold);
  rule(ctx, 54, 177, 274, 177);
  text(ctx, "Make the match.", 54, 221, 23, ink, "Georgia");
  text(ctx, "Find the fracture.", 54, 252, 23, ink, "Georgia");
  for (const [i, line] of [
    "Swap neighboring stones.",
    "Line up three or more.",
    "Let the pressure build.",
  ].entries())
    text(ctx, line, 54, 292 + i * 24, 12, dim);
  text(ctx, "STRAIN", 54, 399, 11, gold);
  for (let i = 0; i < 4; i++) {
    sprite(ctx, s, `gems/jade-${i}.png`, 76 + i * 57, 444, 48);
    text(
      ctx,
      i === 3 ? "FLAWED" : String(i),
      76 + i * 57,
      489,
      10,
      i === 3 ? gold : dim,
      "monospace",
      "center",
    );
  }
  text(ctx, "A flawed stone joins a", 54, 531, 12, dim);
  text(ctx, "touching clear. Double value.", 54, 553, 12, dim);
  text(ctx, "RELEASE TO SWAP", 54, 653, 11, gold);
  text(ctx, "Mouse · Pen · Touch", 54, 676, 11, dim);
  text(ctx, "THE CUTS", 986, 217, 11, gold);
  const cuts = [
    ["brilliant", "FOUR", "Clears its neighbors."],
    ["star", "CROSS", "Clears row + column."],
    ["prism", "FIVE +", "Takes a whole kind."],
  ];
  cuts.forEach(([cut, label, desc], i) => {
    const yy = 270 + i * 113;
    stone(
      ctx,
      s,
      {
        col: 0,
        row: 0,
        kind: cut === "prism" ? null : "beryl",
        cut: cut as GemState["cut"],
        strain: 0,
        fell: 0,
      },
      1010,
      yy,
      false,
    );
    text(ctx, label, 1056, yy - 8, 10, gold);
    text(ctx, cut.toUpperCase(), 1056, yy + 13, 14, ink);
    text(ctx, desc, 986, yy + 48, 11, dim);
  });
  text(ctx, s.muted ? "M  SOUND OFF" : "M  SOUND ON", 986, 654, 11, gold);
  text(ctx, "P / ESC  PAUSE", 986, 677, 11, dim);
  if (s.screen === "playing")
    for (const t of targets(s)) button(ctx, t, C.PAUSE_LABEL, false);
}
export function render(s: State, ctx: CanvasRenderingContext2D) {
  ctx.imageSmoothingEnabled = false;
  field(ctx);
  if (!["title", "howto"].includes(s.screen)) board(ctx, s);
  if (s.screen === "title") {
    text(
      ctx,
      "A GAME OF STRAIN & STONE",
      640,
      123,
      12,
      gold,
      "monospace",
      "center",
    );
    text(ctx, C.TITLE_TEXT, 640, 282, 136, ink, "Georgia", "center");
    rule(ctx, 493, 312, 787, 312, gold);
    text(ctx, C.TAGLINE_TEXT, 640, 354, 15, gold, "monospace", "center");
    const positions = [
      [270, 275, 0],
      [1020, 260, 5],
      [205, 467, 3],
      [1080, 488, 6],
      [358, 590, 1],
      [941, 603, 4],
    ];
    for (const [px, py, k] of positions) {
      ctx.save();
      ctx.translate(px, py + Math.sin(s.simTime * 0.7 + k) * 5);
      ctx.scale(1.5, 1.5);
      sprite(ctx, s, `gems/${C.GEM_KINDS[k]}-0.png`, 0, 0);
      ctx.restore();
    }
    text(
      ctx,
      "SEVEN STONES. ONE BEAUTIFUL CHAIN REACTION.",
      640,
      649,
      11,
      dim,
      "monospace",
      "center",
    );
    text(
      ctx,
      "↑ ↓  CHOOSE     ENTER  PLAY     M  SOUND",
      640,
      678,
      10,
      dim,
      "monospace",
      "center",
    );
  } else if (s.screen === "howto") {
    text(ctx, "THE ART OF THE CHAIN", 70, 99, 43, ink, "Georgia");
    text(
      ctx,
      "Every clear leaves a little pressure behind.",
      70,
      139,
      16,
      gold,
    );
    const blocks = [
      [
        "01  TAKE HOLD",
        "Seven kinds of stone, one 8 × 8 board. Press a gem with a mouse,",
        "pen, or finger; carry it onto a neighbor and release to swap.",
        "Carry it back to its start to cancel. Three in a line shatter.",
        "A swap that clears nothing is refused.",
      ],
      [
        "02  BUILD PRESSURE",
        "Stones beside a clear gain strain. After three hits, they are",
        "flawed: a touching clear takes them too, for double the points.",
        "Falling gems can match again. Each chain step raises the value.",
        "Reach the level target; the round ends when no move remains.",
      ],
      [
        "03  EARN THE CUT",
        "Four in a line leaves a brilliant: it takes its eight neighbors.",
        "Five or more leaves a prism: swap it to clear an entire kind.",
        "Crossing lines leave a star: it takes its whole row and column.",
        "Set up the next match. Spend the strain when it matters.",
      ],
    ];
    blocks.forEach((b, i) => {
      const yy = 198 + i * 139;
      text(ctx, b[0], 70, yy, 12, gold);
      b.slice(1).forEach((l, j) => text(ctx, l, 70, yy + 28 + j * 22, 15, ink));
    });
    text(ctx, "MENUS", 862, 199, 12, gold);
    [
      "↑ / ↓   Choose",
      "ENTER / SPACE   Accept",
      "P / ESC   Pause / resume",
      "ESC   Back",
      "M   Toggle sound",
    ].forEach((l, i) => text(ctx, l, 862, 238 + i * 38, 13, ink));
    for (let i = 0; i < 3; i++)
      sprite(ctx, s, `gems/${C.GEM_KINDS[i * 2]}-0.png`, 898 + i * 107, 497);
    for (const t of targets(s)) button(ctx, t, C.BACK_LABEL, false);
  } else if (s.screen !== "playing") {
    ctx.fillStyle = "#06121bdc";
    ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
    ctx.fillStyle = "#102630";
    ctx.fillRect(406, 180, 468, 440);
    rule(ctx, 406, 180, 874, 180, gold);
    const title =
      s.screen === "paused"
        ? C.PAUSED_TITLE_TEXT
        : s.screen === "levelclear"
          ? C.LEVELCLEAR_TITLE_TEXT
          : C.GAMEOVER_TITLE_TEXT;
    text(ctx, title, 640, 270, 40, ink, "Georgia", "center");
    if (s.screen === "levelclear") {
      text(
        ctx,
        `${C.HUD_LEVEL_LABEL} ${s.level} COMPLETE`,
        640,
        315,
        12,
        gold,
        "monospace",
        "center",
      );
      text(
        ctx,
        `${C.BEST_CHAIN_LABEL}  ${s.bestChain}     ${C.BEST_MOVE_LABEL}  ${s.bestMove}`,
        640,
        361,
        12,
        ink,
        "monospace",
        "center",
      );
    } else if (s.screen === "gameover")
      text(
        ctx,
        `${C.HUD_SCORE_LABEL}  ${s.score}    ${C.HUD_LEVEL_LABEL}  ${s.level}`,
        640,
        345,
        16,
        gold,
        "monospace",
        "center",
      );
    else
      text(ctx, "The stones can wait.", 640, 347, 18, dim, "Georgia", "center");
  }
  if (items(s.screen).length)
    targets(s).forEach((t, i) =>
      button(ctx, t, items(s.screen)[i], s.menuIndex === i),
    );
}
export { lastFall };
