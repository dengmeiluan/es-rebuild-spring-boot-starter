package io.github.dengmeiluan.es.rebuild.mapping;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

final class MappingTargetResolutionException extends IOException {

    static final String AMBIGUOUS_ALIAS_TARGET = "AMBIGUOUS_ALIAS_TARGET";

    private final String code;
    private final List<String> observedTargets;

    MappingTargetResolutionException(String logicalIndex, List<String> observedTargets) {
        super("Failed to resolve alias target for index [" + logicalIndex + "]: "
                + AMBIGUOUS_ALIAS_TARGET + " targets=" + observedTargets);
        this.code = AMBIGUOUS_ALIAS_TARGET;
        this.observedTargets = Collections.unmodifiableList(new ArrayList<String>(
                Objects.requireNonNull(observedTargets, "observedTargets")));
    }

    String getCode() {
        return code;
    }

    List<String> getObservedTargets() {
        return observedTargets;
    }
}
