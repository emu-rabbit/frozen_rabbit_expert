param(
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [ValidateRange(1, 1440)][int]$DurationMinutes = 720
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
# Run this small reader in a user-opened administrator PowerShell. The evaluator
# stays unprivileged. Never relaunch, install/start a driver, or accept API names.
$taskExecutable = 'C:\Program Files\AMD\RyzenMasterSDK\AMDRyzenMasterCLI\bin-prebuilt\AMDRyzenMasterCLI.exe'
$taskExpectedHash = 'B11A073FC9E036A2BB8D139CA0865096997522DD937ECE171758F1E6548B1BB1'
$taskOutput = [IO.Path]::GetFullPath($OutputPath)
$taskDirectory = [IO.Path]::GetDirectoryName($taskOutput)
$taskSession = [Guid]::NewGuid().ToString()
$taskSequence = 0
$taskProcess = $null
$taskLock = $null
$taskStatus = 'stopped'
$taskError = $null
$taskStarted = [DateTime]::UtcNow.ToString('o')
function Save-TemperatureSnapshot($status, $temperature, $started, $errorMessage) {
    $taskSnapshot = [ordered]@{
        schemaVersion = 'overnight-temperature-v1'
        provider = 'amd-ryzen-master-sdk'
        sourceVersion = '3.0.0.3620'
        executableSha256 = $taskExpectedHash
        sensor = 'PMTable.dTemperature'
        unit = 'Celsius'
        sessionId = $taskSession
        sequence = $taskSequence
        status = $status
        startedAt = $started
        observedAt = [DateTime]::UtcNow.ToString('o')
        temperatureCelsius = $temperature
        error = $errorMessage
    }
    $taskTemporary = "$taskOutput.$taskSession.tmp"
    [IO.File]::WriteAllText($taskTemporary, ($taskSnapshot | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
    if ([IO.File]::Exists($taskOutput)) { [IO.File]::Replace($taskTemporary, $taskOutput, $null) }
    else { [IO.File]::Move($taskTemporary, $taskOutput) }
}
function Assert-ExistingDriver {
    $taskDriver = Get-CimInstance Win32_SystemDriver -Filter "Name='AMDRyzenMasterDriverV29'"
    if ($null -eq $taskDriver -or $taskDriver.State -ne 'Running' -or
        $taskDriver.PathName -ne '\??\C:\Program Files\AMD\RyzenMasterSDK\bin\AMDRyzenMasterDriver.sys') {
        throw 'Verified AMD driver is not already Running; no driver installation or start permitted.'
    }
}
try {
    $taskPrincipal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $taskPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Open a separate administrator PowerShell for this reader; no automatic elevation.'
    }
    $null = [IO.Directory]::CreateDirectory($taskDirectory)
    $taskLock = [IO.File]::Open("$taskOutput.lock", [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $taskSignature = Get-AuthenticodeSignature -LiteralPath $taskExecutable
    if ($taskSignature.Status -ne 'Valid' -or $taskSignature.SignerCertificate.Subject -notmatch 'O=Advanced Micro Devices' -or
        (Get-FileHash -Algorithm SHA256 -LiteralPath $taskExecutable).Hash -ne $taskExpectedHash) {
        throw 'AMD CLI signature/hash changed; stop and revalidate the SDK before use.'
    }
    Assert-ExistingDriver
    $taskLifetime = [Diagnostics.Stopwatch]::StartNew()
    while ($taskLifetime.Elapsed.TotalMinutes -lt $DurationMinutes) {
        $taskCycle = [Diagnostics.Stopwatch]::StartNew()
        Assert-ExistingDriver
        $taskStarted = [DateTime]::UtcNow.ToString('o')
        $taskSequence++
        $taskStartInfo = [Diagnostics.ProcessStartInfo]::new()
        $taskStartInfo.FileName = $taskExecutable
        $taskStartInfo.Arguments = '-a GetPMTableData'
        $taskStartInfo.WorkingDirectory = [IO.Path]::GetDirectoryName($taskExecutable)
        $taskStartInfo.UseShellExecute = $false
        $taskStartInfo.CreateNoWindow = $true
        $taskStartInfo.RedirectStandardOutput = $true
        $taskStartInfo.RedirectStandardError = $true
        $taskProcess = [Diagnostics.Process]::new()
        $taskProcess.StartInfo = $taskStartInfo
        if (-not $taskProcess.Start()) { throw 'AMD reader failed to start.' }
        $taskStdout = $taskProcess.StandardOutput.ReadToEndAsync()
        $taskStderr = $taskProcess.StandardError.ReadToEndAsync()
        if (-not $taskProcess.WaitForExit(3000)) { throw 'AMD temperature read exceeded 3 seconds.' }
        $taskText = $taskStdout.GetAwaiter().GetResult()
        $taskErrors = $taskStderr.GetAwaiter().GetResult()
        if ($taskProcess.ExitCode -ne 0 -or $taskErrors.Trim().Length -ne 0 -or $taskText -match 'Deprecated API') {
            throw 'AMD temperature read returned an error.'
        }
        $taskMatches = [regex]::Matches($taskText, '(?m)^GetCurrentTemperature[^\r\n]*?(-?\d+(?:\.\d+)?)\s+Celsius\s*\r?$')
        if ($taskMatches.Count -ne 1) { throw 'Expected exactly one PMTable CPU temperature in Celsius.' }
        $taskTemperature = [double]::Parse($taskMatches[0].Groups[1].Value, [Globalization.CultureInfo]::InvariantCulture)
        if ($taskTemperature -le 0 -or $taskTemperature -ge 150) { throw 'Invalid CPU temperature.' }
        Save-TemperatureSnapshot 'ok' $taskTemperature $taskStarted $null
        $taskProcess.Dispose()
        $taskProcess = $null
        $taskDelay = [Math]::Max(0, 3000 - [int]$taskCycle.ElapsedMilliseconds)
        if ($taskDelay -gt 0) { Start-Sleep -Milliseconds $taskDelay }
    }
} catch {
    $taskStatus = 'error'
    $taskError = $_.Exception.Message
    [Console]::Error.WriteLine($taskError)
} finally {
    if ($null -ne $taskProcess) {
        try {
            if (-not $taskProcess.HasExited) {
                $taskProcess.Kill()
                $null = $taskProcess.WaitForExit(2000)
            }
        } finally { $taskProcess.Dispose() }
    }
    if ($null -ne $taskLock) {
        try {
            $taskSequence++
            Save-TemperatureSnapshot $taskStatus $null $taskStarted $taskError
        } finally { $taskLock.Dispose() }
    }
}
if ($taskStatus -eq 'error') { exit 1 }
