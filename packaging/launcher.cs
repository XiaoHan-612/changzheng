// 《星火微光 · 我路过他们的长征》单文件启动器
// ─────────────────────────────────────────────────────────────
// 这个 exe = 启动器（本文件编译出来的 ~20 KB）+ 追加在末尾的游戏数据（zip）。
//
// 为什么要这么做：Chromium 必须从磁盘上的真实文件加载，没法从内存跑起来，
// 所以「一个文件」只能是**分发形态**是一个文件。启动器负责把它展开一次：
//
//   首次双击  → 解到 %LOCALAPPDATA%\长征-抉择\app\（约 400 MB，带进度条），写版本戳
//   以后再双击 → 版本戳对得上就跳过解包，直接拉起游戏（几百毫秒）
//
// 不写注册表、不建快捷方式、不装服务：整个软件就是这一个 exe 加一个用户数据目录。
// 换新版只需把这个 exe 覆盖过去，版本戳一变会自动重新展开。
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Windows.Forms;

internal static class Launcher
{
    const string APP_NAME = "长征 · 抉择";
    const string APP_EXE = "长征-抉择.exe";
    const string DIR_NAME = "长征-抉择";        // %LOCALAPPDATA% 下的目录名
    const string ZIP_TOP = "长征-抉择";          // zip 里的顶层目录名
    const string BUILD_STAMP = "@@BUILD_STAMP@@"; // 打包脚本替换成数据指纹
    const int TRAILER_SIZE = 16;                  // [magic 8][payload offset 8]
    static readonly byte[] TRAILER_MAGIC = Encoding.ASCII.GetBytes("CZPK1END");

    [STAThread]
    static int Main()
    {
        try
        {
            Run();
            return 0;
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "《" + APP_NAME + "》启动失败：\r\n\r\n" + ex.Message
                + "\r\n\r\n把这段提示截图发给开发者即可。",
                APP_NAME, MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }

    static void Run()
    {
        string exePath = Assembly.GetExecutingAssembly().Location;
        string root = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), DIR_NAME);
        string appDir = Path.Combine(root, "app");
        string stateDir = Path.Combine(root, "user-data");
        string stampFile = Path.Combine(root, "版本戳.txt");
        string appExe = Path.Combine(appDir, APP_EXE);

        bool needExtract = !File.Exists(appExe) || ReadStamp(stampFile) != BUILD_STAMP;
        if (needExtract) Extract(exePath, appDir, stampFile);

        if (!File.Exists(appExe))
            throw new FileNotFoundException("展开后没找到 " + APP_EXE + "，文件可能不完整。", appExe);

        // 把「配置与日志放哪」显式告诉外壳：放在 app\ 外面，
        // 这样以后换新版重新展开也不会把玩家的日志和设置冲掉。
        var psi = new ProcessStartInfo(appExe);
        psi.WorkingDirectory = appDir;
        psi.UseShellExecute = false;
        psi.EnvironmentVariables["CZ_STATE_DIR"] = stateDir;
        Process.Start(psi);
    }

    static string ReadStamp(string file)
    {
        try { return File.Exists(file) ? File.ReadAllText(file, Encoding.UTF8).Trim() : ""; }
        catch { return ""; }
    }

    static void Extract(string exePath, string destDir, string stampFile)
    {
        long offset;
        using (var fs = new FileStream(exePath, FileMode.Open, FileAccess.Read, FileShare.Read))
        {
            if (fs.Length < TRAILER_SIZE) throw new InvalidDataException("文件不完整（没有内嵌数据）。");
            fs.Seek(-TRAILER_SIZE, SeekOrigin.End);
            var trailer = new byte[TRAILER_SIZE];
            ReadExactly(fs, trailer);
            for (int i = 0; i < TRAILER_MAGIC.Length; i++)
            {
                if (trailer[i] != TRAILER_MAGIC[i])
                    throw new InvalidDataException("找不到内嵌的游戏数据 —— 文件可能被截断、被杀软改过，或没下载完整。");
            }
            offset = BitConverter.ToInt64(trailer, 8);
            if (offset <= 0 || offset >= fs.Length - TRAILER_SIZE)
                throw new InvalidDataException("内嵌数据的偏移不对，文件已损坏。");
        }

        using (var fs = new FileStream(exePath, FileMode.Open, FileAccess.Read, FileShare.Read))
        using (var payload = new SubStream(fs, offset, fs.Length - offset - TRAILER_SIZE))
        using (var zip = new ZipArchive(payload, ZipArchiveMode.Read, false, Encoding.UTF8))
        {
            long total = 0;
            foreach (var e in zip.Entries) total += e.Length;
            if (total <= 0) throw new InvalidDataException("内嵌数据是空的。");

            // 每次都是干净的一份：上一次中途失败留下的半截文件不会混进来
            if (Directory.Exists(destDir)) Directory.Delete(destDir, true);
            Directory.CreateDirectory(destDir);
            string destRoot = Path.GetFullPath(destDir) + Path.DirectorySeparatorChar;

            var splash = new Splash();
            splash.Show();
            splash.Step(0, "首次运行：正在展开游戏文件（约 400 MB，只需这一次）…");

            long done = 0;
            var buffer = new byte[256 * 1024];
            foreach (var entry in zip.Entries)
            {
                string rel = entry.FullName.Replace('\\', '/');
                if (rel.StartsWith("./")) rel = rel.Substring(2);
                if (ZIP_TOP.Length > 0 && rel.StartsWith(ZIP_TOP + "/")) rel = rel.Substring(ZIP_TOP.Length + 1);
                if (rel.Length == 0) continue;
                if (rel.EndsWith("/"))
                {
                    Directory.CreateDirectory(Path.Combine(destDir, rel.TrimEnd('/')));
                    continue;
                }

                string target = Path.GetFullPath(Path.Combine(destDir, rel));
                if (!target.StartsWith(destRoot, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException("压缩包里出现了越界路径：" + rel);

                string parent = Path.GetDirectoryName(target);
                if (!string.IsNullOrEmpty(parent)) Directory.CreateDirectory(parent);

                using (var input = entry.Open())
                using (var output = new FileStream(target, FileMode.Create, FileAccess.Write, FileShare.None))
                {
                    int n;
                    while ((n = input.Read(buffer, 0, buffer.Length)) > 0)
                    {
                        output.Write(buffer, 0, n);
                        done += n;
                        if ((done & 0x3FFFFF) < n)   // 大约每 4 MB 刷一次进度
                            splash.Step((int)(done * 1000 / total), null);
                    }
                }
            }

            File.WriteAllText(stampFile, BUILD_STAMP, Encoding.UTF8);
            splash.Step(1000, "展开完成，正在启动…");
            splash.Close();
        }
    }

    static void ReadExactly(Stream s, byte[] buf)
    {
        int off = 0;
        while (off < buf.Length)
        {
            int n = s.Read(buf, off, buf.Length - off);
            if (n <= 0) throw new EndOfStreamException();
            off += n;
        }
    }

    /// <summary>只读、可定位的「文件切片」——让 ZipArchive 能直接读 exe 尾部那段数据，不必先落一份临时文件</summary>
    sealed class SubStream : Stream
    {
        readonly Stream _base;
        readonly long _start;
        readonly long _length;
        long _pos;

        public SubStream(Stream b, long start, long length)
        {
            _base = b; _start = start; _length = length;
        }

        public override bool CanRead { get { return true; } }
        public override bool CanSeek { get { return true; } }
        public override bool CanWrite { get { return false; } }
        public override long Length { get { return _length; } }
        public override long Position { get { return _pos; } set { _pos = value; } }

        public override int Read(byte[] buffer, int offset, int count)
        {
            long remain = _length - _pos;
            if (remain <= 0) return 0;
            if (count > remain) count = (int)remain;
            _base.Seek(_start + _pos, SeekOrigin.Begin);
            int n = _base.Read(buffer, offset, count);
            _pos += n;
            return n;
        }

        public override long Seek(long offset, SeekOrigin origin)
        {
            long next;
            if (origin == SeekOrigin.Begin) next = offset;
            else if (origin == SeekOrigin.Current) next = _pos + offset;
            else next = _length + offset;
            _pos = next;
            return _pos;
        }

        public override void Flush() { }
        public override void SetLength(long value) { throw new NotSupportedException(); }
        public override void Write(byte[] buffer, int offset, int count) { throw new NotSupportedException(); }
    }

    /// <summary>首次展开时的进度窗：四千多个文件、四百兆，没有反馈会让人以为程序死了</summary>
    sealed class Splash : Form
    {
        readonly ProgressBar _bar;
        readonly Label _text;

        public Splash()
        {
            Text = APP_NAME;
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(460, 100);
            BackColor = Color.FromArgb(11, 13, 18);
            ShowInTaskbar = true;
            TopMost = true;

            var title = new Label();
            title.Text = "长 征 · 抉 择";
            title.ForeColor = Color.FromArgb(232, 226, 212);
            title.Font = new Font("Microsoft YaHei", 12f);
            title.SetBounds(24, 16, 412, 28);
            title.BackColor = Color.Transparent;

            _text = new Label();
            _text.Text = "正在启动…";
            _text.ForeColor = Color.FromArgb(150, 146, 138);
            _text.Font = new Font("Microsoft YaHei", 8.5f);
            _text.SetBounds(24, 48, 412, 20);
            _text.BackColor = Color.Transparent;

            _bar = new ProgressBar();
            _bar.SetBounds(24, 72, 412, 6);
            _bar.Minimum = 0;
            _bar.Maximum = 1000;
            _bar.Style = ProgressBarStyle.Continuous;

            Controls.Add(title);
            Controls.Add(_text);
            Controls.Add(_bar);
        }

        public void Step(int permille, string text)
        {
            if (text != null) _text.Text = text;
            if (permille < 0) permille = 0;
            if (permille > 1000) permille = 1000;
            // 展开过程中进度偶尔倒着走（文件大小总和与实际写入的差），夹住别让控件抛异常
            if (permille >= _bar.Value) _bar.Value = permille;
            Application.DoEvents();
        }
    }
}
