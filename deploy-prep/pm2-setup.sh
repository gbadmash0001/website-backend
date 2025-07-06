#!/bin/bash
# 🚀 PM2 Setup Script — For Post-Deployment Server

echo "📦 Installing PM2 globally..."
npm install -g pm2

echo "⚙️ Starting backend server with PM2..."
pm2 start server.js --name server
pm2 start adminserver.js --name adminserver

echo "💾 Saving PM2 process list..."
pm2 save

echo "🔁 Enabling restart on reboot..."
pm2 startup