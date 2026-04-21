# Tar bort ReadOnly-attributet från alla filer i projektet.
#
# OneDrive (och särskilt Files-On-Demand) sätter ReadOnly på nya filer. node-tar
# som EAS Build använder för att packa upp projektet översätter ReadOnly →
# Linux-mode 0444/0555, vilket gör att bygg-servern får "Permission denied"
# när den försöker skriva till mappar under src/. Körs automatiskt innan varje
# EAS-bygge via npm-scripten `build:*`.
#
# Kör manuellt: `npm run strip-readonly`

$ErrorActionPreference = "SilentlyContinue"
$count = 0
Get-ChildItem -Recurse -Force -Path . |
  Where-Object { $_.Attributes -band [IO.FileAttributes]::ReadOnly } |
  ForEach-Object {
    try {
      $_.Attributes = $_.Attributes -bxor [IO.FileAttributes]::ReadOnly
      $count++
    } catch { }
  }
Write-Host "strip-readonly: rensade $count objekt"
