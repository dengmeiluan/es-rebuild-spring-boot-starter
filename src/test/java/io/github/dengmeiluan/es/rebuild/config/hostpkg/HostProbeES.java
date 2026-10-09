package io.github.dengmeiluan.es.rebuild.config.hostpkg;

import org.springframework.data.elasticsearch.annotations.Document;

/**
 * 模拟「宿主基础包里的一个 @Document 实体」—— 自动发现方案下业务侧接入的最小形态。
 *
 * <p>本包<b>只放这一个实体</b>，不设子包：ClientModeWiringTest 会把本包注册进
 * {@code AutoConfigurationPackages}，让 starter 真走一遍扫描链路。若包里再混入
 * 同简名实体（参见 core.scanfixture.dupkey），会撞 indexKey 触发 IndexMetaRegistry
 * 的 fail-fast，把「扫描链路通不通」的判据污染成「撞不撞 key」。</p>
 *
 * <p><b>刻意不加 {@code @Setting}/{@code @Mapping}</b>：IndexMetaRegistry.register()
 * 会用 ClassPathResource 真读注解里指向的 json，多一个注解就多一个必须真实存在的资源文件，
 * 而本 fixture 要验的只是「带 @Document 就能被发现」。</p>
 *
 * <p>indexKey 按 ManagedEsIndex#indexKey() 的默认反推规则（去 ES 后缀 + 首字母小写）
 * 得到 {@code hostProbe}。</p>
 */
@Document(indexName = "host_probe_alias")
public class HostProbeES {
}
