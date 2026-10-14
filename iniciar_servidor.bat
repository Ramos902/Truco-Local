@echo off
title Servidor Truco Local
chcp 65001 >nul
cls

echo ========================================================
echo               SERVIDOR TRUCO LOCAL
echo ========================================================
echo.

:: Garante que o Node.js esteja no PATH caso a janela não tenha sido reiniciada
where node >nul 2>nul
if %errorlevel% neq 0 (
    set "PATH=C:\Program Files\nodejs;%PATH%"
)

echo Verificando ambiente Node.js...
node -v >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao foi encontrado no sistema.
    echo Certifique-se de que o Node.js esta instalado.
    echo.
    pause
    exit /b 1
)

echo Iniciando o servidor Truco Local...
echo.
echo Acesse no seu navegador:
echo   - Computador local: http://localhost:3000
echo.
echo Pressione Ctrl + C para encerrar o servidor a qualquer momento.
echo ========================================================
echo.

cd /d "%~dp0"
node server.js

if %errorlevel% neq 0 (
    echo.
    echo [AVISO] O servidor foi encerrado.
    pause
)
