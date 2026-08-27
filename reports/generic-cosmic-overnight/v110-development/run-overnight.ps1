param(
    [switch]$StatusOnly,
    [switch]$Smoke,
    [ValidateRange(1, 8)][int]$Workers = 2,
    [string]$TimeBudget = '8.5h'
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$binaryRelativePath = 'evaluation-runs/v110-development/artifacts/35e924b2c36516a7fac3d6a424c32cd9ceb94b9db732191ef8d280a3549b7c99/craft-kernel-generic-episode.exe'
$binaryPath = Join-Path $repositoryRoot $binaryRelativePath
$expectedHash = '35e924b2c36516a7fac3d6a424c32cd9ceb94b9db732191ef8d280a3549b7c99'
if (!(Test-Path -LiteralPath $binaryPath)) { throw "Missing sealed binary: $binaryPath" }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $binaryPath).Hash.ToLowerInvariant() -ne $expectedHash) {
    throw 'Sealed v1.1 binary hash mismatch'
}

$baseSeed = if ($Smoke) { 2101202608 } else { 1101202608 }
$runnerArguments = @(
    'tools/evaluate-generic-cosmic-overnight/run.mjs',
    '--engine=rust-native', '--native-preview', "--native-binary=$binaryPath",
    '--native-baseline-solver=generic-craft-specialist-resource-guard-v0.30.0',
    '--native-candidate-solver=generic-craft-route-portfolio-v1.1.0',
    "--base-seed=$baseSeed", "--workers=$Workers", "--time-budget=$TimeBudget",
    '--shard-timeout=30m', '--retries=1',
    '--output=evaluation-runs/generic-cosmic-overnight-native'
)
if ($Smoke) {
    $runnerArguments += @('--family-limit=1', '--risk=stable', '--seed-count=1',
        '--run-id=generic-native-v110-operations-smoke-20260827')
} else {
    $runnerArguments += @('--risk=all', '--seed-count=8',
        '--run-id=generic-native-v110-vs-v030-8seed-20260827')
}
if ($StatusOnly) { $runnerArguments += '--status-only' }

Push-Location -LiteralPath $repositoryRoot
try {
    & node @runnerArguments
    $runnerExitCode = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $runnerExitCode
