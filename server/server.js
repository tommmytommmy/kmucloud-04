require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const axios = require("axios");
const cors = require("cors");

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 80;
const MAX_SOURCE_LENGTH = 5000;

const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
  : true;

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: "1mb" }));

let dbConnection = null;

const connectToDatabase = () => {
  const required = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    return Promise.reject(new Error(`Missing env: ${missing.join(", ")}`));
  }

  const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  return new Promise((resolve, reject) => {
    connection.connect(async (err) => {
      if (err) return reject(err);
      console.log("DB 연결 성공");
      try {
        await createTranslationsTable(connection);
        dbConnection = connection;
        resolve(connection);
      } catch (e) {
        reject(e);
      }
    });
  });
};

const createTranslationsTable = (connection) =>
  new Promise((resolve, reject) => {
    const sql = `
      CREATE TABLE IF NOT EXISTS translations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        source_text TEXT NOT NULL,
        translated_text TEXT,
        status ENUM('pending','done','failed') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `;
    connection.query(sql, (err) => (err ? reject(err) : resolve()));
  });

const checkDb = (req, res, next) => {
  if (!dbConnection) {
    return res.status(503).json({ error: "데이터베이스 연결 실패" });
  }
  next();
};

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    dbConnection.query(sql, params, (err, result) =>
      err ? reject(err) : resolve(result),
    );
  });

const callGeminiLambda = async (sourceText) => {
  if (!process.env.GEMINI_LAMBDA_URL) {
    throw new Error("GEMINI_LAMBDA_URL not configured");
  }
  const res = await axios.post(
    process.env.GEMINI_LAMBDA_URL,
    { sourceText },
    { timeout: 60000 },
  );
  const data = res.data;
  if (typeof data === "string") return data;
  if (data?.translatedText) return data.translatedText;
  throw new Error("Invalid Lambda response");
};

app.get("/", (req, res) => {
  res.json({
    message: "논문체 변환 서버 실행 중",
    database: dbConnection ? "연결됨" : "연결 안됨",
    lambda: process.env.GEMINI_LAMBDA_URL ? "설정됨" : "설정 안됨",
  });
});

app.post("/translate", checkDb, async (req, res) => {
  const { sourceText } = req.body;

  if (!sourceText || typeof sourceText !== "string" || !sourceText.trim()) {
    return res.status(400).json({ error: "sourceText가 필요합니다" });
  }
  if (sourceText.length > MAX_SOURCE_LENGTH) {
    return res
      .status(400)
      .json({ error: `입력은 ${MAX_SOURCE_LENGTH}자 이하로 제한됩니다` });
  }

  let insertId;
  try {
    const result = await query(
      "INSERT INTO translations (source_text, status) VALUES (?, 'pending')",
      [sourceText],
    );
    insertId = result.insertId;
  } catch (err) {
    console.error("DB 저장 실패:", err);
    return res.status(500).json({ error: "저장 실패" });
  }

  try {
    const translatedText = await callGeminiLambda(sourceText);
    await query(
      "UPDATE translations SET translated_text = ?, status = 'done' WHERE id = ?",
      [translatedText, insertId],
    );
    res.json({ id: insertId, translatedText });
  } catch (err) {
    console.error("변환 실패:", err);
    await query(
      "UPDATE translations SET status = 'failed' WHERE id = ?",
      [insertId],
    ).catch(() => {});
    res.status(502).json({ error: "변환 실패" });
  }
});

app.get("/translations", checkDb, async (req, res) => {
  try {
    const rows = await query(
      "SELECT id, source_text, translated_text, status, created_at FROM translations ORDER BY created_at DESC",
    );
    res.json(rows);
  } catch (err) {
    console.error("조회 실패:", err);
    res.status(500).json({ error: "조회 실패" });
  }
});

app.get("/translations/:id", checkDb, async (req, res) => {
  try {
    const rows = await query("SELECT * FROM translations WHERE id = ?", [
      req.params.id,
    ]);
    if (!rows.length) return res.status(404).json({ error: "없음" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "조회 실패" });
  }
});

app.delete("/translations/:id", checkDb, async (req, res) => {
  try {
    const result = await query("DELETE FROM translations WHERE id = ?", [
      req.params.id,
    ]);
    if (!result.affectedRows) return res.status(404).json({ error: "없음" });
    res.json({ message: "삭제됨" });
  } catch (err) {
    res.status(500).json({ error: "삭제 실패" });
  }
});

app.delete("/translations", checkDb, async (req, res) => {
  try {
    const result = await query("DELETE FROM translations");
    res.json({ message: "전체 삭제됨", deletedCount: result.affectedRows });
  } catch (err) {
    res.status(500).json({ error: "삭제 실패" });
  }
});

process.on("uncaughtException", (e) => {
  console.error("uncaughtException:", e);
  process.exit(1);
});
process.on("unhandledRejection", (e) => {
  console.error("unhandledRejection:", e);
  process.exit(1);
});

connectToDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`서버 시작 — port ${port}`);
      console.log(
        `GEMINI_LAMBDA_URL: ${process.env.GEMINI_LAMBDA_URL ? "✅" : "⚠️ 미설정"}`,
      );
      console.log(`CORS_ORIGIN: ${process.env.CORS_ORIGIN || "(전체 허용)"}`);
    });
  })
  .catch((err) => {
    console.error("서버 시작 실패:", err);
    process.exit(1);
  });
