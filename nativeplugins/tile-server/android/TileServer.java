package com.offlinemapreader.tileserver;

import android.util.Log;

import fi.iki.elonen.NanoHTTPD;
import io.dcloud.feature.uniapp.annotation.UniJSMethod;
import io.dcloud.feature.uniapp.bridge.UniJSCallback;
import io.dcloud.feature.uniapp.common.UniModule;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public class TileServer extends UniModule {
    private OfflineTileHttpServer server;
    private String basePath;
    private int port = 18888;

    @UniJSMethod(uiThread = false)
    public void start(JSONObject options, UniJSCallback callback) {
        Map<String, Object> result = new HashMap<>();
        String nextBasePath = options != null ? options.optString("basePath", "") : "";
        int nextPort = options != null ? options.optInt("port", 18888) : 18888;

        if (nextBasePath == null || nextBasePath.trim().isEmpty()) {
            result.put("success", false);
            result.put("message", "basePath 不能为空");
            invoke(callback, result);
            return;
        }

        File directory = new File(nextBasePath);
        if (!directory.exists() || !directory.isDirectory()) {
            result.put("success", false);
            result.put("message", "瓦片目录不存在");
            invoke(callback, result);
            return;
        }

        stopServer();

        try {
            basePath = directory.getCanonicalPath();
            port = nextPort > 0 ? nextPort : 18888;
            server = new OfflineTileHttpServer(port, basePath);
            server.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false);

            Log.d("TileServer", "服务器启动: port=" + port + " basePath=" + basePath);
            result.put("success", true);
            result.put("port", port);
            result.put("basePath", basePath);
            invoke(callback, result);
        } catch (IOException error) {
            Log.e("TileServer", "服务器启动失败", error);
            result.put("success", false);
            result.put("message", error.getMessage());
            invoke(callback, result);
        }
    }

    @UniJSMethod(uiThread = false)
    public void stop(UniJSCallback callback) {
        stopServer();
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        invoke(callback, result);
    }

    @UniJSMethod(uiThread = false)
    public void checkPath(JSONObject options, UniJSCallback callback) {
        Map<String, Object> result = new HashMap<>();
        String path = options != null ? options.optString("path", "") : "";
        File directory = new File(path);

        result.put("exists", directory.exists() && directory.isDirectory());
        invoke(callback, result);
    }

    private synchronized void stopServer() {
        if (server == null) {
            return;
        }

        try {
            server.stop();
            Log.d("TileServer", "服务器停止");
        } catch (Exception error) {
            Log.w("TileServer", "服务器停止异常", error);
        } finally {
            server = null;
        }
    }

    private void invoke(UniJSCallback callback, Map<String, Object> payload) {
        if (callback != null) {
            callback.invoke(payload);
        }
    }

    private static String guessMimeType(String fileName) {
        String lower = fileName.toLowerCase(Locale.US);
        if (lower.endsWith(".png")) {
            return "image/png";
        }
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
            return "image/jpeg";
        }
        if (lower.endsWith(".webp")) {
            return "image/webp";
        }
        if (lower.endsWith(".gif")) {
            return "image/gif";
        }
        return "application/octet-stream";
    }

    private static File resolveFile(File baseDirectory, String uri) throws IOException {
        if (uri == null || uri.trim().isEmpty()) {
            return null;
        }

        String relative = uri.startsWith("/") ? uri.substring(1) : uri;
        File canonicalBase = baseDirectory.getCanonicalFile();
        File requested = new File(canonicalBase, relative).getCanonicalFile();

        String basePath = canonicalBase.getPath();
        String requestedPath = requested.getPath();
        if (!requestedPath.equals(basePath) && !requestedPath.startsWith(basePath + File.separator)) {
            return null;
        }

        return requested;
    }

    private static class OfflineTileHttpServer extends NanoHTTPD {
        private final File baseDirectory;

        OfflineTileHttpServer(int port, String basePath) {
            super(port);
            this.baseDirectory = new File(basePath);
        }

        @Override
        public Response serve(IHTTPSession session) {
            String uri = session != null ? session.getUri() : "";
            Log.d("TileServer", "收到请求: " + uri);

            if (uri == null || uri.trim().isEmpty() || "/".equals(uri)) {
                return newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "404");
            }

            try {
                File file = resolveFile(baseDirectory, uri);
                if (file == null || !file.exists() || !file.isFile()) {
                    String relative = uri.startsWith("/") ? uri.substring(1) : uri;
                    File miss = file != null ? file : new File(baseDirectory, relative);
                    Log.w("TileServer", "文件不存在 (404): " + miss.getAbsolutePath());
                    return newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "404");
                }

                Log.d("TileServer", "文件存在: " + file.getAbsolutePath() + " size=" + file.length());
                return newChunkedResponse(Response.Status.OK, guessMimeType(file.getName()), new FileInputStream(file));
            } catch (IOException error) {
                Log.e("TileServer", "读取瓦片失败", error);
                return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", error.getMessage());
            }
        }
    }
}
