package fi.iki.elonen;

import java.io.ByteArrayOutputStream;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public abstract class NanoHTTPD {
    public static final int SOCKET_READ_TIMEOUT = 5000;

    public interface IHTTPSession {
        String getMethod();
        String getUri();
        Map<String, String> getHeaders();
    }

    public static class Response {
        public enum Status {
            OK(200, "OK"),
            NOT_FOUND(404, "Not Found"),
            INTERNAL_ERROR(500, "Internal Server Error");

            private final int requestStatus;
            private final String description;

            Status(int requestStatus, String description) {
                this.requestStatus = requestStatus;
                this.description = description;
            }

            public int getRequestStatus() {
                return requestStatus;
            }

            public String getDescription() {
                return description;
            }
        }

        private final Status status;
        private final String mimeType;
        private final byte[] body;

        private Response(Status status, String mimeType, byte[] body) {
            this.status = status;
            this.mimeType = mimeType;
            this.body = body != null ? body : new byte[0];
        }

        private void write(OutputStream outputStream) throws IOException {
            StringBuilder headers = new StringBuilder();
            headers.append("HTTP/1.1 ")
                .append(status.getRequestStatus())
                .append(' ')
                .append(status.getDescription())
                .append("\r\n")
                .append("Connection: close\r\n")
                .append("Content-Type: ")
                .append(mimeType == null || mimeType.trim().isEmpty() ? "application/octet-stream" : mimeType)
                .append("\r\n")
                .append("Content-Length: ")
                .append(body.length)
                .append("\r\n\r\n");

            outputStream.write(headers.toString().getBytes(StandardCharsets.UTF_8));
            outputStream.write(body);
            outputStream.flush();
        }
    }

    private final int port;
    private volatile boolean running;
    private ServerSocket serverSocket;
    private Thread serverThread;

    protected NanoHTTPD(int port) {
        this.port = port;
    }

    public synchronized void start(int timeout, boolean daemon) throws IOException {
        if (running) {
            return;
        }

        serverSocket = new ServerSocket(port);
        serverSocket.setSoTimeout(timeout);
        running = true;

        serverThread = new Thread(new Runnable() {
            @Override
            public void run() {
                serveLoop();
            }
        }, "NanoHTTPD-" + port);
        serverThread.setDaemon(daemon);
        serverThread.start();
    }

    public synchronized void stop() {
        running = false;

        if (serverSocket != null) {
            try {
                serverSocket.close();
            } catch (IOException error) {
                // ignore
            }
            serverSocket = null;
        }

        if (serverThread != null) {
            serverThread.interrupt();
            serverThread = null;
        }
    }

    private void serveLoop() {
        while (running) {
            try {
                Socket socket = serverSocket.accept();
                handleConnection(socket);
            } catch (IOException error) {
                if (running) {
                    // timeout or transient accept failure
                }
            }
        }
    }

    private void handleConnection(Socket socket) {
        if (socket == null) {
            return;
        }

        Thread worker = new Thread(new Runnable() {
            @Override
            public void run() {
                try (Socket currentSocket = socket;
                     InputStream inputStream = currentSocket.getInputStream();
                     OutputStream outputStream = currentSocket.getOutputStream()) {
                    currentSocket.setSoTimeout(SOCKET_READ_TIMEOUT);

                    BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8));
                    String requestLine = reader.readLine();
                    if (requestLine == null || requestLine.trim().isEmpty()) {
                        return;
                    }

                    String[] parts = requestLine.split("\\s+");
                    if (parts.length < 2) {
                        return;
                    }

                    String method = parts[0].trim();
                    String uri = parts[1].trim();
                    int queryIndex = uri.indexOf('?');
                    if (queryIndex >= 0) {
                        uri = uri.substring(0, queryIndex);
                    }

                    Map<String, String> headers = new HashMap<>();
                    String headerLine;
                    while ((headerLine = reader.readLine()) != null) {
                        if (headerLine.trim().isEmpty()) {
                            break;
                        }

                        int separatorIndex = headerLine.indexOf(':');
                        if (separatorIndex > 0) {
                            String headerName = headerLine.substring(0, separatorIndex).trim().toLowerCase(Locale.US);
                            String headerValue = headerLine.substring(separatorIndex + 1).trim();
                            headers.put(headerName, headerValue);
                        }
                    }

                    Response response = serve(new SimpleSession(method, uri, headers));
                    if (response == null) {
                        response = newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", "500");
                    }

                    response.write(outputStream);
                } catch (IOException error) {
                    // ignore connection failure
                }
            }
        }, "NanoHTTPD-Worker");
        worker.setDaemon(true);
        worker.start();
    }

    public abstract Response serve(IHTTPSession session);

    public Response newFixedLengthResponse(Response.Status status, String mimeType, String text) {
        return new Response(status, mimeType, text == null ? new byte[0] : text.getBytes(StandardCharsets.UTF_8));
    }

    public Response newChunkedResponse(Response.Status status, String mimeType, InputStream data) {
        return new Response(status, mimeType, readAllBytes(data));
    }

    private static byte[] readAllBytes(InputStream inputStream) {
        if (inputStream == null) {
            return new byte[0];
        }

        try (InputStream current = inputStream; ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int read;
            while ((read = current.read(buffer)) != -1) {
                outputStream.write(buffer, 0, read);
            }
            return outputStream.toByteArray();
        } catch (IOException error) {
            return new byte[0];
        }
    }

    private static final class SimpleSession implements IHTTPSession {
        private final String method;
        private final String uri;
        private final Map<String, String> headers;

        private SimpleSession(String method, String uri, Map<String, String> headers) {
            this.method = method;
            this.uri = uri;
            this.headers = headers == null ? Collections.<String, String>emptyMap() : Collections.unmodifiableMap(headers);
        }

        @Override
        public String getMethod() {
            return method;
        }

        @Override
        public String getUri() {
            return uri;
        }

        @Override
        public Map<String, String> getHeaders() {
            return headers;
        }
    }
}
