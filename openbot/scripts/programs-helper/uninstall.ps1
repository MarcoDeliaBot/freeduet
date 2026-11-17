# Removes the FreeDuet programs helper from this Windows computer (docs/design/programs-on-your-computer.md, S2, D62).
# It is a script YOU run: deleting things on your computer is your own command, not something FreeDuet does.
#
#   powershell -NoProfile -ExecutionPolicy RemoteSigned -File .\uninstall.ps1          asks once
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
        $answer = Read-Host "Remove the task '$TaskName' and delete $Directory? (y/n)"
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
        [void](Stop-HelperProcess -Directory $Directory)
        # The folder is deleted only if it is a real folder. A link (junction or symlink) put in its place is removed as
        # a link, by name, and what it points to is never touched. Inside, links are removed the same way.
        if (Test-ReparsePoint -Path $Directory) {
            (Get-Item -LiteralPath $Directory -Force).Delete()
            Write-Host "$Directory was a link: the link was removed, what it pointed to was left alone."
            return 0
        }
        foreach ($item in @(Get-ChildItem -LiteralPath $Directory -Force)) {
            if (Test-ReparsePoint -Path $item.FullName) { $item.Delete(); Write-Host ("A link inside was removed as a link: " + $item.Name); continue }
            Remove-Item -LiteralPath $item.FullName -Recurse -Force
        }
        Remove-Item -LiteralPath $Directory -Force
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
