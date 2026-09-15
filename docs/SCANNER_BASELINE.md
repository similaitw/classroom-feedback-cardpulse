# M0.1 單卡解碼基線

## 範圍與使用

這是可在 Node.js / browser worker 執行的純 TypeScript 模組，沒有 runtime dependencies、DOM、網路或檔案存取。日後 Next.js 可直接整合 `src/index.ts` 或編譯後的 ESM；目前沒有建立產品 UI。

Node.js 22+，首次安裝後以一個命令執行測試（不需要 Python 或網路）：

```powershell
npm ci --cache .npm-cache
npm test
```

其他檢查：`npm run build`、`npm run typecheck`、`npm run lint`。Build 輸出 `dist/` JavaScript 與 `.d.ts`。測試使用 Node 內建 test runner。

```ts
import { scanCandidate } from './src/index.js';
import type { GrayImage, Quad } from './src/index.js';

// data 是 row-major、每像素一個 0–255 亮度值的 Uint8Array。
// 相機 RGBA / JPEG 解碼與灰階轉換由呼叫端處理。
const image: GrayImage = { width: 100, height: 100, data: grayscalePixels };
const corners: Quad = [
  { x: 0, y: 0 }, { x: 100, y: 0 },
  { x: 100, y: 100 }, { x: 0, y: 100 },
];
const result = scanCandidate(image, corners);
if (result.status === 'detected') {
  const { cardId, answer, confidence } = result.detection;
  // 使用 { cardId, answer, confidence }；不儲存原始影像。
}
// uncertain: { status: 'uncertain', reason, confidence }，沒有猜測的 ID / answer。
```

`grayscalePixels` 是呼叫端已解碼的像素資料。上例 corners 僅適用於恰好裁切到圖樣外框的影像。

## 參考資料來源與可重現流程

來源是 [Plickers 官方卡片下載頁](https://help.plickers.com/hc/en-us/articles/360008948034-Get-Plickers-Cards) 的 [Expanded 1–63 PDF](https://assets.plickers.com/plickers-cards/PlickersCards_2up_1-63.pdf)。本專案使用其既有圖樣作相容性比對，沒有自訂替代 marker 或推測 ID 編碼。

- 來源 SHA-256：`9b782fd5e62f0f9edd861b0678920caad008d3c005298e201f103330443d3f33`。
- Renderer：`PyMuPDF==1.27.2.3`，只用於開發期抽取。
- 官方 PDF：32 頁、每頁 612 × 792 points；第 `ceil(cardId / 2)` 頁，上／下槽按 ID 遞增。
- 圖樣裁框：`x=181..431`；上槽 `y=73..323`，下槽 `y=469..719`，每格 50 points，共 5 × 5。框包含缺口所在的白格，排除字母、卡號與紙張邊緣。
- 驗證頁數、頁面尺寸、每卡至少四個印刷 ID、A/B/C/D 各一及其順時針排列。由字母座標找出 A 所在邊。
- 以 250 × 250 灰階 PDF render 的格心 `<128` 為黑，旋轉成 A 朝上的 25-bit template。這只是已知圖樣的參考表示，並非通用 Plickers 編碼器。
- 必須得到 63 個 ID、252 個互異方向圖樣；目前最小 Hamming distance（不同格數）為 2。
- Golden fixtures 用另一個倍率的整頁 raster 裁出 100 × 100 PGM，保留 PDF 原印刷方向；不是由參考 bits 或 production decoder 重畫。manifest 記錄印刷頂部字母、四旋轉答案、頁／槽及各檔 SHA-256。

Windows PowerShell 重建（所有下載與安裝限於 repository）：

```powershell
python -m pip install --target .tools/python --cache-dir .tools/pip-cache -r scripts/requirements.txt
$env:PYTHONPATH = '.tools/python'
npm run references:generate
npm run references:check
```

Python 3.10+，需平台可用的 pinned PyMuPDF wheel（本次 Python 3.14 / Windows 驗證）。首次執行會下載至忽略版控的 `tmp/pdfs/official.pdf`，之後可離線重建。若下載不可用，可將相同官方 PDF 放入此路徑；hash 不符立即失敗，不會悄悄替換來源。

輸出為 `src/references.generated.ts`、`tests/fixtures/manifest.json` 及 9 個 `.pgm`。`--check` 重新抽取並逐 byte 比較，不更新輸出。產物沒有時間戳；本次已驗證重建完全相同。PDF 原檔不納入版控。圖樣與 golden crops 是 Plickers 官方卡片的衍生參考資料；來源權利仍屬其權利人，本專案不宣稱其為原創或重新授權官方卡片。

## 座標與方向

呼叫端必須提供**圖樣完整正方形外框**在影像上的四角：影像空間左上、右上、右下、左下，順時針、凸四邊形、非鏡像。不是紙張四角，也不是沿著黑色凹口取輪廓。不要先把 A 所在角放到第一個點，否則會丟失回答方向。影像 x 向右、y 向下；角點使用像素邊界座標 `[0,width] × [0,height]`，像素中心為 `(x+.5,y+.5)`。

`normalizeCandidate` 用 homography（透視座標轉換）把單位正方形映射至四角，再 bilinear sampling 成 50 × 50。它保留影像中的旋轉。匹配時把每個 A 朝上模板轉成四種方向：

| 相對於 A 朝上的順時針旋轉 | 朝上的印刷字母 / answer |
| --- | --- |
| 0° | A |
| 90° | D |
| 180° | C |
| 270° | B |

官方 PDF 本身不全是 A 朝上。人工檢查的方向錨點：Card 1 頂部 A、Card 2 頂部 D、Card 40 頂部 B、Card 41 頂部 C、Card 63 頂部 D。Golden 的 expected answers 由每卡印刷字母產生，另有硬編碼錨點測試防止全體 mapping 同時偏移。實體卡以朝上的字母作答，參見 [官方 Cards Overview](https://help.plickers.com/hc/en-us/articles/360009089113-Cards-Overview)。

## 比對、confidence 與拒絕

50 × 50 正規影像中，每個 10 × 10 格只取中央 6 × 6 像素，共 900 個樣本，減少 raster 邊界及小幅角點誤差。以樣本第 5 / 95 percentile 得 dark / light，將亮度線性轉為 `[0,1]` darkness。對 252 個 templates 計算各樣本和預期黑白值的平均絕對誤差 `error`，越小越好；`margin = 第二名 error - 第一名 error`。

固定基線閾值見 `thresholds`：

| 條件 | 預設值 | 不符合時 |
| --- | --- | --- |
| 完整合法 grayscale buffer、有限且在影像內的凸四角 | 必須 | invalid-image / invalid-quad |
| 四邊長及其餘頂點至每邊直線的最小距離 | ≥25 px | low-resolution |
| light − dark | ≥60 / 255 | low-contrast |
| 最佳平均誤差 | ≤0.018 | poor-match |
| 最佳與次佳誤差差距 | ≥0.02 | ambiguous |
| confidence | ≥0.55 | ambiguous |

`confidence = clamp(1 − error / 0.04) × clamp(margin / 0.04) × clamp(contrast / 128)`，其中 clamp 限制至 `[0,1]`。這是匹配證據分數，**不是經校準的正確機率**。基線刻意保守：一個完整格的誤差占 0.04，會拒絕而非主動糾錯；距離 2 的模板中間輸入也會拒絕。邊界比較使用表中包含等號的條件。拒絕時不得使用排序第一名作學生回覆；只有 `detected` 才提供穩定 `ScanDetection` contract。

閾值是在乾淨官方 PDF 與有限生成擾動下驗證的起始策略，尚未由實機 dataset 校準。`normalizeCandidate` 單獨呼叫時對無效輸入拋出 `RangeError`；一般應使用會回傳 uncertain 的 `scanCandidate`。

## 測試證據與限制

M0.1 驗證命令及結果（2026-09-15）：

- `npm test`：81 tests 通過；包含 63 × 4 = 252 個 generated ID/方向辨識。
- 9 個官方 PDF golden IDs：1、2、7、16、31、40、41、52、63；每張四方向，分別測原圖、透視、透視加降曝光／固定微量雜訊，共 108 次 golden-derived 成功辨識。
- 均勻黑／白／灰、低對比、非卡片紋理、漸層、中心遮擋、兩卡混合、低 confidence，以及錯誤／超界／凹／逆序／退化四角、低解析度均有拒絕測試。
- Homography 有獨立解析座標灰階 ramp 測試；identity normalization 逐像素相等。
- `npm run build`、`npm run typecheck`、`npm run lint` 通過。
- `npm run references:check`：63 templates、252 unique orientations、9 golden crops 逐 byte 相符。

已知限制：

1. `scanCandidate()` 只接受呼叫端定位好的單一卡片；M0.2 已另增自動四角與多卡 API，見 [SCANNER_MULTICARD.md](SCANNER_MULTICARD.md)。仍無相機 UI 或跨幀穩定化。
2. 模糊、嚴重透視、反光、遮擋、陰影及角點偏差可能拒絕或誤判。測試只包含一組中等透視與有限微擾，不能推論實際容忍範圍。
3. 忽略格邊界與圖樣外部，無法驗證整張紙或官方真偽；任何外觀接近模板的輸入都可能接受。遮擋若恰好變成另一合法圖樣，單幀參考比對無法保證偵測。未知 marker、鏡像、前鏡頭翻轉不在支援範圍；呼叫端需先取消鏡像，不能假設一定會拒絕鏡像。
4. 63 個圖樣均有 generated 測試，只有上述 9 個 ID 有獨立 PDF raster golden。這些是官方來源的 reference evidence，全部都不是手機實拍。
5. M0.1 完成不代表 Phase 0 通過。2–5 m、正常教室光線、Android 手機與多卡的量化實拍驗證仍屬 M0.4 / M0.5。Phase 1–5 UI hard gate 保持關閉。
