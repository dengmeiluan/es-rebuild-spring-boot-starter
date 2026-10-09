package io.github.dengmeiluan.es.rebuild.core.scanfixture.dupkey.a;

import org.springframework.data.elasticsearch.annotations.Document;

/**
 * 撞 indexKey 的 fixture（A 包）。与 dupkey.b.SameNameES 同简名，
 * 两者都反推出 indexKey `sameName` —— 这是**自动发现才会出现**的冲突场景：
 * 手写注册时两个类摆在眼前一眼能看见，自动发现之后藏起来了。
 */
@Document(indexName = "dup_a_alias")
public class SameNameES {
}
