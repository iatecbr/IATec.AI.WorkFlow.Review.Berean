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

# Remove previous installation to ensure fresh install
if [ -d "$INSTALL_DIR" ]; then
  CURRENT_VERSION=$(get_version "$INSTALL_DIR")
  echo "🧹 Cleaning previous installation (current: v$CURRENT_VERSION)..."
  rm -rf "$INSTALL_DIR"
fi

# Clone or update
if [ -d "$INSTALL_DIR" ]; then
  CURRENT_VERSION=$(get_version "$INSTALL_DIR")
  echo "📦 Updating Berean${CURRENT_VERSION:+ (current: v$CURRENT_VERSION)}..."
  echo "  Pulling latest changes..."
  cd "$INSTALL_DIR"
  git remote set-url origin "$REPO"
  git fetch origin
  git reset --hard origin/main

  # Re-execute the updated install.sh from the repo to ensure latest logic runs
  # Only re-exec if we are NOT already the repo's own install.sh
  REPO_INSTALL="$INSTALL_DIR/install.sh"
  if [ "$(realpath "$0" 2>/dev/null || echo "$0")" != "$(realpath "$REPO_INSTALL" 2>/dev/null || echo "$REPO_INSTALL")" ]; then
    exec bash "$REPO_INSTALL"
  fi
else
  echo "📦 Installing Berean..."
  echo "  Cloning from GitHub..."
  git clone "$REPO" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

NEW_VERSION=$(get_version "$INSTALL_DIR")

# Install dependencies (including devDependencies needed for build)
echo "  Installing dependencies..."
npm install 2>&1 | tail -3

# Build TypeScript sources
echo "  Building..."
npm run build 2>&1 | tail -3

# Link globally
echo "  Linking globally..."
npm link 2>&1 | tail -2

# Ensure binary has execution permission
chmod +x "$(which berean)" 2>/dev/null || true

echo ""
if [ -n "$CURRENT_VERSION" ] && [ "$CURRENT_VERSION" != "$NEW_VERSION" ]; then
  echo "✅ Berean updated: v$CURRENT_VERSION → v$NEW_VERSION"
elif [ -n "$CURRENT_VERSION" ] && [ "$CURRENT_VERSION" = "$NEW_VERSION" ]; then
  echo "✅ Berean updated to v$NEW_VERSION"
else
  echo "✅ Berean v$NEW_VERSION installed!"
fi
echo "   Run: berean --help"
echo "   Location: $INSTALL_DIR"
