package io.github.dengmeiluan.es.rebuild.mapping;

import java.io.IOException;

public interface MappingPort {

    MappingSnapshot read(String indexOrAlias) throws IOException;

    void put(String indexOrAlias, String mappingJson) throws IOException;
}
