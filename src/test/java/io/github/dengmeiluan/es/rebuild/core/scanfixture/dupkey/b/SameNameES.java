package io.github.dengmeiluan.es.rebuild.core.scanfixture.dupkey.b;

import org.springframework.data.elasticsearch.annotations.Document;

/** 撞 indexKey 的 fixture（B 包）。见 dupkey.a.SameNameES 的注释。 */
@Document(indexName = "dup_b_alias")
public class SameNameES {
}
