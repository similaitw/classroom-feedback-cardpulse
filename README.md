# CardPulse

CardPulse 是一套面向教室即時形成性評量的開源系統，目標相容 Plickers 官方 Card 1–63 實體卡，讓教師以手機掃描學生卡片取得 A/B/C/D 回答，並保存完整學習歷程與統計。

## 核心目標

- 相容 Plickers Card 1–63，辨識 `cardId + answer + confidence`
- 班級與學生名單 CSV/Excel 匯入、卡號配對
- A/B/C/D 題庫、圖片、解析、標籤與題組
- 電腦投影 + 手機掃描的 Live Classroom
- 永久保存 Session、題目 Snapshot、參與狀態與逐題原始作答
- 嚴格區分「缺席 / 未作答 / 答錯」
- 單次活動、學生與班級長期統計及資料匯出

## 技術方向

Next.js + TypeScript + Tailwind CSS + Supabase + PWA，部署目標為 Vercel。

## 開發原則

目前優先進行 **Phase 0：Plickers 相容掃描器 POC**。在掃描器可行性通過驗收前，不大量投入後續產品 UI。

詳細規格見 `PROJECT_SPEC.md`，任務狀態見 `docs/TASKS.md`。
