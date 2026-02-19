#!/usr/bin/env bash
# Berean installer - install globally from GitHub
set -e

REPO="https://github.com/iatecbr/IATec.AI.WorkFlow.Review.Berean.git"
INSTALL_DIR="${BEREAN_INSTALL_DIR:-$HOME/.berean-cli}"

get_version() {
  local dir="$1"
  if [ -f "$dir/package.json" ]; then
    grep '"version"' "$dir/package.json" | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/'
  fi
}

# Clone or update
if [ -d "$INSTALL_DIR" ]; then
  CURRENT_VERSION=$(get_version "$INSTALL_DIR")
  echo "📦 Updating Berean${CURRENT_VERSION:+ (current: v$CURRENT_VERSION)}..."
  echo "  Pulling latest changes..."
  cd "$INSTALL_DIR"
  git pull --ff-only
else
  echo "📦 Installing Berean..."
  echo "  Cloning from GitHub..."
  git clone "$REPO" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

NEW_VERSION=$(get_version "$INSTALL_DIR")

# Install dependencies
echo "  Installing dependencies..."
npm install --production 2>&1 | tail -3

# Link globally
echo "  Linking globally..."
npm link 2>&1 | tail -2

echo ""
if [ -n "$CURRENT_VERSION" ] && [ "$CURRENT_VERSION" != "$NEW_VERSION" ]; then
  echo "✅ Berean updated: v$CURRENT_VERSION → v$NEW_VERSION"
elif [ -n "$CURRENT_VERSION" ] && [ "$CURRENT_VERSION" = "$NEW_VERSION" ]; then
  echo "✅ Berean is already up to date (v$NEW_VERSION)"
else
  echo "✅ Berean v$NEW_VERSION installed!"
fi
echo "   Run: berean --help"
echo "   Location: $INSTALL_DIR"
