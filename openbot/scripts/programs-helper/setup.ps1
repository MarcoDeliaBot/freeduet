# Sets up the FreeDuet programs helper on this Windows computer (docs/design/programs-on-your-computer.md, slice S2, D62).
#
# STATUS: NEVER RUN ON A PERSON'S COMPUTER (see FreeDuetProgramsHelper.ps1). Windows PowerShell 5.1.
#
# Run it as YOURSELF, in a normal window, NOT as administrator (it refuses to be). Three steps for you:
#   1. In FreeDuet, switch on "programs on this computer" and show a pairing code (the page /api/programs/pairing).
#   2. Run:   powershell -NoProfile -ExecutionPolicy RemoteSigned -File .\setup.ps1
#      and type the code when it asks. (-Code ABCDE-FGHJK gives it on the command line.)
#      If Windows says the script is blocked because it came from the internet, run  Unblock-File .\*.ps1  first.
#   3. Ask a member "what on my PC needs an update?" and press Allow on the card.
#
# WHAT IT DOES
#   - Sends the code to the FreeDuet server (-Server, default http://localhost:3010; the server runs inside WSL on some
#     installations, and whether Windows reaches it there is to be seen: pass the address that works from Windows).
#     Only this computer (localhost) is accepted unless you pass -AllowRemoteServer, which also needs https.
#     The server answers with this helper's secret, once. The old secret of any earlier pairing stops working, and
#     a helper that is still running from an earlier pairing is stopped first.
#   - Writes %LOCALAPPDATA%\FreeDuet\programs-helper\ with a folder only YOU (and no other Windows user) can read: the
#     secret (protected with DPAPI for your Windows user), a small config file (server address, your FreeDuet id,
#     never the secret), a copy of the helper and later its log.
#   - Offers to run `winget list` in front of you, so that if winget asks you to accept its source terms YOU read them
#     and answer. Neither this script nor the helper ever accepts terms for you.
#   - Makes ONE per-user scheduled task, "FreeDuet Programs Helper": at your log on, run the helper as you, not
#     elevated, in a hidden window. Then starts it.
# WHAT IT NEVER DOES: ask for administrator rights, change the machine's execution policy, download anything, install
# a program, open a port, or read any other file of yours.
#
# WHAT THE PROTECTION IS, SAID PLAINLY: the folder's access list and DPAPI keep the secret from OTHER Windows users and
# from the computers of FreeDuet's members. They do NOT keep it from a program that runs as YOU: such a program can read
# the secret exactly as the helper does. The approval card in FreeDuet is what stands between a read-only question and a
# program being touched, and the helper only ever runs two fixed read-only winget commands.
#
# -UseWindowsAppsAlias (winget is then NOT signature-checked) prints a warning at once and asks you to type UNCHECKED;
# -AcceptAliasRisk gives that answer on the command line for a person who has already decided.
#
# Remove everything again with uninstall.ps1.
[CmdletBinding()]
param(
    [string]$Server = 'http://localhost:3010',
    [string]$Code = '',
    [string]$WingetPath = '',
    [switch]$UseWindowsAppsAlias,
    [switch]$AcceptAliasRisk,
    [switch]$AllowRemoteServer,
    [switch]$AllowWritableWingetFolder,
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
        Arguments = ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "{0}"' -f $script)
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
        [bool]$AllowRemote = $false, [bool]$AllowWritable = $false, [bool]$AcceptAliasRisk = $false,
        [string]$Directory = (Get-HelperDirectory)
    )
    if (Test-Elevated) {
        Write-Host 'This setup refuses to run as administrator. Close this window and run it as yourself, in a normal window.'
        return 2
    }
    if (-not (Test-ServerUrl -Url $Server -AllowRemote $AllowRemote)) {
        Write-Host "The server address '$Server' is not allowed: only this computer (localhost) is accepted. Another host needs -AllowRemoteServer and an https address."
        return 1
    }
    if ($UseAlias) {
        # Said here, at the moment it is chosen, and before the pairing code is spent: not only in the helper's log.
        Write-Host 'WARNING: -UseWindowsAppsAlias makes the helper run the winget alias in your WindowsApps folder under your profile.'
        Write-Host 'That file is NOT signature-checked, and any program that runs as you can replace it; the helper would then start that program.'
        Write-Host 'Use it only if the safe way (the App Installer package folder) does not work on this PC and you accept this.'
        if (-not $AcceptAliasRisk) {
            $word = Read-Host 'To go on, type UNCHECKED (anything else stops here and nothing is written)'
            if ($word -cne 'UNCHECKED') {
                Write-Host 'Not confirmed. Nothing was written and no code was used.'
                return 1
            }
        }
    }
    if ($AllowRemote -and -not (Test-ServerUrl -Url $Server -AllowRemote $false)) {
        Write-Host ("WARNING: the pairing code and every later message go to the remote host {0}. Only continue if that is your own FreeDuet." -f ([Uri]$Server).Host)
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
    $found = Resolve-WingetPath -ConfiguredPath $WingetPath -UseAlias $UseAlias -AllowWritableFolder $AllowWritable
    if ($found.Path -eq '') { Write-Host ('Note: winget was not found yet: ' + $found.Why + ' The helper will look again each time.') }
    if (-not (Test-Path -LiteralPath $Directory)) { New-Item -ItemType Directory -Force -Path $Directory | Out-Null }
    # An earlier helper still holds the old secret in memory: stop it (task first, so it is not restarted), then write the new one.
    Stop-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue
    $stopped = Stop-HelperProcess -Directory $Directory
    if ($stopped -eq 'stopped') { Write-Host 'An earlier helper was still running and has been stopped.' }
    Set-PrivateAcl -Path $Directory
    Save-ProtectedSecret -Bytes (ConvertFrom-Hex $reply.secret) -Path (Join-Path $Directory 'secret.bin')
    $config = [ordered]@{ serverUrl = $Server; actorId = $reply.actorId; wingetPath = $WingetPath; useAlias = $UseAlias; allowRemoteServer = $AllowRemote; allowWritableWingetFolder = $AllowWritable }
    [System.IO.File]::WriteAllText((Join-Path $Directory 'config.json'), ($config | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'FreeDuetProgramsHelper.ps1') -Destination (Join-Path $Directory 'helper.ps1') -Force
    Unblock-File -LiteralPath (Join-Path $Directory 'helper.ps1') -ErrorAction SilentlyContinue
    Write-HelperLog 'setup' 'paired; the secret is stored protected for this Windows user'
    Write-Host "Paired. The helper's folder is $Directory"
    Write-Host 'About the protection: other Windows users and FreeDuet members cannot read the secret. A program running as YOU still can, as the helper itself does.'
    if ($found.Path -ne '' -and -not $Yes) {
        $answer = Read-Host 'Run "winget list" now, here, so you can read and answer any terms winget shows? (y/n)'
        if ($answer -match '^[yY]') { & $found.Path list }
    }
    if (-not $NoTask) {
        Register-HelperTask -Directory $Directory
        Start-ScheduledTask -TaskName $script:TaskName
        Write-Host "Task '$($script:TaskName)' created (runs at log on, as you, not elevated) and started."
        Write-Host 'The task runs the helper with execution policy RemoteSigned (not Bypass); the copy of the script is unblocked for that.'
    }
    Write-Host ('Log, readable any time: ' + (Join-Path $Directory 'helper.log'))
    Write-Host 'Now ask a member: what on my PC needs an update?'
    return 0
}

if ($MyInvocation.InvocationName -ne '.') {
    $exitCode = 1
    try { $exitCode = [int](@(Invoke-Setup -Server $Server -Code $Code -WingetPath $WingetPath -UseAlias ([bool]$UseWindowsAppsAlias) -NoTask ([bool]$NoTask) -Yes ([bool]$Yes) -AllowRemote ([bool]$AllowRemoteServer) -AllowWritable ([bool]$AllowWritableWingetFolder) -AcceptAliasRisk ([bool]$AcceptAliasRisk))[-1]) }
    catch { Write-Host "Stopped by an unexpected error: $($_.Exception.Message)" }
    exit $exitCode
}
