# $prFile="PR-009-sensor-catalog-api.tar.gz"
$devServer="ubuntu@na-01.f-colas.com"

$scriptName = $MyInvocation.MyCommand.Name
if ($args.Count -eq 0) {
    Write-Host "Usage: .\$scriptName <path_to_pr_file>"
    exit 1
}

# Add prFile as script argument
$prFileFullPath = $args[0]
$prFile = Split-Path $prFileFullPath -Leaf

$prNumber = $prFile -replace 'PR-(\d+)-.*', '$1'
$prName = $prFile -replace 'PR-\d+-(.*)\.tar\.gz', '$1'

echo "------------------------------"
echo "PR File Full Path: $prFileFullPath"
echo "PR File          : $prFile"
echo "PR Number        : $prNumber"
echo "PR Name          : $prName"
echo "------------------------------"

# ssh $devServer ls
scp $prFileFullPath ${devServer}:/tmp
ssh $devServer "cd /home/ubuntu/sensorsphere && ./dev/tools/pr extract /tmp/$prFile && ./dev/tools/pr info $prNumber && ./dev/tools/pr apply $prNumber && ./dev/tools/pr verify $prNumber"

