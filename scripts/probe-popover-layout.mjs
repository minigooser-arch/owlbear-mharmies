import { readFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const appCss = await readFile("src/ui/app.css", "utf8");
const wikiCss = await readFile("src/ui/wiki-light.css", "utf8");
const executablePath = process.env.CHROME_BIN || "/usr/bin/google-chrome";

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"]
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 688, height: 1000, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html>
    <html>
      <head>
        <style>${appCss}</style>
        <style>${wikiCss}</style>
      </head>
      <body>
        <div id="root">
          <main class="app-shell" data-theme="letopis-wiki-light">
            <header class="topbar wiki-topbar"><strong>Военная панель</strong></header>
            <nav class="tabs wiki-nav">
              <button>Обзор</button><button>Войска</button><button>Карта</button>
              <button>Города</button><button>Бои</button><button>Управление</button>
            </nav>
            <div class="content wiki-content">
              <section>
                <div class="section-heading"><div><p class="eyebrow">Администрирование</p><h2>Управление</h2></div></div>
                <nav class="subtabs">
                  <button>Фракции</button>
                  <button>Государства</button>
                  <button>Межгосударственные отношения</button>
                  <button>Отношения фракций</button>
                  <button>Восстания</button>
                  <button>Настройки</button>
                  <button>Диагностика</button>
                </nav>
                <div style="height:1600px">Длинный контент</div>
              </section>
            </div>
          </main>
        </div>
      </body>
    </html>`);

  const result = await page.evaluate(() => {
    const content = globalThis.document.querySelector(".wiki-content");
    const subtabs = globalThis.document.querySelector(".subtabs");
    const buttons = Array.from(globalThis.globalThis.document.querySelectorAll(".subtabs button"));
    if (!(content instanceof globalThis.HTMLElement) || !(subtabs instanceof globalThis.HTMLElement)) {
      throw new Error("Fixture layout nodes missing");
    }

    const before = content.scrollTop;
    content.scrollTop = 500;
    const after = content.scrollTop;
    const firstTop = buttons[0]?.getBoundingClientRect().top ?? 0;
    const lastTop = buttons.at(-1)?.getBoundingClientRect().top ?? 0;

    return {
      viewportHeight: globalThis.innerHeight,
      rootHeight: globalThis.document.getElementById("root")?.getBoundingClientRect().height ?? 0,
      shellHeight: globalThis.document.querySelector(".app-shell")?.getBoundingClientRect().height ?? 0,
      contentClientHeight: content.clientHeight,
      contentScrollHeight: content.scrollHeight,
      contentOverflowY: globalThis.getComputedStyle(content).overflowY,
      scrollBefore: before,
      scrollAfter: after,
      subtabsClientWidth: subtabs.clientWidth,
      subtabsScrollWidth: subtabs.scrollWidth,
      firstTop,
      lastTop
    };
  });

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");

  const failures = [];
  if (Math.abs(result.shellHeight - result.viewportHeight) > 2) {
    failures.push(`shell height ${result.shellHeight} does not match viewport ${result.viewportHeight}`);
  }
  if (result.contentScrollHeight <= result.contentClientHeight) {
    failures.push("content area is not vertically scrollable");
  }
  if (result.contentOverflowY !== "auto") {
    failures.push(`expected overflow-y:auto, got ${result.contentOverflowY}`);
  }
  if (result.scrollAfter <= result.scrollBefore) {
    failures.push("setting scrollTop did not move the content viewport");
  }
  if (result.lastTop <= result.firstTop) {
    failures.push("management subtabs did not wrap onto multiple rows");
  }
  if (result.subtabsScrollWidth > result.subtabsClientWidth + 2) {
    failures.push("management subtabs still require horizontal scrolling");
  }

  if (failures.length) {
    throw new Error("Popover layout probe failed:\n- " + failures.join("\n- "));
  }

  process.stdout.write("Popover layout probe passed.\n");
} finally {
  await browser.close();
}
