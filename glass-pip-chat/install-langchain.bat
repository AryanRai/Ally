@echo off
echo Installing LangChain dependencies for Glass PiP Chat...
echo.

echo Installing with legacy peer deps to resolve conflicts...
npm install @langchain/core @langchain/ollama @langchain/community langchain --legacy-peer-deps

echo.
echo ✅ LangChain dependencies installed!
echo Please restart the application to enable enhanced tool calling.
echo.
pause