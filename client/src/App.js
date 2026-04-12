import React, { useState, useEffect, useCallback } from "react";
import "./App.css";

const SERVER_URL = process.env.REACT_APP_SERVER_URL;
const MAX_LENGTH = 5000;

function App() {
  const [sourceText, setSourceText] = useState("");
  const [convertedText, setConvertedText] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/translations`);
      if (!res.ok) throw new Error(`서버 오류: ${res.status}`);
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("히스토리 조회 실패:", err);
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const convert = async () => {
    if (!sourceText.trim()) return;

    setError("");
    setIsConverting(true);
    setConvertedText("");
    setSelectedId(null);

    try {
      const res = await fetch(`${SERVER_URL}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceText }),
      });

      if (!res.ok) throw new Error(`변환 실패: ${res.status}`);

      const data = await res.json();
      setConvertedText(data.translatedText || "");
      if (data.id) setSelectedId(data.id);
      await fetchHistory();
    } catch (err) {
      console.error("변환 요청 실패:", err);
      setError("변환 요청에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsConverting(false);
    }
  };

  const copyResult = async () => {
    if (!convertedText) return;
    try {
      await navigator.clipboard.writeText(convertedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("복사 실패:", err);
    }
  };

  const selectHistory = (item) => {
    setSelectedId(item.id);
    setSourceText(item.source_text || "");
    setConvertedText(item.translated_text || "");
    setError("");
  };

  const newEntry = () => {
    setSelectedId(null);
    setSourceText("");
    setConvertedText("");
    setError("");
  };

  const deleteOne = async (id, e) => {
    e?.stopPropagation();
    try {
      await fetch(`${SERVER_URL}/translations/${id}`, { method: "DELETE" });
      if (selectedId === id) newEntry();
      await fetchHistory();
    } catch (err) {
      console.error("삭제 실패:", err);
    }
  };

  const deleteAll = async () => {
    if (!window.confirm("모든 변환 기록을 삭제하시겠습니까?")) return;
    try {
      await fetch(`${SERVER_URL}/translations`, { method: "DELETE" });
      newEntry();
      await fetchHistory();
    } catch (err) {
      console.error("전체 삭제 실패:", err);
    }
  };

  const preview = (text) => {
    if (!text) return "";
    const t = text.replace(/\s+/g, " ").trim();
    return t.length > 60 ? `${t.slice(0, 60)}…` : t;
  };

  return (
    <div className="App">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>기록</h2>
          <button className="secondary-button" onClick={newEntry}>
            새로 작성
          </button>
        </div>

        <div className="sidebar-list">
          {history.length === 0 ? (
            <p className="no-notes">기록이 없습니다.</p>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className={`history-item${
                  selectedId === item.id ? " history-item--active" : ""
                }`}
                onClick={() => selectHistory(item)}
              >
                <div className="history-item-text">
                  {preview(item.source_text)}
                </div>
                <div className="history-item-meta">
                  <span className={`status status--${item.status || "done"}`}>
                    {item.status || "done"}
                  </span>
                  <button
                    className="icon-button"
                    onClick={(e) => deleteOne(item.id, e)}
                    title="삭제"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {history.length > 0 && (
          <div className="sidebar-footer">
            <button onClick={deleteAll} className="danger-button">
              전체 삭제
            </button>
          </div>
        )}
      </aside>

      <main className="main">
        <div className="container">
          <h1>논문체 변환기</h1>
          <h3>구어체·일상 문장을 학술 논문 어투로 변환합니다.</h3>

          <div className="translator">
            <div className="panels">
              <div className="panel">
                <span className="panel-label">입력 문장</span>
                <textarea
                  value={sourceText}
                  onChange={(e) =>
                    setSourceText(e.target.value.slice(0, MAX_LENGTH))
                  }
                  placeholder="변환할 문장을 입력하세요."
                  className="text-area"
                  disabled={isConverting}
                />
                <div className="panel-footer">
                  <span className="counter">
                    {sourceText.length} / {MAX_LENGTH}
                  </span>
                </div>
              </div>

              <div className="panel">
                <span className="panel-label">논문체 결과</span>
                <textarea
                  value={convertedText}
                  readOnly
                  placeholder={
                    isConverting
                      ? "변환 중..."
                      : "변환 결과가 여기에 표시됩니다."
                  }
                  className="text-area"
                />
                <div className="panel-footer">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={copyResult}
                    disabled={!convertedText}
                  >
                    {copied ? "복사됨" : "복사"}
                  </button>
                </div>
              </div>
            </div>

            {error && <div className="error-banner">{error}</div>}

            <div className="button-group">
              <button
                onClick={convert}
                disabled={isConverting || !sourceText.trim()}
                className="primary-button"
              >
                {isConverting ? "변환 중..." : "변환"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
