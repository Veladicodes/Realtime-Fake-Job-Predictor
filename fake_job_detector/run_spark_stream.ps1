$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

function Fail-AndExit {
    param([string]$Message)
    Write-Error $Message
    exit 1
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Fail-AndExit "Python is not available on PATH. Install Python and ensure 'python' is executable."
}

$javaHome = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { "C:\Program Files\Java\jdk-17.0.18" }
if (-not (Test-Path $javaHome)) {
    Fail-AndExit "JAVA_HOME is invalid: $javaHome. Set JAVA_HOME to your JDK installation path."
}
$env:JAVA_HOME = $javaHome

$hadoopHome = "D:\hadoop"
$env:HADOOP_HOME = $hadoopHome
Set-Item -Path Env:hadoop.home.dir -Value $hadoopHome

$hadoopBin = Join-Path $hadoopHome "bin"
if (-not (Test-Path $hadoopBin)) {
    New-Item -ItemType Directory -Path $hadoopBin -Force | Out-Null
    Write-Host "[INFO] Created missing directory: $hadoopBin"
}

$winutilsPath = Join-Path $hadoopBin "winutils.exe"
$hadoopDllPath = Join-Path $hadoopBin "hadoop.dll"

if (-not (Test-Path $winutilsPath)) {
    Fail-AndExit "Missing $winutilsPath. Place official Hadoop Windows binaries in $hadoopBin, then rerun."
}
if (-not (Test-Path $hadoopDllPath)) {
    Fail-AndExit "Missing $hadoopDllPath. Place official Hadoop Windows binaries in $hadoopBin, then rerun."
}

$pathPrefix = @("$javaHome\bin", "$hadoopHome\bin")
$currentPath = $env:Path -split ';'
$missingPrefixes = @()
foreach ($entry in $pathPrefix) {
    if ($currentPath -notcontains $entry) {
        $missingPrefixes += $entry
    }
}
if ($missingPrefixes.Count -gt 0) {
    $env:Path = ($missingPrefixes -join ';') + ';' + $env:Path
}

$versionInfo = python -c "import re,pyspark; v=pyspark.__version__; nums=[int(x) for x in re.findall(r'\d+', v)[:3]]+[0,0,0]; major,minor,patch=nums[:3]; scala='2.13' if major>=4 else '2.12' if major==3 else 'unsupported'; pkg=f'org.apache.spark:spark-sql-kafka-0-10_{scala}:{major}.{minor}.0' if major>=4 else (f'org.apache.spark:spark-sql-kafka-0-10_{scala}:{major}.{minor}.{patch}' if major==3 else ''); print(v); print(scala); print(pkg)"
$versionLines = $versionInfo | Where-Object { $_.Trim().Length -gt 0 }

if ($versionLines.Count -lt 3) {
    Fail-AndExit "Could not detect PySpark runtime details. Ensure pyspark is installed in this Python environment."
}

$sparkVersion = $versionLines[0].Trim()
$scalaVersion = $versionLines[1].Trim()
$kafkaPackage = $versionLines[2].Trim()

if ($scalaVersion -eq "unsupported" -or [string]::IsNullOrWhiteSpace($kafkaPackage)) {
    Fail-AndExit "Unsupported Spark version detected: $sparkVersion"
}

$env:SPARK_RUNTIME_VERSION = $sparkVersion
$env:SPARK_SCALA_BINARY_VERSION = $scalaVersion
$env:SPARK_KAFKA_PACKAGE = $kafkaPackage

Write-Host "Spark version: $sparkVersion"
Write-Host "Scala version: $scalaVersion"
Write-Host "Kafka package: $kafkaPackage"
Write-Host "Starting Spark stream processor..."

python .\spark\spark_stream.py
