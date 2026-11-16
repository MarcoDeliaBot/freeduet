# Removes the FreeDuet programs helper from this Windows computer (docs/design/programs-on-your-computer.md, S2, D62).
# It is a script YOU run: deleting things on your computer is your own command, not something FreeDuet does.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall.ps1          asks once
#   ... -Yes                                                                      does not ask
#
# It stops and removes the scheduled task "FreeDuet Programs Helper", then deletes the helper's folder
# (%LOCALAPPDATA%\FreeDuet\programs-helper: the protected secret, the config, the copy of the helper and the log).
# It does not tell FreeDuet. To make the old secret useless on the server side too, switch "programs on this
# computer" off in FreeDuet, or pair again later: a new pairing replaces the secret.
[CmdletBinding()]
param([switch]$Yes)

. (Join-Path $PSScriptRoot 'FreeDuetProgramsHelper.ps1')

function Invoke-Uninstall {
    param([bool]$Yes, [string]$Directory = (Get-HelperDirectory), [string]$TaskName = 'FreeDuet Programs Helper')
    if (-not $Yes) {
        $answer = Read-Host "Remove the task '$TaskName' and delete $Directory ? (y/n)"
        if ($answer -notmatch '^[yY]') { Write-Host 'Nothing was changed.'; return 1 }
    }
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($null -ne $task) {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Task '$TaskName' removed."
    }
    else { Write-Host "There was no task '$TaskName'." }
    if (Test-Path -LiteralPath $Directory) {
        Remove-Item -LiteralPath $Directory -Recurse -Force
        Write-Host "Deleted $Directory"
    }
    else { Write-Host 'There was no helper folder.' }
    return 0
}

if ($MyInvocation.InvocationName -ne '.') {
    $exitCode = 1
    try { $exitCode = [int](@(Invoke-Uninstall -Yes ([bool]$Yes))[-1]) }
    catch { Write-Host "Stopped by an unexpected error: $($_.Exception.Message)" }
    exit $exitCode
}
