package io.github.dengmeiluan.es.rebuild.core.scanfixture;

import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Setting;

/**
 * 扫描器 fixture：有 @Setting 但**没有 @Mapping**。
 *
 * <p>对齐生产里的真实形态 BondRepurchaseBasicInfoES（有 settingPath、无 mappingPath）。
 * 用来钉住「@Mapping 可选，无它照样登记成功」。</p>
 */
@Document(indexName = "scan_nomapping_alias")
@Setting(settingPath = "scanfixture/scan_setting.json")
public class ScanNoMappingES {
}
