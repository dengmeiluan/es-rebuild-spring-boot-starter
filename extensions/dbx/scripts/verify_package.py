"""Verify a built .dbxp package has the expected frontend-only layout."""
from pathlib import Path
import json
import sys
import zipfile

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"


def main() -> None:
    packages = sorted(DIST.glob("*.dbxp"))
    if not packages:
        raise SystemExit("no .dbxp package found; run scripts/package.py first")
    package = packages[-1]
    with zipfile.ZipFile(package) as archive:
        names = set(archive.namelist())
        required = {"manifest.json", "assets/plugin.svg", "ui/index.html", "ui/app.js", "ui/style.css"}
        missing = sorted(required - names)
        if missing:
            raise SystemExit(f"{package.name} missing: {', '.join(missing)}")
        manifest = json.loads(archive.read("manifest.json"))
        if manifest.get("manifest_version") != 1:
            raise SystemExit("manifest_version must be 1")
        if any(name.startswith(("dist/", "test/", "scripts/")) for name in names):
            raise SystemExit("development files leaked into the package")
    print(f"verified {package.name}: {len(names)} entries")


if __name__ == "__main__":
    main()
    sys.exit(0)
