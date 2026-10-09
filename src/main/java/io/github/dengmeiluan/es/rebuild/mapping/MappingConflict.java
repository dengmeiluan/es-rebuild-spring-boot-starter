package io.github.dengmeiluan.es.rebuild.mapping;

public final class MappingConflict {

    private final String path;
    private final String actualSummary;
    private final String desiredSummary;
    private final String code;

    public MappingConflict(String path, String actualSummary, String desiredSummary, String code) {
        this.path = path;
        this.actualSummary = actualSummary;
        this.desiredSummary = desiredSummary;
        this.code = code;
    }

    public String getPath() {
        return path;
    }

    public String getActualSummary() {
        return actualSummary;
    }

    public String getDesiredSummary() {
        return desiredSummary;
    }

    public String getCode() {
        return code;
    }
}
