# Sets up the FreeDuet programs helper on this Windows computer (docs/design/programs-on-your-computer.md, slice S2, D62).
#
# STATUS: NEVER RUN ON A PERSON'S COMPUTER (see FreeDuetProgramsHelper.ps1). Windows PowerShell 5.1.
#
# Run it as YOURSELF, in a normal window, NOT as administrator (it refuses to be). Three steps for you:
#   1. In FreeDuet, switch on "programs on this computer" and show a pairing code (the page /api/programs/pairing).
#   2. Run:   powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1
#      and type the code when it asks. (-Code ABCDE-FGHJK gives it on the command line.)
#   3. Ask a member "what on my PC needs an update?" and press Allow on the card.
#
# WHAT IT DOES
#   - Sends the code to the FreeDuet server (-Server, default http://localhost:3010; the server runs inside WSL on some
#     installations, and whether Windows reaches it there is to be seen: pass the address that works from Windows).
#     The server answers with this helper's secret, once. The old secret of any earlier pairing stops working.
#   - Writes %LOCALAPPDATA%\FreeDuet\programs-helper\ with a folder only YOU can read: the secret (protected for your
#     Windows user with DPAPI, so it is not readable as text and not usable by another Windows user), a small config
#     file (server address, your FreeDuet id, never the secret), a copy of the helper, and later its log.
#   - Offers to run `winget list` in front of you, so that if winget asks you to accept its source terms YOU read them
#     and answer. Neither this script nor the helper ever accepts terms for you.
#   - Makes ONE per-user scheduled task, "FreeDuet Programs Helper": at your log on, run the helper as you, not
#     elevated, in a hidden window. Then starts it.
# WHAT IT NEVER DOES: ask for administrator rights, change the execution policy, download anything, install a program,
# open a port, or read any other file of yours.
#
# Remove everything again with uninstall.ps1.
[CmdletBinding()]
param(
    [string]$Server = 'http://localhost:3010',
    [string]$Code = '',
    [string]$WingetPath = '',
    [switch]$UseWindowsAppsAlias,
    [switch]$NoTask,
    [switch]$Yes
)

. (Join-Path $PSScriptRoot 'FreeDuetProgramsHelper.ps1')

$script:TaskName = 'FreeDuet Programs Helper'

# Only the current user can read or change this folder, and what is created inside it inherits that.
function Set-PrivateAcl {
    param([string]$Path)
    $acl = Get-Acl -LiteralPath $Path
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($existing in @($acl.Access)) { [void]$acl.RemoveAccessRule($existing) }
    $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($me, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $Path -AclObject $acl | Out-Null
}

function Save-ProtectedSecret {
    param([byte[]]$Bytes, [string]$Path)
    Add-Type -AssemblyName System.Security
    $entropy = [System.Text.Encoding]::UTF8.GetBytes('FreeDuetProgramsHelper-v1')
    $protected = [System.Security.Cryptography.ProtectedData]::Protect($Bytes, $entropy, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    [System.IO.File]::WriteAllBytes($Path, $protected)
}

function Get-HelperTaskDefinition {
    param([string]$Directory)
    $script = Join-Path $Directory 'helper.ps1'
    return @{
        Name      = $script:TaskName
        Execute   = 'powershell.exe'
        Arguments = ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $script)
        RunLevel  = 'Limited'
    }
}

function Register-HelperTask {
    param([string]$Directory)
    $definition = Get-HelperTaskDefinition -Directory $Directory
    $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $action = New-ScheduledTaskAction -Execute $definition.Execute -Argument $definition.Arguments
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
        -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval ([TimeSpan]::FromMinutes(1))
    Register-ScheduledTask -TaskName $definition.Name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
}

function Get-PairingFailureText {
    param($ErrorRecord, [string]$Server)
    $status = 0
    try { $status = [int]$ErrorRecord.Exception.Response.StatusCode } catch { }
    if ($status -eq 401) { return 'FreeDuet did not accept that code. Codes work once and for two minutes: show a new one and try again.' }
    if ($status -eq 429) { return 'Too many tries. Wait a minute, show a new code and try again.' }
    return ("Could not reach FreeDuet at $Server ({0}). If FreeDuet runs inside WSL, check that Windows can open that address in a browser; if it cannot, pass -Server with an address that works from Windows." -f $ErrorRecord.Exception.Message)
}

# Returns the exit status: 0 done, 1 stopped (and said why), 2 refused (elevated).
function Invoke-Setup {
    param(
        [string]$Server, [string]$Code, [string]$WingetPath, [bool]$UseAlias, [bool]$NoTask, [bool]$Yes,
        [string]$Directory = (Get-HelperDirectory)
    )
    if (Test-Elevated) {
        Write-Host 'This setup refuses to run as administrator. Close this window and run it as yourself, in a normal window.'
        return 2
    }
    if (-not (Test-ServerUrl $Server)) {
        Write-Host "The server address '$Server' is not allowed: use https, or http only for this computer (localhost)."
        return 1
    }
    if ($Code -eq '') { $Code = Read-Host 'Pairing code shown by FreeDuet' }
    $reply = $null
    try { $reply = Send-SignedPost -ServerUrl $Server -Path '/api/programs/helper/pair' -Body @{ code = $Code } }
    catch { Write-Host (Get-PairingFailureText -ErrorRecord $_ -Server $Server); return 1 }
    if ($null -eq $reply -or $reply.actorId -isnot [string] -or $reply.actorId -eq '' -or $reply.secret -isnot [string] -or $reply.secret -notmatch '^[0-9a-f]{64}$') {
        Write-Host 'FreeDuet answered, but not in the expected way. Nothing was written.'
        return 1
    }
    try { $skew = [Math]::Abs((Get-NowMilliseconds) - [long]$reply.serverTime) } catch { $skew = 0 }
    if ($skew -gt 20000) {
        Write-Host ("Warning: this computer's clock differs from FreeDuet's by about {0} seconds. The helper is refused above 30. Fix the clock." -f [int]($skew / 1000))
    }
    $found = Resolve-WingetPath -ConfiguredPath $WingetPath -UseAlias $UseAlias
    if ($found.Path -eq '') { Write-Host ('Note: winget was not found yet: ' + $found.Why + ' The helper will look again each time.') }
    if (-not (Test-Path -LiteralPath $Directory)) { New-Item -ItemType Directory -Force -Path $Directory | Out-Null }
    Set-PrivateAcl -Path $Directory
    Save-ProtectedSecret -Bytes (ConvertFrom-Hex $reply.secret) -Path (Join-Path $Directory 'secret.bin')
    $config = [ordered]@{ serverUrl = $Server; actorId = $reply.actorId; wingetPath = $WingetPath; useAlias = $UseAlias }
    [System.IO.File]::WriteAllText((Join-Path $Directory 'config.json'), ($config | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'FreeDuetProgramsHelper.ps1') -Destination (Join-Path $Directory 'helper.ps1') -Force
    Write-HelperLog 'setup' 'paired; the secret is stored protected for this Windows user'
    Write-Host "Paired. The helper's folder is $Directory"
    if ($found.Path -ne '' -and -not $Yes) {
        $answer = Read-Host 'Run "winget list" now, here, so you can read and answer any terms winget shows? (y/n)'
        if ($answer -match '^[yY]') { & $found.Path list }
    }
    if (-not $NoTask) {
        Register-HelperTask -Directory $Directory
        Start-ScheduledTask -TaskName $script:TaskName
        Write-Host "Task '$($script:TaskName)' made (at your log on, as you, not elevated) and started."
    }
    Write-Host ('Log, readable any time: ' + (Join-Path $Directory 'helper.log'))
    Write-Host 'Now ask a member: what on my PC needs an update?'
    return 0
}

if ($MyInvocation.InvocationName -ne '.') {
    $exitCode = 1
    try { $exitCode = [int](@(Invoke-Setup -Server $Server -Code $Code -WingetPath $WingetPath -UseAlias ([bool]$UseWindowsAppsAlias) -NoTask ([bool]$NoTask) -Yes ([bool]$Yes))[-1]) }
    catch { Write-Host "Stopped by an unexpected error: $($_.Exception.Message)" }
    exit $exitCode
}
