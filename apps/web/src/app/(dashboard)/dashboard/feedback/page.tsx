"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MessageSquarePlus, Lightbulb, AlertCircle, Clock, CheckCircle2, CheckCheck } from "lucide-react";
import api, { apiErrMsg } from "@/lib/api";

interface FeedbackItem {
  id: string;
  type: "suggestion" | "complaint";
  title: string;
  content: string;
  status: "pending" | "reviewed" | "resolved";
  created_at: string;
}

const TYPE_CONFIG = {
  suggestion: { label: "Sugestão", icon: Lightbulb, color: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200 dark:border-blue-800" },
  complaint:  { label: "Reclamação", icon: AlertCircle, color: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border-red-200 dark:border-red-800" },
};

const STATUS_CONFIG = {
  pending:  { label: "Pendente",  icon: Clock,         variant: "outline" as const },
  reviewed: { label: "Em análise", icon: CheckCircle2, variant: "secondary" as const },
  resolved: { label: "Resolvido", icon: CheckCheck,    variant: "default" as const },
};

const fetcher = (url: string) => api.get(url).then(r => r.data);

export default function FeedbackPage() {
  const [type, setType] = useState<"suggestion" | "complaint">("suggestion");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: items = [], isLoading } = useSWR<FeedbackItem[]>("/feedback", fetcher);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error("Preencha o título e a descrição.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/feedback", { type, title: title.trim(), content: content.trim() });
      await mutate("/feedback");
      setTitle("");
      setContent("");
      toast.success("Enviado com sucesso! Agradecemos seu feedback.");
    } catch (err) {
      toast.error(apiErrMsg(err, "Erro ao enviar feedback"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquarePlus className="h-6 w-6 text-blue-600" />
          Sugestões e Reclamações
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Compartilhe sua opinião, reporte problemas ou sugira melhorias para a plataforma.
        </p>
      </div>

      {/* Form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Novo feedback</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Type selector */}
            <div className="flex gap-2">
              {(["suggestion", "complaint"] as const).map(t => {
                const cfg = TYPE_CONFIG[t];
                const Icon = cfg.icon;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                      type === t ? cfg.color : "border-input text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Título</label>
              <input
                type="text"
                placeholder={type === "suggestion" ? "Ex: Adicionar exportação para Excel" : "Ex: Gráfico não carrega no Safari"}
                value={title}
                onChange={e => setTitle(e.target.value)}
                maxLength={255}
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>

            {/* Content */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Descrição</label>
              <textarea
                placeholder={type === "suggestion"
                  ? "Descreva sua sugestão com detalhes. Qual problema ela resolve? Como poderia funcionar?"
                  : "Descreva o problema com detalhes. Quando acontece? Quais passos para reproduzir?"}
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={5}
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 resize-none"
              />
            </div>

            <Button type="submit" disabled={submitting || !title.trim() || !content.trim()} className="w-full">
              {submitting ? "Enviando..." : "Enviar feedback"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Previous submissions */}
      {(isLoading || items.length > 0) && (
        <>
          <Separator />
          <div className="space-y-4">
            <h2 className="text-base font-semibold">Seus feedbacks anteriores</h2>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2].map(i => (
                  <div key={i} className="h-24 rounded-lg border bg-muted/30 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {items.map(item => {
                  const typeCfg = TYPE_CONFIG[item.type];
                  const statusCfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pending;
                  const TypeIcon = typeCfg.icon;
                  const StatusIcon = statusCfg.icon;
                  return (
                    <Card key={item.id}>
                      <CardContent className="pt-4 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium shrink-0 ${typeCfg.color}`}>
                              <TypeIcon className="h-3 w-3" />
                              {typeCfg.label}
                            </span>
                            <p className="text-sm font-medium truncate">{item.title}</p>
                          </div>
                          <Badge variant={statusCfg.variant} className="shrink-0 gap-1 text-xs">
                            <StatusIcon className="h-3 w-3" />
                            {statusCfg.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">{item.content}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(item.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
