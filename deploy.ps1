# ==========================================
# GitHub Pages Auto-Deploy Script
# ==========================================

$repoUrl = Read-Host "Enter GitHub Repository URL (e.g., https://github.com/username/Trackora.git) or press Enter to skip"

if (!(Test-Path ".git")) {
    Write-Host "Initializing Git repository..." -ForegroundColor Yellow
    git init
    git branch -M main
}

if (![string]::IsNullOrWhiteSpace($repoUrl)) {
    git remote add origin $repoUrl
}

Write-Host "Adding files..." -ForegroundColor Yellow
git add .

$commitMsg = Read-Host "Enter commit message (or press Enter for default)"
if ([string]::IsNullOrWhiteSpace($commitMsg)) {
    $commitMsg = "System Update: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
}
git commit -m "$commitMsg"

Write-Host "Pushing to GitHub..." -ForegroundColor Yellow
git push -u origin main

Write-Host "Done successfully!" -ForegroundColor Green
Write-Host "To enable Free Hosting:"
Write-Host "1. Go to your GitHub Repository Settings"
Write-Host "2. Choose 'Pages' from the left sidebar"
Write-Host "3. Under Branch, select 'main' and click Save"
Write-Host "Your site will be live in 2 minutes."
pause
