param([Parameter(Mandatory=$true)][string]$Wave)
$ErrorActionPreference='Stop'
$taskPlayer=New-Object System.Media.SoundPlayer
try {$taskPlayer.SoundLocation=$Wave;$taskPlayer.Load();$taskPlayer.PlaySync()} finally {$taskPlayer.Dispose()}
