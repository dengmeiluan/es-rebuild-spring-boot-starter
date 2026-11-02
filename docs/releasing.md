# Releasing

SearchDeck releases are cut from `main` with a signed Git tag. The tag-driven workflow builds,
verifies, and publishes the artifacts; no manual upload is required.

## Preconditions

1. `main` is green in CI (backend, frontend, extensions, typecheck, CodeQL).
2. `CHANGELOG.md` has an entry for the version being released.
3. The version is identical in:
   - `pom.xml` (`<artifactId>searchdeck</artifactId>` project version),
   - `ui/package.json`,
   - `extensions/chrome/manifest.json` and `package.json`,
   - `extensions/dbx/manifest.json` and `package.json`,
   - `CITATION.cff`.
4. The release profile passes locally:

   ```bash
   cd ui && npm ci && npm run build && cd ..
   mvn -P release -DskipTests -Dconsole.build.skip=true verify
   ```

5. Reproducibility check: build `package` twice and compare the SHA-256 of the `platform`,
   `console`, and `server` jars. They must match.

## Tag and publish

```bash
git checkout main
git pull --ff-only
git tag -a v2.0.0 -m "SearchDeck 2.0.0"
git push origin v2.0.0
```

The `Release` workflow then:

1. validates the tag against every declared project version;
2. builds the UI, Maven artifacts, sources, Javadocs, and aggregate SBOM;
3. runs Chrome/DBX launcher tests and packages both launchers;
4. writes `SHA256SUMS` and a build provenance attestation;
5. creates the GitHub Release with generated notes.

Verify the release page, checksums, SBOM, and attestation before announcing it.

## Artifacts

| File | Purpose |
|---|---|
| `searchdeck-server-<version>.jar` | Standalone server (boot jar) |
| `searchdeck-platform-<version>.jar` | Platform kernel for hosts |
| `searchdeck-console-<version>.jar` | Embeddable console + engine |
| `*-sources.jar`, `*-javadoc.jar` | Sources and API docs for library modules |
| `searchdeck-chrome-<version>.zip` | Chrome MV3 extension |
| `io.github.dengmeiluan.searchdeck-<version>-universal.dbxp` | DBX plugin |
| `searchdeck-sbom.json` | CycloneDX SBOM |
| `SHA256SUMS` | Checksums for every artifact |

## Maven Central

The repository does not publish to Maven Central yet. To publish, add your own
`distributionManagement`, a signing key (`maven-gpg-plugin`), and the Central publishing plugin to
the `release` profile. Keep sources, Javadocs, SBOM, and reproducible timestamps; they are already
produced by the release profile.

## Rollback

- Bad artifact, no code issue: supersede with a patch release; do not rewrite published tags.
- Bad tag: delete the GitHub Release and tag, fix the issue, then create a new patch version.
- Security issue: follow [SECURITY.md](../SECURITY.md), release a fix out of band, and disclose after
  users can upgrade.
