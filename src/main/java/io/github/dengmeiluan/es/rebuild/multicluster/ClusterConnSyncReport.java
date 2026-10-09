package io.github.dengmeiluan.es.rebuild.multicluster;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 一轮连接中心同步的报告(连接中心自动同步批):计数 + 脱敏中文明细。
 * {@code GET internal/es/index/clusters/sync} 数据源;notes 只含集群名/原因,绝不含密码(红线)。
 *
 * @author aicoding
 */
public final class ClusterConnSyncReport {

    private final long finishedAt;
    private final long durationMs;
    private final String trigger;            // boot(预留)/scheduled/manual
    private final boolean contributorBroken; // 降级红线置位
    private final int contributedTotal;      // 贡献者原始条数
    private final int created;
    private final int updated;
    private final int unchanged;             // 指纹全同免刷
    private final int duplicatesMerged;      // 源内同集群重复登记并入
    private final int skippedConflicts;      // 与手工连接同集群,手工优先跳过
    private final int skipped;               // skipReason/字段缺失等不可同步条
    private final int markedStale;           // 源已失联标记
    private final int restored;              // 失联恢复
    private final int errors;                // 单条失败
    private final List<String> notes;

    private ClusterConnSyncReport(Builder b) {
        this.finishedAt = System.currentTimeMillis();
        this.durationMs = b.durationMs;
        this.trigger = b.trigger;
        this.contributorBroken = b.contributorBroken;
        this.contributedTotal = b.contributedTotal;
        this.created = b.created;
        this.updated = b.updated;
        this.unchanged = b.unchanged;
        this.duplicatesMerged = b.duplicatesMerged;
        this.skippedConflicts = b.skippedConflicts;
        this.skipped = b.skipped;
        this.markedStale = b.markedStale;
        this.restored = b.restored;
        this.errors = b.errors;
        this.notes = Collections.unmodifiableList(new ArrayList<>(b.notes));
    }

    public static Builder builder() { return new Builder(); }

    public long getFinishedAt() { return finishedAt; }
    public long getDurationMs() { return durationMs; }
    public String getTrigger() { return trigger; }
    public boolean isContributorBroken() { return contributorBroken; }
    public int getContributedTotal() { return contributedTotal; }
    public int getCreated() { return created; }
    public int getUpdated() { return updated; }
    public int getUnchanged() { return unchanged; }
    public int getDuplicatesMerged() { return duplicatesMerged; }
    public int getSkippedConflicts() { return skippedConflicts; }
    public int getSkipped() { return skipped; }
    public int getMarkedStale() { return markedStale; }
    public int getRestored() { return restored; }
    public int getErrors() { return errors; }
    public List<String> getNotes() { return notes; }

    /** 累加器(引擎内部用;builder 语义,count 类字段只增不减)。 */
    public static final class Builder {
        private long durationMs;
        private String trigger = "scheduled";
        private boolean contributorBroken;
        private int contributedTotal;
        private int created;
        private int updated;
        private int unchanged;
        private int duplicatesMerged;
        private int skippedConflicts;
        private int skipped;
        private int markedStale;
        private int restored;
        private int errors;
        private final List<String> notes = new ArrayList<>();

        public Builder durationMs(long v) { this.durationMs = v; return this; }
        public Builder trigger(String v) { this.trigger = v; return this; }
        public Builder contributorBroken(boolean v) { this.contributorBroken = v; return this; }
        public Builder contributedTotal(int v) { this.contributedTotal = v; return this; }
        public Builder created(int v) { this.created += v; return this; }
        public Builder updated(int v) { this.updated += v; return this; }
        public Builder unchanged(int v) { this.unchanged += v; return this; }
        public Builder duplicatesMerged(int v) { this.duplicatesMerged += v; return this; }
        public Builder skippedConflicts(int v) { this.skippedConflicts += v; return this; }
        public Builder skipped(int v) { this.skipped += v; return this; }
        public Builder markedStale(int v) { this.markedStale += v; return this; }
        public Builder restored(int v) { this.restored += v; return this; }
        public Builder errors(int v) { this.errors += v; return this; }
        public Builder note(String v) { this.notes.add(v); return this; }

        public ClusterConnSyncReport build() { return new ClusterConnSyncReport(this); }
    }
}
