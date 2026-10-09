package io.github.dengmeiluan.es.rebuild.core.scanfixture;

import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Mapping;
import org.springframework.data.elasticsearch.annotations.Setting;

/** 扫描器 fixture：带 @Setting + @Mapping 的常规实体。 */
@Document(indexName = "scan_alpha_alias")
@Setting(settingPath = "scanfixture/scan_setting.json")
@Mapping(mappingPath = "scanfixture/scan_mapping.json")
public class ScanAlphaES {
}
