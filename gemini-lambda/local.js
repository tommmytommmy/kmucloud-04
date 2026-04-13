require("dotenv").config();
const http = require("http");
const { handler } = require("./index");

const port = process.env.LOCAL_PORT || 3001;

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405).end();
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const result = await handler({ body });
      res.writeHead(result.statusCode, result.headers || {});
      res.end(result.body);
    } catch (err) {
      console.error("handler threw:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
});

server.listen(port, () => {
  console.log(`Lambda local runner: http://localhost:${port}`);
  console.log(
    `GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? "✅" : "⚠️ 미설정"}`,
  );
});
