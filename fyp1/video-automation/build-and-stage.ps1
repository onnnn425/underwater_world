param(
  [string]$Profile = "underwater-fyp1",
  [string]$Region = "ap-southeast-5",
  [string]$CodeBucket = "underwater-demo",
  [string]$AwsCli = "C:\Users\onn\AppData\Local\Programs\Amazon\AWSCLIV2\aws.exe"
)

$ErrorActionPreference = "Stop"
$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$buildDirectory = Join-Path $projectDirectory ".build"
$releaseId = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")

New-Item -ItemType Directory -Force -Path $buildDirectory | Out-Null

$packages = @(
  @{ Name = "processor"; Directory = Join-Path $projectDirectory "functions\processor" },
  @{ Name = "finalizer"; Directory = Join-Path $projectDirectory "functions\finalizer" },
  @{ Name = "catalog"; Directory = Join-Path $projectDirectory "functions\catalog" },
  @{ Name = "cleanup"; Directory = Join-Path $projectDirectory "functions\cleanup" }
)

$codeKeys = @{}
foreach ($package in $packages) {
  $zipPath = Join-Path $buildDirectory "$($package.Name)-$releaseId.zip"
  Compress-Archive -Path (Join-Path $package.Directory "*") -DestinationPath $zipPath -Force
  $key = "automation/code/$releaseId/$($package.Name).zip"
  & $AwsCli s3 cp $zipPath "s3://$CodeBucket/$key" --region $Region --profile $Profile --only-show-errors
  if ($LASTEXITCODE -ne 0) { throw "Failed to upload $($package.Name) Lambda package." }
  $codeKeys[$package.Name] = $key
}

$parameters = @(
  @{ ParameterKey = "SourceBucketName"; ParameterValue = "underwater-demo" },
  @{ ParameterKey = "OutputBucketName"; ParameterValue = "underwater-demo-hls-output-2206078" },
  @{ ParameterKey = "CloudFrontDomain"; ParameterValue = "d2du92h297hvfr.cloudfront.net" },
  @{ ParameterKey = "MediaConvertRoleArn"; ParameterValue = "arn:aws:iam::407264390882:role/service-role/MediaConvert_Default_Role" },
  @{ ParameterKey = "CodeBucketName"; ParameterValue = $CodeBucket },
  @{ ParameterKey = "ProcessorCodeKey"; ParameterValue = $codeKeys.processor },
  @{ ParameterKey = "FinalizerCodeKey"; ParameterValue = $codeKeys.finalizer },
  @{ ParameterKey = "CatalogCodeKey"; ParameterValue = $codeKeys.catalog },
  @{ ParameterKey = "CleanupCodeKey"; ParameterValue = $codeKeys.cleanup }
)

$parameterPath = Join-Path $buildDirectory "parameters-$releaseId.json"
$parameters | ConvertTo-Json -Depth 4 | Set-Content -Path $parameterPath -Encoding utf8

[pscustomobject]@{
  ReleaseId = $releaseId
  ParametersFile = $parameterPath
  ProcessorCodeKey = $codeKeys.processor
  FinalizerCodeKey = $codeKeys.finalizer
  CatalogCodeKey = $codeKeys.catalog
  CleanupCodeKey = $codeKeys.cleanup
}
