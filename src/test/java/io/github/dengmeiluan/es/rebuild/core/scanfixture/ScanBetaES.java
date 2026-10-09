package io.github.dengmeiluan.es.rebuild.core.scanfixture;

import org.springframework.data.elasticsearch.annotations.Document;

/** 扫描器 fixture：只有 @Document。 */
@Document(indexName = "scan_beta_alias")
public class ScanBetaES {
}
