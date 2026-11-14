# Pester 5 tests for install.ps1 (the Windows step of the installer; docs/design/installer.md, section 10).
#
# STATUS: NOT RUN. Written on a Linux machine where PowerShell could not be installed, so nothing in this file has
# executed. The first run on a Windows machine is part of the manual check in docs/design/installer.md, section 10.
#
# The tests never change the computer. install.ps1 is dot-sourced (which runs nothing), the facts are fake, and every
# command that would change something (wsl, Start-Process, Read-Host, Get-CimInstance) is replaced by a Pester mock.
#
# To run, in Windows PowerShell, from the repository root:
#   Install-Module Pester -MinimumVersion 5.0 -Scope CurrentUser     (once; the Pester 3 that Windows ships cannot run this file)
#   Invoke-Pester -Path .\openbot\scripts\install.Tests.ps1 -Output Detailed
#
# Not wired into CI: that needs a Windows runner, which the maintainer has not chosen.

BeforeAll {
    $script:InstallerPath = Join-Path $PSScriptRoot 'install.ps1'
    . $script:InstallerPath

    function New-TestFacts {
        # A computer where everything is in place. A hashtable argument replaces the keys it names.
        param([hashtable]$Override = @{})
        $facts = @{
            IsWindows              = $true
            WindowsBuild           = 22631
            WindowsName            = 'Windows 11 Pro 23H2'
            IsElevated             = $false
            HypervisorPresent      = $true
            VirtualizationFirmware = $true
            MemoryMiB              = 16384
            WslWorks               = $true
            WslDefaultVersion      = 2
            Distributions          = @(@{ Name = 'Ubuntu-24.04'; Version = 2; DefaultUid = 1000 })
            RunningDistributions   = @()
            SystemdConf            = 'true'
            DockerInUbuntu         = 'not read'
            DockerDesktopInstalled = $false
            RestartPending         = $false
            CheckoutPath           = 'C:\Users\Test\freeduet'
            CheckoutOk             = $true
            WslDiskRoot            = 'C:\'
            WslDiskFreeGB          = 100
            CheckoutDiskRoot       = 'C:\'
            CheckoutDiskFreeGB     = 100
        }
        foreach ($key in $Override.Keys) { $facts[$key] = $Override[$key] }
        return $facts
    }

    function New-MissingWslFacts {
        return (New-TestFacts @{ WslWorks = $false; WslDefaultVersion = $null; Distributions = @() })
    }
}

Describe 'Exit codes' {
    It 'uses install.sh meanings, and 4 for a restart' {
        Get-InstallerExitCode -Name 'Done' | Should -Be 0
        Get-InstallerExitCode -Name 'Stopped' | Should -Be 1
        Get-InstallerExitCode -Name 'Gap' | Should -Be 2
        Get-InstallerExitCode -Name 'PersonStep' | Should -Be 3
        Get-InstallerExitCode -Name 'Restart' | Should -Be 4
    }
    It 'refuses a name it does not know' {
        { Get-InstallerExitCode -Name 'Maybe' } | Should -Throw
    }
}

Describe 'Text readers and path helpers' {
    It 'removes the NUL characters that UTF-16 output leaves between letters' {
        Remove-NullCharacters -Text ("a`0b`0") | Should -Be 'ab'
    }
    It 'reads the default WSL version from its number, also through NUL characters' {
        $plain = "Default Version: 2`r`n"
        $spaced = ($plain.ToCharArray() | ForEach-Object { [string]$_ + [char]0 }) -join ''
        Get-WslDefaultVersion -Text $plain | Should -Be 2
        Get-WslDefaultVersion -Text $spaced | Should -Be 2
    }
    It 'reads no default version when the status has no such line' {
        Get-WslDefaultVersion -Text 'Kernel version: 5.15' | Should -BeNullOrEmpty
    }
    It 'lists distribution names one per line, without blank lines' {
        $names = @(ConvertFrom-WslNameList -Text "Ubuntu-24.04`r`n`r`nUbuntu-22.04`r`n")
        $names.Count | Should -Be 2
        $names[0] | Should -Be 'Ubuntu-24.04'
    }
    It 'reads systemd only from the [boot] section of wsl.conf' {
        Get-WslConfSystemd -Text "[boot]`nsystemd=true`n" | Should -Be 'true'
        Get-WslConfSystemd -Text "[boot]`r`n systemd = false `r`n" | Should -Be 'false'
        Get-WslConfSystemd -Text "[user]`nsystemd=true`n" | Should -Be 'not set'
        Get-WslConfSystemd -Text '' | Should -Be 'not set'
    }
    It 'turns a Windows path into the path Ubuntu sees' {
        ConvertTo-WslPath -WindowsPath 'C:\Users\Test\freeduet' | Should -Be '/mnt/c/Users/Test/freeduet'
        ConvertTo-WslPath -WindowsPath 'D:\' | Should -Be '/mnt/d'
        ConvertTo-WslPath -WindowsPath '\\server\share\freeduet' | Should -BeNullOrEmpty
    }
    It 'quotes only the arguments that contain a space or a double quote' {
        Join-CommandLine -Arguments @('--install', '-d', 'Ubuntu-24.04', '--no-launch') | Should -Be '--install -d Ubuntu-24.04 --no-launch'
        Join-CommandLine -Arguments @('--distribution', 'Ubuntu-24.04', 'bash', '/mnt/c/Users/John Smith/freeduet/openbot/scripts/install.sh', '--yes') | Should -Be '--distribution Ubuntu-24.04 bash "/mnt/c/Users/John Smith/freeduet/openbot/scripts/install.sh" --yes'
    }
    It 'tells Docker Desktop''s docker command from another one by its real path' {
        Get-DockerKind -RealPath '/mnt/wsl/docker-desktop/cli-tools/usr/bin/docker' | Should -Be 'DockerDesktop'
        Get-DockerKind -RealPath '/usr/bin/docker' | Should -Be 'inside'
    }
    It 'picks Ubuntu-24.04 before 22.04, by name and without regard to case' {
        $pick = Select-UbuntuDistro -Distributions @(@{ Name = 'Ubuntu-22.04' }, @{ Name = 'ubuntu-24.04' })
        $pick.Name | Should -Be 'ubuntu-24.04'
        Select-UbuntuDistro -Distributions @(@{ Name = 'Debian' }) | Should -BeNullOrEmpty
    }
}

Describe 'Resource states' {
    It 'is ok at or above the recommendation' {
        Get-ResourceState -Value 20 -Minimum 7 -Recommended 20 | Should -Be 'ok'
    }
    It 'is LOW between the minimum and the recommendation' {
        Get-ResourceState -Value 10 -Minimum 7 -Recommended 20 | Should -Be 'LOW'
    }
    It 'is STOP below the minimum, and LOW there when the minimum is ignored' {
        Get-ResourceState -Value 6 -Minimum 7 -Recommended 20 | Should -Be 'STOP'
        Get-ResourceState -Value 6 -Minimum 7 -Recommended 20 -IgnoreResources $true | Should -Be 'LOW'
    }
    It 'is unknown when the size could not be read' {
        Get-ResourceState -Value $null -Minimum 7 -Recommended 20 | Should -Be 'unknown'
    }
}

Describe 'Get-InstallerPlan decides from the facts' {
    It 'is Ready, with only the hand-over, when everything is in place' {
        $plan = Get-InstallerPlan -Facts (New-TestFacts)
        $plan.Status | Should -Be 'Ready'
        $plan.Steps.Count | Should -Be 0
        $plan.ReachesHandover | Should -BeTrue
        $plan.PersonStep | Should -BeFalse
        ($plan.Handover.Arguments -join ' ') | Should -Be '--distribution Ubuntu-24.04 bash /mnt/c/Users/Test/freeduet/openbot/scripts/install.sh'
    }
    It 'installs WSL and Ubuntu with the exact arguments, and needs a restart after it' {
        $plan = Get-InstallerPlan -Facts (New-MissingWslFacts)
        $plan.Status | Should -Be 'Gap'
        $plan.Steps.Count | Should -Be 1
        $plan.Steps[0].Id | Should -Be 'wsl-install'
        ($plan.Steps[0].Arguments -join ' ') | Should -Be '--install -d Ubuntu-24.04 --no-launch'
        $plan.Steps[0].NeedsAdmin | Should -BeTrue
        $plan.RestartAfterInstall | Should -BeTrue
        $plan.ReachesHandover | Should -BeFalse
    }
    It 'sets the default version to 2 when it is 1, as a step without administrator rights' {
        $plan = Get-InstallerPlan -Facts (New-TestFacts @{ WslDefaultVersion = 1 })
        $plan.Steps.Count | Should -Be 1
        $plan.Steps[0].Id | Should -Be 'wsl-default-2'
        $plan.Steps[0].NeedsAdmin | Should -BeFalse
        ($plan.Steps[0].Arguments -join ' ') | Should -Be '--set-default-version 2'
    }
    It 'converts an Ubuntu that is WSL 1 to WSL 2, by its name, and then hands over' {
        $plan = Get-InstallerPlan -Facts (New-TestFacts @{ Distributions = @(@{ Name = 'Ubuntu-24.04'; Version = 1; DefaultUid = 1000 }) })
        $step = @($plan.Steps | Where-Object { $_.Id -eq 'wsl-version-2' })
        $step.Count | Should -Be 1
        ($step[0].Arguments -join ' ') | Should -Be '--set-version Ubuntu-24.04 2'
        $plan.ReachesHandover | Should -BeTrue
    }
    It 'waits for the person when no Ubuntu user has been created yet' {
        $plan = Get-InstallerPlan -Facts (New-TestFacts @{ Distributions = @(@{ Name = 'Ubuntu-24.04'; Version = 2; DefaultUid = 0 }) })
        $plan.PersonStep | Should -BeTrue
        $plan.ReachesHandover | Should -BeFalse
        $plan.Status | Should -Be 'Gap'
    }
    It 'asks for a restart first when Windows is waiting for one and an administrator step is due' {
        $plan = Get-InstallerPlan -Facts (New-TestFacts @{ RestartPending = $true; WslWorks = $false; WslDefaultVersion = $null; Distributions = @() })
        $plan.Status | Should -Be 'Restart'
        $plan.Steps.Count | Should -Be 1
    }
    It 'is blocked by a Windows build older than 19041' {
        $plan = Get-InstallerPlan -Facts (New-TestFacts @{ WindowsBuild = 18363 })
        $plan.Status | Should -Be 'Blocked'
        ($plan.Blocks -join ' ') | Should -Match '19041'
    }
    It 'is blocked when run as administrator' {
        $plan = Get-InstallerPlan -Facts (New-TestFacts @{ IsElevated = $true })
        $plan.Status | Should -Be 'Blocked'
        ($plan.Blocks -join ' ') | Should -Match 'administrator'
    }
    It 'is blocked when virtualisation is off, and not when a hypervisor is running' {
        (Get-InstallerPlan -Facts (New-TestFacts @{ HypervisorPresent = $false; VirtualizationFirmware = $false })).Status | Should -Be 'Blocked'
        (Get-InstallerPlan -Facts (New-TestFacts @{ HypervisorPresent = $true; VirtualizationFirmware = $false })).Status | Should -Not -Be 'Blocked'
    }
    It 'is blocked when the disk is under the minimum, and goes on with -IgnoreResources' {
        $facts = New-TestFacts @{ WslDiskFreeGB = 5; CheckoutDiskFreeGB = 5 }
        (Get-InstallerPlan -Facts $facts).Status | Should -Be 'Blocked'
        (Get-InstallerPlan -Facts $facts -IgnoreResources).Status | Should -Not -Be 'Blocked'
    }
    It 'is blocked when memory is under the minimum' {
        (Get-InstallerPlan -Facts (New-TestFacts @{ MemoryMiB = 2000 })).Status | Should -Be 'Blocked'
    }
    It 'is blocked when the folder is not a FreeDuet checkout' {
        (Get-InstallerPlan -Facts (New-TestFacts @{ CheckoutOk = $false })).Status | Should -Be 'Blocked'
    }
    It 'is blocked when the folder is on a network path' {
        $facts = New-TestFacts @{ CheckoutPath = '\\server\share\freeduet'; CheckoutDiskRoot = '\\server\share\'; CheckoutDiskFreeGB = $null }
        (Get-InstallerPlan -Facts $facts).Status | Should -Be 'Blocked'
    }
    It 'passes -Yes and -IgnoreResources on to install.sh' {
        $plan = Get-InstallerPlan -Facts (New-TestFacts) -Yes -IgnoreResources
        ($plan.Handover.Arguments -join ' ') | Should -Match '--yes --ignore-resources$'
    }
    It 'names no download and no script runner in any step it would run' {
        $plan = Get-InstallerPlan -Facts (New-MissingWslFacts)
        foreach ($step in $plan.Steps) {
            $step.Command | Should -Not -Match 'curl|wget|Invoke-WebRequest|Invoke-Expression|bitsadmin|certutil'
        }
    }
}

Describe 'Format-InstallerPlan' {
    It 'says nothing was changed when the plan is blocked' {
        $plan = Get-InstallerPlan -Facts (New-TestFacts @{ WindowsBuild = 18363 })
        ((Format-InstallerPlan -Plan $plan) -join "`n") | Should -Match 'Nothing was changed'
    }
    It 'says which steps need administrator rights' {
        $plan = Get-InstallerPlan -Facts (New-MissingWslFacts)
        ((Format-InstallerPlan -Plan $plan) -join "`n") | Should -Match 'Administrator rights: yes'
    }
    It 'says that -Check changes nothing, and lists no hand-over when nothing is missing' {
        $plan = Get-InstallerPlan -Facts (New-TestFacts)
        $text = (Format-InstallerPlan -Plan $plan -Check) -join "`n"
        $text | Should -Match 'This computer'
        $text | Should -Not -Match 'Hand over to install.sh'
    }
}

Describe 'Planning reads nothing from the computer' {
    It 'Get-InstallerPlan runs no wsl, queries no WMI and asks for no elevation' {
        Mock Invoke-WslCommand { throw 'planning must not run wsl' }
        Mock Invoke-WslVisible { throw 'planning must not run wsl' }
        Mock Invoke-ElevatedWsl { throw 'planning must not run wsl' }
        Mock Get-CimInstance { throw 'planning must not query WMI' }
        { Get-InstallerPlan -Facts (New-TestFacts) } | Should -Not -Throw
        { Get-InstallerPlan -Facts (New-MissingWslFacts) } | Should -Not -Throw
    }
}

Describe 'Invoke-Installer: the one question, -Check, and the exit codes' {
    BeforeEach {
        Mock Write-Host {}
        Mock Invoke-WslVisible { return 0 }
        Mock Invoke-ElevatedWsl { return 0 }
        Mock Invoke-Handover { return 0 }
        Mock Read-InstallerAnswer { return 'n' }
    }

    It '-Check on a computer without WSL returns 2 and changes nothing' {
        Invoke-Installer -Check -Facts (New-MissingWslFacts) | Should -Be 2
        Should -Invoke -CommandName Invoke-ElevatedWsl -Times 0 -Exactly
        Should -Invoke -CommandName Invoke-WslVisible -Times 0 -Exactly
        Should -Invoke -CommandName Invoke-Handover -Times 0 -Exactly
        Should -Invoke -CommandName Read-InstallerAnswer -Times 0 -Exactly
    }
    It '-Check on a ready computer returns 0 and changes nothing' {
        Invoke-Installer -Check -Facts (New-TestFacts) | Should -Be 0
        Should -Invoke -CommandName Invoke-WslVisible -Times 0 -Exactly
        Should -Invoke -CommandName Invoke-Handover -Times 0 -Exactly
        Should -Invoke -CommandName Read-InstallerAnswer -Times 0 -Exactly
    }
    It '-Check with only the Ubuntu user left returns 3 and changes nothing' {
        $facts = New-TestFacts @{ Distributions = @(@{ Name = 'Ubuntu-24.04'; Version = 2; DefaultUid = 0 }) }
        Invoke-Installer -Check -Facts $facts | Should -Be 3
        Should -Invoke -CommandName Invoke-WslVisible -Times 0 -Exactly
        Should -Invoke -CommandName Invoke-Handover -Times 0 -Exactly
    }
    It '-Check with a pending restart returns 4 and changes nothing' {
        $facts = New-TestFacts @{ RestartPending = $true; WslWorks = $false; WslDefaultVersion = $null; Distributions = @() }
        Invoke-Installer -Check -Facts $facts | Should -Be 4
        Should -Invoke -CommandName Invoke-ElevatedWsl -Times 0 -Exactly
    }
    It 'a blocked computer returns 1 and changes nothing, with or without -Check' {
        $facts = New-TestFacts @{ WindowsBuild = 18363 }
        Invoke-Installer -Check -Facts $facts | Should -Be 1
        Invoke-Installer -Yes -Facts $facts | Should -Be 1
        Should -Invoke -CommandName Invoke-ElevatedWsl -Times 0 -Exactly
        Should -Invoke -CommandName Invoke-WslVisible -Times 0 -Exactly
        Should -Invoke -CommandName Invoke-Handover -Times 0 -Exactly
    }
    It 'asks once, and an answer other than yes changes nothing' {
        Invoke-Installer -Facts (New-MissingWslFacts) | Should -Be 1
        Should -Invoke -CommandName Read-InstallerAnswer -Times 1 -Exactly
        Should -Invoke -CommandName Invoke-ElevatedWsl -Times 0 -Exactly
        Should -Invoke -CommandName Invoke-Handover -Times 0 -Exactly
    }
    It 'on a yes, installs WSL with the exact arguments, then stops for the restart (4)' {
        Mock Read-InstallerAnswer { return 'y' }
        Invoke-Installer -Facts (New-MissingWslFacts) | Should -Be 4
        Should -Invoke -CommandName Read-InstallerAnswer -Times 1 -Exactly
        Should -Invoke -CommandName Invoke-ElevatedWsl -Times 1 -Exactly -ParameterFilter { ($Arguments -join ' ') -eq '--install -d Ubuntu-24.04 --no-launch' }
        Should -Invoke -CommandName Invoke-Handover -Times 0 -Exactly
    }
    It 'with -Yes it does not ask, and sets the default version without administrator rights' {
        Invoke-Installer -Yes -Facts (New-TestFacts @{ WslDefaultVersion = 1 }) | Should -Be 0
        Should -Invoke -CommandName Read-InstallerAnswer -Times 0 -Exactly
        Should -Invoke -CommandName Invoke-WslVisible -Times 1 -Exactly -ParameterFilter { ($Arguments -join ' ') -eq '--set-default-version 2' }
        Should -Invoke -CommandName Invoke-ElevatedWsl -Times 0 -Exactly
        Should -Invoke -CommandName Invoke-Handover -Times 1 -Exactly
    }
    It 'hands over to install.sh inside Ubuntu, and returns install.sh''s own exit code' {
        Mock Invoke-Handover { return 7 }
        Invoke-Installer -Yes -Facts (New-TestFacts) | Should -Be 7
        Should -Invoke -CommandName Invoke-Handover -Times 1 -Exactly -ParameterFilter { ($Arguments -join ' ') -like '*openbot/scripts/install.sh*' }
    }
    It 'stops at a failed step and does not hand over' {
        Mock Invoke-ElevatedWsl { return 5 }
        Invoke-Installer -Yes -Facts (New-MissingWslFacts) | Should -Be 1
        Should -Invoke -CommandName Invoke-Handover -Times 0 -Exactly
    }
    It 'asks for the Ubuntu user, and does not hand over, when that is all that is left' {
        $facts = New-TestFacts @{ Distributions = @(@{ Name = 'Ubuntu-24.04'; Version = 2; DefaultUid = 0 }) }
        Invoke-Installer -Yes -Facts $facts | Should -Be 3
        Should -Invoke -CommandName Invoke-Handover -Times 0 -Exactly
    }
}

Describe 'install.ps1 as a file' {
    BeforeAll {
        $script:Source = Get-Content -LiteralPath $script:InstallerPath -Raw
    }
    It 'is plain ASCII, so Windows PowerShell 5.1 reads it the same way on every machine' {
        $bytes = [System.IO.File]::ReadAllBytes($script:InstallerPath)
        @($bytes | Where-Object { $_ -gt 127 }).Count | Should -Be 0
    }
    It 'parses with no syntax error' {
        $tokens = $null
        $errors = $null
        [void][System.Management.Automation.Language.Parser]::ParseFile($script:InstallerPath, [ref]$tokens, [ref]$errors)
        @($errors).Count | Should -Be 0
    }
    It 'downloads nothing and runs no script it has not got itself' {
        $script:Source | Should -Not -Match '(?i)\b(Invoke-WebRequest|Invoke-RestMethod|DownloadFile|DownloadString|Start-BitsTransfer|bitsadmin|certutil|curl|wget)\b'
        $script:Source | Should -Not -Match '(?i)\b(Invoke-Expression|iex)\b'
    }
    It 'handles no password, secret or credential' {
        $script:Source | Should -Not -Match '(?i)Get-Credential|ConvertTo-SecureString|AsSecureString'
    }
    It 'changes no execution policy, adds no startup task and writes no registry value' {
        $script:Source | Should -Not -Match '(?i)Set-ExecutionPolicy|Register-ScheduledTask|New-ScheduledTask|schtasks|New-ItemProperty|Set-ItemProperty|Remove-Item|Stop-Process'
    }
    It 'never restarts Windows by itself' {
        $script:Source | Should -Not -Match '(?i)Restart-Computer|shutdown\.exe'
    }
}
