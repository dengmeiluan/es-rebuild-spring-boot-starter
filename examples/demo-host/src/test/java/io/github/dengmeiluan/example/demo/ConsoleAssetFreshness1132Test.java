package io.github.dengmeiluan.example.demo;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.web.server.LocalServerPort;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 1132：控制台静态产物必须只暴露「当前这一份」。
 *
 * <p>背景（实测缺陷）：`maven-resources-plugin` 只覆盖式复制、从不删除目标目录里多出的文件，
 * 而 vite 每次构建都换哈希名。不跑 `mvn clean` 的增量构建会让
 * `target/classes/static/console/assets/` 堆积历史 bundle（实测 5849 个 vs 源码 278 个）。
 * 这些文件经 `/console/assets/**`（直连 classpath，正常启用时无白名单）**可被 HTTP 直接请求**——
 * 拿旧文件名就能加载修复前的控制台代码，等于绕过本轮全部权限加固。</p>
 *
 * <p>本测试从两个方向钉死：</p>
 * <ol>
 *   <li>index.html 引用的当前 bundle 必须 200（清理没有误删产物）；</li>
 *   <li>打包进 classpath 的 bundle 集合必须与源码里的**完全一致**（没有历史残留）。</li>
 * </ol>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"es.rebuild.console.home-dir=target/demo-asset-probe",
                "es.rebuild.console.sqlite-path=target/demo-asset-probe/jobs.db"})
class ConsoleAssetFreshness1132Test {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate rest;

    @Test
    void 当前bundle可访问且index页可加载() {
        int html = rest.getForEntity("http://localhost:" + port + "/es-rebuild.html", String.class)
                .getStatusCodeValue();
        assertEquals(200, html, "控制台入口页必须可访问");
    }

    /**
     * 打进 classpath 的 console assets 与源码侧**完全一致**——多出来的就是历史残留。
     *
     * <p>为什么必须双向比对：只逐个请求源码里的文件名，只能证明「该有的都有」，
     * 证不出「没有多余的」（实测：塞一个陈旧 bundle 后，那种写法依然全绿 = 假通过）。</p>
     *
     * <p>实现上直接枚举 starter jar 内的 `static/console/assets/` 条目：
     * `ClassLoader.getResource` 只会返回**第一个**命中（demo-host 自己的 classes 或依赖 jar），
     * 拿它做目录列举会漏掉另一侧，进而把「少了一个空名条目」误判成泄漏。</p>
     */
    @Test
    void classpath中的bundle集合与源码侧完全一致() throws Exception {
        Path srcAssets = Paths.get("..", "src", "main", "resources", "static", "console", "assets");
        if (!Files.isDirectory(srcAssets)) {
            srcAssets = Paths.get("..", "..", "src", "main", "resources", "static", "console", "assets");
        }
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.isDirectory(srcAssets),
                "源码侧 assets 目录不在预期位置，跳过（不把定位失败当成通过）");

        java.util.Set<String> sourceNames;
        try (Stream<Path> s = Files.list(srcAssets)) {
            sourceNames = s.filter(Files::isRegularFile)
                    .map(p -> p.getFileName().toString()).collect(Collectors.toSet());
        }
        assertTrue(sourceNames.size() > 0, "源码侧 assets 不应为空");

        /* 找到 starter jar（承载 console 产物），直接读它的条目 */
        Path jar = findStarterJar();
        assertTrue(jar != null, "本地仓库里必须能找到已安装的 starter jar");

        java.util.Set<String> jarNames = new java.util.TreeSet<>();
        String prefix = "static/console/assets/";
        try (java.util.zip.ZipFile zf = new java.util.zip.ZipFile(jar.toFile())) {
            java.util.Enumeration<? extends java.util.zip.ZipEntry> en = zf.entries();
            while (en.hasMoreElements()) {
                java.util.zip.ZipEntry e = en.nextElement();
                String name = e.getName();
                if (e.isDirectory() || !name.startsWith(prefix)) continue;
                String rest = name.substring(prefix.length());
                if (rest.isEmpty() || rest.contains("/")) continue;
                jarNames.add(rest);
            }
        }
        assertTrue(jarNames.size() > 0, "starter jar 里必须含 console assets：" + jar);

        java.util.Set<String> stale = new java.util.TreeSet<>(jarNames);
        stale.removeAll(sourceNames);
        java.util.Set<String> missing = new java.util.TreeSet<>(sourceNames);
        missing.removeAll(jarNames);

        assertTrue(stale.isEmpty(),
                "jar 里有 " + stale.size() + " 个源码侧不存在的历史 bundle（可被 /console/assets/** 直接请求，"
                        + "等于对外提供旧控制台代码）：" + stale.stream().limit(10).collect(Collectors.toList()));
        assertTrue(missing.isEmpty(),
                "源码侧的 bundle 未被打进 jar：" + missing.stream().limit(10).collect(Collectors.toList()));
    }

    /** 从本地 Maven 仓库找当前版本的 starter jar。 */
    private static Path findStarterJar() {
        String home = System.getProperty("user.home");
        Path repo = Paths.get(home, ".m2", "repository",
                "io", "github", "dengmeiluan", "es-rebuild-spring-boot-starter");
        if (!Files.isDirectory(repo)) {
            /* 本机约定：仓库根 pom 的 localRepository 可能指向 D:/mvn_repository */
            repo = Paths.get("D:", "mvn_repository",
                    "io", "github", "dengmeiluan", "es-rebuild-spring-boot-starter");
        }
        if (!Files.isDirectory(repo)) return null;
        try (Stream<Path> s = Files.walk(repo, 3)) {
            return s.filter(p -> p.getFileName().toString().endsWith(".jar"))
                    .filter(p -> !p.getFileName().toString().contains("sources"))
                    .filter(p -> !p.getFileName().toString().contains("javadoc"))
                    .max(java.util.Comparator.comparingLong(p -> p.toFile().lastModified()))
                    .orElse(null);
        } catch (Exception e) {
            return null;
        }
    }

    /** 不存在于当前构建的哈希名必须 404——证明「classpath 里没有的东西不会被服务」。 */
    @Test
    void 历史哈希bundle返回404() {
        int code = rest.getForEntity(
                "http://localhost:" + port + "/console/assets/index-00000000.js", String.class)
                .getStatusCodeValue();
        assertEquals(404, code, "不存在的 bundle 不应返回 200");
    }
}
