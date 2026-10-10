package io.github.dengmeiluan.es.rebuild.standalone;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * standalone 模块结构契约：可执行应用 jar 与库 jar 的纪律互为镜像。
 *
 * <p>库 jar（仓根）：BOOT-INF=0、ES 栈 provided、repackage skip=true；
 * 应用 jar（本模块）：repackage 生效（fat jar）、ES 栈 compile 由本模块自带、
 * starter 依赖版本与仓根版本同步（防两坐标漂移）。</p>
 */
class StandalonePomContractTest {

    private static String read(Path path) throws IOException {
        return new String(Files.readAllBytes(path), "UTF-8");
    }

    private static String repoPom() throws IOException {
        return read(Paths.get(System.getProperty("user.dir"), "..", "pom.xml"));
    }

    private static String standalonePom() throws IOException {
        return read(Paths.get(System.getProperty("user.dir"), "pom.xml"));
    }

    @Test
    public void starterDependencyVersionMatchesRepoVersion() throws IOException {
        String repo = repoPom();
        String standalone = standalonePom();

        String artifact = "es-rebuild-spring-boot-starter";
        assertTrue(standalone.contains("<artifactId>" + artifact + "</artifactId>"),
                "standalone pom must depend on the starter");

        // 仓根 <version> 在 <parent> 之后第一处 project version；standalone 引用必须与其同步
        String repoVersion = projectVersion(repo);
        String expected = "<version>" + repoVersion + "</version>";
        int at = standalone.indexOf(artifact);
        assertTrue(at > 0, "starter dependency missing");
        String tail = standalone.substring(at);
        assertTrue(tail.contains(expected),
                "standalone must pin starter version " + repoVersion + " (same line as repo pom); update both together");
    }

    @Test
    public void executableJarDiscipline() throws IOException {
        String standalone = standalonePom();

        // 应用 jar：repackage 生效（parent 默认绑定），且绝不配 skip=true
        assertFalse(standalone.replaceAll("(?s)<!--.*?-->", "")
                        .contains("<skip>true</skip>"),
                "standalone must stay a bootable fat jar — never skip repackage");

        // ES 栈由本模块 compile 自带（starter 侧是 provided），版本走 parent BOM
        String withoutComments = standalone.replaceAll("(?s)<!--.*?-->", "");
        for (String required : Arrays.asList(
                "spring-boot-starter-web",
                "spring-boot-starter-data-elasticsearch",
                "elasticsearch-rest-high-level-client")) {
            assertTrue(withoutComments.contains(required),
                    "standalone pom must declare compile dependency " + required);
        }
    }

    private static String projectVersion(String pom) {
        // 跳过 <parent> 段，取项目自身 <version>
        int parentEnd = pom.indexOf("</parent>");
        int at = pom.indexOf("<version>", parentEnd);
        int end = pom.indexOf("</version>", at);
        return pom.substring(at + "<version>".length(), end).trim();
    }
}
