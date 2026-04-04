"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpenIcon, Loader2Icon, XIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/core/i18n/hooks";
import { useKnowledgeBases } from "@/core/knowledge/hooks";
import {
  bindKnowledgeBases,
  getThreadKnowledgeBases,
  unbindKnowledgeBase,
} from "@/core/threads/kb-api";
import { cn } from "@/lib/utils";

import { Tooltip } from "./tooltip";

export function ThreadKBSettings({ threadId }: { threadId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: bindings = [], isLoading: bindingsLoading } = useQuery({
    queryKey: ["thread-kb-bindings", threadId],
    queryFn: () => getThreadKnowledgeBases(threadId),
    enabled: !!threadId,
  });

  const { knowledgeBases, isLoading: kbsLoading } = useKnowledgeBases();

  const boundKbIds = new Set(bindings.map((b) => b.kb_id));
  const availableKbs = knowledgeBases.filter((kb) => !boundKbIds.has(kb.id));

  const bindMutation = useMutation({
    mutationFn: (kbIds: string[]) => bindKnowledgeBases(threadId, kbIds),
    onSuccess: () => {
      toast.success(t.knowledge.bindSuccess);
      setSelectedIds([]);
      void queryClient.invalidateQueries({
        queryKey: ["thread-kb-bindings", threadId],
      });
    },
    onError: () => {
      toast.error(t.knowledge.bindFailed);
    },
  });

  const unbindMutation = useMutation({
    mutationFn: (kbId: string) => unbindKnowledgeBase(threadId, kbId),
    onSuccess: () => {
      toast.success(t.knowledge.unbindSuccess);
      void queryClient.invalidateQueries({
        queryKey: ["thread-kb-bindings", threadId],
      });
    },
    onError: () => {
      toast.error(t.knowledge.unbindFailed);
    },
  });

  const toggleSelect = useCallback((kbId: string) => {
    setSelectedIds((prev) =>
      prev.includes(kbId) ? prev.filter((id) => id !== kbId) : [...prev, kbId],
    );
  }, []);

  const handleBind = useCallback(() => {
    if (selectedIds.length > 0) {
      bindMutation.mutate(selectedIds);
    }
  }, [selectedIds, bindMutation]);

  const isLoading = bindingsLoading || kbsLoading;

  return (
    <Popover>
      <Tooltip content={t.knowledge.threadKb}>
        <PopoverTrigger asChild>
          <Button
            className="text-muted-foreground hover:text-foreground"
            variant="ghost"
            size="icon-sm"
          >
            <BookOpenIcon className="size-4" />
            {bindings.length > 0 && (
              <span className="text-xs">{bindings.length}</span>
            )}
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3">
          <h4 className="text-sm font-medium">{t.knowledge.threadKb}</h4>
          <p className="text-muted-foreground text-xs">
            {t.knowledge.threadKbDescription}
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2Icon className="text-muted-foreground size-4 animate-spin" />
          </div>
        ) : (
          <ScrollArea className="max-h-72">
            {/* Bound KBs */}
            {bindings.length > 0 && (
              <div className="px-4 py-2">
                <p className="text-muted-foreground mb-2 text-xs font-medium">
                  {t.knowledge.boundKbs}
                </p>
                <div className="flex flex-col gap-1">
                  {bindings.map((binding) => (
                    <div
                      key={binding.id}
                      className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm"
                    >
                      <span className="truncate">{binding.kb_name}</span>
                      <Button
                        className="text-muted-foreground hover:text-destructive size-6 shrink-0"
                        variant="ghost"
                        size="icon-sm"
                        disabled={unbindMutation.isPending}
                        onClick={() => unbindMutation.mutate(binding.kb_id)}
                      >
                        <XIcon className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Available KBs */}
            {availableKbs.length > 0 && (
              <div className="border-t px-4 py-2">
                <p className="text-muted-foreground mb-2 text-xs font-medium">
                  {t.knowledge.availableKbs}
                </p>
                <div className="flex flex-col gap-1">
                  {availableKbs.map((kb) => (
                    <button
                      key={kb.id}
                      type="button"
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        selectedIds.includes(kb.id)
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50",
                      )}
                      onClick={() => toggleSelect(kb.id)}
                    >
                      <div
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border",
                          selectedIds.includes(kb.id)
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/30",
                        )}
                      >
                        {selectedIds.includes(kb.id) && (
                          <svg
                            className="size-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </div>
                      <span className="truncate">{kb.name}</span>
                    </button>
                  ))}
                </div>
                {selectedIds.length > 0 && (
                  <Button
                    className="mt-2 w-full"
                    size="sm"
                    disabled={bindMutation.isPending}
                    onClick={handleBind}
                  >
                    {bindMutation.isPending ? (
                      <Loader2Icon className="size-3 animate-spin" />
                    ) : (
                      t.knowledge.bind
                    )}
                  </Button>
                )}
              </div>
            )}

            {/* Empty states */}
            {bindings.length === 0 && availableKbs.length === 0 && (
              <div className="text-muted-foreground px-4 py-6 text-center text-sm">
                {t.knowledge.noAvailableKbs}
              </div>
            )}
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function ThreadKBBadges({
  kbIds,
  onRemove,
}: {
  kbIds: string[];
  onRemove: (kbId: string) => void;
}) {
  const { knowledgeBases } = useKnowledgeBases();

  if (kbIds.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {kbIds.map((kbId) => {
        const kb = knowledgeBases.find((k) => k.id === kbId);
        return (
          <Badge
            key={kbId}
            variant="secondary"
            className="gap-1 pr-1 text-xs"
          >
            <BookOpenIcon className="size-3" />
            <span className="max-w-24 truncate">
              {kb?.name ?? kbId}
            </span>
            <button
              type="button"
              className="hover:text-destructive ml-0.5 rounded-full"
              onClick={() => onRemove(kbId)}
            >
              <XIcon className="size-3" />
            </button>
          </Badge>
        );
      })}
    </div>
  );
}
