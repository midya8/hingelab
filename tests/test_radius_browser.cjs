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
  "Chrome radius profiles, inverse targets, existence endpoints, export and stale clearing",
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
          process.env.HINGELAB_RADIUS_URL ||
          `http://127.0.0.1:${server.address().port}/radius.html`,
      });
      for (let i = 0; i < 500; i++) {
        if (await js("Boolean(window.radiusReport)")) break;
        await delay(20);
      }
      assert.ok(await js("window.radiusReport"));
      const controls = JSON.parse(
          fs.readFileSync(path.join(__dirname, "../docs/controls.json")),
        ),
        inputs = controls.map((c) => ({
          network: c.input,
          target_fraction: "1/2",
        })),
        native = JSON.parse(
          execFileSync(
            process.env.PYTHON || "python",
            [
              "-c",
              "import sys,json;from hingelab.radius import radius_profile;print(json.dumps([radius_profile(r) for r in json.load(sys.stdin)]))",
            ],
            { input: JSON.stringify(inputs), maxBuffer: 16 << 20 },
          ),
        );
      const set = (id, value, event = "change") =>
          js(
            `document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(String(value))};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event(${JSON.stringify(event)}))`,
          ),
        reports = [];
      async function shot(name) {
        if (!process.env.HINGELAB_RADIUS_SCREEN_DIR) return;
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
          path.join(process.env.HINGELAB_RADIUS_SCREEN_DIR, `${name}.png`),
          Buffer.from(im.data, "base64"),
        );
        fs.writeFileSync(
          path.join(
            process.env.HINGELAB_RADIUS_SCREEN_DIR,
            `${name}.layout.json`,
          ),
          JSON.stringify(
            await js(
              'Object.fromEntries(["output","plot","classes","existence","limits"].map(id=>[id,document.getElementById(id).getBoundingClientRect().top+scrollY]))',
            ),
          ),
        );
      }
      for (const width of [320, 390, 1280]) {
        await call("Emulation.setDeviceMetricsOverride", {
          width,
          height: 1200,
          deviceScaleFactor: 1,
          mobile: width < 700,
        });
        for (let k = 0; k < controls.length; k++) {
          await set("target", "1/2", "input");
          await set("control", k);
          const r = await js("window.radiusReport");
          assert.deepEqual(r, native[k]);
          reports.push(r);
          assert.equal(
            await js("document.documentElement.scrollWidth>innerWidth"),
            false,
          );
          assert.equal(
            await js('document.querySelectorAll("#classes article").length'),
            2,
          );
          assert.equal(
            await js('document.querySelectorAll("#pieces tr").length'),
            r.length_segments.length,
          );
          assert.equal(
            await js('document.querySelectorAll("svg polyline").length'),
            6,
          );
          await shot(`control-${k}-${width}`);
        }
      }
      await call("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 1200,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await set("control", 0);
      await set("target", "0", "input");
      let r = await js("window.radiusReport");
      assert.equal(r.first_radius_at_most, "2");
      assert.equal(
        r.classes[0].existence_radius_regions[0].right_closed,
        false,
      );
      assert.equal(r.classes[1].existence_radius_regions[0].right_closed, true);
      reports.push(r);
      await shot("state-zero-length");
      await set("control", 2);
      r = await js("window.radiusReport");
      assert.deepEqual(r.classes[1].existence_radius_regions, [
        { left: "0", right: "0", left_closed: true, right_closed: true },
      ]);
      reports.push(r);
      await shot("state-isolated-tie");
      await set("control", 3);
      r = await js("window.radiusReport");
      assert.equal(r.first_radius_at_most, null);
      reports.push(r);
      assert.ok(
        (await js('document.getElementById("verdict").textContent')).includes(
          "not reached",
        ),
      );
      await shot("state-unattained");
      await set("target", "1", "input");
      r = await js("window.radiusReport");
      assert.equal(r.first_radius_at_most, "0");
      reports.push(r);
      await shot("state-target-one");
      await js(
        `window.downloadBody=null;window.downloadName=null;URL.createObjectURL=b=>{window.downloadBody=b.text();return'blob:test'};URL.revokeObjectURL=()=>{};HTMLAnchorElement.prototype.click=function(){window.downloadName=this.download};document.getElementById('download').click()`,
      );
      assert.equal(await js("window.downloadName"), "hingelab-radius.json");
      assert.deepEqual(JSON.parse(await js("window.downloadBody")), r);
      for (const bad of ["-1", "2", "1/1025", "0.5", "bad"]) {
        await set("target", bad, "input");
        assert.equal(await js("window.radiusReport"), null);
        assert.equal(
          await js('document.getElementById("download").disabled'),
          true,
        );
        assert.ok(await js('document.getElementById("error").textContent'));
      }
      await set("target", "1/2", "input");
      await set("control", 0);
      await set("input", "{", "input");
      assert.equal(await js("window.radiusReport"), null);
      assert.equal(await js('document.getElementById("output").hidden'), true);
      await js('document.getElementById("run").click()');
      assert.ok(await js('document.getElementById("error").textContent'));
      for (const raw of [{}, { ...controls[0].input, extra: 1 }]) {
        await set("input", JSON.stringify(raw), "input");
        await js('document.getElementById("run").click()');
        assert.equal(await js("window.radiusReport"), null);
        assert.ok(await js('document.getElementById("error").textContent'));
      }
      execFileSync(
        process.env.PYTHON || "python",
        [
          "-c",
          "import sys,json;from hingelab.radius_oracle import radius_verify;assert all(radius_verify(r) for r in json.load(sys.stdin))",
        ],
        { input: JSON.stringify(reports), maxBuffer: 32 << 20 },
      );
      console.log(JSON.stringify({ radiusBrowserReports: reports.length }));
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
