using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Server.Kestrel.Core.Features;

const int AdminPort = 4000;
const int PublicPort = 3000;
const long MaxPhotoBytes = 20 * 1024 * 1024;
const int MaxPhotosPerSession = 30;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(kestrel =>
{
    // Hanya loopback. Port 3000 dibuka ke internet lewat VS Code Ports, bukan lewat bind ke LAN.
    kestrel.ListenLocalhost(AdminPort);
    kestrel.ListenLocalhost(PublicPort);
});

var app = builder.Build();

// Folder induk untuk photos/, sessions/ dan data/. Default: folder proyek server (saat `dotnet run`).
// Skrip start memberi --StorageDir agar versi publish tetap menyimpan ke folder server/.
var storageDir = builder.Configuration["StorageDir"] is { Length: > 0 } dir
    ? Path.GetFullPath(dir)
    : app.Environment.ContentRootPath;
var store = new PhotoStore(storageDir, app.Logger);
var config = new ConfigStore(Path.Combine(storageDir, "data", "config.json"));
app.Logger.LogInformation("Foto disimpan di {SessionsDir} (satu folder per sesi)", store.SessionsDir);

// \z, bukan $, supaya path yang diakhiri newline tidak lolos.
var publicPathRegex = new Regex(@"^/[pfds]/[a-f0-9]{16}\z", RegexOptions.CultureInvariant);

// Batas keamanan: port publik hanya boleh GET /p, /f, /d, /s. Selain itu 404, termasuk file statis Vue.
// Penjagaan berdasarkan port lokal koneksi, tidak pernah berdasarkan header Host.
app.Use(async (ctx, next) =>
{
    var port = ctx.Connection.LocalPort;
    if (port == PublicPort)
    {
        var allowed = HttpMethods.IsGet(ctx.Request.Method)
            && publicPathRegex.IsMatch(ctx.Request.Path.Value ?? "");
        if (!allowed)
        {
            ctx.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }
        ctx.Response.Headers["X-Robots-Tag"] = "noindex, nofollow";
        ctx.Response.Headers["Referrer-Policy"] = "no-referrer";
        ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
    }
    else if (port != AdminPort)
    {
        ctx.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }
    await next();
});

app.UseDefaultFiles();
app.UseStaticFiles();

// ---------- Admin (port 4000) ----------

var api = app.MapGroup("/api");

api.MapGet("/config", () => new ConfigDto(config.PublicBaseUrl));

api.MapPut("/config", (ConfigDto body) =>
{
    if (!TryNormalizeBaseUrl(body.PublicBaseUrl, out var normalized))
        return Results.BadRequest(new { error = "URL publik harus berupa alamat http(s) lengkap." });
    config.Set(normalized);
    return Results.Ok(new ConfigDto(normalized));
});

api.MapPost("/photos", async (HttpContext ctx) =>
{
    var mediaType = ctx.Request.ContentType?.Split(';', 2)[0].Trim();
    if (!string.Equals(mediaType, "image/jpeg", StringComparison.OrdinalIgnoreCase))
        return Results.StatusCode(StatusCodes.Status415UnsupportedMediaType);

    var sizeFeature = ctx.Features.Get<IHttpMaxRequestBodySizeFeature>();
    if (sizeFeature is { IsReadOnly: false }) sizeFeature.MaxRequestBodySize = MaxPhotoBytes;
    if (ctx.Request.ContentLength > MaxPhotoBytes)
        return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);

    // Upload dari tablet lewat tunnel bisa tersendat sebentar saat sinyal naik-turun.
    // Default Kestrel memutus koneksi di bawah 240 B/s setelah 5 detik; untuk foto dibuat lebih sabar.
    var rateFeature = ctx.Features.Get<IHttpMinRequestBodyDataRateFeature>();
    if (rateFeature is not null)
        rateFeature.MinDataRate = new Microsoft.AspNetCore.Server.Kestrel.Core.MinDataRate(bytesPerSecond: 100, gracePeriod: TimeSpan.FromSeconds(30));

    using var buffer = new MemoryStream();
    try
    {
        await ctx.Request.Body.CopyToAsync(buffer, ctx.RequestAborted);
    }
    catch (BadHttpRequestException e)
    {
        // 413 = terlalu besar, 408 = koneksi terlalu lambat/terputus. Aplikasi menampilkan tombol Coba Lagi.
        app.Logger.LogWarning("Upload foto gagal ({Status}): {Message}", e.StatusCode, e.Message);
        return Results.StatusCode(e.StatusCode);
    }

    var bytes = buffer.GetBuffer();
    var length = (int)buffer.Length;
    if (length < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8 || bytes[2] != 0xFF)
        return Results.BadRequest(new { error = "Body bukan file JPEG." });

    var id = await store.SaveAsync(bytes.AsMemory(0, length), ctx.RequestAborted);
    var baseUrl = config.PublicBaseUrl;
    return Results.Ok(new PhotoCreated(id, baseUrl is null ? null : $"{baseUrl}/p/{id}"));
});

api.MapGet("/photos", (int? limit) => store.ListPhotos(Math.Clamp(limit ?? 60, 1, 500)));

// Sesi = satu foto template (main) + semua foto mentah dari sesi itu, di balik satu QR.
// Foto-fotonya dipindahkan ke folder sesi sendiri.
api.MapPost("/sessions", (SessionRequest body) =>
{
    var photoIds = body.Photos ?? [];
    if (!PhotoIds.IsValid(body.Main) || photoIds.Count > MaxPhotosPerSession || !photoIds.All(PhotoIds.IsValid))
        return Results.BadRequest(new { error = "ID foto tidak valid." });

    var (id, error) = store.CreateSession(body.Main, photoIds);
    if (id is null) return Results.BadRequest(new { error });

    var baseUrl = config.PublicBaseUrl;
    return Results.Ok(new PhotoCreated(id, baseUrl is null ? null : $"{baseUrl}/s/{id}"));
});

api.MapGet("/sessions", (int? limit) =>
    store.ListSessions(Math.Clamp(limit ?? 60, 1, 500))
        .Select(s => new SessionInfo(s.Id, s.Main.Id, s.Photos.Count, s.CreatedAt)));

// ---------- Publik (port 3000, juga bisa diakses dari port 4000) ----------

app.MapGet("/s/{id}", (string id) =>
{
    var session = PhotoIds.IsValid(id) ? store.GetSession(id) : null;
    if (session is null || store.GetPhotoPath(session.Main.Id) is null) return Results.NotFound();
    var photoIds = session.Photos.Select(p => p.Id).Where(p => store.GetPhotoPath(p) is not null).ToList();
    return Results.Content(PublicPage.RenderSession(session.Main.Id, photoIds), "text/html; charset=utf-8");
});

app.MapGet("/p/{id}", (string id) =>
{
    if (!PhotoIds.IsValid(id) || store.GetPhotoPath(id) is null) return Results.NotFound();
    return Results.Content(PublicPage.Render(id), "text/html; charset=utf-8");
});

app.MapGet("/f/{id}", (string id) =>
{
    var path = PhotoIds.IsValid(id) ? store.GetPhotoPath(id) : null;
    return path is null ? Results.NotFound() : Results.File(path, "image/jpeg");
});

app.MapGet("/d/{id}", (string id) =>
{
    var path = PhotoIds.IsValid(id) ? store.GetPhotoPath(id) : null;
    return path is null ? Results.NotFound() : Results.File(path, "image/jpeg", $"natal-naposo-{id}.jpg");
});

app.Run();

static bool TryNormalizeBaseUrl(string? input, out string? normalized)
{
    normalized = null;
    if (string.IsNullOrWhiteSpace(input)) return true;
    if (!Uri.TryCreate(input.Trim(), UriKind.Absolute, out var uri)) return false;
    if (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp) return false;
    if (uri.Query.Length > 0 || uri.Fragment.Length > 0 || uri.UserInfo.Length > 0) return false;
    normalized = uri.GetLeftPart(UriPartial.Path).TrimEnd('/');
    return true;
}

record ConfigDto(string? PublicBaseUrl);
record PhotoCreated(string Id, string? Url);
record PhotoInfo(string Id, DateTime CreatedAt);
record SessionRequest(string? Main, List<string>? Photos);
record SessionInfo(string Id, string Main, int PhotoCount, DateTime CreatedAt);

/// <summary>URL publik disimpan di memori dan di disk, supaya tetap ada setelah server restart.</summary>
sealed class ConfigStore
{
    private readonly string _path;
    private readonly Lock _lock = new();
    private string? _publicBaseUrl;

    public ConfigStore(string path)
    {
        _path = path;
        try
        {
            if (File.Exists(path))
                _publicBaseUrl = JsonSerializer.Deserialize<ConfigDto>(File.ReadAllText(path), JsonSerializerOptions.Web)?.PublicBaseUrl;
        }
        catch (Exception e) when (e is IOException or JsonException)
        {
            _publicBaseUrl = null;
        }
    }

    public string? PublicBaseUrl
    {
        get { lock (_lock) return _publicBaseUrl; }
    }

    public void Set(string? value)
    {
        lock (_lock)
        {
            _publicBaseUrl = value;
            Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
            File.WriteAllText(_path, JsonSerializer.Serialize(new ConfigDto(value), JsonSerializerOptions.Web));
        }
    }
}

static class PublicPage
{
    // Semua id sudah lolos validasi hex, jadi aman disisipkan langsung ke HTML.

    public static string Render(string id) => Layout($$"""
          <img class="photo" src="/f/{{id}}" alt="Foto Natal Remaja Naposo">
          <a class="btn" href="/d/{{id}}" download="natal-naposo-{{id}}.jpg">Download Foto</a>
          <p class="hint"><strong>Pengguna iPhone:</strong> tekan lama foto di atas, lalu pilih <strong>Simpan ke Foto</strong>.</p>
        """);

    public static string RenderSession(string mainId, IReadOnlyList<string> photoIds)
    {
        var items = string.Concat(photoIds.Select((id, i) => $$"""
                <figure>
                  <a href="/f/{{id}}"><img src="/f/{{id}}" alt="Foto {{i + 1}}" loading="lazy"></a>
                  <a class="btn small" href="/d/{{id}}" download="natal-naposo-{{id}}.jpg">Download</a>
                </figure>

            """));
        var others = photoIds.Count == 0 ? "" : $$"""
              <h2>Semua foto ({{photoIds.Count}})</h2>
              <p class="note">Foto asli tanpa bingkai. Sentuh foto untuk melihat ukuran penuh.</p>
              <div class="grid">
            {{items}}
              </div>
            """;
        return Layout($$"""
              <img class="photo" src="/f/{{mainId}}" alt="Foto Natal Remaja Naposo">
              <a class="btn" href="/d/{{mainId}}" download="natal-naposo-{{mainId}}.jpg">Download Foto</a>
              <p class="hint"><strong>Pengguna iPhone:</strong> tekan lama foto, lalu pilih <strong>Simpan ke Foto</strong>.</p>
            {{others}}
            """);
    }

    private static string Layout(string body) => $$"""
        <!doctype html>
        <html lang="id">
        <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="robots" content="noindex, nofollow">
        <meta name="theme-color" content="#0c1612">
        <title>Foto Natal Remaja Naposo · HKBP Lontar 2026</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap">
        <style>
          :root {
            --bg: #0c1612; --surface: #13211b; --line: rgba(244,241,234,.1);
            --text: #f4f1ea; --muted: #a3aea8; --gold: #c9a45c;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0; min-height: 100vh; background: var(--bg); color: var(--text);
            font-family: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            -webkit-font-smoothing: antialiased;
          }
          main { width: 100%; max-width: 560px; margin: 0 auto; padding: 32px 20px 40px; }
          header { margin-bottom: 24px; }
          .eyebrow { margin: 0; font-size: .75rem; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: var(--gold); }
          h1 { margin: 6px 0 0; font-family: "Cormorant Garamond", Georgia, serif; font-weight: 500; font-size: 2.6rem; line-height: 1.05; }
          h2 { margin: 40px 0 4px; font-size: 1.15rem; font-weight: 700; }
          img { display: block; -webkit-touch-callout: default; }
          .photo { width: 100%; border-radius: 12px; background: #fff; box-shadow: 0 16px 40px rgba(0,0,0,.4); }
          .btn {
            display: block; width: 100%; margin-top: 16px; padding: 17px; border-radius: 14px;
            background: var(--gold); color: #1a1408; text-decoration: none; text-align: center;
            font-size: 1.05rem; font-weight: 700;
          }
          .btn:active { opacity: .85; }
          .btn.small {
            margin-top: 8px; padding: 10px; border-radius: 10px; font-size: .9rem;
            background: transparent; color: var(--text); border: 1px solid rgba(244,241,234,.22);
          }
          .hint { margin: 14px 0 0; color: var(--muted); font-size: .9rem; line-height: 1.55; }
          .hint strong { color: var(--text); font-weight: 600; }
          .note { margin: 0 0 16px; color: var(--muted); font-size: .9rem; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
          figure { margin: 0; }
          figure img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 10px; background: #000; }
          footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--line); color: var(--muted); font-size: .85rem; text-align: center; }
        </style>
        </head>
        <body>
        <main>
          <header>
            <p class="eyebrow">HKBP Lontar · 19 Desember 2026</p>
            <h1>Natal Remaja Naposo</h1>
          </header>
        {{body}}
          <footer>Selamat Natal. Tuhan memberkati.</footer>
        </main>
        </body>
        </html>
        """;
}
