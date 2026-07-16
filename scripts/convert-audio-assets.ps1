param(
  [Parameter(Mandatory = $true)]
  [string]$FfmpegPath,
  [string]$AudioDirectory = "public/assets/audio"
)

$ErrorActionPreference = "Stop"
$audioPath = Resolve-Path -LiteralPath $AudioDirectory

Get-ChildItem -LiteralPath $audioPath -Filter "*.wav" | ForEach-Object {
  $target = [System.IO.Path]::ChangeExtension($_.FullName, ".ogg")
  & $FfmpegPath -hide_banner -loglevel error -y `
    -i $_.FullName -map_metadata -1 -vn `
    -ar 48000 -ac 2 -c:a libvorbis -b:a 128k $target
  if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg failed for $($_.Name)"
  }
  Write-Output "$($_.Name) -> $([System.IO.Path]::GetFileName($target))"
}
