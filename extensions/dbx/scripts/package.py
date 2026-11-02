"""Build a frontend-only DBX plugin package (.dbxp, a zip with manifest at root)."""
from pathlib import Path
import json
import zipfile

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"


def main() -> None:
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    DIST.mkdir(parents=True, exist_ok=True)
    output = DIST / f"{manifest['id']}-{version}-universal.dbxp"

    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as package:
        for relative in ("manifest.json", "assets", "ui"):
            source = ROOT / relative
            files = [source] if source.is_file() else sorted(source.rglob("*"))
            for path in files:
                if path.is_dir():
                    continue
                arcname = path.relative_to(ROOT).as_posix()
                info = zipfile.ZipInfo(arcname, date_time=(2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                package.writestr(info, path.read_bytes())

    print(f"built {output} ({output.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
