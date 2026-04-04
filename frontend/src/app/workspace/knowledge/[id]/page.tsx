"use client";

import { ArrowLeftIcon, Trash2Icon } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentList } from "@/components/workspace/knowledge/document-list";
import { DocumentUpload } from "@/components/workspace/knowledge/document-upload";
import { SearchPanel } from "@/components/workspace/knowledge/search-panel";
import { useI18n } from "@/core/i18n/hooks";
import {
  useDeleteKnowledgeBase,
  useDocuments,
  useKnowledgeBase,
} from "@/core/knowledge/hooks";

export default function KnowledgeBaseDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const kbId = params.id;
  const { knowledgeBase, isLoading } = useKnowledgeBase(kbId);
  const { documents, isLoading: docsLoading } = useDocuments(kbId);
  const deleteMutation = useDeleteKnowledgeBase();

  const handleDelete = useCallback(async () => {
    if (!kbId) return;
    if (!confirm(t.knowledge.deleteConfirm)) return;
    try {
      await deleteMutation.mutateAsync(kbId);
      toast.success(t.knowledge.deleted);
      router.push("/workspace/knowledge");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t.knowledge.deleteFailed,
      );
    }
  }, [kbId, deleteMutation, router, t.knowledge.deleteConfirm, t.knowledge.deleted, t.knowledge.deleteFailed]);

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex items-center justify-center py-12 text-sm">
        {t.common.loading}
      </div>
    );
  }

  if (!knowledgeBase) {
    return (
      <div className="text-muted-foreground flex items-center justify-center py-12 text-sm">
        {t.knowledge.notFound}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/workspace/knowledge")}
            aria-label={t.knowledge.backToList}
          >
            <ArrowLeftIcon className="size-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{knowledgeBase.name}</h1>
            {knowledgeBase.description && (
              <p className="text-muted-foreground text-sm">
                {knowledgeBase.description}
              </p>
            )}
          </div>
          <Badge variant="secondary">
            {documents.length} {documents.length === 1 ? "doc" : "docs"}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          aria-label={t.knowledge.deleteConfirm}
          className="text-destructive hover:text-destructive"
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>

      <Tabs defaultValue="documents" className="flex flex-1 flex-col">
        <div className="border-b px-6">
          <TabsList variant="line">
            <TabsTrigger value="documents">{t.knowledge.documents}</TabsTrigger>
            <TabsTrigger value="search">{t.knowledge.searchButton}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="documents" className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-col gap-6">
            <DocumentUpload kbId={kbId} />
            <DocumentList
              kbId={kbId}
              documents={documents}
              isLoading={docsLoading}
            />
          </div>
        </TabsContent>

        <TabsContent value="search" className="flex-1 overflow-y-auto p-6">
          <SearchPanel kbId={kbId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
