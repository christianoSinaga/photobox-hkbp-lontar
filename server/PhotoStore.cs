using System.Collections.Concurrent;
using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;

static partial class PhotoIds
{
    [GeneratedRegex("^[a-f0-9]{16}$", RegexOptions.CultureInvariant)]
    private static partial Regex Pattern();

    // Panjang dicek juga karena $ di regex .NET menerima newline di akhir string.
    public static bool IsValid([NotNullWhen(true)] string? id) => id is { Length: 16 } && Pattern().IsMatch(id);

    public static string New() => Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant();
}

record StoredPhoto(string Id, string File);
record SessionManifest(string Id, DateTime CreatedAt, StoredPhoto Main, List<StoredPhoto> Photos);

/// <summary>
/// Penyimpanan foto di disk:
/// - photos/{id}.jpg: foto yang baru di-upload dan belum masuk sesi.
/// - sessions/{yyyy-MM-dd_HH-mm-ss}_{sessionId}/: satu folder per sesi berisi bingkai.jpg,
///   foto-01.jpg, foto-02.jpg, ... dan session.json.
/// URL publik tetap memakai id foto; lokasi file dicari lewat indeks di memori.
/// </summary>
sealed partial class PhotoStore
{
    private const string ManifestName = "session.json";

    [GeneratedRegex(@"^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_([a-f0-9]{16})\z", RegexOptions.CultureInvariant)]
    private static partial Regex SessionFolderPattern();

    // Nama file di dalam folder sesi. Dicek saat membaca manifest supaya tidak bisa keluar folder.
    [GeneratedRegex(@"^(bingkai|foto-\d{2})\.jpg\z", RegexOptions.CultureInvariant)]
    private static partial Regex SessionFilePattern();

    private readonly string _photosDir;
    private readonly string _sessionsDir;
    private readonly ILogger _logger;
    private readonly ConcurrentDictionary<string, string> _photoPaths = new();
    private readonly ConcurrentDictionary<string, string> _sessionDirs = new();
    private readonly Lock _sessionLock = new();

    public PhotoStore(string storageDir, ILogger logger)
    {
        _photosDir = Path.Combine(storageDir, "photos");
        _sessionsDir = Path.Combine(storageDir, "sessions");
        _logger = logger;
        Directory.CreateDirectory(_photosDir);
        Directory.CreateDirectory(_sessionsDir);
        MigrateFlatSessions();
        BuildIndex();
    }

    public string PhotosDir => _photosDir;
    public string SessionsDir => _sessionsDir;

    public string? GetPhotoPath(string id) =>
        PhotoIds.IsValid(id) && _photoPaths.TryGetValue(id, out var path) && File.Exists(path) ? path : null;

    /// <summary>Simpan JPEG baru sebagai foto lepas (belum masuk sesi). Mengembalikan id foto.</summary>
    public async Task<string> SaveAsync(ReadOnlyMemory<byte> jpeg, CancellationToken ct)
    {
        string id;
        do id = PhotoIds.New(); while (_photoPaths.ContainsKey(id));
        var path = Path.Combine(_photosDir, id + ".jpg");
        // Tulis ke file sementara dulu agar /f/{id} tidak pernah menyajikan file setengah jadi.
        var tempPath = Path.Combine(_photosDir, id + ".tmp");
        await File.WriteAllBytesAsync(tempPath, jpeg, ct);
        File.Move(tempPath, path);
        _photoPaths[id] = path;
        return id;
    }

    public List<PhotoInfo> ListPhotos(int take) =>
        _photoPaths
            .Where(p => File.Exists(p.Value))
            .Select(p => new PhotoInfo(p.Key, File.GetCreationTimeUtc(p.Value)))
            .OrderByDescending(p => p.CreatedAt)
            .Take(take)
            .ToList();

    /// <summary>
    /// Buat sesi dan pindahkan foto-fotonya (yang masih lepas) ke folder sesi.
    /// Mengembalikan id sesi, atau pesan error jika foto tidak valid.
    /// </summary>
    public (string? Id, string? Error) CreateSession(string mainId, IReadOnlyList<string> photoIds)
    {
        var all = photoIds.Prepend(mainId).ToList();
        if (all.Distinct().Count() != all.Count) return (null, "Foto yang sama dipakai lebih dari sekali.");

        lock (_sessionLock)
        {
            // Hanya foto lepas yang boleh dimasukkan ke sesi baru (bukan foto milik sesi lain).
            foreach (var id in all)
            {
                var path = GetPhotoPath(id);
                if (path is null || !string.Equals(Path.GetDirectoryName(path), _photosDir, StringComparison.OrdinalIgnoreCase))
                    return (null, "Foto tidak ditemukan.");
            }

            string sessionId;
            do sessionId = PhotoIds.New(); while (_sessionDirs.ContainsKey(sessionId));
            var createdAt = DateTime.UtcNow;
            var folder = Path.Combine(_sessionsDir, FolderName(createdAt, sessionId));
            Directory.CreateDirectory(folder);

            var main = new StoredPhoto(mainId, "bingkai.jpg");
            var photos = photoIds.Select((id, i) => new StoredPhoto(id, $"foto-{i + 1:00}.jpg")).ToList();
            var moved = new List<(string From, string To)>();
            try
            {
                foreach (var photo in photos.Prepend(main))
                {
                    var from = _photoPaths[photo.Id];
                    var to = Path.Combine(folder, photo.File);
                    File.Move(from, to);
                    moved.Add((from, to));
                }
                var manifest = new SessionManifest(sessionId, createdAt, main, photos);
                File.WriteAllText(Path.Combine(folder, ManifestName), JsonSerializer.Serialize(manifest, JsonSerializerOptions.Web));
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException)
            {
                // Kembalikan foto ke tempat semula supaya tidak ada yang hilang.
                foreach (var (from, to) in moved) File.Move(to, from);
                TryDeleteDirectory(folder);
                throw;
            }

            foreach (var (from, to) in moved) _photoPaths[Path.GetFileNameWithoutExtension(from)] = to;
            _sessionDirs[sessionId] = folder;
            return (sessionId, null);
        }
    }

    public SessionManifest? GetSession(string sessionId) =>
        PhotoIds.IsValid(sessionId) && _sessionDirs.TryGetValue(sessionId, out var folder) ? ReadManifest(folder, sessionId) : null;

    public List<SessionManifest> ListSessions(int take) =>
        _sessionDirs
            .Select(s => ReadManifest(s.Value, s.Key))
            .OfType<SessionManifest>()
            .OrderByDescending(s => s.CreatedAt)
            .Take(take)
            .ToList();

    // ---------- Internal ----------

    private static string FolderName(DateTime createdAtUtc, string sessionId) =>
        $"{createdAtUtc.ToLocalTime().ToString("yyyy-MM-dd_HH-mm-ss", CultureInfo.InvariantCulture)}_{sessionId}";

    /// <summary>Baca session.json dan validasi ulang semua id dan nama file di dalamnya.</summary>
    private SessionManifest? ReadManifest(string folder, string expectedId)
    {
        try
        {
            var path = Path.Combine(folder, ManifestName);
            if (!File.Exists(path)) return null;
            var m = JsonSerializer.Deserialize<SessionManifest>(File.ReadAllText(path), JsonSerializerOptions.Web);
            if (m is null || m.Id != expectedId || m.Main is null || m.Photos is null) return null;
            if (!m.Photos.Prepend(m.Main).All(p => PhotoIds.IsValid(p.Id) && p.File is not null && SessionFilePattern().IsMatch(p.File)))
                return null;
            return m;
        }
        catch (Exception e) when (e is IOException or JsonException)
        {
            return null;
        }
    }

    private void BuildIndex()
    {
        foreach (var file in Directory.EnumerateFiles(_photosDir, "*.jpg"))
        {
            var id = Path.GetFileNameWithoutExtension(file);
            if (Path.GetExtension(file) == ".jpg" && PhotoIds.IsValid(id)) _photoPaths[id] = file;
        }

        foreach (var folder in Directory.EnumerateDirectories(_sessionsDir))
        {
            var match = SessionFolderPattern().Match(Path.GetFileName(folder));
            if (!match.Success) continue;
            var sessionId = match.Groups[1].Value;
            var manifest = ReadManifest(folder, sessionId);
            if (manifest is null)
            {
                _logger.LogWarning("Folder sesi {Folder} dilewati: session.json tidak ada atau tidak valid.", folder);
                continue;
            }
            _sessionDirs[sessionId] = folder;
            foreach (var photo in manifest.Photos.Prepend(manifest.Main))
                _photoPaths[photo.Id] = Path.Combine(folder, photo.File);
        }

        _logger.LogInformation("Indeks foto: {Photos} foto, {Sessions} sesi.", _photoPaths.Count, _sessionDirs.Count);
    }

    private sealed record FlatSession(string Main, List<string> Photos, DateTime CreatedAt);

    /// <summary>
    /// Sesi format lama (sessions/{id}.json, foto di photos/) dipindahkan ke format folder.
    /// Aman dijalankan berulang: file lama baru dihapus setelah folder baru lengkap.
    /// </summary>
    private void MigrateFlatSessions()
    {
        foreach (var file in Directory.EnumerateFiles(_sessionsDir, "*.json"))
        {
            var sessionId = Path.GetFileNameWithoutExtension(file);
            if (!PhotoIds.IsValid(sessionId)) continue;
            try
            {
                var old = JsonSerializer.Deserialize<FlatSession>(File.ReadAllText(file), JsonSerializerOptions.Web);
                if (old is null || !PhotoIds.IsValid(old.Main) || old.Photos is null || !old.Photos.All(PhotoIds.IsValid)) continue;

                var folder = Path.Combine(_sessionsDir, FolderName(old.CreatedAt, sessionId));
                Directory.CreateDirectory(folder);
                var main = new StoredPhoto(old.Main, "bingkai.jpg");
                var photos = old.Photos.Select((id, i) => new StoredPhoto(id, $"foto-{i + 1:00}.jpg")).ToList();
                foreach (var photo in photos.Prepend(main))
                {
                    var from = Path.Combine(_photosDir, photo.Id + ".jpg");
                    var to = Path.Combine(folder, photo.File);
                    if (File.Exists(from) && !File.Exists(to)) File.Move(from, to);
                }
                var manifest = new SessionManifest(sessionId, old.CreatedAt, main, photos);
                File.WriteAllText(Path.Combine(folder, ManifestName), JsonSerializer.Serialize(manifest, JsonSerializerOptions.Web));
                File.Delete(file);
                _logger.LogInformation("Sesi {Id} dipindahkan ke folder {Folder}.", sessionId, folder);
            }
            catch (Exception e) when (e is IOException or JsonException or UnauthorizedAccessException)
            {
                _logger.LogWarning(e, "Sesi lama {File} gagal dipindahkan; dicoba lagi saat server berikutnya menyala.", file);
            }
        }
    }

    private static void TryDeleteDirectory(string folder)
    {
        try
        {
            Directory.Delete(folder, recursive: true);
        }
        catch (IOException)
        {
        }
    }
}
