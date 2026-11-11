#!/usr/bin/env bash
# Compiles the bridge plugin against the jars Paper extracted into runtime/server/libraries.
# No Gradle needed. Output: plugin/out/BuildMCPBridge.jar (and copies it into the server's plugins dir).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HERE/.."
JDK="$(ls -d "$ROOT"/runtime/jdk-*/ | head -1)"
SERVER="$ROOT/runtime/server"
CP=$(find "$SERVER/libraries" "$SERVER/versions" -name "*.jar" | while read -r f; do cygpath -w "$f" 2>/dev/null || echo "$f"; done | tr "
" ";")
rm -rf "$HERE/out" && mkdir -p "$HERE/out/classes"
"$JDK/bin/javac" --release 21 -nowarn -cp "$CP" -d "$HERE/out/classes" $(find "$HERE/src" -name '*.java')
cp "$HERE"/resources/* "$HERE/out/classes/"
(cd "$HERE/out/classes" && "$JDK/bin/jar" cf ../BuildMCPBridge.jar .)
mkdir -p "$SERVER/plugins" && cp "$HERE/out/BuildMCPBridge.jar" "$SERVER/plugins/"
echo "built $HERE/out/BuildMCPBridge.jar"
