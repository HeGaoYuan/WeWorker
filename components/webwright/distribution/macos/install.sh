#!/bin/sh
set -eu

source_dir=${1:?Usage: install.sh /path/to/Webwright.app-or-onedir}
install_root=${2:-"$HOME/Applications/Webwright.app"}

mkdir -p "$(dirname "$install_root")"
ditto "$source_dir" "$install_root"
printf '%s\n' "Installed Webwright at $install_root"
