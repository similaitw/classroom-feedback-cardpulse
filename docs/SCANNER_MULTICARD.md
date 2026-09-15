# M0.2 完整 still frame 多卡偵測

## API

```ts
import { detectCandidates, scanFrame } from './src/index.js';
const image = { width, height, data: grayscalePixels }; // Uint8Array，每像素一 byte
const candidates = detectCandidates(image); // Quad[]，不是成功辨識
const { detections, uncertain } = scanFrame(image);
// detections: { quad, detection: { cardId, answer, confidence } }[]
// uncertain: { quad, reason, confidence }[]；沒有猜測的 ID 或 answer
```

完整畫面不需呼叫端提供角點。模組只有標準 JS / typed arrays，無 Node、DOM、檔案、網路或 runtime dependencies，可於 browser worker 執行。RGBA / JPEG 解碼、轉灰階由呼叫端負責。非法影像會拋出 `RangeError`；有效空畫面回傳空陣列。沒有產生候選的區域也不會出現在 uncertain 中。

`Quad` 沿用 M0.1：圖樣 5×5 完整外框，像素邊界座標，影像左上、右上、右下、左下順時針。不是紙張四角，不預先把 A 轉到上方。以邊中點 y 最小者為上邊；相同時取起點 x 最小者。接近 45° 的回答切換有方向歧義，未作跨幀穩定化。

## Detector pipeline 與固定參數

1. 對原解析度灰階畫面分別用 `<64 / 112 / 160 / 208` 做四次二值化。多閾值讓不同曝光的卡片有機會形成完整暗色區域；不要求整張畫面同一曝光。
2. 四鄰接 flood fill 找暗色連通區域。每列只保留最左／最右像素的外角，建立 monotone-chain convex hull。官方圖樣的暗色主體相連，邊上的白色缺口不應成為外框角點。
3. 排除少於 200 暗色像素或暗色面積／凸包面積低於 0.4 的區域。逐次移除損失三角形面積最小的凸包點，直到剩四點；總面積損失不得超過 8%。使用既有 `validQuad` 及 `quadResolution`，要求凸、順時針、在畫面內、最小邊／高度 ≥25 px。
4. 候選按凸包面積保留比例降序排列，平手按四角依序 y、x 升序。最多保留 1024 個初步 proposals；使用凸多邊形 clipping 計算真正 quad IoU，≥0.65 時 NMS 保留較前候選，最多 256 個。不是以 card ID 去重，分開的同 ID 卡片仍各自保留。
5. 去重後按四角依序 y、x 升序提供 deterministic ordering。`scanFrame()` 對每個 quad 呼叫原有 `scanCandidate()`：homography → 50×50 → 252 模板比對 → 原有 confidence / error / margin 門檻。只有 `detected` 進入 detections；拒絕結果保留在 uncertain。沒有降低 M0.1 的成功門檻。

參數匯出為唯讀 `detectorParameters`；目前無呼叫端調參介面。幾何 NMS 在解碼之前，可能保留形狀較佳但解碼較差的候選；此基線偏向拒絕，沒有嘗試修正角點直到某個模板成功。

## 可重現 fixtures 與驗證

```powershell
npm test
npm run typecheck
npm run lint
npm run benchmark:frame
```

`tests/frame-fixtures.mjs` 定義完整 640×420 deterministic composite fixtures。以既有 SHA-256 驗證的官方 PDF golden crops 作來源，用測試端獨立反矩陣 rasterizer 放入畫面；沒有借用 detector 的定位，也沒有把 expected quad 傳給 scanner。程式定義固定位置、尺寸、homography、曝光及干擾圖形，測試每次離線重建，不需新增二進位副本。

2026-09-15 驗證：

- `npm test`（包含 build）：103 tests 通過，M0.1 原有 81 tests 全數保留。
- 2、3、4、5 卡 × 四次方向配置 × 兩種曝光，共 32 composite frames、112 次 golden-derived detection。含不同位置、70–135 px 的變換尺度、中等透視、文字狀條紋與實心矩形；檢查 ID、answer、quad 合法且與標註 IoU >0.93、NMS 無重複及重跑結果完全一致。
- 全部 63 generated references × 四方向，共 252 次完整 frame 自動定位與解碼。
- 全部 9 官方 PDF goldens × 四方向 × 兩種平面傾斜（−25° / +20°），共 72 次辨識；65 / 150 px 尺寸，降低曝光與固定微量雜訊。
- 黑／白／灰、紋理雜訊、漸層、條紋、棋盤、圓形、實心矩形負例均無成功 detection。低對比及中心遮擋候選拒絕且不洩漏猜測 ID。另測 polygon IoU、非法輸入及相鄰同 ID 卡片保留。
- `npm run typecheck`、`npm run lint` 通過。

## 效能

`npm run benchmark:frame` 包含 build，量測五卡曝光 composite 的完整 `scanFrame()`，先 warm up 5 次，再測 30 次。2026-09-15，本機 Windows x64 / Node v24.18.0，640×420：median **39.61 ms**、p95 **43.48 ms**。這是本機 Node POC 量測，不是手機 FPS 保證；不包含相機、灰階轉換或 UI。

四次 flood fill 的像素處理為 O(4WH)。額外 typed-array 儲存為約 5WH bytes（visited + queue），不含輸入、JS 物件及凸包／排序暫存。每區域最多 4H 個凸包輸入點，排序 O(H log H)，凸包簡化最差 O(H²)；NMS 最多比較 1024×256 組四邊形，decode 最多 256 次。大尺寸、高雜訊或大量物件的畫面仍可能很慢；目前不自動降採樣，應放在 worker 並限制呼叫頻率。

## 限制與 Phase gate

- 證據來自官方 PDF 圖樣與生成擾動，沒有手機教室實拍。M0.2 完成只代表多卡 still-frame POC；Phase 0 gate 保持未通過，M0.4 / M0.5 仍須實卡實拍量化驗證。
- 必須有可分離的暗色主體。卡片相互碰觸、連上深色背景、被裁切、遮擋、強陰影、反光、模糊或嚴重透視可能漏檢。四個全域閾值無法處理所有局部光照，不保證低於 64 或高於 208 的對比範圍。
- 當 clutter 超出 proposal 上限，較後候選可能被捨棄。沒有對超載輸出完整性保證。接近／重疊卡片也可能被 NMS 抑制。
- 符合合法模板的非官方圖形仍可能成功；負例測試的零誤報不能外推任意畫面的零誤報率。M0.1 的鏡像、遮擋恰好變另一合法模板等限制仍適用。
- 本次沒有 live camera UI、跨幀去重、追蹤或 Phase 1–5 功能。
