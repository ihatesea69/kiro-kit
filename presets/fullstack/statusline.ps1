$branch = try { git rev-parse --abbrev-ref HEAD 2>$null } catch { "no-git" }
if (-not $branch) { $branch = "no-git" }
$project = Split-Path -Leaf (Get-Location)
$time = Get-Date -Format "HH:mm"
Write-Host "$branch | $project | $time" -NoNewline
