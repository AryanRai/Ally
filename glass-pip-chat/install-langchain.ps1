Write-Host "Installing LangChain dependencies for Glass PiP Chat..." -ForegroundColor Cyan
Write-Host ""

Write-Host "Installing with legacy peer deps to resolve conflicts..." -ForegroundColor Yellow
npm install @langchain/core @langchain/ollama @langchain/community langchain --legacy-peer-deps

Write-Host ""
Write-Host "✅ LangChain dependencies installed!" -ForegroundColor Green
Write-Host "Please restart the application to enable enhanced tool calling." -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to continue"