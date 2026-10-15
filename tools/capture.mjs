/* global document */
// Run once against the development server; no part of the production build.
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => {
  throw e;
});
await page.goto("http://localhost:5173");
await page.waitForTimeout(600);
const recording = await page.evaluate(async () => {
  const { createEngine, ConstantClock } =
    await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
  const { game, BACKGROUND } = await import("/src/game.ts");
  const canvas = document.createElement("canvas");
  canvas.style.width = "1280px";
  canvas.style.height = "720px";
  document.body.replaceChildren(canvas);
  const engine = createEngine({
    canvas,
    width: 1280,
    height: 720,
    game,
    background: BACKGROUND,
    clock: new ConstantClock(1000 / 30),
  });
  await engine.initialize();
  const d = engine.debug;
  engine.apply((s) => d.dealBoard(s));
  engine.apply((s) => d.setScreen(s, "playing"));
  // A run charged with flawed neighbors and two special cuts.
  for (const [col, row, t] of [
    [2, 3, "R0"],
    [3, 3, "A0"],
    [4, 3, "R0b"],
    [3, 2, "R0"],
    [2, 4, "J3"],
    [3, 4, "B3"],
    [4, 4, "S3s"],
    [5, 4, "M3"],
    [6, 4, "C3"],
    [1, 4, "A3"],
  ])
    engine.apply((s) => d.setGem(s, col, row, t));
  await engine.advance(1);
  engine.startRecording();
  engine.apply((s) => d.requestSwap(s, 3, 2, 3, 3));
  await engine.advance(120);
  return engine.stopRecording();
});
await writeFile("showcase/chain.json.gz", gzipSync(JSON.stringify(recording)));
await page.screenshot({ path: "showcase/chain.png" });
await browser.close();
