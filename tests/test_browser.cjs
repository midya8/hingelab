"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawn, execFileSync } = require("node:child_process"),
  { waitForDebugger } = require("./chrome_support.cjs");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
test(
  "Chrome exact atlas, every region, export, error and stale clearing",
  { timeout: 180000 },
  async () => {
    const server = require("node:http").createServer((req, res) => {
      try {
        const file = path.join(
          __dirname,
          "../docs",
          req.url === "/" ? "index.html" : req.url,
        );
        res.setHeader(
          "Content-Type",
          {
            ".html": "text/html",
            ".js": "application/javascript",
            ".css": "text/css",
            ".json": "application/json",
          }[path.extname(file)] || "text/plain",
        );
        res.end(fs.readFileSync(file));
      } catch (e) {
        res.statusCode = 404;
        res.end("not found");
      }
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "hingelab-")),
      browser = spawn(
        process.env.CHROME_BIN || "google-chrome",
        [
          "--headless",
          "--no-sandbox",
          "--disable-gpu",
          "--disable-extensions",
          "--disable-dev-shm-usage",
          "--remote-debugging-port=0",
          `--user-data-dir=${profile}`,
          "about:blank",
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
    let ws,
      startupError,
      diagnostics = "";
    browser.on("error", (e) => (startupError = e));
    browser.stderr.on(
      "data",
      (d) => (diagnostics = (diagnostics + d).slice(-4000)),
    );
    try {
      for (
        let i = 0;
        i < 1200 &&
        !startupError &&
        browser.exitCode === null &&
        !fs.existsSync(path.join(profile, "DevToolsActivePort"));
        i++
      )
        await delay(25);
      assert.ok(
        fs.existsSync(path.join(profile, "DevToolsActivePort")),
        startupError?.message || diagnostics || "Chrome unavailable",
      );
      const port = fs
          .readFileSync(path.join(profile, "DevToolsActivePort"), "utf8")
          .split("\n")[0],
        tab = await waitForDebugger(`http://127.0.0.1:${port}/json/list`, {
          alive: () => browser.exitCode === null && !startupError,
        });
      ws = new WebSocket(tab.webSocketDebuggerUrl);
      await new Promise((r, j) => {
        ws.onopen = r;
        ws.onerror = j;
      });
      let seq = 0;
      const pending = new Map();
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (pending.has(m.id)) {
          const { res, rej } = pending.get(m.id);
          pending.delete(m.id);
          m.error ? rej(Error(JSON.stringify(m.error))) : res(m.result);
        }
      };
      const call = (method, params = {}) =>
          new Promise((res, rej) => {
            const id = ++seq;
            pending.set(id, { res, rej });
            ws.send(JSON.stringify({ id, method, params }));
          }),
        js = async (expression) => {
          const r = await call("Runtime.evaluate", {
            expression,
            returnByValue: true,
            awaitPromise: true,
          });
          if (r.exceptionDetails)
            throw Error(JSON.stringify(r.exceptionDetails));
          return r.result.value;
        };
      await call("Page.enable");
      await call("Page.navigate", {
        url:
          process.env.HINGELAB_URL ||
          `http://127.0.0.1:${server.address().port}/`,
      });
      for (let i = 0; i < 500; i++) {
        if (await js("Boolean(window.hingeReport)")) break;
        await delay(20);
      }
      assert.ok(await js("window.hingeReport"));
      const controls = JSON.parse(
          fs.readFileSync(path.join(__dirname, "../docs/controls.json")),
        ),
        native = JSON.parse(
          execFileSync(
            process.env.PYTHON || "python",
            [
              "-c",
              "import json,sys;from hingelab import atlas;print(json.dumps([atlas(c) for c in json.load(sys.stdin)]))",
            ],
            {
              input: JSON.stringify(controls.map((c) => c.input)),
              maxBuffer: 16 << 20,
            },
          ),
        ),
        set = (id, value, event = "change") =>
          js(
            `document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(String(value))};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event(${JSON.stringify(event)}))`,
          ),
        reports = [];
      let selections = 0;
      for (const width of [320, 390, 1280]) {
        await call("Emulation.setDeviceMetricsOverride", {
          width,
          height: 1200,
          deviceScaleFactor: 1,
          mobile: width < 700,
        });
        for (let k = 0; k < controls.length; k++) {
          await set("control", k);
          const r = await js("window.hingeReport");
          assert.deepEqual(r, native[k]);
          reports.push(r);
          assert.equal(
            await js('document.getElementById("output").hidden'),
            false,
          );
          assert.equal(
            await js('document.querySelectorAll("#cells .cell").length'),
            r.cells.length,
          );
          assert.equal(
            await js('document.getElementById("verdict").textContent'),
            r.closed_ball_robust
              ? "This closed ball is robust."
              : "This closed ball contains an adversary.",
          );
          for (let i = 0; i < r.cells.length; i++) {
            await set("cell", i);
            selections++;
            assert.equal(await js("window.hingeCell"), i);
            assert.ok(
              (
                await js('document.getElementById("cell-detail").textContent')
              ).includes(
                `Margin = (${r.cells[i].slope}) × x + (${r.cells[i].intercept})`,
              ),
            );
            assert.equal(
              await js('document.querySelectorAll(".cell.selected").length'),
              1,
            );
            assert.equal(
              await js(
                '[...document.querySelectorAll("#plot line")].filter(e=>e.getAttribute("stroke-width")==="3").length',
              ),
              r.cells.length,
            );
          }
          await js('document.querySelector("#cells button").click()');
          assert.equal(await js("window.hingeCell"), 0);
          assert.equal(
            await js("document.documentElement.scrollWidth>innerWidth"),
            false,
          );
          if (process.env.HINGELAB_SCREEN_DIR) {
            await delay(1100);
            await js(
              "document.activeElement.blur();window.scrollTo(0,0);new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
            );
            const m = await call("Page.getLayoutMetrics"),
              im = await call("Page.captureScreenshot", {
                format: "png",
                captureBeyondViewport: true,
                clip: {
                  x: 0,
                  y: 0,
                  width: m.cssContentSize.width,
                  height: m.cssContentSize.height,
                  scale: 1,
                },
              });
            fs.writeFileSync(
              path.join(
                process.env.HINGELAB_SCREEN_DIR,
                `control-${k}-${width}.layout.json`,
              ),
              JSON.stringify(
                await js(
                  'Object.fromEntries(["output","plot","cell-detail","cells","limits"].map(id=>[id,document.getElementById(id).getBoundingClientRect().top+scrollY]))',
                ),
              ),
            );
            fs.writeFileSync(
              path.join(
                process.env.HINGELAB_SCREEN_DIR,
                `control-${k}-${width}.png`,
              ),
              Buffer.from(im.data, "base64"),
            );
          }
        }
      }
      await set("control", 0);
      const r = await js("window.hingeReport");
      await js(
        `window.downloadBody=null;window.downloadName=null;URL.createObjectURL=b=>{window.downloadBody=b.text();return'blob:test'};URL.revokeObjectURL=()=>{};HTMLAnchorElement.prototype.click=function(){window.downloadName=this.download};document.getElementById('download').click()`,
      );
      assert.equal(await js("window.downloadName"), "hingelab-atlas.json");
      assert.deepEqual(JSON.parse(await js("window.downloadBody")), r);
      await set("input", "{", "input");
      assert.equal(await js("window.hingeReport"), null);
      assert.equal(await js("window.hingeCell"), null);
      assert.equal(await js('document.getElementById("output").hidden'), true);
      assert.equal(
        await js('document.getElementById("download").disabled'),
        true,
      );
      assert.equal(
        await js('document.querySelectorAll("#cells .cell").length'),
        0,
      );
      await js('document.getElementById("run").click()');
      assert.ok(await js('document.getElementById("error").textContent'));
      for (const raw of [
        {},
        { ...controls[0].input, radius: -1 },
        { ...controls[0].input, extra: 1 },
      ]) {
        await set("input", JSON.stringify(raw), "input");
        await js('document.getElementById("run").click()');
        assert.equal(await js("window.hingeReport"), null);
        assert.ok(await js('document.getElementById("error").textContent'));
      }
      execFileSync(
        process.env.PYTHON || "python",
        [
          "-c",
          "import json,sys;from hingelab.oracle import verify;assert all(verify(r) for r in json.load(sys.stdin))",
        ],
        { input: JSON.stringify(reports), maxBuffer: 16 << 20 },
      );
      console.log(JSON.stringify({ selections, reports: reports.length }));
    } finally {
      if (ws) ws.close();
      if (browser.exitCode === null) {
        const stopped = new Promise((r) => browser.once("exit", r));
        browser.kill("SIGTERM");
        await stopped;
      }
      await new Promise((r) => server.close(r));
      await fs.promises.rm(profile, {
        recursive: true,
        force: true,
        maxRetries: 20,
        retryDelay: 100,
      });
    }
  },
);
