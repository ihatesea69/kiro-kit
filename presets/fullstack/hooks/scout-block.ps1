# Security guard: blocks dangerous commands before execution.
# Registered as PreToolUse hook.

$Input = $args -join ' '

$BlockedPatterns = @(
    'rm\s+(-rf|-fr)\s+[\/~]'
    'drop\s+(database|table|schema)'
    'truncate\s+table'
    'format\s+[a-z]:'
    'mkfs\.'
    'dd\s+if=.*of=\/dev'
    'chmod\s+-R\s+777\s+\/'
    'shutdown'
    'reboot'
    'init\s+0'
)

foreach ($pattern in $BlockedPatterns) {
    if ($Input -match $pattern) {
        Write-Error "[scout-block] Blocked dangerous command: $Input"
        exit 2
    }
}

exit 0
