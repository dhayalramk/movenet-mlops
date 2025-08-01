#!/usr/bin/env bash
set -euo pipefail

# ---- Config (edit if you want other versions/names) ----
PY_VER="3.10.13"
VENV_NAME="movenet-310"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"

echo "==> Repo root: $REPO_ROOT"

# ---- Apt prerequisites (Debian/Ubuntu image in Codespaces) ----
if ! command -v apt-get >/dev/null 2>&1; then
  echo "This script expects apt-get (Debian/Ubuntu). Aborting."
  exit 1
fi

echo "==> Installing build prerequisites (sudo required)..."
sudo apt-get update -y
sudo apt-get install -y \
  build-essential libssl-dev zlib1g-dev libbz2-dev \
  libreadline-dev libsqlite3-dev curl llvm libncursesw5-dev xz-utils tk-dev \
  libxml2-dev libxmlsec1-dev libffi-dev liblzma-dev

# ---- Install pyenv (if missing) ----
if [ ! -d "$HOME/.pyenv" ]; then
  echo "==> Installing pyenv..."
  curl -fsSL https://pyenv.run | bash
else
  echo "==> pyenv already present at ~/.pyenv"
fi

# Ensure current shell knows about pyenv (without restarting)
export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"
eval "$(pyenv virtualenv-init -)"

# Also persist to future shells (append only once)
if ! grep -q 'pyenv init' "$HOME/.bashrc"; then
  {
    echo 'export PYENV_ROOT="$HOME/.pyenv"'
    echo 'export PATH="$PYENV_ROOT/bin:$PATH"'
    echo 'eval "$(pyenv init -)"'
    echo 'eval "$(pyenv virtualenv-init -)"'
  } >> "$HOME/.bashrc"
fi

# ---- Install Python & virtualenv (idempotent) ----
echo "==> Ensuring Python $PY_VER is installed via pyenv..."
pyenv install -s "$PY_VER"

echo "==> Ensuring virtualenv $VENV_NAME exists..."
if ! pyenv virtualenvs --bare | grep -qx "$VENV_NAME"; then
  pyenv virtualenv "$PY_VER" "$VENV_NAME"
fi

# Set this repo to use the venv locally
cd "$REPO_ROOT"
pyenv local "$VENV_NAME"

# ---- Verify and install backend requirements ----
echo "==> Python version in this repo:"
python --version

echo "==> Upgrading pip and installing backend requirements..."
cd "$REPO_ROOT/backend"
python -m pip install --upgrade pip
pip install -r requirements.txt

echo "==> Done."
echo "You can start the API with:"
echo "    cd $REPO_ROOT/backend"
echo "    uvicorn app:app --host 0.0.0.0 --port 8000"

