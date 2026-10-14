import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

export async function startFixture(port = 0) {
  let requests = 0;
  const server = createServer((request, response) => {
    requests++;
    const url = new URL(request.url, "http://localhost");
    const amount = Number(url.searchParams.get("amount"));
    response.setHeader("Content-Type", "application/json");
    if (request.method !== "GET" || !["/shipping", "/shipping-bug", "/shipping-type-bug"].includes(url.pathname)) {
      response.writeHead(404).end(JSON.stringify({ error: "Not found" }));
      return;
    }
    if (!url.searchParams.has("amount") || !Number.isSafeInteger(amount) || amount < 0) {
      response.writeHead(400).end(JSON.stringify({ error: "amount must be nonnegative integer cents" }));
      return;
    }
    let fee = amount >= 10000 ? 0 : 1000;
    if (url.pathname === "/shipping-bug") fee = 0;
    if (url.pathname === "/shipping-type-bug") fee = fee !== 0;
    response.end(JSON.stringify({ fee }));
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    url: "http://127.0.0.1:" + server.address().port,
    get requests() { return requests; },
    close() {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const fixture = await startFixture(4100);
  console.log("Example API: " + fixture.url + "/shipping");
  console.log("Deliberately incorrect targets: /shipping-bug and /shipping-type-bug");
}
