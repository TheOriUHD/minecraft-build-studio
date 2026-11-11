"""Launch a Modrinth App instance directly (no launcher), in OFFLINE mode, and auto-join the local test server.
Uses only files the Modrinth App already installed. No account tokens are read or used.
Usage: python scripts/launch-client.py [instance_folder] [username] [server]
"""
import json, os, subprocess, sys, uuid, hashlib

APP = os.path.join(os.environ["APPDATA"], "ModrinthApp")
META = os.path.join(APP, "meta")
if len(sys.argv) < 2:
    sys.exit("usage: launch-modrinth-client.py <instance folder under ModrinthApp/profiles> [username] [server] [fabric version id]")
inst = sys.argv[1]
user = sys.argv[2] if len(sys.argv) > 2 else "Builder"
server = sys.argv[3] if len(sys.argv) > 3 else "127.0.0.1:25565"
ver = sys.argv[4] if len(sys.argv) > 4 else "26.2-0.19.3"  # a version folder under ModrinthApp/meta/versions
game_dir = os.path.join(APP, "profiles", inst)
j = json.load(open(os.path.join(META, "versions", ver, ver + ".json")))


def allowed(rules):
    if not rules:
        return True
    ok = False
    for r in rules:
        osr = r.get("os", {})
        feats = r.get("features")
        match = (not osr.get("name") or osr["name"] == "windows") and (not osr.get("arch") or osr["arch"] == "x86_64")
        if feats:
            match = match and feats.get("is_quick_play_multiplayer") is True
        if match:
            ok = r["action"] == "allow"
    return ok


cp = []
for lib in j["libraries"]:
    if not lib.get("include_in_classpath", True) or not allowed(lib.get("rules")):
        continue
    p = lib.get("downloads", {}).get("artifact", {}).get("path")
    if not p:
        g, a, v = lib["name"].split(":")[:3]
        p = f"{g.replace('.', '/')}/{a}/{v}/{a}-{v}.jar"
    f = os.path.join(META, "libraries", p)
    if os.path.exists(f) and f not in cp:
        cp.append(f)
cp.append(os.path.join(META, "versions", ver, ver + ".jar"))

natives = os.path.join(META, "natives", ver)
offline_uuid = str(uuid.UUID(bytes=hashlib.md5(("OfflinePlayer:" + user).encode()).digest(), version=3))
subs = {
    "natives_directory": natives, "launcher_name": "buildmcp", "launcher_version": "1", "classpath": os.pathsep.join(cp),
    "auth_player_name": user, "version_name": ver, "game_directory": game_dir, "assets_root": os.path.join(META, "assets"),
    "assets_index_name": j["assetIndex"]["id"], "auth_uuid": offline_uuid, "auth_access_token": "0", "clientid": "0",
    "auth_xuid": "0", "version_type": "release", "quickPlayMultiplayer": server, "user_type": "legacy",
}


def expand(args):
    out = []
    for a in args:
        if isinstance(a, dict):
            if not allowed(a.get("rules")):
                continue
            v = a["value"]
            out += v if isinstance(v, list) else [v]
        else:
            out.append(a)
    res = []
    for a in out:
        for k, v in subs.items():
            a = a.replace("${" + k + "}", v)
        if "${" not in a:
            res.append(a)
    return res


jvm = ["-Xms2G", "-Xmx8G", "-XX:+UseG1GC"] + expand(j["arguments"]["jvm"])
jvm = [a for a in jvm if not a.startswith("-DFabricMcEmu")] + ["-DFabricMcEmu= net.minecraft.client.main.Main "]
game = expand(j["arguments"]["game"])
java = os.path.join(META, "java_versions", "zulu25.36.205-ca-jre25.0.4.1-win_x64", "bin", "javaw.exe")
cmd = [java] + jvm + [j["mainClass"]] + game
log = open(os.path.join(os.path.dirname(__file__), "..", "runtime", "client.log"), "w")
p = subprocess.Popen(cmd, cwd=game_dir, stdout=log, stderr=subprocess.STDOUT, creationflags=0x00000008)
print("started pid", p.pid, "classpath entries", len(cp))
