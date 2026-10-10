package io.github.dengmeiluan.es.rebuild.docs;

import org.junit.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * README 双语同步守卫：
 * 中文 README.md 与英文 README_EN.md 是同一份能力说明的两种语言交付，
 * 结构漂移=国际用户丢入口（已实锚漂移：英文缺「设计文档」节、ops console 节
 * 缺能力清单、HTTP 端点节脱离快速开始序列）。守卫三层=主题节锚成对且同序+
 * 控制台能力清单锚+结构量化对表（代码块数/快速开始步数/端点表正向活锚），
 * 防再漂移；断言为结构性对齐锚，非逐字锁死全文档。
 */
public class ReadmeBilingualContractTest {

    private final Path starterRoot = Paths.get(System.getProperty("basedir", "."))
            .toAbsolutePath().normalize();

    private final String readme = read(starterRoot.resolve("README.md"));
    private final String readmeEn = read(starterRoot.resolve("README_EN.md"));

    /** 双语一级节主题锚对（中文标题 → 英文标题），顺序=文档出现顺序。 */
    private static final String[][] SECTION_ANCHORS = {
            {"## 它解决什么问题", "## The problem it solves"},
            {"## 特性", "## Features"},
            {"## 两种部署形态", "## Two deployment shapes"},
            {"## 快速开始", "## Quick start"},
            {"## 可运行示例", "## Runnable example"},
            {"## 运维控制台", "## The ops console"},
            {"## 从源码构建", "## Build from source"},
            {"## 兼容性", "## Compatibility"},
            {"## 设计文档", "## Design docs"},
            {"## License", "## License"},
    };

    @Test
    public void bilingualSectionAnchorsAligned() {
        int zhPos = -1;
        int enPos = -1;
        for (String[] pair : SECTION_ANCHORS) {
            int nextZh = readme.indexOf(pair[0]);
            int nextEn = readmeEn.indexOf(pair[1]);
            assertTrue("README 应含节「" + pair[0] + "」", nextZh >= 0);
            assertTrue("README_EN 应含节「" + pair[1] + "」", nextEn >= 0);
            assertTrue("README 节序错位：「" + pair[0] + "」应在上一节之后", nextZh > zhPos);
            assertTrue("README_EN 节序错位：「" + pair[1] + "」应在上一节之后", nextEn > enPos);
            zhPos = nextZh;
            enPos = nextEn;
        }
    }

    @Test
    public void englishOpsConsoleListsAllCapabilities() {
        /* 中文 ops console 节列了七项能力（托管重建/索引工作区/查询工作台/数据浏览器/
         * 集群治理/权限审计/实时监控），英文须逐项对齐——截图不能替代能力清单。 */
        String[] en = {"**Ad-hoc rebuilds**", "**Index workspace**", "**Query workbench**",
                "**Data browser**", "**Cluster governance**", "**Audit**", "**Live monitoring**"};
        for (String anchor : en) {
            assertTrue("README_EN ops console 应含能力清单项 " + anchor,
                    readmeEn.contains(anchor));
        }
    }

    @Test
    public void bilingualQuickStartStepsAligned() {
        for (int step = 1; step <= 5; step++) {
            String heading = "### " + step + ". ";
            assertTrue("README 快速开始应含第 " + step + " 步（" + heading + "）",
                    readme.contains(heading));
            assertTrue("README_EN quick start 应含第 " + step + " 步（" + heading + "）",
                    readmeEn.contains(heading));
        }
        assertEquals("双语代码块数量应对齐",
                countFences(readme), countFences(readmeEn));
    }

    @Test
    public void bilingualEndpointTableAligned() {
        /* 正向活锚：三端点双语各出现（自证守卫在读文档）。 */
        String[] endpoints = {"/internal/es/index/rebuild",
                "/internal/es/index/keys", "/internal/es/index/desired-state.html"};
        for (String endpoint : endpoints) {
            assertTrue("README 应含端点 " + endpoint, readme.contains(endpoint));
            assertTrue("README_EN 应含端点 " + endpoint, readmeEn.contains(endpoint));
        }
    }

    private static int countFences(String doc) {
        int count = 0;
        for (int idx = doc.indexOf("```"); idx >= 0; idx = doc.indexOf("```", idx + 3)) {
            count++;
        }
        return count;
    }

    private static String read(Path path) {
        try {
            return new String(Files.readAllBytes(path), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new AssertionError("无法读取 " + path, e);
        }
    }
}
