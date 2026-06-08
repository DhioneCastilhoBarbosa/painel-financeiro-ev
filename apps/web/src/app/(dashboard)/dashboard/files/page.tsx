"use client";

import { PlanGate } from "@/components/PlanGate";
import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Loader2, Trash2, RefreshCw, CheckCircle, XCircle, Clock, Database } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { formatBytes, formatDate, formatNumber } from "@/lib/format";
import type { DataFile } from "@/lib/types";
import useSWR, { mutate } from "swr";

interface ExampleDataset {
  name: string;
  filename: string;
  available: boolean;
}

const fetcher = (url: string) => api.get(url).then((r) => r.data);

function StatusBadge({ status }: { status: DataFile["status"] }) {
  const map = {
    done: { label: "Processado", icon: CheckCircle, class: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-800" },
    pending: { label: "Aguardando", icon: Clock, class: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800" },
    processing: { label: "Processando", icon: Loader2, class: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-800" },
    error: { label: "Erro", icon: XCircle, class: "text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-800" },
  };
  const { label, icon: Icon, class: cls } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cls}`}>
      <Icon className={`h-3 w-3 ${status === "processing" ? "animate-spin" : ""}`} />
      {label}
    </span>
  );
}

export default function FilesPage() {
  return (
    <PlanGate feature="files">
      <FilesPageContent />
    </PlanGate>
  );
}

function FilesPageContent() {
  const { data: files, isLoading } = useSWR<DataFile[]>("/files", fetcher, { refreshInterval: 3000 });
  const { data: examples } = useSWR<ExampleDataset[]>("/files/examples", fetcher);
  const [uploading, setUploading] = useState(false);

  // Invalidate all analytics caches whenever any file transitions to "done"
  const prevDoneIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!files) return;
    const currentDone = new Set(files.filter(f => f.status === "done").map(f => f.id));
    const hasNewDone = [...currentDone].some(id => !prevDoneIds.current.has(id));
    if (hasNewDone) {
      // Broadcast invalidation to all analytics SWR keys
      mutate((key) => Array.isArray(key) && typeof key[0] === "string" && key[0].startsWith("/analytics"));
    }
    prevDoneIds.current = currentDone;
  }, [files]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loadingExample, setLoadingExample] = useState<string | null>(null);

  const loadExample = async (name: string) => {
    setLoadingExample(name);
    try {
      await api.post(`/files/examples/${encodeURIComponent(name)}/load`);
      toast.success(`Dataset "${name}" carregado com sucesso`);
      mutate("/files");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? "Erro ao carregar dataset");
    } finally {
      setLoadingExample(null);
    }
  };

  const onDrop = useCallback(async (accepted: File[]) => {
    if (accepted.length === 0) return;
    const file = accepted[0];
    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    setUploadProgress(0);

    try {
      await api.post("/files", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (e.total) setUploadProgress(Math.round((e.loaded * 100) / e.total));
        },
      });
      toast.success(`"${file.name}" enviado com sucesso`);
      mutate("/files");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? "Erro ao enviar arquivo");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"], "application/vnd.ms-excel": [".xls"] },
    maxFiles: 1,
    disabled: uploading,
  });

  const deleteFile = async (id: string, name: string) => {
    if (!confirm(`Remover "${name}"?`)) return;
    try {
      await api.delete(`/files/${id}`);
      toast.success("Arquivo removido");
      mutate("/files");
    } catch {
      toast.error("Erro ao remover arquivo");
    }
  };

  const reprocess = async (id: string) => {
    try {
      await api.post(`/files/${id}/reprocess`);
      toast.success("Reprocessamento iniciado");
      mutate("/files");
    } catch {
      toast.error("Erro ao reprocessar");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Arquivos</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Importe planilhas Excel da plataforma Intelbras</p>
      </div>

      {/* Upload area */}
      <Card>
        <CardContent className="pt-5">
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
              isDragActive
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                : uploading
                ? "border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/30 cursor-not-allowed"
                : "border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-slate-50 dark:hover:bg-slate-800/30"
            }`}
          >
            <input {...getInputProps()} />
            {uploading ? (
              <div className="space-y-3">
                <Loader2 className="h-10 w-10 text-blue-600 animate-spin mx-auto" />
                <p className="text-sm font-medium">Enviando arquivo...</p>
                <Progress value={uploadProgress} className="w-48 mx-auto h-1.5" />
                <p className="text-xs text-muted-foreground">{uploadProgress}%</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="h-10 w-10 text-slate-500 dark:text-slate-400 mx-auto" />
                <p className="font-medium">
                  {isDragActive ? "Solte o arquivo aqui" : "Arraste ou clique para selecionar"}
                </p>
                <p className="text-sm text-muted-foreground">Suporta .xlsx e .xls · Máx. 50 MB</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Example datasets */}
      {examples && examples.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-600" />
              Datasets de Exemplo
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Dados reais anonimizados para explorar o dashboard. Útil para avaliação e demonstração.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {examples.map((ex) => (
                <div
                  key={ex.name}
                  className="flex items-center gap-4 p-3 rounded-lg border hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <FileSpreadsheet className={`h-8 w-8 shrink-0 ${ex.available ? "text-blue-500" : "text-slate-300 dark:text-slate-600"}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${!ex.available ? "text-muted-foreground" : ""}`}>{ex.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ex.available ? ex.filename : "Dataset não disponível neste ambiente"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={!ex.available || loadingExample === ex.name}
                    onClick={() => loadExample(ex.name)}
                    title={!ex.available ? "Dataset não instalado no servidor" : undefined}
                  >
                    {loadingExample === ex.name ? (
                      <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Carregando...</>
                    ) : (
                      "Carregar"
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* File list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Arquivos importados</span>
            <Badge variant="secondary">{files?.length ?? 0}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : !files?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileSpreadsheet className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum arquivo importado ainda</p>
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-4 p-3 rounded-lg border hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <FileSpreadsheet className="h-8 w-8 text-green-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">{f.original_filename}</p>
                      <StatusBadge status={f.status} />
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground mt-0.5">
                      <span>{formatBytes(f.file_size_bytes)}</span>
                      {f.row_count !== null && <span>{formatNumber(f.row_count)} linhas</span>}
                      {f.date_min && (
                        <span>{formatDate(f.date_min)} → {f.date_max ? formatDate(f.date_max) : "?"}</span>
                      )}
                      <span>Importado {formatDate(f.created_at)}</span>
                    </div>
                    {f.error_message && (
                      <p className="text-xs text-red-600 mt-0.5 truncate">{f.error_message}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(f.status === "error" || f.status === "pending") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => reprocess(f.id)}
                        title="Reprocessar"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700"
                      onClick={() => deleteFile(f.id, f.original_filename)}
                      title="Remover"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
