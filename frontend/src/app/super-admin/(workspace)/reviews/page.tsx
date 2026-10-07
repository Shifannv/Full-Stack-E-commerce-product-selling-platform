"use client";

import { Suspense, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { superAdminApi } from "@/lib/api/super-admin";
import { operatorKeys } from "@/lib/api/query-keys";
import { PageHeader, Panel } from "@/components/operator/page-header";
import { DataTable, type Column } from "@/components/operator/data-table";
import { EmptyPanel, LoadingPanel } from "@/components/operator/states";
import { StatusBadge } from "@/components/operator/status-badge";
import { useToast } from "@/components/operator/toast";
import { describeApiError } from "@/lib/api/errors";
import { dateTime } from "@/components/operator/money";
import { Button } from "@/components/ui/button";
import type { PendingReview } from "@/lib/api/types";

// ─── moderation inline row ────────────────────────────────────────────────────

function ModerationRow({
  review,
  onDone,
}: {
  review: PendingReview;
  onDone: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: (decision: "PUBLISHED" | "REJECTED") =>
      superAdminApi.moderateReview(review.id, decision, notes),
    onSuccess: (_, decision) => {
      toast.success(decision === "PUBLISHED" ? "Review published." : "Review rejected.");
      setOpen(false);
      setNotes("");
      onDone();
    },
    onError: (error) => toast.error(describeApiError(error, "mutation").message),
  });

  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Moderate
      </Button>
    );

  return (
    <div className="grid gap-2 rounded-md border border-border bg-muted/40 p-3">
      <label className="grid gap-1 text-xs">
        Moderation notes
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={1000}
          required
          placeholder="Add the required moderation note…"
          className="min-h-16"
          autoFocus
        />
      </label>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!notes.trim() || mutation.isPending}
          onClick={() => mutation.mutate("PUBLISHED")}
        >
          Publish
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={!notes.trim() || mutation.isPending}
          onClick={() => mutation.mutate("REJECTED")}
        >
          Reject
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => { setOpen(false); setNotes(""); }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── refund authorization ─────────────────────────────────────────────────────

function RefundAuthRow({ returnId, onDone }: { returnId: string; onDone: () => void }) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  const mutation = useMutation({
    mutationFn: () => superAdminApi.authorizeRefund(returnId),
    onSuccess: () => {
      toast.success("Refund authorized.");
      setConfirming(false);
      onDone();
    },
    onError: (error) => toast.error(describeApiError(error, "mutation").message),
  });

  if (!confirming)
    return (
      <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
        Authorize refund
      </Button>
    );

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3">
      <p className="flex-1 text-xs text-muted-foreground">Authorize refund for this return?</p>
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        Confirm
      </Button>
      <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

function ReviewsPageContent() {
  const queryClient = useQueryClient();
  const [returnId, setReturnId] = useState("");

  const list = useQuery({
    queryKey: operatorKeys.superPendingReviews(),
    queryFn: () => superAdminApi.pendingReviews(),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["super-admin", "reviews"] });
  }

  const columns: Column<PendingReview>[] = [
    {
      key: "review",
      header: "Review",
      primary: true,
      cell: (row) => (
        <div className="min-w-0 max-w-sm">
          <p className="truncate font-medium" title={row.title}>{row.title || "(no title)"}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{row.body}</p>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            Product {row.productId.slice(0, 8)}…
          </p>
        </div>
      ),
    },
    {
      key: "rating",
      header: "Rating",
      className: "tabular-nums text-center",
      cell: (row) => (
        <span className="text-sm font-semibold">
          {"★".repeat(row.rating)}{"☆".repeat(5 - row.rating)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "submitted",
      header: "Submitted",
      hideOnCard: true,
      className: "whitespace-nowrap text-xs text-muted-foreground",
      cell: (row) => dateTime(row.createdAt),
    },
    {
      key: "actions",
      header: "Actions",
      className: "min-w-[14rem]",
      cell: (row) => (
        <ModerationRow review={row} onDone={invalidate} />
      ),
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Review moderation"
        description="Pending customer reviews waiting for a publish or reject decision."
      />

      <Panel>
        <DataTable
          caption="Pending reviews"
          columns={columns}
          rows={list.data?.reviews ?? null}
          rowKey={(row) => row.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => void list.refetch()}
          empty={
            <EmptyPanel title="No reviews pending moderation">
              All submitted reviews have been moderated.
            </EmptyPanel>
          }
        />
      </Panel>

      {/* Refund authorization — per-return, not surfaced as a list today */}
      <Panel title="Authorize a refund">
        <div className="grid gap-3 p-4">
          <label className="grid gap-1.5 text-sm font-medium">
            Return ID
            <input
              value={returnId}
              onChange={(event) => setReturnId(event.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="font-mono text-sm"
            />
          </label>
          {returnId.trim() ? (
            <RefundAuthRow
              returnId={returnId.trim()}
              onDone={() => setReturnId("")}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              Enter a return ID above to authorize its refund.
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}

export default function ReviewsPage() {
  return (
    <Suspense fallback={<LoadingPanel />}>
      <ReviewsPageContent />
    </Suspense>
  );
}
