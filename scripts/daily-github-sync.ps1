$ErrorActionPreference = 'Stop'

$repositoryPath = 'C:\Users\redcl\ai project'
$targetBranch = 'agent/publish-latest-source'
$logDirectory = Join-Path $env:LOCALAPPDATA 'PollInsightGitHubSync'
$logPath = Join-Path $logDirectory 'daily-sync.log'

New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

function Write-SyncLog {
    param([string]$Message)
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -LiteralPath $logPath -Value "[$timestamp] $Message"
}

try {
    Set-Location -LiteralPath $repositoryPath

    $currentBranch = (git branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0 -or $currentBranch -ne $targetBranch) {
        throw "Current branch is '$currentBranch'; expected '$targetBranch'. Sync stopped without switching branches."
    }

    git fetch origin $targetBranch --quiet
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to fetch the remote branch.'
    }

    git add -A
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to stage changes.'
    }

    $stagedFiles = @(git diff --cached --name-only)
    $environmentFiles = @($stagedFiles | Where-Object {
        $_ -match '(^|/)\.env($|\.)' -and $_ -notmatch '\.env\.example$'
    })
    if ($environmentFiles.Count -gt 0) {
        git reset --quiet
        throw 'An .env file was staged. All staged changes were cleared and sync was stopped.'
    }

    $secretPatterns = @(
        'AKIA[0-9A-Z]{16}',
        'ASIA[0-9A-Z]{16}',
        'ghp_[A-Za-z0-9]{30,}',
        'github_pat_[A-Za-z0-9_]{30,}',
        'sk-[A-Za-z0-9]{20,}',
        'AIza[0-9A-Za-z_-]{30,}',
        'xox[baprs]-[0-9A-Za-z-]{10,}',
        '-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
        '(mysql|postgres(ql)?|mongodb(\+srv)?):[^[:space:]]+:[^[:space:]@]+@',
        '(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)[[:space:]]*[:=][[:space:]]*["''][^"'']{4,}["'']'
    )

    $secretFiles = @()
    foreach ($pattern in $secretPatterns) {
        $matches = @(git grep --cached -I -l -E -- $pattern 2>$null)
        if ($LASTEXITCODE -eq 0) {
            $secretFiles += $matches
        }
    }
    $secretFiles = @($secretFiles | Sort-Object -Unique)
    if ($secretFiles.Count -gt 0) {
        git reset --quiet
        throw "Potential secrets detected in $($secretFiles.Count) file(s). Staged changes were cleared and sync was stopped."
    }

    if ($stagedFiles.Count -eq 0) {
        Write-SyncLog 'No local changes to sync.'
        exit 0
    }

    $commitMessage = "Daily sync $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    git commit -m $commitMessage --quiet
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to create the daily sync commit.'
    }

    git push origin $targetBranch --quiet
    if ($LASTEXITCODE -ne 0) {
        throw 'Push failed. The local commit was preserved for manual review.'
    }

    $commitSha = (git rev-parse --short HEAD).Trim()
    Write-SyncLog "Sync completed successfully at commit $commitSha."
}
catch {
    Write-SyncLog "ERROR: $($_.Exception.Message)"
    exit 1
}
