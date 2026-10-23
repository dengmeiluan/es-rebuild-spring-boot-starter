/*
 * Copyright 2026 Meiluan Deng
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package io.github.dengmeiluan.es.rebuild;

import org.junit.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * 根侧 standalone 钉版守卫：standalone 模块的项目版本与 starter 依赖钉版必须跟平
 * 仓根版本。既有 StandalonePomContractTest 也锁同语义，但它住在 standalone 模块
 * 测试期——CI 的 standalone 步在依赖解析阶段就因钉版漂移失败，守卫结构性不可达
 * （漂移本身让守卫无法执行）；而根 reactor 不含 standalone 模块，漂移在根侧测试期
 * 无声通过，直到 standalone 步才炸出「Could not find artifact」。
 *
 * <p>本守卫住根 reactor：版本 bump 漏跟 standalone 时，Backend tests 一步即红，
 * 把失败面从「远端 standalone 解析」前移到「根侧测试」，漂移当场现形。
 * （1.0.55 漂移由 standalone/pom.xml 手工跟平修复过一次；1.0.56/1.0.57 两次
 * bump 复发同一漂移——磨盘收口为守卫。）</p>
 */
public class StandalonePinGuard1035Test {

    private static String read(Path path) throws IOException {
        return new String(Files.readAllBytes(path), "UTF-8");
    }

    /** 跳过 &lt;parent&gt; 段取项目自身 &lt;version&gt;（两份 pom 同构） */
    private static String projectVersion(String pom) {
        int parentEnd = pom.indexOf("</parent>");
        int at = pom.indexOf("<version>", parentEnd);
        int end = pom.indexOf("</version>", at);
        return pom.substring(at + "<version>".length(), end).trim();
    }

    @Test
    public void standaloneProjectAndStarterPinFollowRootVersion() throws IOException {
        Path rootPom = Paths.get(System.getProperty("user.dir"), "pom.xml");
        Path standalonePom = Paths.get(System.getProperty("user.dir"), "standalone", "pom.xml");
        String root = read(rootPom);
        String standalone = read(standalonePom);

        String version = projectVersion(root);
        // 项目版本必须等值（contains 断言会被 starter 钉版行的同版本字面量满足，抓不住项目版本漂移）
        assertEquals("standalone/pom.xml 项目版本必须跟平仓根版本 " + version
                + "（bump 根 pom 时两处一起改；钉版漂移会让 CI standalone 步在依赖解析阶段失败）",
                version, projectVersion(standalone));

        String artifact = "es-rebuild-spring-boot-starter";
        int at = standalone.indexOf(artifact);
        assertTrue("standalone pom must depend on the starter", at > 0);
        String tail = standalone.substring(at);
        assertTrue("standalone 的 starter 依赖钉版必须跟平仓根版本 " + version + "（同上，两处一起改）",
                tail.contains("<version>" + version + "</version>"));
    }
}
