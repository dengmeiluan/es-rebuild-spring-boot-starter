package io.github.dengmeiluan.es.rebuild.docs;

import org.junit.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.junit.Assert.assertTrue;

/**
 * 内部记账语汇守卫：公开仓库的源码注释不得携带内部批号/轮次/Task 编号等台账黑话
 * （开源读者视角这些是无从查证的内部语汇）。命中即红，防清洗成果回潮。
 */
public class InternalJargonGuardTest {

    private static final Pattern JARGON = Pattern.compile(
            "(?<![A-Za-z0-9])R\\d{2,3}[a-z]?(?![0-9A-Za-z_])"
                    + "|第[一二三四五六七八九十百千零]{1,3}[批轮]"
                    + "|[一二三四五六七八九十百千零]{2,}批"
                    + "|\\b\\d{3} *批"
                    + "|(?<![A-Za-z])Task ?\\d+[a-z]?(?![A-Za-z0-9_])"
                    + "|G\\d{2,3}(?![0-9A-Za-z_])");

    @Test
    public void javaSourcesAreFreeOfInternalJargon() throws IOException {
        List<String> hits = new ArrayList<>();
        try (Stream<Path> walk = Files.walk(Paths.get(System.getProperty("basedir", "."), "src"))) {
            walk.filter(p -> p.toString().endsWith(".java")).forEach(p -> {
                try {
                    List<String> lines = Files.readAllLines(p, StandardCharsets.UTF_8);
                    for (int i = 0; i < lines.size(); i++) {
                        if (JARGON.matcher(lines.get(i)).find()) {
                            hits.add(p.getFileName() + ":" + (i + 1));
                        }
                    }
                } catch (IOException e) {
                    throw new RuntimeException(e);
                }
            });
        }
        assertTrue("源码残留内部记账黑话 " + hits.size() + " 处（首 20）：\n  "
                + String.join("\n  ", hits.subList(0, Math.min(20, hits.size()))), hits.isEmpty());
    }
}
