package io.github.dengmeiluan.es.rebuild.control;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.ApplicationContext;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.data.elasticsearch.core.mapping.SimpleElasticsearchMappingContext;

/**
 * 实体索引名离线解析（）：把「@Document 索引名解析」从宿主 {@link ElasticsearchOperations}
 * 解耦出来——宿主有 ops 则沿用（与历史行为逐字节一致）；没有则用裸
 * {@link SimpleElasticsearchMappingContext} 解析（纯元数据计算，不建任何连接）。
 *
 * <p>这是「宿主零 ES 依赖」的地基： 之前索引名解析都借宿主 ops 完成，导致
 * 无 ES Bean 的宿主（quote web 形态）连启动都过不去。SpEL（{@code #{@environment...}}）
 * 与 {@code ${...}} 占位符经 {@link ApplicationContext} 照常解析，两条路径结果一致。</p>
 *
 * @author aicoding
 */
public class EntityIndexNames {

    private final ObjectProvider<ElasticsearchOperations> hostOps;
    private final SimpleElasticsearchMappingContext fallbackContext;

    public EntityIndexNames(ObjectProvider<ElasticsearchOperations> hostOps, ApplicationContext applicationContext) {
        this.hostOps = hostOps;
        SimpleElasticsearchMappingContext ctx = new SimpleElasticsearchMappingContext();
        // 必须挂 ApplicationContext：@Document indexName 的 #{@environment.getProperty(...)} SpEL
        // 依赖 BeanFactoryResolver，裸 MappingContext 不挂则解析失败
        ctx.setApplicationContext(applicationContext);
        this.fallbackContext = ctx;
    }

    /** 解析实体的 @Document 索引名（SpEL/占位符已展开）。 */
    public String indexNameOf(Class<?> entityClass) {
        ElasticsearchOperations ops = hostOps.getIfAvailable();
        if (ops != null) {
            return ops.getIndexCoordinatesFor(entityClass).getIndexName();
        }
        return fallbackContext.getRequiredPersistentEntity(entityClass).getIndexCoordinates().getIndexName();
    }
}
