# M0.3 跨影格穩定回覆收集

## API 與題目生命週期

```ts
import { scanFrame, TemporalCollector } from './src/index.js';
const collector = new TemporalCollector();
const token = collector.startQuestion('session-1/question-1');
// 每次擷取影格時保存 token 與單調遞增的 capture timestamp（毫秒）。
const capturedAt = performance.now();
const result = scanFrame(image);
const events = collector.collect(token, capturedAt, result);
// 呼叫端保存 events；每個事件包含 questionId、generation、cardId、answer、
// firstSeenAt、confirmedAt、observations 及這段有效證據的最低 confidence。
collector.reset(); // 結束題目，清除 pending / confirmed，停止收集
// 下一題（即使相同 questionId）必須重新 startQuestion，取得新 token。
```

只有標準 TypeScript/JS，無 Node、DOM、timer、I/O 或 runtime dependencies，可在 browser worker 使用。`scanFrame()` 與既有 decoder 沒有改變。collector 接收 `FrameScanResult`，不保留像素、quad、學生姓名或輸入物件參照，也不寫入資料庫。事件是同步回傳值，不是網路提交；呼叫端負責保存原始回覆與不可變的題目 snapshot。

token 以物件 identity 驗證，必須傳回此 collector 發出的**原物件**，不可複製或 serialize 後重建。非同步掃描須在開始工作前捕捉 token；回傳後不可套用當時的新題目 token。跨 worker 時，讓 collector 與 token 同處一端，呼叫端以工作 ID 對應原 token。不同 collector 的 token、舊題目 token、reset 後的影格均無事件、不改變狀態。`startQuestion()` 自動清除前題，generation 遞增；空白 questionId 拋出 `RangeError`。

## 固定預設與可配置參數

`new TemporalCollector({ ...overrides })` 會複製並 freeze policy，預設匯出為 `temporalDefaults`。

| 參數 | 預設 | 約束 / 意義 |
| --- | --- | --- |
| minObservations | 3 | safe integer ≥2；至少多少個不同 timestamp 的可靠觀測 |
| minStableMs | 200 ms | 有限且 >0；從本次候選首個可靠觀測到目前的最小跨度 |
| maxGapMs | 250 ms | 有限且 >0；相鄰可靠觀測最大間隔，等於門檻仍保留 |
| minConfidence | 0.7 | 有限且介於 0.55–1；不可低於 M0.1 decoder 下限 |

非法參數拋出 `RangeError`。這些是 POC 政策預設，尚未由手機資料調校，confidence 不是正確率。影格需同時滿足觀測數與時間；不換算 FPS。若可靠觀測總是間隔超過 maxGapMs，就不會確認。minStableMs 可大於 maxGapMs，只要有足夠中間可靠觀測。

## 狀態與改答政策

每張 Card 1–63 各自維護 `empty → pending → confirmed`，採用 **first stable answer wins**：

| 原狀態 / 輸入 | 結果 |
| --- | --- |
| empty + 可靠答案 | 建立 pending，count=1 |
| pending + 同答案，gap ≤ maxGapMs | count+1，更新最後可靠時間與最低 confidence |
| pending + 不同可靠答案 | 捨棄先前證據，新答案從 count=1、目前時間開始 |
| pending + 漏檢 / uncertain / 低信心 | 不累積、不更新可靠時間；gap 未超時仍保留 |
| pending 超過 maxGapMs | 清除；即使中間未呼叫 collect，也會在下一影格先清除 |
| pending 同時達到 count 與 duration | 當下可靠觀測觸發一個事件，轉 confirmed |
| confirmed + 任意後續觀測 / 長時間消失 | 保持鎖定，不再發事件 |
| startQuestion / reset | 全部卡片狀態清除；前題事件不被修改 |

確認後的 A→B→A 均不再提交，包含長時間消失後重新出現；每題每卡最多一個事件，因此同 card+answer 不會重複提交。確認前的 A→B→A 必須重新確認 A，不能沿用第一次 A 的證據。本次不提供題中改答覆寫或單卡解鎖；需要重新收集時必須明確開始新一輪題目（新 generation）。

`uncertain` 永遠不作為證據，因為沒有可信 cardId，無法指定清除哪張卡；低信心 detection 亦視為漏檢。非法 ID、非 A/B/C/D、非有限 confidence、confidence >1 都忽略。短暫漏檢容忍代表穩定跨度可包含空白區段，但只有可靠觀測增加 count，而且空影格本身不會觸發事件。

同框同 ID 同答案只算一次，confidence 取可靠副本最低值；同 ID 出現互相矛盾的可靠答案時，清除該卡 pending，本框不計證據。此規則不依 detections 順序，不影響其他卡。低信心副本不參與衝突判定。輸出事件按 cardId 數值升序。

timestamp 使用同一個單調時鐘的擷取時間，允許非整數與不規則間隔。負數、NaN、Infinity 拋出 `RangeError`；重複或倒序 timestamp 整框忽略且不改變任何狀態，防止同一時間重播累積。collector 不緩存重排亂序影格；呼叫端若平行掃描，應依擷取順序餵入，或接受晚到影格被丟棄。新題 timestamp 可重新從 0 開始。停止輸入期間無 timer；過期狀態在下次有效影格清理，不會自行產生事件。

## 測試與效能

```powershell
npm test
npm run typecheck
npm run lint
npm run benchmark:collector
```

2026-09-15：115 tests 通過（原 M0.1/M0.2 103 tests 全數保留，新增 12 個 temporal tests），build、typecheck、lint 通過。deterministic sequences 涵蓋雙門檻、邊界、漏檢、低信心、改答、去重、衝突順序、獨立多卡、時序與生命週期；另以官方 PDF-derived 五卡 `scanFrame()` 結果實際串接 collector 並驗證重跑事件一致。既有 golden fixtures 不變。

效能腳本只量 collector，合成 63 個可靠 detections，每輪新題經 0/90/210/300 ms 四個影格，涵蓋 pending、確認與去重。每 batch 1000 題 / 4000 frames，warmup 5 batches，量測 30 batches，檢查每 batch 恰有 63000 events。Windows x64 / Node v24.18.0：batch 平均每影格耗時之 median **0.008009 ms**、p95 **0.008147 ms**，包括 startQuestion 成本；這不是單次呼叫延遲 p95，也不包含 scanFrame、camera、UI 或網路。

每框成本 O(D + K log K + S)：D 是 detections 數，K/S ≤63 是本框 ID / pending 數。跨影格狀態 O(63)，不隨影格數成長；事件由呼叫端保存，collector 不存事件歷史。手機效能與端到端延遲尚未量測。

## 限制 / Phase gate

這是 temporal 邏輯與官方 PDF 串接證據，沒有新增真實手機教室影片；M0.4 實卡實拍與 M0.5 gate 仍未通過。重複的高信心辨識錯誤仍可能被鎖定；穩定化不保證真實正確率。相同 cardId 的實體副本無法區分學生。首次鎖定政策不支援教師確認前自由更改已收答案。新開 collector、新 generation 或應用重啟不保留去重，正式持久層仍需事件冪等處理。本模組不推斷 absent、unanswered、incorrect，亦未建立相機 UI、儲存或其他 Phase 1–5 功能。
