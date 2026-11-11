package dev.buildmcp.bridge;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.bukkit.Bukkit;
import org.bukkit.GameMode;
import org.bukkit.GameRule;
import org.bukkit.HeightMap;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.WorldCreator;
import org.bukkit.WorldType;
import org.bukkit.block.Block;
import org.bukkit.block.data.BlockData;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

/**
 * Minimal HTTP bridge that lets the BuildMCP server read and write blocks.
 * Listens on 127.0.0.1 only. All world access is marshalled onto the main thread,
 * and large writes are spread over several ticks so the server stays responsive.
 */
public final class BridgePlugin extends JavaPlugin {
    private static final Gson GSON = new Gson();
    private HttpServer http;
    private String token;
    private int blocksPerTick;
    private final ConcurrentLinkedQueue<Runnable> tickQueue = new ConcurrentLinkedQueue<>();

    @Override
    public void onEnable() {
        saveDefaultConfig();
        String host = getConfig().getString("host", "127.0.0.1");
        int port = getConfig().getInt("port", 8765);
        token = getConfig().getString("token", "");
        blocksPerTick = getConfig().getInt("blocks-per-tick", 60000);

        // Budgeted per-tick work queue for large writes.
        Bukkit.getScheduler().runTaskTimer(this, () -> {
            long deadline = System.nanoTime() + 35_000_000L; // ~35ms per tick max
            Runnable r;
            while (System.nanoTime() < deadline && (r = tickQueue.poll()) != null) r.run();
        }, 1L, 1L);

        try {
            http = HttpServer.create(new InetSocketAddress(host, port), 0);
            http.setExecutor(Executors.newFixedThreadPool(4));
            route("/status", this::status);
            route("/read", this::read);
            route("/write", this::write);
            route("/heightmap", this::heightmap);
            route("/command", this::command);
            route("/world", this::world);
            route("/player", this::player);
            http.start();
            getLogger().info("BuildMCP bridge listening on http://" + host + ":" + port);
        } catch (IOException e) {
            getLogger().severe("Could not start bridge: " + e);
        }
    }

    @Override
    public void onDisable() {
        if (http != null) http.stop(0);
    }

    private interface Handler { JsonElement handle(JsonObject body) throws Exception; }

    private void route(String path, Handler h) {
        http.createContext(path, ex -> {
            try {
                if (!token.isEmpty() && !token.equals(ex.getRequestHeaders().getFirst("X-Bridge-Token"))) {
                    respond(ex, 401, err("bad token"));
                    return;
                }
                JsonObject body = new JsonObject();
                try (InputStream in = ex.getRequestBody()) {
                    String s = new String(in.readAllBytes(), StandardCharsets.UTF_8);
                    if (!s.isBlank()) body = JsonParser.parseString(s).getAsJsonObject();
                }
                respond(ex, 200, h.handle(body));
            } catch (Throwable t) {
                getLogger().warning(path + " failed: " + t);
                respond(ex, 500, err(t.toString()));
            }
        });
    }

    private static JsonObject err(String m) { JsonObject o = new JsonObject(); o.addProperty("error", m); return o; }

    private static void respond(HttpExchange ex, int code, JsonElement json) throws IOException {
        byte[] b = GSON.toJson(json).getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json");
        ex.sendResponseHeaders(code, b.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(b); }
    }

    private <T> T sync(Supplier<T> s) throws Exception {
        CompletableFuture<T> f = new CompletableFuture<>();
        tickQueue.add(() -> { try { f.complete(s.get()); } catch (Throwable t) { f.completeExceptionally(t); } });
        return f.get(120, TimeUnit.SECONDS);
    }

    private World worldOf(JsonObject b) {
        String name = b.has("world") ? b.get("world").getAsString() : Bukkit.getWorlds().get(0).getName();
        World w = Bukkit.getWorld(name);
        if (w == null) throw new IllegalArgumentException("unknown world " + name);
        return w;
    }

    private static int[] vec(JsonObject b, String k) {
        JsonArray a = b.getAsJsonArray(k);
        return new int[]{a.get(0).getAsInt(), a.get(1).getAsInt(), a.get(2).getAsInt()};
    }

    // ---- endpoints ----

    private JsonElement status(JsonObject b) throws Exception {
        return sync(() -> {
            JsonObject o = new JsonObject();
            o.addProperty("minecraft", Bukkit.getMinecraftVersion());
            o.addProperty("bukkit", Bukkit.getBukkitVersion());
            o.addProperty("dataVersion", Bukkit.getUnsafe().getDataVersion());
            JsonArray worlds = new JsonArray();
            for (World w : Bukkit.getWorlds()) {
                JsonObject wo = new JsonObject();
                wo.addProperty("name", w.getName());
                wo.addProperty("minY", w.getMinHeight());
                wo.addProperty("maxY", w.getMaxHeight());
                Location s = w.getSpawnLocation();
                wo.add("spawn", arr(s.getBlockX(), s.getBlockY(), s.getBlockZ()));
                worlds.add(wo);
            }
            o.add("worlds", worlds);
            JsonArray players = new JsonArray();
            for (Player p : Bukkit.getOnlinePlayers()) {
                JsonObject po = new JsonObject();
                po.addProperty("name", p.getName());
                po.addProperty("world", p.getWorld().getName());
                Location l = p.getLocation();
                po.add("pos", arr(l.getX(), l.getY(), l.getZ()));
                players.add(po);
            }
            o.add("players", players);
            return o;
        });
    }

    /** Reads a cuboid. Returns a palette plus run-length-encoded indices in x-fastest, then z, then y order. */
    private JsonElement read(JsonObject b) throws Exception {
        int[] min = vec(b, "min"), max = vec(b, "max");
        long vol = (long) (max[0] - min[0] + 1) * (max[1] - min[1] + 1) * (max[2] - min[2] + 1);
        if (vol > 8_000_000) throw new IllegalArgumentException("region too large: " + vol);
        World w = worldOf(b);
        return sync(() -> {
            Map<String, Integer> pal = new HashMap<>();
            JsonArray palette = new JsonArray();
            JsonArray rle = new JsonArray();
            int last = -1, run = 0;
            for (int y = min[1]; y <= max[1]; y++)
                for (int z = min[2]; z <= max[2]; z++)
                    for (int x = min[0]; x <= max[0]; x++) {
                        String s = w.getBlockAt(x, y, z).getBlockData().getAsString();
                        Integer idx = pal.get(s);
                        if (idx == null) { idx = pal.size(); pal.put(s, idx); palette.add(s); }
                        if (idx == last) run++;
                        else { if (run > 0) { rle.add(last); rle.add(run); } last = idx; run = 1; }
                    }
            if (run > 0) { rle.add(last); rle.add(run); }
            JsonObject o = new JsonObject();
            o.add("min", arr(min[0], min[1], min[2]));
            o.add("max", arr(max[0], max[1], max[2]));
            o.add("palette", palette);
            o.add("rle", rle);
            return o;
        });
    }

    /**
     * Writes blocks. Body: {world, palette:[state...], blocks:[x,y,z,idx, x,y,z,idx, ...], physics:false}
     * Returns the previous state of every changed block in the same format (for undo).
     */
    private JsonElement write(JsonObject b) throws Exception {
        World w = worldOf(b);
        JsonArray paletteJson = b.getAsJsonArray("palette");
        JsonArray blocks = b.getAsJsonArray("blocks");
        boolean physics = b.has("physics") && b.get("physics").getAsBoolean();
        boolean wantPrevious = !b.has("returnPrevious") || b.get("returnPrevious").getAsBoolean();
        int n = blocks.size() / 4;
        int[] xyzi = new int[blocks.size()];
        for (int i = 0; i < xyzi.length; i++) xyzi[i] = blocks.get(i).getAsInt();

        BlockData[] palette = sync(() -> {
            BlockData[] p = new BlockData[paletteJson.size()];
            for (int i = 0; i < p.length; i++) p[i] = Bukkit.createBlockData(paletteJson.get(i).getAsString());
            return p;
        });

        Map<String, Integer> prevPal = new HashMap<>();
        JsonArray prevPalette = new JsonArray();
        List<int[]> prev = new ArrayList<>();
        int[] changed = {0};
        List<CompletableFuture<Void>> parts = new ArrayList<>();
        for (int start = 0; start < n; start += blocksPerTick) {
            final int s0 = start, e0 = Math.min(n, start + blocksPerTick);
            CompletableFuture<Void> f = new CompletableFuture<>();
            parts.add(f);
            tickQueue.add(() -> {
                try {
                    for (int i = s0; i < e0; i++) {
                        int x = xyzi[i * 4], y = xyzi[i * 4 + 1], z = xyzi[i * 4 + 2];
                        BlockData nd = palette[xyzi[i * 4 + 3]];
                        Block blk = w.getBlockAt(x, y, z);
                        BlockData od = blk.getBlockData();
                        if (od.equals(nd)) continue;
                        if (wantPrevious) {
                            String os = od.getAsString();
                            Integer idx = prevPal.get(os);
                            if (idx == null) { idx = prevPal.size(); prevPal.put(os, idx); prevPalette.add(os); }
                            prev.add(new int[]{x, y, z, idx});
                        }
                        blk.setBlockData(nd, physics);
                        changed[0]++;
                    }
                    f.complete(null);
                } catch (Throwable t) { f.completeExceptionally(t); }
            });
        }
        CompletableFuture.allOf(parts.toArray(new CompletableFuture[0])).get(600, TimeUnit.SECONDS);
        JsonObject o = new JsonObject();
        o.addProperty("requested", n);
        o.addProperty("changed", changed[0]);
        if (wantPrevious) {
            o.add("previousPalette", prevPalette);
            JsonArray pb = new JsonArray();
            for (int[] p : prev) { pb.add(p[0]); pb.add(p[1]); pb.add(p[2]); pb.add(p[3]); }
            o.add("previousBlocks", pb);
        }
        return o;
    }

    /** Surface heights (highest motion-blocking non-leaf block) over an XZ rectangle, row-major z then x. */
    private JsonElement heightmap(JsonObject b) throws Exception {
        World w = worldOf(b);
        int minX = b.get("minX").getAsInt(), minZ = b.get("minZ").getAsInt();
        int maxX = b.get("maxX").getAsInt(), maxZ = b.get("maxZ").getAsInt();
        return sync(() -> {
            JsonArray h = new JsonArray();
            Map<String, Integer> pal = new HashMap<>();
            JsonArray palette = new JsonArray();
            JsonArray top = new JsonArray();
            for (int z = minZ; z <= maxZ; z++)
                for (int x = minX; x <= maxX; x++) {
                    int y = w.getHighestBlockYAt(x, z, HeightMap.MOTION_BLOCKING_NO_LEAVES);
                    h.add(y);
                    String s = w.getBlockAt(x, y, z).getType().getKey().toString();
                    Integer idx = pal.get(s);
                    if (idx == null) { idx = pal.size(); pal.put(s, idx); palette.add(s); }
                    top.add(idx);
                }
            JsonObject o = new JsonObject();
            o.add("heights", h);
            o.add("palette", palette);
            o.add("surface", top);
            return o;
        });
    }

    private JsonElement command(JsonObject b) throws Exception {
        String cmd = b.get("command").getAsString();
        boolean ok = sync(() -> Bukkit.dispatchCommand(Bukkit.getConsoleSender(), cmd));
        JsonObject o = new JsonObject();
        o.addProperty("dispatched", ok);
        return o;
    }

    /** Create or load a world. type: normal | flat | void. */
    private JsonElement world(JsonObject b) throws Exception {
        String name = b.get("name").getAsString();
        String type = b.has("type") ? b.get("type").getAsString() : "flat";
        return sync(() -> {
            World w = Bukkit.getWorld(name);
            if (w == null) {
                WorldCreator wc = new WorldCreator(name);
                if (type.equals("flat")) {
                    wc.type(WorldType.FLAT);
                    wc.generateStructures(false);
                } else if (type.equals("void")) {
                    wc.type(WorldType.FLAT);
                    wc.generatorSettings("{\"layers\":[{\"block\":\"minecraft:air\",\"height\":1}],\"biome\":\"minecraft:plains\"}");
                    wc.generateStructures(false);
                }
                w = wc.createWorld();
                if (w != null) {
                    w.setGameRule(GameRule.DO_DAYLIGHT_CYCLE, false);
                    w.setGameRule(GameRule.DO_WEATHER_CYCLE, false);
                    w.setGameRule(GameRule.DO_MOB_SPAWNING, false);
                    w.setTime(6000);
                }
            }
            JsonObject o = new JsonObject();
            o.addProperty("name", w.getName());
            o.addProperty("minY", w.getMinHeight());
            o.addProperty("maxY", w.getMaxHeight());
            return o;
        });
    }

    /** Teleport a player (and put them in spectator/creative) — handy for humans following along. */
    private JsonElement player(JsonObject b) throws Exception {
        String name = b.get("name").getAsString();
        return sync(() -> {
            Player p = Bukkit.getPlayerExact(name);
            if (p == null) throw new IllegalArgumentException("player not online: " + name);
            if (b.has("pos")) {
                JsonArray a = b.getAsJsonArray("pos");
                World w = b.has("world") ? Bukkit.getWorld(b.get("world").getAsString()) : p.getWorld();
                float yaw = b.has("yaw") ? b.get("yaw").getAsFloat() : p.getLocation().getYaw();
                float pitch = b.has("pitch") ? b.get("pitch").getAsFloat() : p.getLocation().getPitch();
                p.teleport(new Location(w, a.get(0).getAsDouble(), a.get(1).getAsDouble(), a.get(2).getAsDouble(), yaw, pitch));
            }
            if (b.has("gamemode")) p.setGameMode(GameMode.valueOf(b.get("gamemode").getAsString().toUpperCase()));
            JsonObject o = new JsonObject();
            o.addProperty("ok", true);
            return o;
        });
    }

    private static JsonArray arr(Number... n) { JsonArray a = new JsonArray(); for (Number x : n) a.add(x); return a; }
}
