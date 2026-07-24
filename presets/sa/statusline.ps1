# Statusline: outputs git branch + project name + time on one line.
# Gracefully omits git branch if not a git repository.

$Branch = ''
try {
    $Branch = (git rev-parse --abbrev-ref HEAD 2>$null)
} catch {}

$Project = Split-Path -Leaf (Get-Location)
$Time = Get-Date -Format 'HH:mm'

if ($Branch) {
    Write-Output "$Branch | $Project | $Time"
} else {
    Write-Output "$Project | $Time"
}
