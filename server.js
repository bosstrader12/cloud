const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const PUBLIC_PATH = process.env.PUBLIC_PATH || "/ray";
const BACKEND_WS_URL = process.env.BACKEND_WS_URL;

if (!BACKEND_WS_URL) {
  throw new Error("BACKEND_WS_URL is required");
}

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("Cloud Run V2Ray relay is running\n");
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

const wss = new WebSocket.Server({
  noServer: true,
  perMessageDeflate: false
});

server.on("upgrade", (req, socket, head) => {
  const incomingUrl = new URL(req.url, "http://localhost");

  if (incomingUrl.pathname !== PUBLIC_PATH) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (clientWs) => {
    const backendUrl = new URL(BACKEND_WS_URL);

    // Preserve query string from client if present.
    if (incomingUrl.search) {
      backendUrl.search = incomingUrl.search;
    }

    const backendWs = new WebSocket(backendUrl.toString(), {
      perMessageDeflate: false,
      headers: {
        "User-Agent": "cloud-run-v2ray-relay"
      }
    });

    backendWs.on("open", () => {
      clientWs.on("message", (data, isBinary) => {
        if (backendWs.readyState === WebSocket.OPEN) {
          backendWs.send(data, { binary: isBinary });
        }
      });

      backendWs.on("message", (data, isBinary) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data, { binary: isBinary });
        }
      });
    });

    const closeBoth = () => {
      try {
        clientWs.close();
      } catch {}
      try {
        backendWs.close();
      } catch {}
    };

    clientWs.on("close", closeBoth);
    backendWs.on("close", closeBoth);
    clientWs.on("error", closeBoth);
    backendWs.on("error", closeBoth);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Relay listening on port ${PORT}`);
  console.log(`Public path: ${PUBLIC_PATH}`);
  console.log(`Backend: ${BACKEND_WS_URL}`);
});
