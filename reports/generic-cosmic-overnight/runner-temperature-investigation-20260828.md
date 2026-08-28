# 徹夜程式 CPU 溫度與續跑計時調查

查核日期：2026-08-28。本紀錄保存本機觀察與可行性；永久操作契約見 [長跑工作流](../../.agents/workflows/run-generic-overnight-evaluation.md)。未啟動完整徹夜評測，也未修改硬體、驅動或 MSI 設定。

## 結論

本機已實測能透過 AMD Ryzen Master SDK 讀取 CPU 溫度。使用者授權一次管理員測試後，官方 CLI 的 `GetPMTableData` 連續取得 54.54°C、52.57°C、52.27°C；每次程序呼叫約 1.04～1.06 秒。舊 `GetCurrentTemperature` API 雖仍出現在範例，實際回覆已停用，不能把其 exit 0 當成有效讀值。

MSI Center 本身尚未找到公開、受支援的 CPU 溫度 API 文件。它的 Hardware Monitoring UI、內部 SDK 及 `API_*.dll` 不等同第三方 API 承諾。已找到的 MSI 公開 [Mystic Light SDK](https://www.msi.com/Landing/mystic-light-rgb-gaming-pc/download) 用於 LED／RGB 控制；[MSI Center 官方說明](https://www.msi.com/support/technical_details/MB_SW_MSI_Center) 描述監測介面，沒有在該頁提供溫度取用 API。

後續已沿用 AMD 入口實作獨立 reader、滑動窗口停止與動態 worker，不逆向 MSI 或安裝另一套工具。操作方式與門檻由 [長跑工作流](../../.agents/workflows/run-generic-overnight-evaluation.md) 管理。三筆短測只證明此機器／版本的程式化讀取可用；新 reader 的長期穩定性、與 MSI UI 同時對照及持續負載校準尚未驗證。未啟用 `--temperature-file` 時仍沒有自動 thermal guard。

## 本機實查

WMI 查詢在沙箱遭拒後，已於沙箱外以唯讀方式重查；沙箱外執行不等於 Windows 管理員提權。

| 項目 | 結果 |
| --- | --- |
| CPU | AMD Ryzen 9 9900X，12 cores／24 logical processors |
| `MSAcpi_ThermalZoneTemperature` | 回覆「不受支援」，沒有取得熱區數值 |
| `Win32_TemperatureProbe` | 沒有可用實例讀值 |
| `root/Hardware` 的 `Sensor`／`NumericSensor` | 類別存在，但查實例回覆「一般失敗」；不能當成感測成功 |
| `root/LibreHardwareMonitor`／`root/OpenHardwareMonitor` | 命名空間不存在，沒有可用 provider |
| MSI Center | `MSI.CentralServer`、`MSI_Central_Service`、`CC_Engine_x64` 等程序正在執行 |
| MSI WMI | `WMI_MSIMBWMXX` 只暴露 `Active`／`InstanceName` 與 `FBfunc`，不是可直接讀取的 temperature property；未呼叫未文件化方法或 BIOS 方法 |
| AMD SDK | `C:\Program Files\AMD\RyzenMasterSDK` 存在，CLI 與 `Platform.dll` 為 `3.0.0.3620`；CLI Authenticode 狀態 Valid，簽署者 Advanced Micro Devices |
| AMD 驅動 | `AMDRyzenMasterDriverV29` 已在 Running，路徑指向上述 SDK 的 `bin\AMDRyzenMasterDriver.sys` |
| 執行權限 | 一般 shell 的 Windows Administrator 為 false；本次獲授權的獨立測試程序為 true，完成後已退出 |

MSI 安裝目錄的 `Data\RyzenMasterSDK.bat` 明確指向 AMD CLI；`Data\RyzenMasterSDK.txt` 只有 CLI help，不能把這個檔案當即時感測 log。未據此推論 MSI 當下每個 UI 數值都一定來自同一條 API。

## 來源與方案比較

| 途徑 | 可行性與成本 |
| --- | --- |
| Windows 通用 WMI | 本機未取得 CPU 溫度。Microsoft 明示 `Win32_TemperatureProbe.CurrentReading` 目前不由 WMI 填入，不能把 null／空集合當成 0°C。[官方文件](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-temperatureprobe) |
| AMD Ryzen Master SDK | 本機 CLI 的 `GetPMTableData` 已取得溫度；舊 `GetCurrentTemperature` 已停用。AMD 公開 Monitoring SDK 提供唯讀處理器量測及範例；本機完整 SDK 另含設定 APIs，整合只能固定允許讀取，不可暴露任意 API 呼叫。需要 Windows 管理員權限及相容驅動。[AMD 官方入口](https://www.amd.com/en/developer/ryzen-master-monitoring-sdk.html) |
| LibreHardwareMonitor | 開源感測 library／應用程式，支援 CPU 等硬體；部分 sensor 要管理員權限。適合未來跨硬體 provider，但本機尚未啟動／驗證；如採用，另外確認版本、授權與驅動，不與 solver bundle 混用。[官方 repository](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor) |
| HWiNFO shared memory | 官方提供對外 shared memory；非 Pro 使用有 12 小時限制，到期會停用，跨整晚執行需考量授權與資料中斷。不能因最後一筆仍在記憶體就當成即時資料。[作者說明](https://www.hwinfo.com/forum/threads/important-changes-to-hwinfo64-coming-soon.7092/) |

## AMD 管理員實測結果

使用者於本 task 明確授權 SDK 溫度測試；Windows UAC 啟動的獨立測試程序驗證管理員權限、AMD 簽章、固定 CLI SHA-256 與既有驅動 Running，才執行固定唯讀 API。每次 CLI 上限 10 秒，失敗即停止剩餘取樣。未執行設定 API、安裝／啟停驅動或啟動 solver 負載。

第一次 `-a GetCurrentTemperature` 在 924ms 後以 exit 0 結束，但 stdout 為 `Deprecated API. Use GetPMTableData`，沒有數值，因此取消剩餘兩次讀取。隨後核對本機官方 `apiCalls.cpp`：`GetPMTableData` 只呼叫 `ICPUEx::GetPMTableData` 取得 PMTable，再列印其中的 `dTemperature`；沒有設定 API。

沿用本次授權改測 `-a GetPMTableData`，於台灣時間 2026-08-28 21:40 完成三筆查詢：

| 第幾筆 | CPU 溫度 | 整個 CLI 呼叫耗時 | Exit／逾時 |
| --- | --- | --- | --- |
| 1 | 54.54°C | 1041.22ms | 0／否 |
| 2 | 52.57°C | 1036.24ms | 0／否 |
| 3 | 52.27°C | 1059.27ms | 0／否 |

三次 stderr 都是空白，驅動前後都是 Running；完成後確認管理員測試程序已退出。完整 CLI 輸出保存在本機 `.tmp/amd-sdk-temperature-test-20260828/pm-table-result.json`，可追蹤的精簡證據見 [SDK 測試 JSON](runner-temperature-sdk-probe-20260828.json)。這是當時觀測值，不是高負載溫度或安全 worker 數的證據。

CLI 為 `3.0.0.3620`，SHA-256 為 `B11A073FC9E036A2BB8D139CA0865096997522DD937ECE171758F1E6548B1BB1`。此版本執行 `GetPMTableData` 後，溫度輸出行仍以 **`GetCurrentTemperature`** 開頭；那是欄位標籤，不表示應呼叫舊 API。Parser 必須驗證數值、單位與錯誤文字，不能只看 exit code。

重播時由使用者在「系統管理員 PowerShell」執行以下固定唯讀 API。`sampleApp.cpp` 在驅動不存在或未 Running 時會走 `InstallDriver()`，故保留前置檢查，且本流程不替使用者安裝或啟動驅動：

~~~powershell
$taskPrincipal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $taskPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw '請先開啟系統管理員 PowerShell；不自動提權。'
}
$taskDriver = Get-CimInstance Win32_SystemDriver -Filter "Name='AMDRyzenMasterDriverV29'"
if ($taskDriver.State -ne 'Running') {
    throw '既有 Ryzen 驅動未運作，停止；本流程不安裝或啟動驅動。'
}
& 'C:\Program Files\AMD\RyzenMasterSDK\AMDRyzenMasterCLI\bin-prebuilt\AMDRyzenMasterCLI.exe' -a GetPMTableData
~~~

後續接入時需要獨立非同步 reader，避免約一秒的程序呼叫卡住 runner。仍需驗證長期讀取、MSI Center CPU Core 溫度對照及雙工具共存。CPU Socket、平均溫度、Tctl／Tdie、瞬間峰值不能無條件互換。

## 降頻偵測的能力邊界

**後續決定：使用者已要求停止降頻研究，不再追查 HWiNFO／HTC／PROCHOT，也不把降頻旗標列為本次溫控啟動的必要條件。以下保留當時查核結果，不是後續工作清單。**

使用者希望發生降頻時立即停止。2026-08-28 核對本機 SDK `3.0.0.3620` 的 `ICPUEx.h`、`IDevice.h`、PMTable 結構、CLI API 清單與先前保存的三筆輸出後，目前已驗證的資料來源能提供溫度、有效／目前時脈，以及 PPT／TDC／EDC 的讀值與限制；尚未找到能直接判斷 HTC／PROCHOT 已觸發的狀態旗標，也沒有已驗證的事件歷史或觸發計數。

第一筆原始輸出有 `cHTC Current Limit: 95.000000 celsius` 與 `cHTC Current Value: 54.538887 celsius`。`IDevice.h` 對 `fcHTCValue` 的定義同樣是攝氏溫度，不是「是否降頻」布林值。`IsDisableProcHOTAvailable` 查的是關閉 PROCHOT 功能是否可用，不是 PROCHOT 是否觸發；`DisablePROCHOT` 則是修改保護設定的方法，本次沒有呼叫，也不作監測用途。

有效時脈下降本身不足以證明熱降頻；觀察值必須保留負載、休眠及功耗限制的脈絡。PPT／TDC／EDC 達到限制也不能直接改名為熱降頻。若要把功耗／電流限制另列為停止條件，應由使用者明確選擇，不混入熱保護事件。

HWiNFO 是待驗證的候選來源，其作者說明 [HTC 與熱保護狀態](https://www.hwinfo.com/forum/threads/what-does-the-htc-in-thermal-throttling-htc-mean.6073/)，另有 [HTC／PROCHOT 來源討論](https://www.hwinfo.com/forum/threads/need-help-understanding-hwinfo-thermal-throttle-meanings-and-where-they-come-from.9776/)。這證明有可調查的明確狀態欄位，不代表本機 9900X 已驗證可用；對外取用、授權、資料更新與版本相容仍需另測，沒有安裝新工具或重新使用管理員權限。

「降頻即停」接入條件：取得來源明示的有效 HTC／PROCHOT 觸發狀態時，直接進入停止流程，不再等溫度達 90／93°C 或持續一分鐘；狀態缺失標為 unknown，不能解讀為未降頻。若要求連兩次取樣間的短暫事件也要捕捉，需來源提供事件或可鎖存旗標；一般輪詢只能保證讀到時處理。歷史最大值必須能界定到本次 run，避免前次事件污染新 run。

目前未實作降頻監測；已實作的自動停止只依溫度與感測有效性，不宣稱能偵測降頻。不以故意升溫、修改溫度上限或關閉硬體保護來製造測試事件。

## 溫控實作與驗證

後續已新增 `thermal-control.mjs` 與 `read-amd-temperature.ps1`，runner 接入動態排程、溫控停止及事件記錄。使用者最後確認的方向是：指定 workers 起跑；90°C 才減員，不採 88°C；低於 82°C 持續觀察後增員；高溫累計限制採滑動窗口；不再研究降頻。完整政策與啟動／續跑方式只由 [長跑工作流](../../.agents/workflows/run-generic-overnight-evaluation.md) 管理。

本輪沒有再次執行管理員 SDK 測試，沒有安裝程式、啟停驅動或改硬體設定。新增 reader 經 PowerShell 語法解析，並以先前三筆真實 SDK stdout 驗證 parser 能取出 54.54／52.57／52.27°C；尚未驗證此 reader 的整晚運作、MSI 同時對照或真實負載自動調整。

已執行的驗證：

- 全部 36 項 overnight tests 通過，含 11 項溫度／CLI／資料新鮮度測試；虛擬時鐘跑過 8 小時，分散的短暫高溫不會錯誤累加成整晚門檻。也涵蓋窗口裁切、分段累計恰好 60 秒、93°C、起始 worker、90°C 減員、82°C 低溫計時與上限、失聯、續跑熱歷史。
- Windows 程序樹中止測試在 Codex 沙箱內被 taskkill 權限阻擋；在沙箱外、一般 Windows 權限下重跑通過。這不等於 Windows UAC／管理員 SDK 測試。
- 原生 runner bounded smoke 使用**模擬溫度檔**，最多 2 workers。讀到模擬 90°C 後從 2 減到 1，attempt 記為 `thermal-rescheduled`；模擬 93°C 後以 exit 76 停止，所有已記錄 evaluator PID 已退出，沒有 failed／running shard。Status exit 75，不增加耗時；同 run 續跑於 budget 到期 exit 75，累積耗時由約 3,909ms 增到 10,336ms。
- 另以單 worker 完成小型 native shard，完成、status、再次執行都是 exit 0；final bytes 與 attempts 保持原樣，沒有重跑已完成工作。這不代表完整徹夜通過。
- 最後一次本機測試輸出位於 `.tmp/thermal-smoke-20260828-1787926084535/verification.json`，manifest／thermal JSONL／console logs 在同目錄；模擬 samples 的 session ID 明示 `SIMULATION-NOT-HARDWARE`，不能當成實測 CPU 溫度。
- Typecheck、docs:check 與 git diff --check 通過。原 semantic fingerprint 不因 temperature path、window 或 worker controls 改變。

## 真實負載啟用時仍需確認

- Reader 使用固定的唯讀 API，明示 provider／sensor／單位；不改時脈、電壓、風扇或安全設定。
- 將讀取時間、讀值、錯誤、provider 版本及 sensor 語意保存，console 明示 unavailable／stale，而不是保留最後一筆當即時溫度。
- 讀取在獨立、有 timeout 的小程序，不能卡住 evaluator queue；量測每次初始化成本，必要時另建持續運作的讀取 helper。
- 已選定的停止線與感測失聯政策接到 child process tree 中止／manifest 收尾；實際裝置仍需先確認 reader 持續更新、來源語意及停止流程，不把軟體門檻當成硬體安全溫度。
- 先做短期對照與中斷測試，再由使用者自行做持續負載觀察。完整 runner 不需要為了 sensor 一起以管理員執行。

## 續跑計時修正與證據

`progress-timing.mjs` 與 runner 已加入累積 active wall clock、跨 invocation ETA 與 30 秒 checkpoint。停機時間及 status-only 不計入 active clock；失敗／中止的執行時間保留。舊資料以區間聯集回補，保留 `legacy-intervals` 標記；不是累加平行 worker 的 duration。

唯讀套用於既有 `generic-native-v110-perf-vs-v030-64seed-20260827` manifest，原本只顯示最後 invocation 的 `5,280,167ms`（約 1h28m），歷史可觀察區間可重建 `11,369,019ms`（約 3h09m29s）的下界。沒有改寫該正式 run、shards 或既有四表。

實作未改 semantic config／evaluator bundle／solver identity，因此原命令與 run ID 可繼續使用。ETA 仍是平均 shard 粗估；改 workers 或剩餘 family 成本不同時，不承諾線性準確。

驗證涵蓋：25 項 runner tests（含 6 項新增計時案例）；單 worker、1 family × 3 risks × 1 seed 的原生 smoke；global cutoff exit 75 後續跑 exit 0；完整／未完整 status-only 的 exit 0／75；重複 status 不增加累積耗時或 attempts。每個完整 smoke 為 120 paired cases／240 solver episodes，不是完整徹夜或 thermal calibration。Typecheck、docs:check 與 git diff --check 也通過。

另以單 worker、32 秒上限的 bounded case 實際觀察到 shard 尚未完成時的 30 秒進度／manifest checkpoint，32 秒截止後保存最後耗時並以 exit 75 結束。這僅驗證計時持久化與中止路徑。
