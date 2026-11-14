# FreeDuet installer for Windows 10 and Windows 11: the first Windows step (docs/design/installer.md, stage S2).
#
# STATUS: NEVER RUN ON A WINDOWS MACHINE. It was written and read, not executed, and install.Tests.ps1 has not
# been run either. See "Built so far" in docs/design/installer.md for the manual check that has to be done.
#
# Run it from a FreeDuet checkout, in Windows PowerShell, as yourself and NOT "as administrator":
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\openbot\scripts\install.ps1
#       reads what is there, prints the plan, asks once, then does only what is missing
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\openbot\scripts\install.ps1 -Check
#       only reports: changes nothing and asks nothing
#   ... -Yes                 the same, without the question (the plan is still printed)
#   ... -IgnoreResources     go on although free disk or memory is under the minimum
#   ... -Help                what is above, in short
#
# -ExecutionPolicy Bypass applies to this one PowerShell process only. Nothing on the computer is changed for it.
#
# WHAT IT LOOKS AT (none of it needs administrator rights)
#   Windows          build 19041 (Windows 10 version 2004) or newer, or Windows 11.
#   Virtualisation   a hypervisor running, or virtualisation turned on in the firmware.
#   WSL              whether "wsl --status" answers, and its default version.
#   Ubuntu           the distributions of this user (the registry), their version, and whether an Ubuntu user
#                    has been created yet (the registry's DefaultUid).
#   systemd          /etc/wsl.conf, only when Ubuntu is already running. This script never starts Ubuntu to look.
#   Docker           whether Docker Desktop is installed, and, when Ubuntu runs already, which docker command it has
#                    (Docker Desktop's or another). This script installs no Docker; install.sh decides about Docker.
#   Disk, memory     the same estimates as install.sh (docs/design/installer.md, section 6).
#   Restart          whether Windows is already waiting for one, and whether this folder is a FreeDuet checkout.
#
# WHAT IT DOES AFTER ONE YES: only the steps that are missing, in this order
#   1. wsl --install -d Ubuntu-24.04 --no-launch
#      Microsoft's command. It needs administrator rights: Windows shows its own permission prompt for it, and
#      this script never sees the administrator's password. Afterwards Windows needs one restart.
#   2. wsl --set-default-version 2             when the default version is 1. Assumed to need no administrator rights.
#   3. wsl --set-version <Ubuntu> 2            when that Ubuntu is WSL 1, because install.sh refuses WSL 1. Assumed to need no administrator rights.
#   4. The Ubuntu user: you open Ubuntu once from the Start menu and create it. This script never does that.
#   5. wsl --distribution <Ubuntu> bash <checkout>/openbot/scripts/install.sh [--yes] [--ignore-resources]
#      inside Ubuntu. install.sh prints its own plan and asks once more, unless you gave -Yes.
#
# THE WSL FORMS: Microsoft's pages (docs/design/installer.md, section 10) show wsl --install -d, --set-version,
# --set-default-version, --status, --list --running --quiet, and --distribution <name> with --user. --no-launch is on
# the basic-commands page. Neither page shows --exec or a bare "--", so "wsl --distribution <name> <command>" (step 5
# and the reads inside Ubuntu) is to verify on a real machine.
#
# WHAT IT NEVER DOES
#   - Download or run anything itself. The WSL command takes Ubuntu from Microsoft; install.sh makes its own
#     checked downloads inside Ubuntu.
#   - Read or write a login, a password or a secret, or touch the Claude sign-in (it stays your own step).
#   - Run as administrator (it refuses to), add a startup task, change the execution policy, or restart Windows.
#   - Install Docker on Windows, replace a Docker it did not install (Docker Desktop is reported, not changed),
#     or send telemetry.
#
# EXIT STATUS: install.sh's meanings, plus one new code for a restart.
#   0  done: nothing is missing on Windows (-Check), or install.sh inside Ubuntu finished with 0
#   1  stopped and said why. If a step had already run, the message says which one
#   2  -Check found something missing. Nothing was changed by -Check
#   3  one step is left for you: create your Ubuntu user. Run this again afterwards.
#      install.sh's own status 3 (log out and in, then run it again) also comes out as 3.
#   4  restart Windows first (one is pending, or the install needs one), then run this again.
#      Windows does not run this script again by itself.
#   Any other number is install.sh's own status, passed through.
#
# HOW IT IS ORGANISED: Get-InstallerFacts reads the computer. Get-InstallerPlan decides from those facts alone,
# and changes and reads nothing. Dot-sourcing this file runs nothing, so install.Tests.ps1 can test the decisions.
# Written for Windows PowerShell 5.1 (the one Windows 10 and 11 ship). Not tried with PowerShell 7.
# Plain ASCII on purpose: Windows PowerShell reads a file without a byte-order mark as ANSI.

[CmdletBinding()]
param(
    [switch]$Check,
    [Alias('y')]
    [switch]$Yes,
    [switch]$IgnoreResources,
    [switch]$Help
)

function Get-InstallerSettings {
    # The names and the estimates used here. The disk and memory numbers are install.sh's own
    # (docs/design/installer.md, section 6): the first start on Ubuntu needs them on this same computer.
    return @{
        MinWindowsBuild   = 19041
        InstallDistro     = 'Ubuntu-24.04'
        DiskMinDockerGB   = 7
        DiskRecDockerGB   = 20
        DiskMinCheckoutGB = 3
        DiskRecCheckoutGB = 5
        MemMinMiB         = 3500
        MemRecMiB         = 7000
    }
}

function Get-InstallerExitCode {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('Done', 'Stopped', 'Gap', 'PersonStep', 'Restart')]
        [string]$Name
    )
    switch ($Name) {
        'Done'       { return 0 }
        'Stopped'    { return 1 }
        'Gap'        { return 2 }
        'PersonStep' { return 3 }
        'Restart'    { return 4 }
    }
}

# ------------------------------------------------------------------------------------------------
# Pure helpers: text in, decision out. Nothing here touches the computer.
# ------------------------------------------------------------------------------------------------

function Remove-NullCharacters {
    # wsl.exe prints some of its output as UTF-16, so a NUL character can sit between the letters of its text.
    param([AllowNull()][AllowEmptyString()][string]$Text)
    if ($null -eq $Text) { return '' }
    return ($Text -replace "`0", '')
}

function ConvertTo-WslPath {
    # C:\Users\me\freeduet becomes /mnt/c/Users/me/freeduet. Anything else (a network path, a relative path) gives $null.
    param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$WindowsPath)
    if ($WindowsPath -match '^([A-Za-z]):\\(.*)$') {
        $drive = $Matches[1].ToLowerInvariant()
        $rest = $Matches[2].Replace('\', '/').TrimEnd('/')
        if ($rest -eq '') { return "/mnt/$drive" }
        return "/mnt/$drive/$rest"
    }
    return $null
}

function Get-WslDefaultVersion {
    # "wsl --status" has a line ending in "Default Version: 2". Its words are translated, the number at the end is not.
    param([AllowEmptyString()][string]$Text)
    $clean = Remove-NullCharacters -Text $Text
    if ($clean -match '(?m):\s*([12])\s*$') { return [int]$Matches[1] }
    return $null
}

function ConvertFrom-WslNameList {
    # "wsl --list --quiet" prints one distribution name per line.
    param([AllowEmptyString()][string]$Text)
    $names = New-Object System.Collections.ArrayList
    foreach ($line in ((Remove-NullCharacters -Text $Text) -split "`n")) {
        $name = $line.Trim()
        if ($name -ne '') { [void]$names.Add($name) }
    }
    return ,$names.ToArray()
}

function Get-WslConfSystemd {
    # /etc/wsl.conf: "true" or "false" when the [boot] section sets systemd, "not set" when it does not.
    param([AllowEmptyString()][string]$Text)
    $section = ''
    $value = 'not set'
    foreach ($raw in ((Remove-NullCharacters -Text $Text) -split "`n")) {
        $line = $raw.Trim()
        if ($line -match '^\[(.+)\]$') {
            $section = $Matches[1].Trim().ToLowerInvariant()
        }
        elseif ($section -eq 'boot' -and $line -match '^systemd\s*=\s*(true|false)$') {
            $value = $Matches[1].ToLowerInvariant()
        }
    }
    return $value
}

function Join-CommandLine {
    # One command line for Start-Process. An argument with a space or a double quote is wrapped in double quotes,
    # because Start-Process joins an array of arguments without quoting them (Windows PowerShell 5.1).
    param([AllowNull()][AllowEmptyCollection()][string[]]$Arguments)
    $parts = New-Object System.Collections.ArrayList
    foreach ($argument in @($Arguments)) {
        $text = [string]$argument
        if ($text -eq '' -or $text -match '[\s"]') {
            [void]$parts.Add('"' + ($text -replace '"', '\"') + '"')
        }
        else {
            [void]$parts.Add($text)
        }
    }
    return ($parts.ToArray() -join ' ')
}

function Get-DockerKind {
    # Which docker command Ubuntu runs, from its real path: under /mnt/wsl or in a docker-desktop folder it is Docker Desktop's.
    param([AllowEmptyString()][string]$RealPath)
    if ([string]$RealPath -match '/mnt/wsl/|docker-desktop') { return 'DockerDesktop' }
    return 'inside'
}

function Select-UbuntuDistro {
    # The distribution the hand-over goes to: Ubuntu-24.04, else Ubuntu-22.04, else a plain "Ubuntu" (its release is checked by install.sh).
    param([AllowNull()]$Distributions)
    foreach ($wanted in @('Ubuntu-24.04', 'Ubuntu-22.04', 'Ubuntu')) {
        foreach ($distribution in @($Distributions)) {
            if ($null -ne $distribution -and ([string]$distribution.Name) -ieq $wanted) { return $distribution }
        }
    }
    return $null
}

function Get-ResourceState {
    # ok, LOW (it fits, but is under the recommendation; or under the minimum when ignored), STOP, or unknown.
    param(
        [AllowNull()]$Value,
        [Parameter(Mandatory = $true)][int]$Minimum,
        [Parameter(Mandatory = $true)][int]$Recommended,
        [bool]$IgnoreResources = $false
    )
    if ($null -eq $Value) { return 'unknown' }
    if ([double]$Value -lt $Minimum) {
        if ($IgnoreResources) { return 'LOW' }
        return 'STOP'
    }
    if ([double]$Value -lt $Recommended) { return 'LOW' }
    return 'ok'
}

function New-ResourceCheck {
    # One disk or memory row for the findings, and a block when it is under the minimum (unless it is ignored).
    param(
        [Parameter(Mandatory = $true)][string]$Area,
        [Parameter(Mandatory = $true)][string]$Where,
        [AllowNull()]$Free,
        [Parameter(Mandatory = $true)][int]$Minimum,
        [Parameter(Mandatory = $true)][int]$Recommended,
        [Parameter(Mandatory = $true)][string]$Unit,
        [bool]$IgnoreResources = $false
    )
    $state = Get-ResourceState -Value $Free -Minimum $Minimum -Recommended $Recommended -IgnoreResources $IgnoreResources
    $detail = ''
    $block = $null
    if ($state -eq 'unknown') {
        $detail = "could not read the size of $Where"
    }
    elseif ($state -eq 'STOP') {
        $detail = "$Free $Unit on $Where; at least $Minimum $Unit are needed ($Recommended $Unit recommended)"
        $block = "${Area}: $detail. Free some space, then run this again. To go on anyway, add -IgnoreResources."
    }
    elseif ($state -eq 'LOW' -and $IgnoreResources -and ([double]$Free -lt $Minimum)) {
        $detail = "$Free $Unit on $Where; at least $Minimum $Unit are needed. Going on because of -IgnoreResources"
    }
    elseif ($state -eq 'LOW') {
        $detail = "$Free $Unit free on $Where; it will fit, but $Recommended $Unit are recommended"
    }
    else {
        $detail = "$Free $Unit free on $Where"
    }
    return @{ State = $state; Detail = $detail; Block = $block }
}

function Get-InstallerPlan {
    # The decisions, from the facts only. Returns a hashtable:
    #   Status               Blocked (stop, nothing changed) | Restart (restart first) | Gap (steps to do) | Ready
    #   Blocks               the reasons to stop, in plain words
    #   Findings             one row per thing looked at: Area, State, Detail
    #   Steps                the steps still to do, in order: Id, Title, Explanation, Command, Arguments, NeedsAdmin
    #   RestartAfterInstall  the install step needs a restart after it
    #   PersonStep           one step is left that only the person can do: create the Ubuntu user
    #   ReachesHandover      the run goes on to install.sh inside Ubuntu
    #   Handover             Distro, LinuxScript, Arguments and Command of that hand-over
    param(
        [Parameter(Mandatory = $true)][hashtable]$Facts,
        [switch]$IgnoreResources,
        [switch]$Yes
    )
    $settings = Get-InstallerSettings
    $ignore = [bool]$IgnoreResources
    $blocks = New-Object System.Collections.ArrayList
    $findings = New-Object System.Collections.ArrayList
    $steps = New-Object System.Collections.ArrayList

    # Windows, the rights this runs with, and virtualisation.
    $build = $Facts.WindowsBuild
    if (-not $Facts.IsWindows) {
        [void]$blocks.Add('This script is for Windows 10 and Windows 11. On Ubuntu, run: bash openbot/scripts/install.sh')
        [void]$findings.Add(@{ Area = 'Windows'; State = 'STOP'; Detail = 'this is not Windows' })
    }
    elseif ($null -eq $build) {
        [void]$findings.Add(@{ Area = 'Windows'; State = 'unknown'; Detail = 'could not read the build number' })
    }
    elseif ($build -lt $settings.MinWindowsBuild) {
        [void]$blocks.Add("WSL 2 needs Windows 10 version 2004 (build 19041) or newer, or Windows 11. This computer has build $build. Install the Windows updates, then run this again.")
        [void]$findings.Add(@{ Area = 'Windows'; State = 'STOP'; Detail = "build $build is too old" })
    }
    else {
        [void]$findings.Add(@{ Area = 'Windows'; State = 'ok'; Detail = ("build $build $($Facts.WindowsName)").Trim() })
    }

    if ($Facts.IsElevated) {
        [void]$blocks.Add('Do not run this script as administrator. WSL would then be installed and set up for the administrator account, and the FreeDuet folder and Ubuntu would belong to it. Run it as yourself: it asks Windows for administrator rights itself, and only for the steps that need them.')
        [void]$findings.Add(@{ Area = 'Rights'; State = 'STOP'; Detail = 'running as administrator' })
    }
    else {
        [void]$findings.Add(@{ Area = 'Rights'; State = 'ok'; Detail = 'running as you; administrator rights are asked for only where a step needs them' })
    }

    if ($Facts.HypervisorPresent -eq $true) {
        [void]$findings.Add(@{ Area = 'Virtualisation'; State = 'ok'; Detail = 'a hypervisor is running' })
    }
    elseif ($Facts.VirtualizationFirmware -eq $true) {
        [void]$findings.Add(@{ Area = 'Virtualisation'; State = 'ok'; Detail = 'turned on in the firmware' })
    }
    elseif ($Facts.VirtualizationFirmware -eq $false) {
        [void]$blocks.Add('Virtualisation looks turned off in the firmware settings (BIOS or UEFI). WSL 2 needs it: turn on Intel VT-x or AMD-V (SVM), then run this again. In a virtual machine, its hypervisor must allow nested virtualisation.')
        [void]$findings.Add(@{ Area = 'Virtualisation'; State = 'STOP'; Detail = 'looks turned off in the firmware' })
    }
    else {
        [void]$findings.Add(@{ Area = 'Virtualisation'; State = 'unknown'; Detail = 'could not be read; WSL says so if it is off' })
    }

    # Disk and memory: install.sh's estimates, on this computer.
    $wslRoot = [string]$Facts.WslDiskRoot
    $checkoutRoot = [string]$Facts.CheckoutDiskRoot
    if ($wslRoot -ne '' -and $wslRoot -eq $checkoutRoot) {
        $disk = New-ResourceCheck -Area 'Disk' -Where "the disk with Ubuntu's files and this folder ($wslRoot)" -Free $Facts.WslDiskFreeGB -Minimum ($settings.DiskMinDockerGB + $settings.DiskMinCheckoutGB) -Recommended ($settings.DiskRecDockerGB + $settings.DiskRecCheckoutGB) -Unit 'GB' -IgnoreResources $ignore
        [void]$findings.Add(@{ Area = 'Disk'; State = $disk.State; Detail = $disk.Detail })
        if ($null -ne $disk.Block) { [void]$blocks.Add($disk.Block) }
    }
    else {
        $diskWsl = New-ResourceCheck -Area 'Disk' -Where "the disk with Ubuntu's files ($wslRoot)" -Free $Facts.WslDiskFreeGB -Minimum $settings.DiskMinDockerGB -Recommended $settings.DiskRecDockerGB -Unit 'GB' -IgnoreResources $ignore
        [void]$findings.Add(@{ Area = 'Disk'; State = $diskWsl.State; Detail = $diskWsl.Detail })
        if ($null -ne $diskWsl.Block) { [void]$blocks.Add($diskWsl.Block) }
        $diskCheckout = New-ResourceCheck -Area 'Disk' -Where "the disk with this folder ($checkoutRoot)" -Free $Facts.CheckoutDiskFreeGB -Minimum $settings.DiskMinCheckoutGB -Recommended $settings.DiskRecCheckoutGB -Unit 'GB' -IgnoreResources $ignore
        [void]$findings.Add(@{ Area = 'Disk'; State = $diskCheckout.State; Detail = $diskCheckout.Detail })
        if ($null -ne $diskCheckout.Block) { [void]$blocks.Add($diskCheckout.Block) }
    }
    $memory = New-ResourceCheck -Area 'Memory' -Where 'this computer' -Free $Facts.MemoryMiB -Minimum $settings.MemMinMiB -Recommended $settings.MemRecMiB -Unit 'MiB' -IgnoreResources $ignore
    [void]$findings.Add(@{ Area = 'Memory'; State = $memory.State; Detail = $memory.Detail })
    if ($null -ne $memory.Block) { [void]$blocks.Add($memory.Block) }

    # The FreeDuet folder: a checkout, on a drive letter that Ubuntu can read.
    $checkoutPath = [string]$Facts.CheckoutPath
    if (-not $Facts.CheckoutOk) {
        [void]$blocks.Add('This does not look like a FreeDuet checkout: openbot\scripts\install.sh, openbot\package.json, openbot\.env.example or scripts\start.sh is missing. Get the repository first (git clone https://github.com/MarcoDeliaBot/freeduet.git, or the ZIP from GitHub), then run this from inside it.')
        [void]$findings.Add(@{ Area = 'Folder'; State = 'STOP'; Detail = "$checkoutPath is not a FreeDuet checkout" })
    }
    $wslCheckout = ConvertTo-WslPath -WindowsPath $checkoutPath
    if ($null -eq $wslCheckout) {
        [void]$blocks.Add('The FreeDuet folder is not on a local drive letter (it is on a network path, or somewhere Ubuntu cannot see). Move it to a folder on this computer, for example C:\Users\you\freeduet, then run this again.')
        [void]$findings.Add(@{ Area = 'Folder'; State = 'STOP'; Detail = 'not on a local drive letter' })
    }
    elseif ($Facts.CheckoutOk) {
        [void]$findings.Add(@{ Area = 'Folder'; State = 'ok'; Detail = $checkoutPath })
        if ($wslCheckout.StartsWith('/mnt/')) {
            [void]$findings.Add(@{ Area = 'Folder'; State = 'note'; Detail = 'Ubuntu reads a Windows folder through /mnt: it works, but it is slow. For speed, clone the repository into the Linux home folder of Ubuntu instead (install.sh says the same).' })
        }
    }

    # Docker: this script installs none. Docker Desktop is reported and never changed. A docker command inside Ubuntu is
    # found only when Ubuntu runs already, and install.sh decides what to do about it.
    if ($Facts.DockerDesktopInstalled -eq $true) {
        [void]$findings.Add(@{ Area = 'Docker'; State = 'note'; Detail = 'Docker Desktop is installed on Windows. This script does not change it. To have install.sh use it inside Ubuntu, turn on WSL integration for that Ubuntu first (Docker Desktop, Settings, Resources, WSL integration).' })
    }
    else {
        [void]$findings.Add(@{ Area = 'Docker'; State = 'none'; Detail = 'Docker Desktop is not installed on Windows. This script installs no Docker.' })
    }
    $dockerInUbuntu = [string]$Facts.DockerInUbuntu
    if ($dockerInUbuntu -eq 'DockerDesktop') {
        [void]$findings.Add(@{ Area = 'Docker'; State = 'note'; Detail = 'inside Ubuntu: the docker command is Docker Desktop''s (its WSL integration is on). install.sh uses it and installs no other.' })
    }
    elseif ($dockerInUbuntu -eq 'inside') {
        [void]$findings.Add(@{ Area = 'Docker'; State = 'note'; Detail = 'inside Ubuntu: a docker command that is not Docker Desktop''s. install.sh checks it and never replaces a Docker it did not install.' })
    }
    elseif ($dockerInUbuntu -eq 'none') {
        [void]$findings.Add(@{ Area = 'Docker'; State = 'note'; Detail = 'inside Ubuntu: no docker command found. install.sh installs Ubuntu''s Docker packages there, unless Docker Desktop is turned on for this Ubuntu first.' })
    }
    else {
        [void]$findings.Add(@{ Area = 'Docker'; State = 'note'; Detail = 'inside Ubuntu: not read (Ubuntu is not running, and this script does not start it to look). install.sh checks it.' })
    }

    if ($Facts.RestartPending -eq $true) {
        [void]$findings.Add(@{ Area = 'Restart'; State = 'pending'; Detail = 'Windows is waiting for a restart from an earlier update or install' })
    }

    # WSL and Ubuntu.
    $wslWorks = ($Facts.WslWorks -eq $true)
    $defaultVersion = $Facts.WslDefaultVersion
    $ubuntu = Select-UbuntuDistro -Distributions $Facts.Distributions
    $installDistro = [string]$settings.InstallDistro
    if (-not $wslWorks) {
        [void]$findings.Add(@{ Area = 'WSL'; State = 'MISSING'; Detail = 'not installed, or not answering wsl --status' })
    }
    elseif ($defaultVersion -eq 1) {
        [void]$findings.Add(@{ Area = 'WSL'; State = 'FIX'; Detail = 'installed; the default version is 1, so it will be set to 2' })
    }
    else {
        $versionText = 'not read'
        if ($null -ne $defaultVersion) { $versionText = [string]$defaultVersion }
        [void]$findings.Add(@{ Area = 'WSL'; State = 'ok'; Detail = "installed; default version $versionText" })
    }
    if ($null -eq $ubuntu) {
        [void]$findings.Add(@{ Area = 'Ubuntu'; State = 'MISSING'; Detail = "no Ubuntu 22.04 or 24.04 distribution; $installDistro will be installed" })
    }
    else {
        if ($null -eq $ubuntu.DefaultUid -or $ubuntu.DefaultUid -eq 0) {
            [void]$findings.Add(@{ Area = 'Ubuntu'; State = 'YOU'; Detail = "$($ubuntu.Name) is installed, but no Ubuntu user has been created yet" })
        }
        else {
            [void]$findings.Add(@{ Area = 'Ubuntu'; State = 'ok'; Detail = "$($ubuntu.Name) is installed, and its user is set up" })
        }
        if ($ubuntu.Version -eq 1) {
            [void]$findings.Add(@{ Area = 'Ubuntu'; State = 'FIX'; Detail = "$($ubuntu.Name) is WSL 1, and it will be converted to WSL 2 (install.sh refuses WSL 1)" })
        }
    }
    $systemd = [string]$Facts.SystemdConf
    if ($systemd -eq 'true') {
        [void]$findings.Add(@{ Area = 'systemd'; State = 'ok'; Detail = 'on, in /etc/wsl.conf' })
    }
    elseif ($systemd -eq 'false') {
        [void]$findings.Add(@{ Area = 'systemd'; State = 'note'; Detail = 'off in /etc/wsl.conf: Docker does not start by itself with Ubuntu, and install.sh starts it by hand' })
    }
    elseif ($systemd -eq 'not set') {
        [void]$findings.Add(@{ Area = 'systemd'; State = 'note'; Detail = 'not set in /etc/wsl.conf (Microsoft''s Ubuntu images turn systemd on by default)' })
    }
    else {
        [void]$findings.Add(@{ Area = 'systemd'; State = 'note'; Detail = 'not read: Ubuntu is not running, and this script does not start it to look' })
    }

    # The steps that are missing, in order. Only these commands are ever run; each one is named here.
    $needInstall = (-not $wslWorks) -or ($null -eq $ubuntu)
    if ($needInstall) {
        $title = "Install $installDistro"
        if (-not $wslWorks) { $title = "Install WSL 2 and $installDistro" }
        $explanation = @(
            'Microsoft''s own command. It installs WSL and the distribution, and does not start Ubuntu (--no-launch).'
            'It needs administrator rights, so Windows shows its own permission prompt for it. This script never sees your Windows password.'
        )
        if (-not $wslWorks) { $explanation += 'Windows needs a restart after it. This script does not restart Windows.' }
        [void]$steps.Add(@{
            Id          = 'wsl-install'
            Title       = $title
            Explanation = $explanation
            Command     = "wsl --install -d $installDistro --no-launch"
            Arguments   = @('--install', '-d', $installDistro, '--no-launch')
            NeedsAdmin  = $true
        })
    }
    if ($wslWorks -and $defaultVersion -eq 1) {
        [void]$steps.Add(@{
            Id          = 'wsl-default-2'
            Title       = 'Make WSL 2 the default for new distributions'
            Explanation = @('Microsoft''s own command. It applies to new distributions.')
            Command     = 'wsl --set-default-version 2'
            Arguments   = @('--set-default-version', '2')
            NeedsAdmin  = $false
        })
    }
    if ($null -ne $ubuntu -and $ubuntu.Version -eq 1) {
        [void]$steps.Add(@{
            Id          = 'wsl-version-2'
            Title       = "Convert $($ubuntu.Name) to WSL 2"
            Explanation = @('Microsoft''s own command. It can take several minutes and needs free disk space. install.sh refuses WSL 1, because Docker does not run there.')
            Command     = "wsl --set-version $($ubuntu.Name) 2"
            Arguments   = @('--set-version', [string]$ubuntu.Name, '2')
            NeedsAdmin  = $false
        })
    }

    # The person's step: a new distribution has no user yet, and an old one may have none.
    $personStep = $false
    if ($null -eq $ubuntu) {
        $personStep = $true
    }
    elseif ($null -eq $ubuntu.DefaultUid -or $ubuntu.DefaultUid -eq 0) {
        $personStep = $true
    }
    $restartAfterInstall = $needInstall -and (-not $wslWorks)

    # The hand-over: install.sh inside the chosen Ubuntu, with the options the person gave.
    $target = $installDistro
    if ($null -ne $ubuntu) { $target = [string]$ubuntu.Name }
    $installerOptions = @()
    if ($Yes) { $installerOptions += '--yes' }
    if ($ignore) { $installerOptions += '--ignore-resources' }
    $linuxScript = ''
    if ($null -ne $wslCheckout) { $linuxScript = "$wslCheckout/openbot/scripts/install.sh" }
    $handoverArguments = @('--distribution', $target, 'bash', $linuxScript) + $installerOptions
    $handoverCommand = 'wsl ' + ($handoverArguments -join ' ')

    $adminSteps = 0
    foreach ($step in $steps) {
        if ($step.NeedsAdmin) { $adminSteps++ }
    }
    $status = 'Ready'
    if ($blocks.Count -gt 0) {
        $status = 'Blocked'
    }
    elseif ($Facts.RestartPending -eq $true -and $adminSteps -gt 0) {
        $status = 'Restart'
    }
    elseif ($steps.Count -gt 0 -or $personStep) {
        $status = 'Gap'
    }
    $reachesHandover = ($status -eq 'Ready' -or $status -eq 'Gap') -and (-not $restartAfterInstall) -and (-not $personStep)

    return @{
        Status              = $status
        Blocks              = @($blocks.ToArray())
        Findings            = @($findings.ToArray())
        Steps               = @($steps.ToArray())
        RestartAfterInstall = [bool]$restartAfterInstall
        PersonStep          = [bool]$personStep
        ReachesHandover     = [bool]$reachesHandover
        Handover            = @{
            Distro     = $target
            LinuxScript = $linuxScript
            Arguments  = $handoverArguments
            Command    = $handoverCommand
        }
    }
}

function Format-InstallerPlan {
    # The text to print: what was found, then what it will do, or why it stops.
    param(
        [Parameter(Mandatory = $true)][hashtable]$Plan,
        [switch]$Check
    )
    $lines = New-Object System.Collections.ArrayList
    [void]$lines.Add('')
    [void]$lines.Add('This computer')
    foreach ($finding in $Plan.Findings) {
        [void]$lines.Add(('  {0,-14} {1,-9} {2}' -f $finding.Area, $finding.State, $finding.Detail))
    }
    if ($Plan.Status -eq 'Blocked') {
        [void]$lines.Add('')
        [void]$lines.Add('Stopped before changing anything:')
        foreach ($block in $Plan.Blocks) { [void]$lines.Add("  - $block") }
        [void]$lines.Add('Nothing was changed.')
        return ,$lines.ToArray()
    }
    if ($Plan.Status -eq 'Restart') {
        [void]$lines.Add('')
        [void]$lines.Add('Windows is waiting for a restart. Restart it first, then run this again. Nothing was changed.')
        return ,$lines.ToArray()
    }
    $showActions = ($Plan.Steps.Count -gt 0 -or $Plan.ReachesHandover)
    if ($Check -and $Plan.Status -eq 'Ready') { $showActions = $false }
    if ($showActions) {
        $heading = 'What I will do:'
        if ($Check) { $heading = 'What I would do (-Check changes nothing):' }
        [void]$lines.Add('')
        [void]$lines.Add($heading)
        $number = 0
        foreach ($step in $Plan.Steps) {
            $number++
            [void]$lines.Add("$number. $($step.Title)")
            foreach ($text in $step.Explanation) { [void]$lines.Add("   $text") }
            $adminText = 'no'
            if ($step.NeedsAdmin) { $adminText = 'yes (Windows asks you first)' }
            [void]$lines.Add("   Administrator rights: $adminText")
            [void]$lines.Add("   `$ $($step.Command)")
        }
        if ($Plan.ReachesHandover) {
            $number++
            [void]$lines.Add("$number. Hand over to install.sh inside $($Plan.Handover.Distro).")
            [void]$lines.Add('   It prints its own plan, and asks once more unless you gave -Yes.')
            [void]$lines.Add("   `$ $($Plan.Handover.Command)")
        }
    }
    if ($Plan.RestartAfterInstall) {
        [void]$lines.Add('')
        [void]$lines.Add('After the install Windows needs a restart. Then run this script again: it finds WSL and Ubuntu in place.')
    }
    elseif ($Plan.PersonStep) {
        [void]$lines.Add('')
        [void]$lines.Add('One step is left, and only you can do it: create your Ubuntu user name and password. This script does not do it.')
    }
    return ,$lines.ToArray()
}

# ------------------------------------------------------------------------------------------------
# What is there. These read the computer; none of them installs, starts or changes anything.
# ------------------------------------------------------------------------------------------------

function Get-OptionalBool {
    param([AllowNull()]$Value)
    if ($Value -is [bool]) { return $Value }
    return $null
}

function Get-DiskFreeGB {
    param([AllowEmptyString()][string]$Root)
    if ($Root -eq '') { return $null }
    try {
        $drive = New-Object -TypeName System.IO.DriveInfo -ArgumentList $Root
        return [int][math]::Floor([double]$drive.AvailableFreeSpace / 1GB)
    }
    catch {
        return $null
    }
}

function Get-PathRootSafe {
    param([AllowEmptyString()][string]$Path)
    if ($Path -eq '') { return '' }
    try {
        $root = [System.IO.Path]::GetPathRoot($Path)
        if ($null -eq $root) { return '' }
        return [string]$root
    }
    catch {
        return ''
    }
}

function Get-InstalledWslDistributions {
    # This user's WSL distributions, from the registry. The names there are not translated, unlike wsl's own text.
    $list = New-Object System.Collections.ArrayList
    $root = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss'
    if (-not (Test-Path -LiteralPath $root)) { return ,$list.ToArray() }
    foreach ($key in (Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue)) {
        $properties = Get-ItemProperty -LiteralPath $key.PSPath -ErrorAction SilentlyContinue
        if ($null -eq $properties -or -not $properties.DistributionName) { continue }
        $defaultUid = $null
        if ($null -ne $properties.DefaultUid) { $defaultUid = [int]$properties.DefaultUid }
        $version = $null
        if ($null -ne $properties.Version) { $version = [int]$properties.Version }
        [void]$list.Add(@{ Name = [string]$properties.DistributionName; Version = $version; DefaultUid = $defaultUid })
    }
    return ,$list.ToArray()
}

function Invoke-WslCommand {
    # Runs wsl.exe and captures its output, for the checks. Returns ExitCode and Text.
    param([string[]]$Arguments)
    $output = & wsl.exe @Arguments 2>$null
    $exitCode = $LASTEXITCODE
    $text = Remove-NullCharacters -Text ($output | Out-String)
    return @{ ExitCode = $exitCode; Text = $text }
}

function Get-InstallerFacts {
    # Reads this computer and changes nothing. It starts no distribution: Ubuntu is asked about only when it runs already.
    param([string]$CheckoutRoot = '')
    $facts = @{}
    $facts.CheckoutPath = $CheckoutRoot
    $facts.IsWindows = ([System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT)

    $facts.WindowsBuild = $null
    $facts.WindowsName = ''
    try {
        $version = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -ErrorAction Stop
        if ($version.CurrentBuild) { $facts.WindowsBuild = [int]$version.CurrentBuild }
        $facts.WindowsName = ("$($version.ProductName) $($version.DisplayVersion)").Trim()
    }
    catch {
        if ($facts.IsWindows) { $facts.WindowsBuild = [System.Environment]::OSVersion.Version.Build }
    }

    $facts.IsElevated = $false
    try {
        $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-Object -TypeName System.Security.Principal.WindowsPrincipal -ArgumentList $identity
        $facts.IsElevated = [bool]$principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
    }
    catch {
        $facts.IsElevated = $false
    }

    $facts.HypervisorPresent = $null
    $facts.MemoryMiB = $null
    try {
        $computer = Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction Stop
        $facts.HypervisorPresent = Get-OptionalBool -Value $computer.HypervisorPresent
        if ($computer.TotalPhysicalMemory) { $facts.MemoryMiB = [int][math]::Floor([double]$computer.TotalPhysicalMemory / 1MB) }
    }
    catch {
    }

    $facts.VirtualizationFirmware = $null
    try {
        $processor = Get-CimInstance -ClassName Win32_Processor -ErrorAction Stop | Select-Object -First 1
        $facts.VirtualizationFirmware = Get-OptionalBool -Value $processor.VirtualizationFirmwareEnabled
    }
    catch {
    }

    $facts.Distributions = @(Get-InstalledWslDistributions)
    $facts.WslWorks = $false
    $facts.WslDefaultVersion = $null
    $facts.RunningDistributions = @()
    $facts.SystemdConf = 'not read'
    if ($null -ne (Get-Command -Name 'wsl.exe' -ErrorAction SilentlyContinue)) {
        $status = Invoke-WslCommand -Arguments @('--status')
        if ($status.ExitCode -eq 0) {
            $facts.WslWorks = $true
            $facts.WslDefaultVersion = Get-WslDefaultVersion -Text $status.Text
            $running = Invoke-WslCommand -Arguments @('--list', '--running', '--quiet')
            if ($running.ExitCode -eq 0) { $facts.RunningDistributions = @(ConvertFrom-WslNameList -Text $running.Text) }
        }
    }

    # systemd and Docker: read from Ubuntu only when it runs already. This script never starts a distribution to look.
    $ubuntu = Select-UbuntuDistro -Distributions $facts.Distributions
    $facts.DockerInUbuntu = 'not read'
    if ($null -ne $ubuntu -and ($facts.RunningDistributions -contains $ubuntu.Name)) {
        $name = [string]$ubuntu.Name
        $conf = Invoke-WslCommand -Arguments @('--distribution', $name, 'cat', '/etc/wsl.conf')
        $facts.SystemdConf = 'not set'
        if ($conf.ExitCode -eq 0) { $facts.SystemdConf = Get-WslConfSystemd -Text $conf.Text }
        $found = Invoke-WslCommand -Arguments @('--distribution', $name, 'which', 'docker')
        if ($found.ExitCode -eq 1 -and $found.Text.Trim() -eq '') {
            $facts.DockerInUbuntu = 'none'
        }
        elseif ($found.ExitCode -eq 0 -and $found.Text.Trim() -ne '') {
            $dockerPath = ($found.Text.Trim() -split "`n")[0].Trim()
            $resolved = Invoke-WslCommand -Arguments @('--distribution', $name, 'readlink', '-f', $dockerPath)
            $realPath = $dockerPath
            if ($resolved.ExitCode -eq 0 -and $resolved.Text.Trim() -ne '') { $realPath = ($resolved.Text.Trim() -split "`n")[0].Trim() }
            $facts.DockerInUbuntu = Get-DockerKind -RealPath $realPath
        }
    }

    $facts.RestartPending = $false
    try {
        $facts.RestartPending = [bool](Test-Path -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending')
    }
    catch {
    }

    $facts.CheckoutOk = $false
    if ($CheckoutRoot -ne '') {
        $facts.CheckoutOk = [bool]((Test-Path -LiteralPath (Join-Path $CheckoutRoot 'openbot\scripts\install.sh')) -and (Test-Path -LiteralPath (Join-Path $CheckoutRoot 'openbot\package.json')) -and (Test-Path -LiteralPath (Join-Path $CheckoutRoot 'openbot\.env.example')) -and (Test-Path -LiteralPath (Join-Path $CheckoutRoot 'scripts\start.sh')))
    }

    $facts.WslDiskRoot = Get-PathRootSafe -Path ([string]$env:LOCALAPPDATA)
    $facts.WslDiskFreeGB = Get-DiskFreeGB -Root $facts.WslDiskRoot
    $facts.CheckoutDiskRoot = Get-PathRootSafe -Path $CheckoutRoot
    $facts.CheckoutDiskFreeGB = Get-DiskFreeGB -Root $facts.CheckoutDiskRoot

    $facts.DockerDesktopInstalled = $false
    try {
        $facts.DockerDesktopInstalled = [bool](Test-Path -LiteralPath (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'))
    }
    catch {
    }
    return $facts
}

# ------------------------------------------------------------------------------------------------
# The steps. These change the computer, and are reached only after the plan, and only after a yes.
# ------------------------------------------------------------------------------------------------

function Read-InstallerAnswer {
    # The question, then the answer on the same line. Write-Host -NoNewline keeps the cursor after the question.
    param([string]$Prompt)
    Write-Host -NoNewline $Prompt
    return (Read-Host)
}

function Invoke-WslVisible {
    # Runs wsl.exe on this same console, so its output and its questions reach the person. Returns its exit code.
    # Start-Process without a redirect gives the child this console. A pipe here would hide a question that has no
    # line end yet, and would collect the output into the return value.
    param([string[]]$Arguments)
    $process = Start-Process -FilePath 'wsl.exe' -ArgumentList (Join-CommandLine -Arguments $Arguments) -NoNewWindow -Wait -PassThru
    return [int]$process.ExitCode
}

function Invoke-ElevatedWsl {
    # Runs wsl.exe with administrator rights through Windows' own permission prompt (UAC), in its own window.
    # Returns its exit code. If the person says no to the prompt, Start-Process throws, and the step reports it.
    param([string[]]$Arguments)
    Write-Host 'Windows is asking for administrator permission. The step runs in its own window; wait until that window closes.'
    $process = Start-Process -FilePath 'wsl.exe' -ArgumentList (Join-CommandLine -Arguments $Arguments) -Verb RunAs -Wait -PassThru
    return [int]$process.ExitCode
}

function Invoke-Handover {
    # install.sh inside the chosen Ubuntu, on this same console, so its questions reach the person. Returns its exit code.
    param([string[]]$Arguments)
    return (Invoke-WslVisible -Arguments $Arguments)
}

function Invoke-PlanStep {
    # Runs one step of the plan, with exactly the arguments the plan names.
    param([Parameter(Mandatory = $true)][hashtable]$Step)
    if ($Step.Id -eq 'wsl-install') {
        try {
            $code = Invoke-ElevatedWsl -Arguments $Step.Arguments
        }
        catch {
            return @{ Ok = $false; Message = "Could not run wsl --install: $($_.Exception.Message) Nothing was installed. If you refused Windows' permission prompt, run this again and accept it." }
        }
        if ($code -ne 0) {
            return @{ Ok = $false; Message = "wsl --install stopped with exit code $code. Read the window that showed its progress. Nothing after it was done. Run this script again after reading it: it checks what is in place first." }
        }
        return @{ Ok = $true }
    }
    $code = Invoke-WslVisible -Arguments $Step.Arguments
    if ($code -ne 0) {
        return @{ Ok = $false; Message = "$($Step.Command) stopped with exit code $code. Nothing after it was done. Run this script again: it checks what is in place first." }
    }
    return @{ Ok = $true }
}

function Write-RestartMessage {
    param([Parameter(Mandatory = $true)][ValidateSet('install', 'pending')][string]$Reason)
    Write-Host ''
    if ($Reason -eq 'install') {
        Write-Host 'Restart Windows now. WSL needs one restart after its first install.'
    }
    else {
        Write-Host 'Restart Windows now. It is waiting for a restart from an earlier update or install.'
    }
    Write-Host 'Windows does not run this script again by itself: it adds no startup task.'
    Write-Host 'After the restart, open Windows PowerShell as yourself (not as administrator), go to the FreeDuet folder, and run the same command again. It finds what is in place and goes on.'
}

function Write-PersonStepMessage {
    param([Parameter(Mandatory = $true)][string]$Distro)
    Write-Host ''
    Write-Host 'One step is left, and only you can do it:'
    Write-Host "  1. Open $Distro from the Start menu."
    Write-Host '  2. In the window that opens, create your Ubuntu user name and password. You choose them; this script never sees them.'
    Write-Host '  3. When Ubuntu shows its prompt, close that window, then run this script again.'
}

function Write-Usage {
    Write-Host 'Usage: powershell -NoProfile -ExecutionPolicy Bypass -File .\openbot\scripts\install.ps1 [-Check] [-Yes] [-IgnoreResources]'
    Write-Host ''
    Write-Host 'Sets up WSL 2 and Ubuntu on Windows 10 or 11, then hands over to openbot/scripts/install.sh inside Ubuntu.'
    Write-Host '  -Check             Only report what is missing. Changes nothing and asks nothing.'
    Write-Host '  -Yes               Do not ask before the steps. The plan is still printed first.'
    Write-Host '  -IgnoreResources   Go on although free disk space or memory is under the minimum.'
    Write-Host '  -Help              This text.'
    Write-Host 'Run it as yourself, not as administrator. It asks Windows for administrator rights only for the steps that need them.'
}

function Invoke-Installer {
    # The whole run; returns the exit status. Tests pass -Facts, so nothing on the test machine is read or changed.
    param(
        [switch]$Check,
        [switch]$Yes,
        [switch]$IgnoreResources,
        [string]$CheckoutRoot = '',
        [hashtable]$Facts = $null
    )
    if ($null -eq $Facts) { $Facts = Get-InstallerFacts -CheckoutRoot $CheckoutRoot }
    $plan = Get-InstallerPlan -Facts $Facts -IgnoreResources:$IgnoreResources -Yes:$Yes
    foreach ($line in (Format-InstallerPlan -Plan $plan -Check:$Check)) { Write-Host $line }

    if ($plan.Status -eq 'Blocked') { return (Get-InstallerExitCode -Name 'Stopped') }
    if ($Check) {
        Write-Host ''
        if ($plan.Status -eq 'Ready') {
            Write-Host 'Nothing is missing on Windows. Inside Ubuntu, install.sh checks the rest when it runs. This was only a check: nothing was changed.'
            return (Get-InstallerExitCode -Name 'Done')
        }
        if ($plan.Status -eq 'Restart') {
            return (Get-InstallerExitCode -Name 'Restart')
        }
        if ($plan.Steps.Count -eq 0 -and $plan.PersonStep) {
            Write-PersonStepMessage -Distro ([string]$plan.Handover.Distro)
            Write-Host 'This was only a check: nothing was changed.'
            return (Get-InstallerExitCode -Name 'PersonStep')
        }
        Write-Host 'Not ready yet. This was only a check: nothing was changed. Run this without -Check to do what is missing; it asks once.'
        return (Get-InstallerExitCode -Name 'Gap')
    }
    if ($plan.Status -eq 'Restart') {
        Write-RestartMessage -Reason 'pending'
        return (Get-InstallerExitCode -Name 'Restart')
    }

    $hasActions = ($plan.Steps.Count -gt 0) -or $plan.ReachesHandover
    if ($hasActions) {
        Write-Host ''
        if ($Yes) {
            Write-Host '-Yes given: going ahead without asking.'
        }
        else {
            $answer = [string](Read-InstallerAnswer -Prompt 'Go ahead? [y/N] ')
            if ($answer.Trim() -notmatch '^(y|yes)$') {
                Write-Host 'Nothing was changed.'
                return (Get-InstallerExitCode -Name 'Stopped')
            }
        }
    }

    foreach ($step in $plan.Steps) {
        Write-Host ''
        Write-Host "Step: $($step.Title)"
        $result = Invoke-PlanStep -Step $step
        if (-not $result.Ok) {
            Write-Host $result.Message
            return (Get-InstallerExitCode -Name 'Stopped')
        }
        # After the install, the other steps wait for the restart: the new WSL is not active before it.
        if ($step.Id -eq 'wsl-install' -and $plan.RestartAfterInstall) { break }
    }
    if ($plan.RestartAfterInstall) {
        Write-RestartMessage -Reason 'install'
        return (Get-InstallerExitCode -Name 'Restart')
    }
    if ($plan.PersonStep) {
        Write-PersonStepMessage -Distro ([string]$plan.Handover.Distro)
        return (Get-InstallerExitCode -Name 'PersonStep')
    }

    Write-Host ''
    Write-Host "Handing over to install.sh inside $($plan.Handover.Distro). Its output follows."
    $code = Invoke-Handover -Arguments $plan.Handover.Arguments
    return [int]$code
}

# Dot-sourcing (as install.Tests.ps1 does) runs nothing below this line.
if ($MyInvocation.InvocationName -ne '.') {
    if ($Help) {
        Write-Usage
        exit 0
    }
    $repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    $exitCode = Get-InstallerExitCode -Name 'Stopped'
    try {
        # The last value is the exit status: a stray value from a command earlier in the run must not become the status.
        $outcome = @(Invoke-Installer -Check:$Check -Yes:$Yes -IgnoreResources:$IgnoreResources -CheckoutRoot $repoRoot)
        if ($outcome.Count -gt 0) { $exitCode = [int]$outcome[-1] }
    }
    catch {
        Write-Host "Stopped by an unexpected error: $($_.Exception.Message)"
    }
    exit $exitCode
}
