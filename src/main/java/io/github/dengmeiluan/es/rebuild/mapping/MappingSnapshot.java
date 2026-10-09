package io.github.dengmeiluan.es.rebuild.mapping;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

public final class MappingSnapshot {

    private final boolean indexExists;
    private final String logicalName;
    private final List<String> indexNames;
    private final String mappingJson;

    public MappingSnapshot(boolean indexExists,
                           String logicalName,
                           List<String> indexNames,
                           String mappingJson) {
        this.indexExists = indexExists;
        this.logicalName = Objects.requireNonNull(logicalName, "logicalName");
        this.indexNames = Collections.unmodifiableList(
                new ArrayList<String>(Objects.requireNonNull(indexNames, "indexNames")));
        this.mappingJson = mappingJson;
    }

    public boolean isIndexExists() {
        return indexExists;
    }

    public String getLogicalName() {
        return logicalName;
    }

    public List<String> getIndexNames() {
        return indexNames;
    }

    public String getMappingJson() {
        return mappingJson;
    }
}
