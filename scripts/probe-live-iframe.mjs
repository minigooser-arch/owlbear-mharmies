import puppeteer from "puppeteer-core";

const targetUrl = "https://minigooser-arch.github.io/owlbear-mharmies/index.html?v=1.2.4";
const executablePath = process.env.CHROME_BIN || "/usr/bin/google-chrome";

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"]
});

const failures = [];

async function probe(label, sandboxAttribute) {
  const page = await browser.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on("console", (message) => {
    consoleMessages.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String(error));
  });
  page.on("requestfailed", (request) => {
    failedRequests.push({
      url: request.url(),
      reason: request.failure()?.errorText ?? "unknown"
    });
  });

  const sandbox = sandboxAttribute == null ? "" : ` sandbox="${sandboxAttribute}"`;
  await page.setContent(
    `<!doctype html>
      <html>
        <body style="margin:0;background:#f0f0f0">
          <iframe id="target"${sandbox}
            src="${targetUrl}"
            style="width:520px;height:760px;border:0"></iframe>
        </body>
      </html>`,
    { waitUntil: "load" }
  );

  await new Promise((resolvePromise) => setTimeout(resolvePromise, 3000));

  const frames = page.frames().map((frame) => ({
    url: frame.url(),
    name: frame.name()
  }));
  const targetFrame = page.frames().find((frame) =>
    frame.url().startsWith("https://minigooser-arch.github.io/owlbear-mharmies/index.html")
  );

  let snapshot = null;
  if (targetFrame) {
    try {
      snapshot = await targetFrame.evaluate(() => {
        const root = document.getElementById("root");
        const bodyStyle = getComputedStyle(document.body);
        return {
          href: location.href,
          title: document.title,
          bodyText: document.body.innerText,
          rootText: root?.innerText ?? null,
          bodyBackground: bodyStyle.background,
          bodyColor: bodyStyle.color,
          htmlLength: document.documentElement.outerHTML.length
        };
      });
    } catch (error) {
      snapshot = { evaluateError: String(error) };
    }
  }

  const result = {
    label,
    sandboxAttribute,
    targetFrameFound: Boolean(targetFrame),
    frames,
    snapshot,
    consoleMessages,
    pageErrors,
    failedRequests
  };
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");

  if (!targetFrame) {
    failures.push(`${label}: target iframe never navigated to the live Pages URL`);
  } else if (!snapshot || "evaluateError" in snapshot) {
    failures.push(`${label}: could not inspect iframe DOM`);
  } else if (!String(snapshot.rootText ?? snapshot.bodyText ?? "").includes("Загрузка")) {
    failures.push(
      `${label}: iframe loaded but did not render loading UI; text=${JSON.stringify(snapshot.rootText)}`
    );
  }

  if (failedRequests.some((item) => item.url.includes("owlbear-mharmies"))) {
    failures.push(`${label}: one or more extension requests failed`);
  }

  await page.close();
}

try {
  await probe("no-sandbox", null);
  await probe("sandbox-scripts-same-origin", "allow-scripts allow-same-origin");
  await probe("sandbox-scripts-only", "allow-scripts");
} finally {
  await browser.close();
}

if (failures.length) {
  throw new Error("Live iframe browser probe failed:\n- " + failures.join("\n- "));
}

process.stdout.write("Live iframe browser probe passed.\n");
