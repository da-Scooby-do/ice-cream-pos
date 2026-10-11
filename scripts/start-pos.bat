@echo off
REM ======================================================================
REM  تشغيل الكاشير | Launch the POS with silent receipt printing.
REM  1) Set the Xprinter as the DEFAULT printer.
REM  2) Edit POS_URL below to the deployed address.
REM  3) Close ALL Chrome windows, then run this file.
REM ======================================================================
set POS_URL=https://YOUR-APP.vercel.app

set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

taskkill /IM chrome.exe /F >nul 2>&1
start "" %CHROME% --kiosk-printing --app=%POS_URL% --start-maximized
