# FreeDuet programs helper for Windows (docs/design/programs-on-your-computer.md, slice S2, D62): the small program that
# answers a member's fixed questions about the programs on THIS computer. Read-only: it can list what is installed and
# what has an update, and nothing else. It cannot update, install, uninstall or run anything.
#
# STATUS: NEVER RUN ON A PERSON'S COMPUTER. It was written on a Linux machine where PowerShell could not be run at all.
# CI runs its Pester tests (programs-helper/FreeDuetProgramsHelper.Tests.ps1) on a hosted Windows runner (job installer-windows).
#
# WHAT IT IS
#   - A readable script, unsigned for now (the maintainer's decision Q6: signing costs money). Windows PowerShell 5.1.
#   - Started at log on by a per-user scheduled task made by setup.ps1, as YOU, not elevated, with a hidden window.
#   - It LISTENS ON NOTHING. It asks the FreeDuet server every few seconds whether there is a question for it (a poll),
#     and answers by posting the result. Nothing on this computer can connect to it.
#   - It refuses to run as an administrator. A read never needs rights, so it never has them.
#
# HOW IT KNOWS A QUESTION IS REAL
#   Every poll and every answer is signed with HMAC-SHA-256 under a secret that only the server and this computer hold
#   (docs/design/programs-on-your-computer.md 2.3; server/src/programs/protocol.ts is the wire format and this file
#   speaks it exactly: the tests hold the same signatures made by the server's own code). A question is carried out only
#   if its signature is right, it has not expired, its id was not seen before, it has EXACTLY the fields of one of the
#   known actions and nothing more, and it names this person. Anything else is dropped and written in the log.
#
# WHAT IT RUNS
#   Only winget.exe, found as described in Resolve-WingetPath, with an argument list taken from ONE fixed table
#   (Get-ActionTable): `list` and `upgrade` (which only reads). No function here builds a command line from text that
#   came from the server, from a program's name, or from anywhere else. It never passes --accept-source-agreements or
#   --accept-package-agreements: accepting a tool's terms is the person's own act (setup.ps1 offers to let you do it).
#
# WHAT THIS DOES AND DOES NOT PROTECT (said plainly)
#   It protects against OTHER Windows users, against a copy of the secret file, and against the members' computers
#   (the secret never goes there). It does NOT protect against a program that already runs as YOU: any such program can
#   read the secret (DPAPI opens it for your user), rewrite config.json (server address, winget path) and rewrite this
#   script, which a scheduled task starts at every log on from a folder you can write. An unsigned script started like
#   that is a persistence point for malware of the same user; signing it (a cost, the maintainer's decision, slice S7)
#   is what would close it, and nothing here claims otherwise.
#
# WHAT IT WRITES
#   %LOCALAPPDATA%\FreeDuet\programs-helper\helper.log : when a question came, what it was, what was run (the exact
#   argument list) and its exit code. Never the secret, never the list itself. You can open it any time.
#
# Plain ASCII on purpose: Windows PowerShell reads a file without a byte-order mark as ANSI.
# Dot-sourcing this file runs nothing; the Pester tests rely on that.

[CmdletBinding()]
param()

# --- Limits (the design's numbers, section 3.1 and 5) --------------------------------------------------------
$script:PollSeconds = 4          # the server counts the helper as connected for 15 s after a poll
$script:OperationTimeoutSeconds = 90   # the server gives up on an operation after 120 s
$script:MaxOutputChars = 2097152       # characters read from winget, in total
$script:MaxRows = 501            # 500 rows are shown; one more lets the server say the list was cut
$script:MaxField = 120           # characters of a text field
$script:MaxIdLength = 120
$script:LogMaxBytes = 1048576
$script:RefusalsBeforeAction = 5   # consecutive 401s after which the secret is re-read once, then the helper stops
$script:MaxSeenIds = 500
$script:SeenKeepMilliseconds = 600000   # an id is remembered until its expiry plus ten minutes
$script:MaxSeenFileBytes = 1048576      # seen.txt is never read past 1 MiB (500 real lines are about 110 KB); larger fails closed
$script:ExitNoApplications = -1978335212   # 0x8A150014: winget found nothing to list

function Get-HelperDirectory {
    return (Join-Path $env:LOCALAPPDATA 'FreeDuet\programs-helper')
}

function Write-HelperLog {
    param([string]$Event, [string]$Detail = '')
    try {
        $dir = Get-HelperDirectory
        if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        $file = Join-Path $dir 'helper.log'
        if ((Test-Path -LiteralPath $file) -and ((Get-Item -LiteralPath $file).Length -gt $script:LogMaxBytes)) {
            Move-Item -LiteralPath $file -Destination (Join-Path $dir 'helper.log.old') -Force
        }
        # The same classes as the output cleaning (Get-SafeText): control (also U+0085), format, private use, surrogate, U+2028/2029.
        $clean = [regex]::Replace($Detail, '[\p{Cc}\p{Cf}\p{Co}\p{Cs}\u2028\u2029]', ' ')
        if ($clean.Length -gt 600) { $clean = $clean.Substring(0, 600) }
        $line = '{0} | {1} | {2}' -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $Event, $clean
        Add-Content -LiteralPath $file -Value $line -Encoding UTF8
    }
    catch {
        # A log that cannot be written must not stop the helper.
    }
}

function Test-Elevated {
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    return ([System.Security.Principal.WindowsPrincipal]$identity).IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-NowMilliseconds {
    return [long][DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
}

# --- The signing (server/src/programs/protocol.ts) -----------------------------------------------------------
function ConvertFrom-Hex {
    param([string]$Hex)
    if ($Hex -notmatch '^(?:[0-9a-fA-F]{2})+$') { throw 'not hexadecimal' }
    $bytes = New-Object byte[] ($Hex.Length / 2)
    for ($i = 0; $i -lt $bytes.Length; $i++) { $bytes[$i] = [Convert]::ToByte($Hex.Substring(2 * $i, 2), 16) }
    return , $bytes
}

function ConvertTo-Hex {
    param([byte[]]$Bytes)
    $builder = New-Object System.Text.StringBuilder
    foreach ($b in $Bytes) { [void]$builder.Append($b.ToString('x2')) }
    return $builder.ToString()
}

function Get-Sha256Hex {
    param([string]$Text)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return (ConvertTo-Hex ($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Text)))) }
    finally { $sha.Dispose() }
}

function Get-HmacHex {
    param([byte[]]$Key, [string]$Text)
    $hmac = New-Object System.Security.Cryptography.HMACSHA256 -ArgumentList (, $Key)
    try { return (ConvertTo-Hex ($hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Text)))) }
    finally { $hmac.Dispose() }
}

# Equal-length digests are compared, whatever the given text is (the server does the same).
function Test-SameMac {
    param($Given, [string]$Expected)
    if ($Given -isnot [string]) { return $false }
    $a = [System.Security.Cryptography.SHA256]::Create()
    try {
        $x = $a.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Given))
        $y = $a.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Expected))
    }
    finally { $a.Dispose() }
    $diff = 0
    for ($i = 0; $i -lt $x.Length; $i++) { $diff = $diff -bor ($x[$i] -bxor $y[$i]) }
    return ($diff -eq 0)
}

function Get-PollText {
    param([string]$ActorId, [long]$Ts, [string]$Nonce)
    return (@('poll1', $ActorId, $Ts.ToString([Globalization.CultureInfo]::InvariantCulture), $Nonce) -join "`n")
}

function Get-ActionField {
    param($Action, [string]$Name)
    $property = $Action.PSObject.Properties[$Name]
    if ($null -eq $property -or $null -eq $property.Value) { return '' }
    return [string]$property.Value
}

function Get-OperationText {
    param($Operation)
    $a = $Operation.action
    $inv = [Globalization.CultureInfo]::InvariantCulture
    return (@(
            'op1',
            [string]$Operation.operationId,
            [string]$Operation.actorId,
            [string]$Operation.botId,
            (Get-ActionField $a 'kind'),
            (Get-ActionField $a 'id'),
            (Get-ActionField $a 'source'),
            (Get-ActionField $a 'versionNow'),
            (Get-ActionField $a 'versionAvailable'),
            (Get-ActionField $a 'version'),
            ([long]$Operation.issuedAt).ToString($inv),
            ([long]$Operation.expiresAt).ToString($inv)
        ) -join "`n")
}

function Get-ResultText {
    param([string]$OperationId, [string]$ActorId, [long]$Ts, [string]$Nonce, [bool]$Ok, [string]$Payload)
    $inv = [Globalization.CultureInfo]::InvariantCulture
    $okText = 'false'
    if ($Ok) { $okText = 'true' }
    return (@('res1', $OperationId, $ActorId, $Ts.ToString($inv), $Nonce, $okText, (Get-Sha256Hex $Payload)) -join "`n")
}

# --- The fixed table of actions ------------------------------------------------------------------------------
# The ONLY place that decides what is run. Each argument is a literal of this file. For S2 two read actions exist.
# `--disable-interactivity` keeps winget from waiting for a key; no flag that accepts terms is in the table.
function Get-ActionTable {
    return @{
        'list_installed' = @{ Arguments = @('list', '--disable-interactivity'); Toast = 'FreeDuet is reading the list of programs on this PC, as you allowed.' }
        'list_updates'   = @{ Arguments = @('upgrade', '--disable-interactivity'); Toast = 'FreeDuet is checking which programs have an update, as you allowed.' }
    }
}

# The action kinds the wire knows, with the exact field names each carries (server/src/programs/protocol.ts).
function Get-KnownKinds {
    return @{
        'list_installed' = @('kind')
        'list_updates'   = @('kind')
        'update_one'     = @('kind', 'id', 'source', 'versionNow', 'versionAvailable')
        'install_one'    = @('kind', 'id', 'source', 'version')
        'stop'           = @('kind')
    }
}

function Test-ExactNames {
    param($Object, [string[]]$Names)
    $have = @($Object.PSObject.Properties | ForEach-Object { $_.Name } | Sort-Object)
    $want = @($Names | Sort-Object)
    if ($have.Count -ne $want.Count) { return $false }
    for ($i = 0; $i -lt $have.Count; $i++) { if ($have[$i] -cne $want[$i]) { return $false } }
    return $true
}

# --- winget: where it is, and running it --------------------------------------------------------------------
# WHERE IT IS. winget.exe is part of the "App Installer" package. The helper asks Windows for that package's install
# folder (Get-AppxPackage, a system record) and uses the winget.exe that lives INSIDE it (the full path is resolved and
# its containment in that folder is checked; a link is refused). That folder (under Program Files\WindowsApps) can be
# changed only by an administrator or the system, so a program running as a normal user cannot put another winget.exe
# there. It is NOT looked up in the current folder and NOT searched in PATH. On top of that the file must carry a VALID
# Authenticode signature whose signer's organisation (read from the certificate's own name, see Read-DerElement) is exactly
# "Microsoft Corporation", with the code-signing purpose. If it cannot be found like this the helper does not run, and says why in the log.
#
# AN EXPLICIT PATH (setup -WingetPath): an absolute path to a file called winget.exe, with the same signature check. If
# it is NOT inside the App Installer folder, neither it nor any folder above it may be writable by the current user
# (checked on the access lists), because a folder you can write is a folder a program running as you can change. A
# person who accepts that risk passes setup's -AllowWritableWingetFolder, which is written in the log as a WARNING at
# every start.
#
# THE ALIAS (setup -UseWindowsAppsAlias): the per-user alias in %LOCALAPPDATA%\WindowsApps. It is a link in a folder
# you can write and cannot be signature-checked, so it is the weakest choice; it is for a computer where the install
# folder cannot be started directly, and the log says so at every start.
#
# THE GAP BETWEEN CHECKING AND STARTING. Just before each start the helper opens the file with a sharing mode that lets
# nobody else write to, replace or delete it, keeps that handle while it checks the signature again and starts the very
# same full path. What remains: PowerShell cannot hand an open file to Process.Start, so a program that can change the
# folder above (an administrator, or you with -AllowWritableWingetFolder) could still swap the directory between the
# check and the start. The alias is not covered at all.
# THE SIGNER'S NAME IS READ FROM THE CERTIFICATE'S OWN BYTES, never from the text Windows prints for it. A subject string
# is a display form (commas, quotes, escapes, "+", ";", hex, OID spellings) and every hand-made reader of it can be fooled.
# So: the subject's DER (SubjectName.RawData) is walked as the standard defines it, name -> relative names -> attribute
# type and value, and the helper requires exactly ONE attribute of type 2.5.4.10 (organisation) in the whole name, in a
# relative name of its own (no multi-valued "+" name anywhere), whose value is, character for character and with no
# trimming, "Microsoft Corporation"; and the certificate must carry the code-signing purpose (1.3.6.1.5.5.7.3.3).
function Read-DerElement {
    param([byte[]]$Bytes, [int]$Offset, [int]$End)
    if ($Offset + 2 -gt $End) { return $null }
    $tag = [int]$Bytes[$Offset]
    $first = [int]$Bytes[$Offset + 1]
    $position = $Offset + 2
    $length = 0
    if ($first -lt 128) { $length = $first }
    else {
        $count = $first -band 127
        if ($count -lt 1 -or $count -gt 3 -or ($position + $count) -gt $End) { return $null }
        # DER wants the shortest form: no leading zero length byte, and no long form for a length under 128.
        if ([int]$Bytes[$position] -eq 0) { return $null }
        if ($count -eq 1 -and [int]$Bytes[$position] -lt 128) { return $null }
        for ($i = 0; $i -lt $count; $i++) { $length = ($length * 256) + [int]$Bytes[$position + $i] }
        $position += $count
    }
    if (($position + $length) -gt $End) { return $null }
    return @{ Tag = $tag; Start = $position; Len = $length; Next = ($position + $length) }
}

function Get-DerSlice {
    param([byte[]]$Bytes, $Element)
    $slice = New-Object byte[] $Element.Len
    if ($Element.Len -gt 0) { [Array]::Copy($Bytes, $Element.Start, $slice, 0, $Element.Len) }
    return , $slice
}

# Returns @{ Ok; Organizations; MultiValued }. Ok is $false for anything that is not a well-formed name.
function Get-DistinguishedNameParts {
    param([byte[]]$Raw)
    $bad = @{ Ok = $false; Organizations = @(); MultiValued = $false }
    if ($null -eq $Raw -or $Raw.Length -lt 2) { return $bad }
    $top = Read-DerElement -Bytes $Raw -Offset 0 -End $Raw.Length
    if ($null -eq $top -or $top.Tag -ne 48 -or $top.Next -ne $Raw.Length) { return $bad }
    $orgs = New-Object System.Collections.ArrayList
    $multi = $false
    $at = $top.Start
    while ($at -lt $top.Next) {
        $set = Read-DerElement -Bytes $Raw -Offset $at -End $top.Next
        if ($null -eq $set -or $set.Tag -ne 49) { return $bad }
        $at = $set.Next
        $inner = $set.Start
        $count = 0
        while ($inner -lt $set.Next) {
            $seq = Read-DerElement -Bytes $Raw -Offset $inner -End $set.Next
            if ($null -eq $seq -or $seq.Tag -ne 48) { return $bad }
            $inner = $seq.Next
            $count++
            $oid = Read-DerElement -Bytes $Raw -Offset $seq.Start -End $seq.Next
            if ($null -eq $oid -or $oid.Tag -ne 6 -or $oid.Len -lt 1) { return $bad }
            $value = Read-DerElement -Bytes $Raw -Offset $oid.Next -End $seq.Next
            if ($null -eq $value -or $value.Next -ne $seq.Next) { return $bad }
            $oidHex = [BitConverter]::ToString((Get-DerSlice -Bytes $Raw -Element $oid)).Replace('-', '').ToLowerInvariant()
            if ($oidHex -ceq '55040a') {
                $valueBytes = Get-DerSlice -Bytes $Raw -Element $value
                $text = $null
                if (@(12, 19, 20, 22) -contains $value.Tag) { $text = [System.Text.Encoding]::UTF8.GetString($valueBytes) }
                elseif ($value.Tag -eq 30) { $text = [System.Text.Encoding]::BigEndianUnicode.GetString($valueBytes) }
                [void]$orgs.Add($text)
            }
        }
        if ($count -ne 1) { $multi = $true }
    }
    return @{ Ok = $true; Organizations = $orgs.ToArray(); MultiValued = $multi }
}

function Test-MicrosoftSignerCertificate {
    param($Certificate)
    try {
        if ($null -eq $Certificate) { return $false }
        $parts = Get-DistinguishedNameParts -Raw ([byte[]]$Certificate.SubjectName.RawData)
        if (-not $parts.Ok -or $parts.MultiValued) { return $false }
        $orgs = @($parts.Organizations)
        if ($orgs.Count -ne 1) { return $false }
        if (-not ($orgs[0] -ceq 'Microsoft Corporation')) { return $false }
        foreach ($extension in $Certificate.Extensions) {
            if ($extension.Oid.Value -ceq '2.5.29.37') {
                $usage = New-Object System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension($extension, $extension.Critical)
                foreach ($purpose in $usage.EnhancedKeyUsages) { if ($purpose.Value -ceq '1.3.6.1.5.5.7.3.3') { return $true } }
            }
        }
        return $false
    }
    catch { return $false }
}

function Test-MicrosoftSignature {
    param([string]$Path)
    try {
        $signature = Get-AuthenticodeSignature -LiteralPath $Path
        if ($signature.Status -ne 'Valid') { return $false }
        return (Test-MicrosoftSignerCertificate -Certificate $signature.SignerCertificate)
    }
    catch { return $false }
}

function Get-AppInstallerFolder {
    try {
        $package = Get-AppxPackage -Name 'Microsoft.DesktopAppInstaller' -ErrorAction Stop | Sort-Object Version -Descending | Select-Object -First 1
        if ($null -ne $package) { return [string]$package.InstallLocation }
    }
    catch { }
    return ''
}

function Test-PathInside {
    param([string]$Path, [string]$Folder)
    if ($Folder -eq '') { return $false }
    $full = [System.IO.Path]::GetFullPath($Path)
    $root = [System.IO.Path]::GetFullPath($Folder).TrimEnd('\') + '\'
    return $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)
}

function Test-ReparsePoint {
    param([string]$Path)
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if ($null -eq $item) { return $false }
    return (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)
}

# Whether an access rule of this folder lets the CURRENT user (in the groups the running token really uses: a
# non-elevated administrator's Administrators group is deny-only and does not count) write, replace or delete in it.
function Test-UserCanWriteFolder {
    param([string]$Folder)
    $mask = [System.Security.AccessControl.FileSystemRights]'WriteData, AppendData, Delete, DeleteSubdirectoriesAndFiles, ChangePermissions, TakeOwnership'
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
    $acl = Get-Acl -LiteralPath $Folder
    foreach ($rule in $acl.Access) {
        if ($rule.AccessControlType -ne 'Allow') { continue }
        if (($rule.FileSystemRights -band $mask) -eq 0) { continue }
        try { $sid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]) } catch { continue }
        if ($sid -eq $identity.User -or $principal.IsInRole($sid)) { return $true }
    }
    return $false
}

# The folder of the file and every folder above it.
function Test-WritableAlongPath {
    param([string]$File)
    $dir = Split-Path -Parent ([System.IO.Path]::GetFullPath($File))
    while ($dir -ne '' -and $null -ne $dir) {
        if ((Test-Path -LiteralPath $dir -PathType Container) -and (Test-UserCanWriteFolder -Folder $dir)) { return $true }
        $parent = Split-Path -Parent $dir
        if ($parent -eq $dir) { break }
        $dir = $parent
    }
    return $false
}

# Returns @{ Path; Why; Verify }. Verify says whether the signature is checked again at every start (all but the alias).
function Resolve-WingetPath {
    param([string]$ConfiguredPath = '', [bool]$UseAlias = $false, [bool]$AllowWritableFolder = $false)
    $result = @{ Path = ''; Why = ''; Verify = $true }
    if ($UseAlias) {
        $alias = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\winget.exe'
        if (Test-Path -LiteralPath $alias -PathType Leaf) {
            $result.Path = $alias
            $result.Verify = $false
            Write-HelperLog 'winget' 'WARNING: using the WindowsApps alias, as set up. It is a link in a folder the current user can write, and it is not signature-checked.'
            return $result
        }
        $result.Why = 'The WindowsApps alias of winget was not found.'
        return $result
    }
    $folder = Get-AppInstallerFolder
    $candidate = $ConfiguredPath
    if ($candidate -eq '') {
        if ($folder -eq '') { $result.Why = 'The App Installer package (which holds winget) is not installed for this user.'; return $result }
        $candidate = Join-Path $folder 'winget.exe'
    }
    if (-not [System.IO.Path]::IsPathRooted($candidate)) { $result.Why = 'The path of winget must be absolute.'; return $result }
    if ((Split-Path -Leaf $candidate) -ine 'winget.exe') { $result.Why = 'The file is not called winget.exe.'; return $result }
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { $result.Why = 'winget.exe was not found where it was expected.'; return $result }
    $full = [System.IO.Path]::GetFullPath($candidate)
    if (Test-ReparsePoint -Path $full) { $result.Why = 'winget.exe is a link, so it is not used.'; return $result }
    if (-not (Test-PathInside -Path $full -Folder $folder)) {
        if (Test-WritableAlongPath -File $full) {
            if (-not $AllowWritableFolder) {
                $result.Why = 'winget.exe is outside the App Installer folder and in a folder this user can write, so a program running as this user could replace it. Setup has -AllowWritableWingetFolder for a person who accepts that.'
                return $result
            }
            Write-HelperLog 'winget' 'WARNING: winget.exe is in a folder this user can write, as set up with -AllowWritableWingetFolder.'
        }
    }
    if (-not (Test-MicrosoftSignature -Path $full)) { $result.Why = 'winget.exe does not carry a valid Microsoft signature, so it is not used.'; return $result }
    $result.Path = $full
    return $result
}

# Runs winget.exe with an argument list from the table and reads what it prints, with hard limits. Returns
# @{ ExitCode; Text; TimedOut; TooMuch }. An argument is checked to be a plain literal token before it is joined.
function Invoke-WingetProcess {
    param([string]$WingetPath, [string[]]$ArgumentList, [int]$TimeoutSeconds, [int]$MaxChars)
    # Only an argument list that IS one of the table's, word for word, is ever run. Anything else is refused before a
    # process exists, whoever asked and however it was built.
    $wanted = ($ArgumentList -join ' ')
    $table = Get-ActionTable
    $allowed = $false
    foreach ($kind in $table.Keys) { if ($wanted -ceq ($table[$kind].Arguments -join ' ')) { $allowed = $true } }
    if (-not $allowed) { throw 'refused: that argument list is not in the table of actions' }
    if ((Split-Path -Leaf $WingetPath) -ine 'winget.exe') { throw 'refused: not winget.exe' }
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $WingetPath
    $info.Arguments = ($ArgumentList -join ' ')
    $info.UseShellExecute = $false
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardInput = $true
    $info.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $info.CreateNoWindow = $true
    $info.WorkingDirectory = [Environment]::GetFolderPath('UserProfile')
    $process = [System.Diagnostics.Process]::Start($info)
    $outcome = @{ ExitCode = $null; Text = ''; TimedOut = $false; TooMuch = $false }
    try {
        # Nobody answers a question winget might ask: end of input is "no".
        $process.StandardInput.Close()
        $builder = New-Object System.Text.StringBuilder
        $buffer = New-Object char[] 8192
        $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
        while ($true) {
            $task = $process.StandardOutput.ReadAsync($buffer, 0, $buffer.Length)
            $left = [int][Math]::Max(1, ($deadline - [DateTime]::UtcNow).TotalMilliseconds)
            if (-not $task.Wait($left)) { $outcome.TimedOut = $true; break }
            $count = $task.Result
            if ($count -le 0) { break }
            [void]$builder.Append($buffer, 0, $count)
            if ($builder.Length -gt $MaxChars) { $outcome.TooMuch = $true; break }
        }
        if ($outcome.TimedOut -or $outcome.TooMuch) {
            try { $process.Kill() } catch { }
        }
        else {
            $left = [int][Math]::Max(1, ($deadline - [DateTime]::UtcNow).TotalMilliseconds)
            if (-not $process.WaitForExit($left)) { $outcome.TimedOut = $true; try { $process.Kill() } catch { } }
        }
        if ($process.HasExited) { $outcome.ExitCode = [int]$process.ExitCode }
        $outcome.Text = $builder.ToString()
    }
    finally { $process.Dispose() }
    return $outcome
}

# --- Reading winget's table ---------------------------------------------------------------------------------
# winget's output is for people: spinner characters, a header in the person's language, padded columns, a footer.
# Nothing here trusts a column's NAME (Italian Windows prints other words). The columns' places come from the header
# line; a row whose cells do not sit on those places, or whose id or version cell does not look like one, is DROPPED
# and counted, never guessed at.
function Get-WingetLines {
    param([string]$Text)
    $lines = New-Object System.Collections.ArrayList
    foreach ($raw in ($Text -split "`n")) {
        $line = $raw.TrimEnd("`r")
        $cut = $line.LastIndexOf("`r")
        if ($cut -ge 0) { $line = $line.Substring($cut + 1) }
        if ($line -match '^\s*[\\|/-]\s*$') { $line = '' }
        if ($line -match '[\u2588\u2592\u2593\u2591]') { $line = '' }
        [void]$lines.Add($line)
    }
    return , $lines.ToArray()
}

# One text from outside: control, format (zero-width, bidirectional, tag characters), private-use and surrogate
# characters become spaces, whitespace is collapsed, the length is cut. (An emoji is a surrogate pair, so it goes too.)
function Get-SafeText {
    param([string]$Text, [int]$Max = 120)
    if ($null -eq $Text) { return '' }
    $clean = [regex]::Replace($Text, '[\p{Cc}\p{Cf}\p{Co}\p{Cs}\u2028\u2029]', ' ')
    $clean = [regex]::Replace($clean, '\s+', ' ').Trim()
    if ($clean.Length -gt $Max) { $clean = $clean.Substring(0, $Max) }
    return $clean
}

function ConvertFrom-WingetTable {
    param([string]$Text, [int]$MaxRows = 501)
    $lines = Get-WingetLines -Text $Text
    $result = @{ Found = $false; Header = @(); Rows = @(); Skipped = 0; More = $false }
    $at = -1
    for ($i = 1; $i -lt $lines.Length; $i++) {
        if ($lines[$i] -match '^-{3,}\s*$' -and $lines[$i - 1].Trim() -ne '') { $at = $i; break }
    }
    if ($at -lt 0) { return $result }
    $result.Found = $true
    $headerLine = $lines[$at - 1]
    $starts = @([regex]::Matches($headerLine, '\S+(?: \S+)*') | ForEach-Object { $_.Index })
    $result.Header = $starts
    if ($starts.Count -lt 3) { return $result }
    $rows = New-Object System.Collections.ArrayList
    for ($i = $at + 1; $i -lt $lines.Length; $i++) {
        $line = $lines[$i]
        if ($line.Trim() -eq '') { break }
        if ($rows.Count -ge $MaxRows) { $result.More = $true; break }
        $cells = New-Object System.Collections.ArrayList
        $good = $true
        for ($c = 0; $c -lt $starts.Count; $c++) {
            $from = $starts[$c]
            if ($c -gt 0 -and $line.Length -ge $from -and $line[$from - 1] -ne ' ') { $good = $false; break }
            $cell = ''
            if ($line.Length -gt $from) {
                if ($c + 1 -lt $starts.Count) { $to = [Math]::Min($starts[$c + 1], $line.Length) } else { $to = $line.Length }
                $cell = $line.Substring($from, $to - $from)
            }
            [void]$cells.Add($cell.Trim())
        }
        if (-not $good) { $result.Skipped++; continue }
        $cellArray = $cells.ToArray()
        $id = $cellArray[1]
        $version = ''
        if ($cellArray.Length -gt 2) { $version = $cellArray[2] }
        if ($id -eq '' -or $id.Length -gt $script:MaxIdLength -or $id -match '\s') { $result.Skipped++; continue }
        if ($version -ne '' -and $version -notmatch '^([<>] )?\S{1,100}$') { $result.Skipped++; continue }
        [void]$rows.Add($cellArray)
    }
    $result.Rows = $rows.ToArray()
    return $result
}

$script:KnownSources = @('winget', 'msstore')

# Turns the table into rows of the wire's shape. $Kind decides how the columns are named: by their ORDER, which is
# fixed (Name, Id, Version, then Available and Source when present).
function ConvertTo-ProgramRows {
    param([string]$Kind, $Table)
    if (-not $Table.Found) { return @{ Ok = $true; Rows = @(); Skipped = 0; More = $false; Why = '' } }
    $n = $Table.Header.Count
    $rows = New-Object System.Collections.ArrayList
    $mode = ''
    if ($Kind -eq 'list_installed') {
        if ($n -eq 3) { $mode = 'three' }
        elseif ($n -eq 5) { $mode = 'five' }
        elseif ($n -eq 4) {
            $last = @($Table.Rows | ForEach-Object { $_[3] })
            $filled = @($last | Where-Object { $_ -ne '' })
            $others = @($filled | Where-Object { $script:KnownSources -notcontains $_ })
            if ($filled.Count -gt 0 -and $others.Count -eq 0) { $mode = 'four-source' } else { $mode = 'four-available' }
        }
    }
    elseif ($Kind -eq 'list_updates') {
        if ($n -eq 5) { $mode = 'five' }
        elseif ($n -eq 4) { $mode = 'four-available' }
    }
    if ($mode -eq '') { return @{ Ok = $false; Rows = @(); Skipped = 0; More = $false; Why = "The table has $n columns, which this helper does not understand." } }
    foreach ($cells in $Table.Rows) {
        $name = Get-SafeText $cells[0]
        $id = Get-SafeText $cells[1]
        $version = Get-SafeText $cells[2]
        $available = ''
        $source = ''
        if ($mode -eq 'five') { $available = Get-SafeText $cells[3]; $source = Get-SafeText $cells[4] }
        elseif ($mode -eq 'four-source') { $source = Get-SafeText $cells[3] }
        elseif ($mode -eq 'four-available') { $available = Get-SafeText $cells[3] }
        if ($Kind -eq 'list_installed') {
            [void]$rows.Add(@{ name = $name; id = $id; version = $version; source = $source })
        }
        else {
            [void]$rows.Add(@{ name = $name; id = $id; versionNow = $version; versionAvailable = $available; source = $source })
        }
    }
    return @{ Ok = $true; Rows = $rows.ToArray(); Skipped = $Table.Skipped; More = $Table.More; Why = '' }
}

# --- JSON of the answer: written by hand, so the exact text that is signed is the exact text that is sent -------
function ConvertTo-JsonString {
    param([string]$Text)
    $builder = New-Object System.Text.StringBuilder
    [void]$builder.Append('"')
    foreach ($ch in $Text.ToCharArray()) {
        $code = [int]$ch
        if ($ch -eq '"') { [void]$builder.Append('\"') }
        elseif ($ch -eq '\') { [void]$builder.Append('\\') }
        elseif ($code -lt 32 -or $code -gt 126) { [void]$builder.Append('\u' + $code.ToString('x4')) }
        else { [void]$builder.Append($ch) }
    }
    [void]$builder.Append('"')
    return $builder.ToString()
}

function ConvertTo-AnswerPayload {
    param([string]$Kind, $Rows)
    $keys = @('name', 'id', 'version', 'source')
    if ($Kind -eq 'list_updates') { $keys = @('name', 'id', 'versionNow', 'versionAvailable', 'source') }
    $items = New-Object System.Collections.ArrayList
    foreach ($row in $Rows) {
        $parts = @($keys | ForEach-Object { (ConvertTo-JsonString $_) + ':' + (ConvertTo-JsonString ([string]$row[$_])) })
        [void]$items.Add('{' + ($parts -join ',') + '}')
    }
    return ('{"items":[' + ($items.ToArray() -join ',') + ']}')
}

function ConvertTo-ErrorPayload {
    param([string]$Message)
    return ('{"error":' + (ConvertTo-JsonString (Get-SafeText $Message 180)) + '}')
}

function Get-ExitCodeText {
    param($Code)
    if ($null -eq $Code) { return 'none' }
    return ('0x{0:X8}' -f [uint32]([int]$Code -band 0xFFFFFFFFL))
}

# --- One operation, from the signed text to the answer -------------------------------------------------------
function Send-ToastNotification {
    param([string]$Text)
        [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
        [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
        $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText01)
        $template.GetElementsByTagName('text').Item(0).AppendChild($template.CreateTextNode($Text)) | Out-Null
        $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
        $toast = New-Object Windows.UI.Notifications.ToastNotification -ArgumentList $template
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
}

function Show-HelperToast {
    param([string]$Text)
    try { Send-ToastNotification -Text $Text }
    catch {
        # Best effort: a toast that cannot be shown must not fail the operation, and the person can read this.
        Write-HelperLog 'toast' ("could not be shown: " + $_.Exception.Message)
    }
}

# Checks a polled operation. Returns @{ Ok = $true; Kind } or @{ Ok = $false; Why; Report } where Report says whether
# an answer is sent back (only for an operation whose signature proved itself).
function Test-Operation {
    param($Operation, [byte[]]$Secret, [string]$ActorId, [long]$Now, $Seen)
    if ($null -eq $Operation -or $Operation -isnot [System.Management.Automation.PSCustomObject]) { return @{ Ok = $false; Why = 'not an object'; Report = $false } }
    $top = @('v', 'operationId', 'actorId', 'botId', 'action', 'issuedAt', 'expiresAt', 'mac')
    if (-not (Test-ExactNames $Operation $top)) { return @{ Ok = $false; Why = 'wrong fields'; Report = $false } }
    if ($Operation.operationId -isnot [string] -or $Operation.operationId -cnotmatch '^[A-Za-z0-9_.:-]{1,200}\z') { return @{ Ok = $false; Why = 'bad operationId'; Report = $false } }
    foreach ($name in 'operationId', 'actorId', 'botId', 'mac') {
        if ($Operation.$name -isnot [string] -or $Operation.$name.Length -lt 1 -or $Operation.$name.Length -gt 200) { return @{ Ok = $false; Why = "bad $name"; Report = $false } }
    }
    if ($Operation.action -isnot [System.Management.Automation.PSCustomObject]) { return @{ Ok = $false; Why = 'action is not an object'; Report = $false } }
    $kind = $Operation.action.kind
    $known = Get-KnownKinds
    if ($kind -isnot [string] -or $kind -cnotmatch '^[a-z_]{1,32}\z' -or -not $known.ContainsKey($kind)) { return @{ Ok = $false; Why = 'unknown action'; Report = $false } }
    if (-not (Test-ExactNames $Operation.action $known[$kind])) { return @{ Ok = $false; Why = 'wrong fields in the action'; Report = $false } }
    foreach ($property in $Operation.action.PSObject.Properties) {
        if ($property.Value -isnot [string] -or $property.Value.Length -gt 200 -or $property.Value -match '[\p{Cc}\p{Cf}\p{Co}\p{Cs}\u2028\u2029]') { return @{ Ok = $false; Why = 'bad field in the action'; Report = $false } }
    }
    try { $issued = [long]$Operation.issuedAt; $expires = [long]$Operation.expiresAt } catch { return @{ Ok = $false; Why = 'bad times'; Report = $false } }
    if ($Operation.v -ne 1) { return @{ Ok = $false; Why = 'unknown version'; Report = $false } }
    $expected = Get-HmacHex -Key $Secret -Text (Get-OperationText $Operation)
    if (-not (Test-SameMac $Operation.mac $expected)) { return @{ Ok = $false; Why = 'signature does not match'; Report = $false } }
    if ($Operation.actorId -cne $ActorId) { return @{ Ok = $false; Why = 'for another person'; Report = $false } }
    if ($Now -ge $expires) { return @{ Ok = $false; Why = 'expired'; Report = $false } }
    if ($Seen.Contains($Operation.operationId)) { return @{ Ok = $false; Why = 'seen before'; Report = $false } }
    [void]$Seen.Add($Operation.operationId)
    return @{ Ok = $true; Kind = $kind }
}

# Carries out one operation that Test-Operation passed. Returns @{ Ok; Payload } (or $null for a stop).
function Invoke-Operation {
    param([string]$Kind, [string]$WingetPath, [bool]$Verify = $true)
    if ($Kind -eq 'stop') { Write-HelperLog 'stop' 'nothing is running, so nothing was stopped'; return $null }
    $table = Get-ActionTable
    if (-not $table.ContainsKey($Kind)) {
        Write-HelperLog 'refused' "action '$Kind' is not supported by this version of the helper"
        return @{ Ok = $false; Payload = (ConvertTo-ErrorPayload 'This version of the helper only reads. It cannot do that.') }
    }
    if ($WingetPath -eq '') {
        Write-HelperLog 'failed' 'winget.exe was not found (see the start line of this log for why)'
        return @{ Ok = $false; Payload = (ConvertTo-ErrorPayload 'winget was not found on this computer, so I could not look.') }
    }
    $entry = $table[$Kind]
    $lock = $null
    try {
        # Nobody may write to, replace or delete the file while it is checked and started (see the note on the gap above).
        try { $lock = [System.IO.File]::Open($WingetPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read) }
        catch {
            Write-HelperLog 'failed' ('winget.exe could not be opened for the check: ' + $_.Exception.Message)
            return @{ Ok = $false; Payload = (ConvertTo-ErrorPayload 'winget could not be checked before it was started.') }
        }
        if ($Verify -and -not (Test-MicrosoftSignature -Path $WingetPath)) {
            Write-HelperLog 'refused' 'winget.exe no longer carries a valid Microsoft signature, so it was not started'
            return @{ Ok = $false; Payload = (ConvertTo-ErrorPayload 'winget no longer passes the signature check, so I did not start it.') }
        }
        return (Invoke-OperationChecked -Kind $Kind -Entry $entry -WingetPath $WingetPath)
    }
    finally { if ($null -ne $lock) { $lock.Dispose() } }
}

function Invoke-OperationChecked {
    param([string]$Kind, $Entry, [string]$WingetPath)
    $entry = $Entry
    Show-HelperToast -Text $entry.Toast
    Write-HelperLog 'run' ("{0} {1}" -f $WingetPath, ($entry.Arguments -join ' '))
    try {
        $run = Invoke-WingetProcess -WingetPath $WingetPath -ArgumentList $entry.Arguments -TimeoutSeconds $script:OperationTimeoutSeconds -MaxChars $script:MaxOutputChars
    }
    catch {
        Write-HelperLog 'failed' $_.Exception.Message
        return @{ Ok = $false; Payload = (ConvertTo-ErrorPayload 'winget could not be started.') }
    }
    Write-HelperLog 'done' ("exit code {0}; timed out: {1}; too much output: {2}" -f (Get-ExitCodeText $run.ExitCode), $run.TimedOut, $run.TooMuch)
    if ($run.TimedOut) { return @{ Ok = $false; Payload = (ConvertTo-ErrorPayload 'winget took too long, so it was stopped.') } }
    if ($run.TooMuch) { return @{ Ok = $false; Payload = (ConvertTo-ErrorPayload 'winget printed far more than expected, so it was stopped.') } }
    if ($run.Text -match '(?i)agreement|accordo|termini|conditions') {
        if ($null -ne $run.ExitCode -and $run.ExitCode -ne 0) {
            return @{ Ok = $false; Payload = (ConvertTo-ErrorPayload 'winget wants you to accept its source terms first. Run winget list once in a terminal, read the terms and answer yourself.') }
        }
    }
    $table = ConvertFrom-WingetTable -Text $run.Text -MaxRows $script:MaxRows
    if (-not $table.Found -and $null -ne $run.ExitCode -and $run.ExitCode -ne 0 -and $run.ExitCode -ne $script:ExitNoApplications) {
        return @{ Ok = $false; Payload = (ConvertTo-ErrorPayload ("winget failed with exit code " + (Get-ExitCodeText $run.ExitCode) + ".")) }
    }
    $rows = ConvertTo-ProgramRows -Kind $Kind -Table $table
    if (-not $rows.Ok) { return @{ Ok = $false; Payload = (ConvertTo-ErrorPayload $rows.Why) } }
    if ($rows.Skipped -gt 0) { Write-HelperLog 'parse' ("{0} row(s) did not look like a program and were left out" -f $rows.Skipped) }
    return @{ Ok = $true; Payload = (ConvertTo-AnswerPayload -Kind $Kind -Rows $rows.Rows) }
}

# --- Talking to the server ----------------------------------------------------------------------------------
# The status code of a failed web call, or 0. Windows PowerShell 5.1 puts it on Exception.Response.
function Get-HttpStatusFromError {
    param($ErrorRecord)
    try { return [int]$ErrorRecord.Exception.Response.StatusCode } catch { return 0 }
}

function Send-SignedPost {
    param([string]$ServerUrl, [string]$Path, [hashtable]$Body)
    $json = ($Body | ConvertTo-Json -Compress -Depth 4)
    try {
        $response = Invoke-RestMethod -Uri ($ServerUrl.TrimEnd('/') + $Path) -Method Post -ContentType 'application/json; charset=utf-8' `
            -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 30 -UseBasicParsing
    }
    catch {
        # A refused signature is told apart from every other failure: the helper acts on it (see Invoke-HelperMain).
        if ((Get-HttpStatusFromError $_) -eq 401) { throw (New-Object System.UnauthorizedAccessException('the server refused the helper (HTTP 401)')) }
        throw
    }
    return $response
}

# The address the pairing code and every poll go to. By default only this computer (http or https on localhost,
# 127.0.0.1 or [::1]). Any other host needs -AllowRemote (setup's -AllowRemoteServer) AND https: never plain http to
# another host, and certificate checking is never switched off anywhere in these scripts.
function Test-ServerUrl {
    param([string]$Url, [bool]$AllowRemote = $false)
    $uri = $null
    if (-not [Uri]::TryCreate($Url, [UriKind]::Absolute, [ref]$uri)) { return $false }
    if ($uri.Scheme -ne 'http' -and $uri.Scheme -ne 'https') { return $false }
    if ($uri.UserInfo -ne '') { return $false }
    $name = $uri.Host.Trim('[', ']')
    if ($name -ieq 'localhost') { return $true }
    $ip = $null
    if ([System.Net.IPAddress]::TryParse($name, [ref]$ip) -and [System.Net.IPAddress]::IsLoopback($ip)) { return $true }
    return ($AllowRemote -and $uri.Scheme -eq 'https')
}

# --- Operation ids already seen, kept on disk ----------------------------------------------------------------
# One line per id: "<id> <expiry in ms>". An id is remembered until its expiry plus ten minutes and at most 500 are
# kept, so a restart of the helper does not reopen a window for an operation that was already carried out.
function Get-SeenFile {
    param([string]$Directory)
    return (Join-Path $Directory 'seen.txt')
}

# Reads at most $script:MaxSeenFileBytes. A file larger than that, or one that cannot be read, THROWS: the helper then does
# not start (fail closed), because without the list of what was already done it could carry an old operation out twice.
function Read-SeenIds {
    param([string]$Directory, [long]$Now)
    $set = New-Object 'System.Collections.Generic.HashSet[string]'
    $file = Get-SeenFile -Directory $Directory
    if (-not (Test-Path -LiteralPath $file)) { return , $set }
    $stream = [System.IO.File]::Open($file, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    try {
        $buffer = New-Object byte[] ($script:MaxSeenFileBytes + 1)
        $total = 0
        while ($total -lt $buffer.Length) {
            $n = $stream.Read($buffer, $total, $buffer.Length - $total)
            if ($n -le 0) { break }
            $total += $n
        }
    }
    finally { $stream.Dispose() }
    if ($total -gt $script:MaxSeenFileBytes) { throw ('seen.txt is larger than {0} bytes' -f $script:MaxSeenFileBytes) }
    $text = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $total).TrimStart([char]0xFEFF)
    $keep = New-Object System.Collections.ArrayList
    foreach ($line in @($text -split "`r?`n")) {
        if ($line -cmatch '^([A-Za-z0-9_.:-]{1,200}) (\d{1,16})$') {
            if ([long]$Matches[2] + $script:SeenKeepMilliseconds -gt $Now) { [void]$keep.Add($line); [void]$set.Add($Matches[1]) }
        }
    }
    $lines = $keep.ToArray()
    if ($lines.Count -gt $script:MaxSeenIds) {
        $lines = $lines[($lines.Count - $script:MaxSeenIds)..($lines.Count - 1)]
        $set.Clear()
        foreach ($line in $lines) { [void]$set.Add(($line -split ' ')[0]) }
    }
    try { Set-Content -LiteralPath $file -Value $lines -Encoding UTF8 } catch { Write-HelperLog 'seen' ('could not be pruned: ' + $_.Exception.Message) }
    return , $set
}

# Returns $true when the id is on disk. $false means it is NOT (disk full, file locked): the caller must then not carry the
# operation out, because a restart would no longer know it had been done.
function Add-SeenId {
    param([string]$Directory, [string]$Id, [long]$ExpiresAt)
    try {
        Add-Content -LiteralPath (Get-SeenFile -Directory $Directory) -Value ('{0} {1}' -f $Id, $ExpiresAt) -Encoding UTF8 -ErrorAction Stop
        return $true
    }
    catch {
        Write-HelperLog 'seen' ('could not be saved: ' + $_.Exception.Message)
        return $false
    }
}

# One poll and what follows from it. Returns the number of operations handled.
function Invoke-HelperCycle {
    param($Config, [byte[]]$Secret, $Seen, [string]$WingetPath, [bool]$VerifyWinget = $true)
    $ts = Get-NowMilliseconds
    $nonce = [guid]::NewGuid().ToString('N')
    $mac = Get-HmacHex -Key $Secret -Text (Get-PollText -ActorId $Config.actorId -Ts $ts -Nonce $nonce)
    $reply = Send-SignedPost -ServerUrl $Config.serverUrl -Path '/api/programs/helper/poll' -Body @{ actorId = $Config.actorId; ts = $ts; nonce = $nonce; mac = $mac }
    $handled = 0
    $operations = @()
    if ($null -ne $reply -and $null -ne $reply.operations) { $operations = @($reply.operations) }
    foreach ($operation in $operations) {
        $checked = Test-Operation -Operation $operation -Secret $Secret -ActorId $Config.actorId -Now (Get-NowMilliseconds) -Seen $Seen
        if (-not $checked.Ok) {
            Write-HelperLog 'dropped' ("an operation was not carried out: " + $checked.Why)
            continue
        }
        # Written down BEFORE it is carried out, so that a crash in the middle cannot let it run twice. When it cannot be
        # written down, it is NOT carried out: a restart would not know it had been done. The server is told so.
        $saved = Add-SeenId -Directory (Get-HelperDirectory) -Id ([string]$operation.operationId) -ExpiresAt ([long]$operation.expiresAt)
        if (-not $saved) {
            Write-HelperLog 'refused' ("operation {0} was not carried out: its id could not be written down" -f $operation.operationId)
            $answer = @{ Ok = $false; Payload = (ConvertTo-ErrorPayload 'The helper could not write this request down on your computer (disk full or file locked), so it did not run it.') }
        }
        else {
            Write-HelperLog 'asked' ("{0} (operation {1})" -f $checked.Kind, $operation.operationId)
            $answer = Invoke-Operation -Kind $checked.Kind -WingetPath $WingetPath -Verify $VerifyWinget
            $handled++
        }
        if ($null -eq $answer) { continue }
        $rts = Get-NowMilliseconds
        $rnonce = [guid]::NewGuid().ToString('N')
        $text = Get-ResultText -OperationId $operation.operationId -ActorId $Config.actorId -Ts $rts -Nonce $rnonce -Ok ([bool]$answer.Ok) -Payload $answer.Payload
        $rmac = Get-HmacHex -Key $Secret -Text $text
        try {
            [void](Send-SignedPost -ServerUrl $Config.serverUrl -Path '/api/programs/helper/result' -Body @{
                    actorId = $Config.actorId; operationId = [string]$operation.operationId; ts = $rts; nonce = $rnonce
                    ok = [bool]$answer.Ok; payload = $answer.Payload; mac = $rmac
                })
        }
        catch { Write-HelperLog 'result' ("the answer could not be delivered: " + $_.Exception.Message) }
    }
    return $handled
}

# --- Start up -----------------------------------------------------------------------------------------------
function Get-HelperSecretBytes {
    param([string]$Directory)
    Add-Type -AssemblyName System.Security
    $protected = [System.IO.File]::ReadAllBytes((Join-Path $Directory 'secret.bin'))
    $entropy = [System.Text.Encoding]::UTF8.GetBytes('FreeDuetProgramsHelper-v1')
    return , ([System.Security.Cryptography.ProtectedData]::Unprotect($protected, $entropy, [System.Security.Cryptography.DataProtectionScope]::CurrentUser))
}

function Read-HelperConfig {
    param([string]$Directory)
    $config = Get-Content -LiteralPath (Join-Path $Directory 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($config.actorId -isnot [string] -or $config.actorId -eq '') { throw 'config.json has no actorId' }
    if (-not (Test-ServerUrl -Url ([string]$config.serverUrl) -AllowRemote ([bool]$config.allowRemoteServer))) { throw 'config.json has a server address that is not allowed' }
    return $config
}

# --- The running helper, found by what IT wrote, never by a name ----------------------------------------------
# helper.pid holds "<process id> <start time in ticks>", written by the helper itself into its private folder. Setup
# ends exactly that process, and only if a process with that id still has that start time (so a reused id is left alone).
function Get-PidFile {
    param([string]$Directory)
    return (Join-Path $Directory 'helper.pid')
}

function Write-PidFile {
    param([string]$Directory)
    $me = [System.Diagnostics.Process]::GetCurrentProcess()
    Set-Content -LiteralPath (Get-PidFile -Directory $Directory) -Value ('{0} {1}' -f $me.Id, $me.StartTime.ToUniversalTime().Ticks) -Encoding ASCII
}

# Returns 'none' (no record), 'gone' (the process is not there), 'other' (the id belongs to a different process now) or 'stopped'.
function Stop-HelperProcess {
    param([string]$Directory)
    $file = Get-PidFile -Directory $Directory
    if (-not (Test-Path -LiteralPath $file)) { return 'none' }
    $text = ((Get-Content -LiteralPath $file -Raw -Encoding ASCII) + '').Trim()
    Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue
    if ($text -notmatch '^(\d{1,10}) (\d{1,20})$') { return 'none' }
    $process = Get-Process -Id ([int]$Matches[1]) -ErrorAction SilentlyContinue
    if ($null -eq $process) { return 'gone' }
    try {
        if ($process.StartTime.ToUniversalTime().Ticks -ne [long]$Matches[2]) { return 'other' }
        $process.Kill()
        [void]$process.WaitForExit(10000)
    }
    catch { return 'other' }
    return 'stopped'
}

# The state machine for a refused secret (HTTP 401). Returns 'continue', 'reread' (read the secret from disk once) or 'stop'.
function Get-RefusalAction {
    param([int]$Refusals, [bool]$RereadDone)
    if ($Refusals -lt $script:RefusalsBeforeAction) { return 'continue' }
    if (-not $RereadDone) { return 'reread' }
    return 'stop'
}

# The exit status: 0 stopped normally, 2 refused (elevated), 3 not set up or cannot start, 4 the secret was refused for good.
function Invoke-HelperMain {
    param([int]$MaxCycles = 0)
    if (Test-Elevated) {
        $message = 'The FreeDuet programs helper refuses to run as administrator. Run it as yourself.'
        Write-HelperLog 'refused' $message
        Write-Host $message
        return 2
    }
    $created = $false
    $mutex = New-Object System.Threading.Mutex($true, 'Local\FreeDuetProgramsHelper', [ref]$created)
    if (-not $created) { $mutex.Dispose(); Write-HelperLog 'start' 'another copy is already running'; return 0 }
    $directory = Get-HelperDirectory
    try {
        try {
            $config = Read-HelperConfig -Directory $directory
            $secret = Get-HelperSecretBytes -Directory $directory
        }
        catch { Write-HelperLog 'start' ("not set up: " + $_.Exception.Message); return 3 }
        $allowWritable = [bool]$config.allowWritableWingetFolder
        $found = Resolve-WingetPath -ConfiguredPath ([string]$config.wingetPath) -UseAlias ([bool]$config.useAlias) -AllowWritableFolder $allowWritable
        if ([bool]$config.allowRemoteServer) { Write-HelperLog 'start' ('WARNING: the server is a remote host, as set up with -AllowRemoteServer: ' + ([Uri]$config.serverUrl).Host) }
        Write-HelperLog 'start' ("helper started; server {0}; winget: {1}" -f $config.serverUrl, $(if ($found.Path -ne '') { $found.Path } else { 'NOT FOUND - ' + $found.Why }))
        try { Write-PidFile -Directory $directory } catch { Write-HelperLog 'start' ('could not write the process record: ' + $_.Exception.Message) }
        try { $seen = Read-SeenIds -Directory $directory -Now (Get-NowMilliseconds) }
        catch {
            Write-HelperLog 'start' ('cannot start: the list of operations already done could not be read safely (' + $_.Exception.Message + '). Move or delete seen.txt yourself, then start again.')
            Show-HelperToast -Text 'FreeDuet programs helper cannot start: its file seen.txt is too large or unreadable. Move or delete that file, then start the task again.'
            return 3
        }
        $cycles = 0
        $quiet = 0
        $refusals = 0
        $rereadDone = $false
        while ($true) {
            $failed = $false
            try {
                if ($found.Path -eq '') { $found = Resolve-WingetPath -ConfiguredPath ([string]$config.wingetPath) -UseAlias ([bool]$config.useAlias) -AllowWritableFolder $allowWritable }
                [void](Invoke-HelperCycle -Config $config -Secret $secret -Seen $seen -WingetPath $found.Path -VerifyWinget ([bool]$found.Verify))
                $quiet = 0
                $refusals = 0
                $rereadDone = $false
            }
            catch {
                $failed = $true
                $quiet++
                if ($_.Exception -is [System.UnauthorizedAccessException]) {
                    $refusals++
                    $action = Get-RefusalAction -Refusals $refusals -RereadDone $rereadDone
                    if ($action -eq 'reread') {
                        $rereadDone = $true
                        $refusals = 0
                        $changed = $false
                        try {
                            $fresh = Get-HelperSecretBytes -Directory $directory
                            if ((ConvertTo-Hex $fresh) -ne (ConvertTo-Hex $secret)) { $secret = $fresh; $changed = $true }
                        }
                        catch { Write-HelperLog 'poll' ('the secret could not be read again: ' + $_.Exception.Message) }
                        Write-HelperLog 'poll' ("the server refused the secret {0} times; it was read from disk again ({1})" -f $script:RefusalsBeforeAction, $(if ($changed) { 'it had changed, trying the new one' } else { 'unchanged' }))
                    }
                    elseif ($action -eq 'stop') {
                        Write-HelperLog 'stopped' 'The server keeps refusing this helper (the pairing is old, or this PC clock is more than 30 seconds off). Polling has stopped. Run setup.ps1 again with a new code.'
                        Show-HelperToast -Text 'FreeDuet programs helper stopped: pair again (run setup.ps1 with a new code).'
                        return 4
                    }
                }
                else {
                    $refusals = 0
                    if ($quiet -le 3 -or ($quiet % 30) -eq 0) { Write-HelperLog 'poll' ("failed: " + $_.Exception.Message) }
                }
            }
            $cycles++
            if ($MaxCycles -gt 0 -and $cycles -ge $MaxCycles) { break }
            if ($failed) { Start-Sleep -Seconds 15 } else { Start-Sleep -Seconds $script:PollSeconds }
        }
        return 0
    }
    finally {
        # Only a record this process wrote is removed.
        try {
            $file = Get-PidFile -Directory $directory
            if (Test-Path -LiteralPath $file) {
                $mine = [System.Diagnostics.Process]::GetCurrentProcess().Id
                if (((Get-Content -LiteralPath $file -Raw -Encoding ASCII) + '').Trim() -like "$mine *") { Remove-Item -LiteralPath $file -Force }
            }
        }
        catch { }
        $mutex.ReleaseMutex(); $mutex.Dispose()
    }
}

# Dot-sourcing (as the tests do) runs nothing below this line.
if ($MyInvocation.InvocationName -ne '.') {
    exit (Invoke-HelperMain)
}
