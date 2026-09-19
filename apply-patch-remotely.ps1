param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("check", "apply", "revert", "status")]
    [string]$Action,

    [Parameter(Mandatory = $true, Position = 1)]
    [string]$PatchPath,

    [string]$RemoteHost = "na-01",

    [string]$RemoteUser = "ubuntu",

    [string]$RemoteProject = "/home/ubuntu/sensorsphere",

    [string]$RemotePatchDir = "/tmp/sensorsphere-patches",

    [string]$IdentityFile = "",

    [string]$VerifyCommand = "",

    [switch]$AllowDirty,

    [switch]$KeepRemotePatch
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Header {
    param(
        [string]$PatchName,
        [string]$SelectedAction
    )

    Write-Host ""
    Write-Host "========================================"
    Write-Host " SensorSphere Patch"
    Write-Host "========================================"
    Write-Host ("Patch  : {0}" -f $PatchName)
    Write-Host ("Action : {0}" -f $SelectedAction)
    Write-Host ("Target : {0}@{1}:{2}" -f $RemoteUser, $RemoteHost, $RemoteProject)
    Write-Host "========================================"
    Write-Host ""
}

function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command,

        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    & $Command @Arguments
    $ExitCode = $LASTEXITCODE

    if ($ExitCode -ne 0) {
        throw "$Command failed with exit code $ExitCode."
    }
}

function Test-PatchFormat {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $Content = Get-Content -LiteralPath $Path -Raw

    if (-not $Content.StartsWith("diff --git ")) {
        throw "Invalid patch format: file must start with 'diff --git'."
    }

    if (
        $Content -notmatch "(?m)^--- (?:a/.+|/dev/null)$"
    ) {
        throw "Invalid patch format: missing valid '--- a/...' or '--- /dev/null' header."
    }

    if (
        $Content -notmatch "(?m)^\+\+\+ (?:b/.+|/dev/null)$"
    ) {
        throw "Invalid patch format: missing valid '+++ b/...' or '+++ /dev/null' header."
    }

    if ($Content -notmatch "(?m)^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@") {
        throw "Invalid patch format: no valid unified-diff hunk header found."
    }
}

if (-not (Test-Path -LiteralPath $PatchPath -PathType Leaf)) {
    throw "Patch file not found: $PatchPath"
}

$PatchFile = Get-Item -LiteralPath $PatchPath

if ($PatchFile.Extension -ne ".patch" -and $PatchFile.Extension -ne ".diff") {
    throw "Expected a .patch or .diff file: $($PatchFile.Name)"
}

if ($PatchFile.Name -notmatch '^[A-Za-z0-9._-]+$') {
    throw "Unsafe patch filename: $($PatchFile.Name)"
}

Test-PatchFormat -Path $PatchFile.FullName

$PatchName = $PatchFile.Name
$RemotePatch = "$RemotePatchDir/$PatchName"
$Target = "$RemoteUser@$RemoteHost"

$LocalHash = (
    Get-FileHash -LiteralPath $PatchFile.FullName -Algorithm SHA256
).Hash.ToLowerInvariant()

Write-Header -PatchName $PatchName -SelectedAction $Action

$SshBaseArgs = @("-A")

if ($IdentityFile) {
    if (-not (Test-Path -LiteralPath $IdentityFile -PathType Leaf)) {
        throw "SSH identity file not found: $IdentityFile"
    }

    $SshBaseArgs += @("-i", $IdentityFile)
}

$ScpBaseArgs = @()

if ($IdentityFile) {
    $ScpBaseArgs += @("-i", $IdentityFile)
}

Write-Host "[1/4] Preparing remote patch directory..."
Invoke-Native -Command "ssh" -Arguments (
    $SshBaseArgs + @(
        $Target,
        "mkdir -p '$RemotePatchDir'"
    )
)

Write-Host "[2/4] Uploading patch..."
Invoke-Native -Command "scp" -Arguments (
    $ScpBaseArgs + @(
        $PatchFile.FullName,
        "${Target}:$RemotePatch"
    )
)

Write-Host "[3/4] Verifying uploaded patch integrity..."
$RemoteHashOutput = & ssh @SshBaseArgs $Target "sha256sum '$RemotePatch' | awk '{print `$1}'"
$HashExitCode = $LASTEXITCODE

if ($HashExitCode -ne 0) {
    throw "Unable to calculate remote SHA256."
}

$RemoteHash = ($RemoteHashOutput | Select-Object -First 1).Trim().ToLowerInvariant()

if ($RemoteHash -ne $LocalHash) {
    throw "Patch integrity check failed. Local SHA256=$LocalHash Remote SHA256=$RemoteHash"
}

Write-Host "Patch SHA256: OK"

$DirtyGuard = @'
if [ -n "$(git status --porcelain)" ]; then
    echo "ERROR: Git working tree is not clean."
    echo
    git status --short
    exit 20
fi
'@

if ($AllowDirty) {
    $DirtyGuard = @'
echo "WARNING: Dirty working tree allowed by caller."
git status --short || true
'@
}

$VerifyBlock = ""

if ($Action -eq "apply" -and $VerifyCommand) {
    $VerifyBlock = @"

echo
echo "Running verification:"
printf '%s\n' '$($VerifyCommand.Replace("'", "'\''"))'

set +e
(
    set -euo pipefail
$VerifyCommand
)
VERIFY_RC=`$?
set -e

if [ "`$VERIFY_RC" -ne 0 ]; then
    echo
    echo "ERROR: Verification failed with exit code `$VERIFY_RC."
    exit "`$VERIFY_RC"
fi

echo
echo "Verification: OK"
"@
}

$CleanupBlock = ""

if (-not $KeepRemotePatch) {
    $CleanupBlock = @"

rm -f '$RemotePatch'
"@
}

$RemoteScript = switch ($Action) {
    "check" {
@"
set -euo pipefail

cd '$RemoteProject'

test -d .git || {
    echo "ERROR: '$RemoteProject' is not a Git repository."
    exit 22
}

$DirtyGuard

echo
echo "Checking patch..."
git apply --check '$RemotePatch'

echo
echo "Patch check: OK"
$CleanupBlock
"@
    }

    "apply" {
@"
set -euo pipefail

cd '$RemoteProject'

test -d .git || {
    echo "ERROR: '$RemoteProject' is not a Git repository."
    exit 22
}

$DirtyGuard

echo
echo "Checking patch..."
git apply --check '$RemotePatch'

echo
echo "Applying patch..."
git apply --whitespace=warn '$RemotePatch'

echo
echo "Patch applied."
echo
git status --short
$VerifyBlock
$CleanupBlock
"@
    }

    "revert" {
@"
set -euo pipefail

cd '$RemoteProject'

test -d .git || {
    echo "ERROR: '$RemoteProject' is not a Git repository."
    exit 22
}

echo
echo "Checking reverse patch..."
git apply --reverse --check '$RemotePatch'

echo
echo "Reverting patch..."
git apply --reverse '$RemotePatch'

echo
echo "Patch reverted."
echo
git status --short
$CleanupBlock
"@
    }

    "status" {
@"
set -euo pipefail

cd '$RemoteProject'

test -d .git || {
    echo "ERROR: '$RemoteProject' is not a Git repository."
    exit 22
}

echo "Git status:"
git status --short

echo
if git apply --check '$RemotePatch' >/dev/null 2>&1; then
    echo "Patch status: NOT APPLIED / APPLICABLE"
elif git apply --reverse --check '$RemotePatch' >/dev/null 2>&1; then
    echo "Patch status: APPLIED"
else
    echo "Patch status: CONFLICT OR PARTIALLY APPLIED"
    exit 21
fi
$CleanupBlock
"@
    }
}

Write-Host "[4/4] Running remote action..."

$RemoteScript = $RemoteScript -replace "`r`n", "`n"
$RemoteScript = $RemoteScript -replace "`r", "`n"

$EncodedRemoteScript = [Convert]::ToBase64String(
    [Text.Encoding]::UTF8.GetBytes($RemoteScript)
)

$Launcher = "printf '%s' '$EncodedRemoteScript' | base64 -d | bash"

Invoke-Native -Command "ssh" -Arguments (
    $SshBaseArgs + @(
        $Target,
        $Launcher
    )
)

Write-Host ""
Write-Host "========================================"
Write-Host " Completed successfully"
Write-Host "========================================"
