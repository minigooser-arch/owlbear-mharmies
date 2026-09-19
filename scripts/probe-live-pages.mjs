const base = "https://minigooser-arch.github.io/owlbear-mharmies";
const targets = [
  ["manifest", `${base}/manifest.json?v=1.2.4`],
  ["popover", `${base}/index.html?v=1.2.4`],
  ["background", `${base}/background.html?v=1.2.4`]
];

const failures = [];

function pickHeaders(headers) {
  const keys = [
    "content-type",
    "cache-control",
    "etag",
    "last-modified",
    "age",
    "server",
    "via",
    "x-frame-options",
    "content-security-policy",
    "access-control-allow-origin",
    "cross-origin-resource-policy",
    "cross-origin-embedder-policy",
    "cross-origin-opener-policy"
  ];
  return Object.fromEntries(
    keys.map((key) => [key, headers.get(key)]).filter(([, value]) => value != null)
  );
}

for (const [name, url] of targets) {
  const response = await globalThis.fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "letopis-armies-live-pages-probe/1.0",
      "cache-control": "no-cache"
    }
  });
  const body = await response.text();
  const info = {
    name,
    requestedUrl: url,
    finalUrl: response.url,
    status: response.status,
    headers: pickHeaders(response.headers),
    bodyPrefix: body.slice(0, 240).replace(/\s+/g, " ")
  };
  process.stdout.write(JSON.stringify(info, null, 2) + "\n");

  if (!response.ok) failures.push(`${name}: HTTP ${response.status}`);

  const xfo = response.headers.get("x-frame-options");
  const csp = response.headers.get("content-security-policy");
  if (xfo && /deny|sameorigin/i.test(xfo)) {
    failures.push(`${name}: X-Frame-Options blocks cross-origin iframe embedding: ${xfo}`);
  }
  if (csp && /frame-ancestors\s+[^;]*(?:'none'|'self')/i.test(csp)) {
    failures.push(`${name}: CSP frame-ancestors may block Owlbear embedding: ${csp}`);
  }

  if (name === "manifest") {
    let manifest;
    try {
      manifest = JSON.parse(body);
    } catch {
      failures.push("manifest: response is not valid JSON");
      continue;
    }
    if (manifest.version !== "1.2.4") {
      failures.push(`manifest: expected version 1.2.4, got ${String(manifest.version)}`);
    }
    const popoverUrl = String(manifest.action?.popover ?? "");
    if (!popoverUrl.startsWith(`${base}/index.html?v=`)) {
      failures.push(`manifest: unexpected popover URL: ${popoverUrl}`);
    }
  }

  if (name === "popover") {
    if (!body.includes("Загрузка интерфейса…")) {
      failures.push("popover: live HTML is missing the inline loading fallback");
    }
    if (!body.includes("/owlbear-mharmies/assets/popover-")) {
      failures.push("popover: live HTML is missing the production popover bundle reference");
    }
  }
}

if (failures.length) {
  throw new Error("Live Pages probe failed:\n- " + failures.join("\n- "));
}

process.stdout.write("Live Pages probe passed.\n");
