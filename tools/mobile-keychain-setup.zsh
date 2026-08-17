#!/bin/zsh

set -euo pipefail

read -s "android_password?StoneSiege Android upload-key password: "
print

if [[ -z "${android_password}" ]]; then
  print -u2 "Password cannot be empty."
  exit 1
fi

security add-generic-password \
  -U -a stonesiege -s com.stonesiege.android.store \
  -l "StoneSiege Android upload keystore password" -w "${android_password}"

security add-generic-password \
  -U -a stonesiege -s com.stonesiege.android.key \
  -l "StoneSiege Android upload key password" -w "${android_password}"

unset android_password
print "Android signing password saved in macOS Keychain."
