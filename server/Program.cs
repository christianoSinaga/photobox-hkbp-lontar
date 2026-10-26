using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http.Features;

const int AdminPort = 4000;
const int PublicPort = 3000;
const long MaxPhotoBytes = 20 * 1024 * 1024;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(kestrel =>
{
    // Hanya loopback. Port 3000 dibuka ke internet lewat VS Code Ports, bukan lewat bind ke LAN.
    kestrel.ListenLocalhost(AdminPort);
    kestrel.ListenLocalhost(PublicPort);
});

var app = builder.Build();

// Folder induk untuk photos/ dan data/. Default: folder proyek server (saat `dotnet run`).
// Skrip start memberi --StorageDir agar versi publish tetap menyimpan ke server/photos.
var storageDir = builder.Configuration["StorageDir"] is { Length: > 0 } dir
    ? Path.GetFullPath(dir)
    : app.Environment.ContentRootPath;
var photosDir = Path.Combine(storageDir, "photos");
Directory.CreateDirectory(photosDir);
var config = new ConfigStore(Path.Combine(storageDir, "data", "config.json"));
app.Logger.LogInformation("Foto disimpan di {PhotosDir}", photosDir);

var idRegex = new Regex("^[a-f0-9]{16}$", RegexOptions.CultureInvariant);
// \z, bukan $, supaya path yang diakhiri newline tidak lolos.
var publicPathRegex = new Regex(@"^/[pfd]/[a-f0-9]{16}\z", RegexOptions.CultureInvariant);

// Batas keamanan: port publik hanya boleh GET /p, /f, /d. Selain itu 404, termasuk file statis Vue.
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

    using var buffer = new MemoryStream();
    try
    {
        await ctx.Request.Body.CopyToAsync(buffer, ctx.RequestAborted);
    }
    catch (BadHttpRequestException e) when (e.StatusCode == StatusCodes.Status413PayloadTooLarge)
    {
        return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
    }

    var bytes = buffer.GetBuffer();
    var length = (int)buffer.Length;
    if (length < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8 || bytes[2] != 0xFF)
        return Results.BadRequest(new { error = "Body bukan file JPEG." });

    string id;
    do id = NewId(); while (File.Exists(PhotoPath(id)));

    // Tulis ke file sementara dulu agar /f/{id} tidak pernah menyajikan file setengah jadi.
    var tempPath = Path.Combine(photosDir, id + ".tmp");
    await File.WriteAllBytesAsync(tempPath, bytes.AsMemory(0, length), ctx.RequestAborted);
    File.Move(tempPath, PhotoPath(id));

    var baseUrl = config.PublicBaseUrl;
    return Results.Ok(new PhotoCreated(id, baseUrl is null ? null : $"{baseUrl}/p/{id}"));
});

api.MapGet("/photos", (int? limit) =>
{
    var take = Math.Clamp(limit ?? 60, 1, 500);
    var photos = new DirectoryInfo(photosDir)
        .EnumerateFiles("*.jpg")
        .Where(f => f.Extension == ".jpg" && IsValidId(Path.GetFileNameWithoutExtension(f.Name)))
        .OrderByDescending(f => f.CreationTimeUtc)
        .Take(take)
        .Select(f => new PhotoInfo(Path.GetFileNameWithoutExtension(f.Name), f.CreationTimeUtc))
        .ToList();
    return photos;
});

// ---------- Publik (port 3000, juga bisa diakses dari port 4000) ----------

app.MapGet("/p/{id}", (string id) =>
{
    if (!IsValidId(id) || !File.Exists(PhotoPath(id))) return Results.NotFound();
    return Results.Content(PublicPage.Render(id), "text/html; charset=utf-8");
});

app.MapGet("/f/{id}", (string id) =>
{
    if (!IsValidId(id) || !File.Exists(PhotoPath(id))) return Results.NotFound();
    return Results.File(PhotoPath(id), "image/jpeg");
});

app.MapGet("/d/{id}", (string id) =>
{
    if (!IsValidId(id) || !File.Exists(PhotoPath(id))) return Results.NotFound();
    return Results.File(PhotoPath(id), "image/jpeg", $"natal-naposo-{id}.jpg");
});

app.Run();

// Panjang dicek juga karena $ di regex .NET menerima newline di akhir string.
bool IsValidId(string? id) => id is { Length: 16 } && idRegex.IsMatch(id);

string PhotoPath(string id) => Path.Combine(photosDir, id + ".jpg");

static string NewId() => Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant();

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
    // id sudah lolos validasi hex, jadi aman disisipkan langsung ke HTML.
    public static string Render(string id) => $$"""
        <!doctype html>
        <html lang="id">
        <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="robots" content="noindex, nofollow">
        <meta name="theme-color" content="#0f3d2a">
        <title>Foto Natal Naposo HKBP Lontar</title>
        <style>
          :root { --red: #b3202a; --red-dark: #7a1219; --green: #0f3d2a; --gold: #d4a63a; --white: #fffaf2; }
          * { box-sizing: border-box; }
          body {
            margin: 0; min-height: 100vh; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            background: radial-gradient(circle at 50% 0%, #17533a, var(--green) 70%); color: var(--white);
            display: flex; flex-direction: column; align-items: center; padding: 20px 16px 32px;
          }
          header { text-align: center; margin-bottom: 16px; }
          h1 { font-family: Georgia, "Times New Roman", serif; font-style: italic; color: var(--gold); margin: 0; font-size: 2rem; }
          header p { margin: 4px 0 0; opacity: .85; letter-spacing: .04em; }
          .photo {
            width: 100%; max-width: 560px; border-radius: 12px; border: 3px solid var(--gold);
            box-shadow: 0 10px 30px rgba(0,0,0,.35); background: #fff; display: block;
            -webkit-touch-callout: default;
          }
          .btn {
            display: block; width: 100%; max-width: 560px; margin-top: 20px; padding: 18px; border-radius: 999px;
            background: var(--red); border: 2px solid var(--gold); color: var(--white); text-decoration: none;
            text-align: center; font-size: 1.25rem; font-weight: 700;
          }
          .btn:active { background: var(--red-dark); }
          .hint {
            max-width: 560px; margin-top: 16px; padding: 14px 16px; border-radius: 12px;
            background: rgba(255,255,255,.08); line-height: 1.5; font-size: .95rem;
          }
          footer { margin-top: 24px; font-size: .85rem; opacity: .7; text-align: center; }
        </style>
        </head>
        <body>
          <header>
            <h1>Natal Naposo</h1>
            <p>HKBP Lontar · 19 Desember 2026</p>
          </header>
          <img class="photo" src="/f/{{id}}" alt="Foto Natal Naposo">
          <a class="btn" href="/d/{{id}}" download="natal-naposo-{{id}}.jpg">Download Foto</a>
          <p class="hint"><strong>Pengguna iPhone:</strong> tekan lama foto di atas, lalu pilih <strong>Simpan ke Foto</strong>.</p>
          <footer>Selamat Natal! Tuhan memberkati.</footer>
        </body>
        </html>
        """;
}
