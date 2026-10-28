"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { libreOfficeArgs } = require("../src/utils/documentRenderer");
const { mapWithLimit } = require("../src/utils/mapWithLimit");

test("every LibreOffice conversion gets its own profile folder", () => {
  const args = libreOfficeArgs("/tmp/work/in.docx", "/tmp/work", "/tmp/work/lo-profile");
  assert.equal(args[0], "-env:UserInstallation=file:///tmp/work/lo-profile");
  assert.deepEqual(args.slice(1), ["--headless", "--convert-to", "pdf", "--outdir", "/tmp/work", "/tmp/work/in.docx"]);
  const other = libreOfficeArgs("/tmp/other/in.docx", "/tmp/other", "/tmp/other/lo-profile");
  assert.notEqual(args[0], other[0]);
});

test("mapWithLimit keeps results in order", async () => {
  const out = await mapWithLimit([1, 2, 3, 4, 5], 2, async (n) => {
    await new Promise((r) => setTimeout(r, 6 - n));
    return n * 10;
  });
  assert.deepEqual(out, [10, 20, 30, 40, 50]);
});

test("mapWithLimit never runs more than the limit at once", async () => {
  let running = 0;
  let peak = 0;
  await mapWithLimit(Array.from({ length: 12 }, (_, i) => i), 4, async () => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    running -= 1;
  });
  assert.equal(peak, 4);
});

test("mapWithLimit rejects with the first error and starts nothing more", async () => {
  const started = [];
  await assert.rejects(
    mapWithLimit([1, 2, 3, 4, 5, 6], 1, async (n) => {
      started.push(n);
      if (n === 2) throw new Error("upload failed");
      return n;
    }),
    /upload failed/
  );
  assert.deepEqual(started, [1, 2]);
});

test("mapWithLimit handles an empty list", async () => {
  assert.deepEqual(await mapWithLimit([], 4, async () => 1), []);
});
