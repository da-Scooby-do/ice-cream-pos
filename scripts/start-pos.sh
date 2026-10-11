#!/usr/bin/env bash
# تشغيل الكاشير | Launch the POS with silent receipt printing (Linux).
# Set the Xprinter as the default CUPS printer first.
POS_URL="${POS_URL:-https://ice-cream-pos.vercel.app}"
pkill -f chrome >/dev/null 2>&1 || true
exec google-chrome --kiosk-printing --app="$POS_URL" --start-maximized
