# 截图 OCR（带坐标）—— 给"看不见图"的 agent 用的眼睛
#
# 为什么有它：本项目的 agent 跑在无视觉输入的模型上（平台会把图省略掉），
# 但人类队友经常用截图沟通（GitHub 页面、报错弹窗、游戏画面）。Windows 自带 OCR 能出**逐行文字 +
# 位置**，足够读文字界面，也能判断"这个元素靠左还是靠右、在不在可见区"。
#
# 用法（Git Bash / PowerShell 均可）：
#   powershell -NoProfile -ExecutionPolicy Bypass -File tests/manual/win-ocr.ps1 -Path <图片> -Out <输出.txt>
#   # 只想看文字不看坐标：加 -TextOnly
#
# 输出格式：每行一条，`y=123 x=456 w=78 | 这一行的文字`
#   y 越小越靠上；x 越小越靠左（单位是图片像素）。同一行内的词按 x 排序后拼起来。
# 注意：语言靠系统已装的语言包（中文系统出 zh-Hans-CN）。识别率对 UI 文字够用，对手写/艺术字一般。

param(
  [Parameter(Mandatory = $true)][string]$Path,
  [Parameter(Mandatory = $true)][string]$Out,
  [switch]$TextOnly
)

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}

[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

$langs = ([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | ForEach-Object { $_.LanguageTag }) -join ', '
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) {
  [System.IO.File]::WriteAllText($Out, "OCR engine unavailable. installed=$langs", [System.Text.UTF8Encoding]::new($false))
  Write-Output "FAIL engine unavailable (langs=$langs)"
  exit 1
}

$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

$sb = [System.Text.StringBuilder]::new()
[void]$sb.AppendLine("=== image: $([System.IO.Path]::GetFileName($Path))  size: $($decoder.PixelWidth)x$($decoder.PixelHeight)  lang: $langs ===")
foreach ($line in $result.Lines) {
  if ($TextOnly) {
    [void]$sb.AppendLine($line.Text)
    continue
  }
  # 行内词按 x 排序；行坐标取本行所有词的包围盒并集
  $words = @($line.Words | Sort-Object { $_.BoundingRect.X })
  if (-not $words.Count) { continue }
  $x = ($words | ForEach-Object { $_.BoundingRect.X } | Measure-Object -Minimum).Minimum
  $y = ($words | ForEach-Object { $_.BoundingRect.Y } | Measure-Object -Minimum).Minimum
  $right = ($words | ForEach-Object { $_.BoundingRect.X + $_.BoundingRect.Width } | Measure-Object -Maximum).Maximum
  $text = ($words | ForEach-Object { $_.Text }) -join ''
  [void]$sb.AppendLine(("y={0,4} x={1,4} w={2,4} | {3}" -f [int]$y, [int]$x, [int]($right - $x), $text))
}
[System.IO.File]::WriteAllText($Out, $sb.ToString(), [System.Text.UTF8Encoding]::new($false))
Write-Output ("OK lines=" + $result.Lines.Count + " -> " + $Out)
