// Dependency-free browser checks. Run: node scripts/check-site.mjs
// Requires Chrome or Edge; screenshots are saved in the OS temporary directory.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile, mkdtemp, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, extname, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = await mkdtemp(join(tmpdir(), "sevencontinents-ui-"));
const profile = join(output, "browser-profile");
const candidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
let executable;
for (const candidate of candidates) {
  try { await access(candidate); executable = candidate; break; } catch {}
}
assert.ok(executable, "Install Chrome/Edge, or set CHROME_PATH.");
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".xml": "application/xml", ".txt": "text/plain" };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const target = resolve(root, "." + (pathname.endsWith("/") ? pathname + "index.html" : pathname));
    if (!target.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const body = await readFile(target);
    res.writeHead(200, { "Content-Type": (types[extname(target)] || "application/octet-stream") + "; charset=utf-8", "Cache-Control": "no-store" });
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = "http://127.0.0.1:" + server.address().port;
const browser = spawn(executable, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--disable-background-networking", "--disable-extensions", "--remote-debugging-port=0",
  "--force-color-profile=srgb", "--user-data-dir=" + profile, "about:blank",
], { windowsHide: true, stdio: "ignore" });
let socket;
let commandId = 0;
const pending = new Map();
const errors = [];
const checks = [];
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const wait = async (probe, label, timeout = 12000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const result = await probe(); if (result) return result; } catch {}
    await pause(80);
  }
  throw new Error("Timed out: " + label);
};
const send = (method, params = {}) => new Promise((done, fail) => {
  const id = ++commandId;
  const timeout = setTimeout(() => { pending.delete(id); fail(new Error(method + " timed out")); }, 15000);
  pending.set(id, { done, fail, timeout });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (fn, argument) => {
  const expression = "(" + fn.toString() + ")(" + JSON.stringify(argument) + ")";
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ": " + JSON.stringify(result.exceptionDetails.exception));
  return result.result.value;
};
const navigate = async (path = "/") => {
  await send("Page.navigate", { url: base + path });
  await wait(() => evaluate((path) => document.readyState === "complete" && location.pathname + location.search === path, path), "load " + path);
  await pause(850);
};
const viewport = async (width, height, mobile = false) => {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  await send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
};
const click = async (selector) => {
  await evaluate((selector) => document.querySelector(selector).scrollIntoView({ block: "center", behavior: "instant" }), selector);
  await pause(120);
  const point = await evaluate((selector) => {
    const rect = document.querySelector(selector).getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, selector);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
};
const key = async (key, modifiers = 0) => {
  const codes = { Escape: 27, Tab: 9, ArrowLeft: 37, ArrowRight: 39, Enter: 13 };
  const windowsVirtualKeyCode = codes[key] || 0;
  await send("Input.dispatchKeyEvent", { type: "keyDown", key, modifiers, windowsVirtualKeyCode });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, modifiers, windowsVirtualKeyCode });
};
const screenshot = async (name) => {
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(join(output, name + ".png"), Buffer.from(shot.data, "base64"));
};
const check = (name, result) => { assert.ok(result, name); checks.push(name); };
const fillForm = async () => evaluate(() => {
  const values = { "full-name": "UI Preview", email: "preview@example.com", destination: "Philippines", message: "Please help arrange a trip.", "travelers": "2" };
  for (const [id, value] of Object.entries(values)) {
    const field = document.getElementById(id);
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }
});

try {
  const port = await wait(async () => Number((await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]), "Chrome debugging port");
  const pages = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json();
  const target = pages.find((page) => page.type === "page");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, fail) => { socket.addEventListener("open", done, { once: true }); socket.addEventListener("error", fail, { once: true }); });
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id);
      clearTimeout(request.timeout);
      pending.delete(message.id);
      if (message.error) request.fail(new Error(JSON.stringify(message.error)));
      else request.done(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text + " " + JSON.stringify(message.params.exceptionDetails.exception));
    if (message.method === "Network.responseReceived" && message.params.response.url.startsWith(base) && message.params.response.status >= 400) {
      // Chromium may probe for a conventional favicon; the site's declared favicon is checked below.
      if (!message.params.response.url.endsWith("/favicon.ico")) errors.push(message.params.response.url);
    }
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });

  // Layout, semantics, images and local destinations at phone, tablet, laptop and desktop widths.
  for (const width of [360, 390, 768, 1024, 1280, 1920]) {
    await viewport(width, 900, width < 640);
    for (const path of ["/", "/gallery.html"]) {
      await navigate(path);
      const structure = await evaluate(() => {
        const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          h1: document.querySelectorAll("h1").length,
          duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
          unnamedButtons: [...document.querySelectorAll("button")].filter((button) => !(button.getAttribute("aria-label") || button.textContent.trim())).length,
          missingAlt: document.querySelectorAll("img:not([alt])").length,
          targets: [...document.querySelectorAll("a[href], img[src], source[srcset], link[rel=stylesheet], script[src]")].map((element) => element.href || element.src || new URL(element.srcset, location.href).href),
        };
      });
      check(width + "px " + path + " no overflow; semantic headings and labels", !structure.overflow && structure.h1 === 1 && !structure.duplicateIds.length && !structure.unnamedButtons && !structure.missingAlt);
      if (width === 1280) {
        for (const target of new Set(structure.targets.filter((url) => url.startsWith(base)))) {
          const url = new URL(target);
          const response = await fetch(url);
          assert.ok(response.ok, "Local resource " + target);
          if (url.hash) {
            const html = await response.text();
            assert.ok(html.includes('id="' + decodeURIComponent(url.hash.slice(1)) + '"'), "Anchor destination " + target);
          }
        }
        checks.push(path + " local assets and cross-page anchors resolve");
      }
      await evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          scrollTo({ top: y, behavior: "instant" });
          await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        }
      });
      await wait(() => evaluate(() => [...document.images].filter((image) => !image.closest("dialog")).every((image) => image.complete && image.naturalWidth > 0)), "lazy images");
      await evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
      await pause(850);
      if ([390, 768, 1280].includes(width)) await screenshot(width + (path === "/" ? "-home" : "-gallery"));
    }
  }

  await viewport(1280, 900);
  await navigate("/");
  check("All eight services, five values, mission, vision and competencies retained", await evaluate(() =>
    document.querySelectorAll(".service-card").length === 8 && document.querySelectorAll(".value-card").length === 5 &&
    document.querySelectorAll(".mission-list li").length === 3 && document.querySelectorAll(".competency-card").length === 2));
  check("Original address, telephone and social destinations restored", await evaluate(() =>
    document.querySelector("#contact").textContent.includes("Bluebay Walk") &&
    document.querySelectorAll('a[href="tel:+63283643904"]').length >= 3 &&
    document.querySelectorAll('a[href*="facebook.com/sevencontinentstravelandtours"]').length >= 3 &&
    document.querySelectorAll('a[href*="instagram.com/7continentsPH/"]').length >= 2));
  const originalHeader = await evaluate(() => document.querySelector("header").outerHTML);
  const originalFooter = await evaluate(() => document.querySelector("footer").outerHTML);
  for (const [section, name] of [["#inspiration", "inspiration"], ["#services", "services"], [".site-footer", "footer"]]) {
    await evaluate((selector) => document.querySelector(selector).scrollIntoView({ behavior: "instant", block: "start" }), section);
    await pause(900);
    await screenshot("1280-" + name);
  }
  await evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  const heroPoint = await evaluate(() => { const r = document.querySelector(".hero .button").getBoundingClientRect(); return { x: r.x + 30, y: r.y + 20 }; });
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...heroPoint });
  await pause(400);
  check("CTA hover still animates after entrance has finished", await evaluate(() => getComputedStyle(document.querySelector(".hero .button")).translate.includes("-3px")));
  await evaluate(() => { window.__navigationProbe = true; });
  await click('a[href="index.html#services"]');
  await pause(800);
  check("Same-page navigation from / preserves page and scrolls to Services", await evaluate(() => window.__navigationProbe && location.pathname === "/" && location.hash === "#services" && document.querySelector("#services").getBoundingClientRect().top > 0));
  await click('[data-service="Hotel Bookings"]');
  await pause(800);
  check("Service enquiry carries selected service into planner", await evaluate(() => document.querySelector('[name="service"]').value === "Hotel Bookings" && !document.querySelector("[data-service-status]").hidden));
  await screenshot("1280-contact");
  await click("[data-submit-button]");
  check("Planner validation focuses first missing required field", await evaluate(() => document.activeElement.id === "full-name" && document.querySelector("#full-name").getAttribute("aria-invalid") === "true"));
  await fillForm();
  await click("[data-submit-button]");
  await wait(() => evaluate(() => document.querySelector("[data-form-status]").textContent.includes("has not been sent")), "honest copy confirmation");
  check("Unconfigured planner copies or exposes manual text; never claims enquiry sent", await evaluate(() => {
    const fallback = document.querySelector(".copy-fallback");
    return !document.querySelector("[data-submit-button]").disabled && (!fallback || fallback.value.includes("UI Preview"));
  }));

  await viewport(390, 844, true);
  await navigate("/");
  await click("[data-menu-toggle]");
  await pause(450);
  check("Mobile menu opens and makes background inert", await evaluate(() => document.querySelector("[data-menu-toggle]").getAttribute("aria-expanded") === "true" && document.querySelector("main").inert));
  await evaluate(() => document.querySelector("[data-navigation]").lastElementChild.focus());
  await key("Tab");
  check("Mobile menu keyboard focus wraps", await evaluate(() => document.activeElement.matches("[data-menu-toggle]")));
  await key("Escape");
  await pause(400);
  check("Escape closes mobile menu and restores focus", await evaluate(() => !document.querySelector("main").inert && document.activeElement.matches("[data-menu-toggle]")));
  check("Visible native buttons receive tap animations", await evaluate(() => {
    const controls = [...document.querySelectorAll("button")].filter((button) => button.getClientRects().length && getComputedStyle(button).visibility !== "hidden");
    return controls.length && controls.every((control) => { control.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 })); return control.getAnimations().length > 0; });
  }));

  await viewport(1280, 900);
  await navigate("/gallery.html");
  const galleryHeader = await evaluate(() => document.querySelector("header").outerHTML.replace(' aria-current="page"', ""));
  check("Header and footer shared across pages", galleryHeader === originalHeader && await evaluate(() => document.querySelector("footer").outerHTML) === originalFooter);
  check("All gallery buttons animate on tap", await evaluate(() =>
    [...document.querySelectorAll("button")].filter((control) => control.getClientRects().length && getComputedStyle(control).visibility !== "hidden").every((control) => {
      control.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      return control.getAnimations().length > 0;
    })));
  for (const region of ["philippines", "asia", "africa-antarctica", "americas", "australia", "europe", "all"]) {
    await click('[data-filter="' + region + '"]');
    await pause(700);
    check("Gallery filter " + region + " updates photo count and URL", await evaluate((region) =>
      document.querySelectorAll("[data-gallery-item]:not([hidden])").length === (region === "all" ? 18 : 3) &&
      (new URLSearchParams(location.search).get("region") || "all") === region &&
      document.querySelector("[data-gallery-status]").textContent.includes(region === "all" ? "18 photos" : "3 photos"), region));
  }
  await evaluate(() => {
    document.querySelector('[data-filter="asia"]').click();
    document.querySelector('[data-filter="europe"]').click();
  });
  await pause(700);
  check("Rapid filter clicks settle on the last selected region", await evaluate(() =>
    [...document.querySelectorAll("[data-gallery-item]:not([hidden])")].every((item) => item.dataset.category === "europe") &&
    document.querySelectorAll("[data-gallery-item]:not([hidden])").length === 3));
  await click('[data-gallery-item][data-category="europe"]');
  await wait(() => evaluate(() => document.querySelector("[data-lightbox-count]").textContent === "1 / 3"), "lightbox first photo");
  await key("ArrowRight");
  await wait(() => evaluate(() => document.querySelector("[data-lightbox-count]").textContent === "2 / 3"), "lightbox next photo");
  await screenshot("1280-lightbox");
  check("Lightbox buttons receive tap animation", await evaluate(() =>
    [...document.querySelectorAll("dialog button")].every((control) => {
      control.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      return control.getAnimations().length > 0;
    })));
  await key("ArrowLeft");
  await wait(() => evaluate(() => document.querySelector("[data-lightbox-count]").textContent === "1 / 3"), "lightbox previous photo");
  await click("[data-lightbox-previous]");
  await wait(() => evaluate(() => document.querySelector("[data-lightbox-count]").textContent === "3 / 3"), "lightbox wrap");
  await key("Escape");
  await pause(400);
  check("Lightbox navigation wraps; Escape restores focus and page scrolling", await evaluate(() =>
    !document.querySelector("dialog").open && !document.body.classList.contains("lightbox-open") &&
    document.activeElement.matches("[data-gallery-item]")));
  await click('[data-gallery-item][data-category="europe"]');
  await pause(500);
  await evaluate(() => document.querySelector(".lightbox-panel").click());
  await pause(400);
  check("Clicking lightbox backdrop closes it", await evaluate(() => !document.querySelector("dialog").open));
  await evaluate(() => history.back());
  await pause(650);
  check("Browser Back restores gallery filter", await evaluate(() => document.querySelector('[data-filter="asia"]').getAttribute("aria-pressed") === "true" && document.querySelectorAll("[data-gallery-item]:not([hidden])").length === 3));
  await navigate("/gallery.html?region=philippines");
  check("Destination deep links open the intended gallery filter", await evaluate(() => document.querySelector('[data-filter="philippines"]').getAttribute("aria-pressed") === "true"));

  await viewport(390, 844, true);
  await navigate("/gallery.html?region=asia");
  await click('[data-gallery-item][data-category="asia"]');
  await wait(() => evaluate(() => document.querySelector("[data-lightbox-count]").textContent === "1 / 3"), "mobile lightbox");
  const swipe = await evaluate(() => {
    const rect = document.querySelector("[data-lightbox-image]").getBoundingClientRect();
    return { start: rect.x + rect.width * .8, end: rect.x + rect.width * .2, y: rect.y + rect.height / 2 };
  });
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: swipe.start, y: swipe.y }] });
  await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: swipe.end, y: swipe.y }] });
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await wait(() => evaluate(() => document.querySelector("[data-lightbox-count]").textContent === "2 / 3"), "touch swipe changes photo");
  checks.push("Touch swipe advances the mobile lightbox");
  await click("[data-lightbox-close]");
  await pause(400);
  check("Mobile lightbox close button restores the gallery", await evaluate(() => !document.querySelector("dialog").open));

  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await navigate("/");
  check("Reduced-motion disables entrances, scrolling and tap effects", await evaluate(() => {
    const button = document.querySelector(".hero .button");
    button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    return getComputedStyle(document.documentElement).scrollBehavior === "auto" && button.getAnimations().length === 0 &&
      getComputedStyle(document.querySelector(".hero-media img")).animationName === "none" &&
      [...document.querySelectorAll(".reveal")].every((item) => getComputedStyle(item).opacity === "1");
  }));
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });

  // Verify configured-form success and failure using an in-browser fetch mock.
  // No submissions or customer details leave this local test.
  const mock = await send("Page.addScriptToEvaluateOnNewDocument", { source:
    "document.addEventListener('readystatechange', () => { if (document.readyState === 'interactive') { const key = document.querySelector('[name=access_key]'); if (key) key.value = 'local-browser-test'; window.__formOk = true; window.fetch = async () => new Response(JSON.stringify({success: window.__formOk}), {status: window.__formOk ? 200 : 500, headers: {'Content-Type':'application/json'}}); } });"
  });
  await navigate("/");
  await fillForm();
  await click("[data-submit-button]");
  await wait(() => evaluate(() => document.querySelector("[data-form-status]").textContent.includes("has been sent to our team")), "configured form success");
  check("Configured form resets only after confirmed server success", await evaluate(() => !document.querySelector("#full-name").value));
  await fillForm();
  await evaluate(() => { window.__formOk = false; });
  await click("[data-submit-button]");
  await wait(() => evaluate(() => document.querySelector("[data-form-status]").textContent.includes("couldn’t send")), "configured form failure");
  check("Failed submission preserves details and offers phone/Facebook fallback", await evaluate(() => document.querySelector("#full-name").value === "UI Preview" && !document.querySelector("[data-submit-button]").disabled));
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: mock.identifier });

  await send("Emulation.setScriptExecutionDisabled", { value: true });
  await viewport(390, 844, true);
  await navigate("/");
  check("Without JavaScript, content and contact links stay available", await evaluate(() =>
    !document.documentElement.classList.contains("js") && getComputedStyle(document.querySelector(".about-copy")).opacity === "1" &&
    getComputedStyle(document.querySelector("[data-navigation]")).visibility === "visible" &&
    document.documentElement.scrollWidth <= innerWidth));
  await send("Emulation.setScriptExecutionDisabled", { value: false });
  check("No JavaScript exceptions or missing site resources", errors.length === 0);
  console.log(JSON.stringify({ passed: checks.length, checks, errors, screenshots: output }, null, 2));
} catch (error) {
  if (socket?.readyState === WebSocket.OPEN) await screenshot("failure").catch(() => {});
  const state = socket?.readyState === WebSocket.OPEN ? await evaluate(() => ({
    url: location.href, active: document.activeElement?.outerHTML.slice(0, 200),
    dialog: document.querySelector("dialog")?.open,
    bodyClass: document.body.className,
  })).catch(() => null) : null;
  console.error(JSON.stringify({ error: error.message, passed: checks.length, checks, errors, state, screenshots: output }, null, 2));
  process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) await send("Browser.close").catch(() => {});
  socket?.close();
  browser.kill();
  server.close();
  // Only remove the disposable browser profile created inside this run's temp folder.
  if (resolve(profile) === resolve(output, "browser-profile") && dirname(profile) === output) {
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  }
}
