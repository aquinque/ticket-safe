#!/bin/bash

# Quick push script for TicketSafe
# Usage: ./push.sh "your commit message"

echo "🚀 TicketSafe Quick Push Script"
echo "================================"

# Check if commit message provided
if [ -z "$1" ]; then
  echo "❌ Error: Please provide a commit message"
  echo "Usage: ./push.sh \"your commit message\""
  exit 1
fi

# Show what files changed
echo "📝 Files changed:"
git status --short

echo ""
echo "➕ Adding all changes..."
git add .

echo "💾 Committing with message: $1"
git commit -m "$1"

echo "📤 Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Done! Your changes are now on GitHub and will deploy automatically."
echo "🌐 Check deployment at: https://github.com/YOUR_USERNAME/ticket-safe/actions"
