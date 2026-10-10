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
 * 产物源码 stdout 卫生守卫：src/main/java（含 standalone 与 examples 模块）不得残留
 * System.out/err 直打与 printStackTrace——调试输出进用户日志面即缺陷，一律走
 * SLF4J logger 或删除。命中即红，防调试残留回潮。
 */
public class StdoutHygieneGuardTest {

    private static final Pattern STDOUT = Pattern.compile(
            "System\\.out\\.println|System\\.err\\.println|\\.printStackTrace\\(");

    @Test
    public void productionSourcesAreFreeOfStdoutDebugging() throws IOException {
        List<String> hits = new ArrayList<>();
        try (Stream<Path> walk = Files.walk(Paths.get(System.getProperty("basedir", ".")))) {
            walk.filter(p -> p.toString().endsWith(".java"))
                    .filter(p -> p.toString().replace('\\', '/').contains("/src/main/java/"))
                    .forEach(p -> {
                        try {
                            List<String> lines = Files.readAllLines(p, StandardCharsets.UTF_8);
                            for (int i = 0; i < lines.size(); i++) {
                                if (STDOUT.matcher(lines.get(i)).find()) {
                                    hits.add(p.getFileName() + ":" + (i + 1));
                                }
                            }
                        } catch (IOException e) {
                            throw new RuntimeException(e);
                        }
                    });
        }
        assertTrue("产物源码残留 stdout 直打 " + hits.size() + " 处（首 20）：\n  "
                + String.join("\n  ", hits.subList(0, Math.min(20, hits.size()))), hits.isEmpty());
    }
}
