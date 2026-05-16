$bytes = [System.IO.File]::ReadAllBytes('.github/workflows/ci.yml')
$crlf = 0
for ($i = 0; $i -lt $bytes.Length - 1; $i++) {
  if ($bytes[$i] -eq 13 -and $bytes[$i+1] -eq 10) { $crlf++ }
}
$lf = ($bytes | Where-Object { $_ -eq 10 }).Count
Write-Host ('CRLF=' + $crlf + ' LF_total=' + $lf + ' size=' + $bytes.Length)
