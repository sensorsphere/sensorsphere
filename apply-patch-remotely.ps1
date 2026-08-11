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

    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE."
    }
}

if (-not (Test-Path -LiteralPath $PatchPath -PathType Leaf)) {
    throw "Patch file not found: $PatchPath"
}

$PatchFile = Get-Item -LiteralPath $PatchPath

if ($PatchFile.Extension -ne ".patch" -and $PatchFile.Extension -ne ".diff") {
    throw "Expected a .patch or .diff file: $($PatchFile.Name)"
}

$PatchName = $PatchFile.Name
$RemotePatch = "$RemotePatchDir/$PatchName"
$Target = "$RemoteUser@$RemoteHost"

Write-Header -PatchName $PatchName -SelectedAction $Action

$SshBaseArgs = @()

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

Write-Host "[1/3] Preparing remote patch directory..."
Invoke-Native -Command "ssh" -Arguments (
    $SshBaseArgs + @(
        $Target,
        "mkdir -p '$RemotePatchDir'"
    )
)

Write-Host "[2/3] Uploading patch..."
Invoke-Native -Command "scp" -Arguments (
    $ScpBaseArgs + @(
        $PatchFile.FullName,
        "${Target}:$RemotePatch"
    )
)

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

$RemoteScript = switch ($Action) {
    "check" {
@"
set -euo pipefail

cd '$RemoteProject'

$DirtyGuard

echo
echo "Checking patch..."
git apply --check '$RemotePatch'

echo
echo "Patch check: OK"
"@
    }

    "apply" {
@"
set -euo pipefail

cd '$RemoteProject'

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
"@
    }

    "revert" {
@"
set -euo pipefail

cd '$RemoteProject'

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
"@
    }

    "status" {
@"
set -euo pipefail

cd '$RemoteProject'

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
"@
    }
}

if ($Action -eq "apply" -and $VerifyCommand) {
    $RemoteScript += @"

echo
echo "Running verification:"
echo '$VerifyCommand'
$VerifyCommand

echo
echo "Verification: OK"
"@
}

if (-not $KeepRemotePatch) {
    $RemoteScript += @"

rm -f '$RemotePatch'
"@
}

Write-Host "[3/3] Running remote action..."

# Normalize Windows CRLF to Unix LF before sending to Bash.
$RemoteScript = $RemoteScript -replace "`r`n", "`n"
$RemoteScript = $RemoteScript -replace "`r", "`n"

$EncodedRemoteScript = [Convert]::ToBase64String(
    [Text.Encoding]::UTF8.GetBytes($RemoteScript)
)

$Launcher = "echo '$EncodedRemoteScript' | base64 -d | bash"

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