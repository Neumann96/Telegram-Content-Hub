"use client";

import { CalendarDays, ImagePlus, Plus, Search, Send, Settings2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createPublishTask,
  createSource,
  getPosts,
  getSources,
  saveDraft,
  type Post,
  type Source,
} from "@/lib/api";
import { useWorkspaceStore } from "@/store/workspace";

const statuses: Post["status"][] = ["new", "editing", "ready", "published", "archived"];

export default function Home() {
  const queryClient = useQueryClient();
  const { selectedPostId, setSelectedPostId } = useWorkspaceStore();
  const [newChannel, setNewChannel] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [draftText, setDraftText] = useState("");
  const [draftStatus, setDraftStatus] = useState<Post["status"]>("editing");
  const [targetChannel, setTargetChannel] = useState("");

  const sources = useQuery({ queryKey: ["sources"], queryFn: getSources });
  const postParams = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedSourceId) params.set("source_id", selectedSourceId);
    if (search) params.set("q", search);
    if (dateFrom) params.set("date_from", dateFrom);
    return params;
  }, [dateFrom, search, selectedSourceId]);
  const posts = useQuery({ queryKey: ["posts", postParams.toString()], queryFn: () => getPosts(postParams) });

  const selectedPost = posts.data?.posts.find((post) => post.id === selectedPostId) ?? posts.data?.posts[0];

  useEffect(() => {
    if (selectedPost && selectedPost.id !== selectedPostId) {
      setSelectedPostId(selectedPost.id);
    }
  }, [selectedPost, selectedPostId, setSelectedPostId]);

  useEffect(() => {
    if (selectedPost) {
      setDraftText(selectedPost.edited_text || selectedPost.raw_text);
      setDraftStatus(selectedPost.status === "new" ? "editing" : selectedPost.status);
    }
  }, [selectedPost]);

  const addSource = useMutation({
    mutationFn: createSource,
    onSuccess: () => {
      setNewChannel("");
      queryClient.invalidateQueries({ queryKey: ["sources"] });
    },
  });

  const draft = useMutation({
    mutationFn: () => saveDraft(selectedPost!.id, draftText, draftStatus),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posts"] }),
  });

  const publish = useMutation({
    mutationFn: () => createPublishTask(selectedPost!.id, targetChannel),
    onSuccess: () => setTargetChannel(""),
  });

  return (
    <main className="min-h-screen">
      <header className="flex h-14 items-center justify-between border-b bg-card px-5">
        <div>
          <h1 className="text-base font-semibold">Telegram Content Hub</h1>
          <p className="text-xs text-muted-foreground">
            {posts.isError ? "API недоступен" : "Phase 1 workspace"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Settings2 className="h-4 w-4" />
            Источники
          </Button>
          <Button size="sm" disabled={!selectedPost || !targetChannel || publish.isPending} onClick={() => publish.mutate()}>
            <Send className="h-4 w-4" />
            Опубликовать
          </Button>
        </div>
      </header>

      <section className="grid min-h-[calc(100vh-3.5rem)] grid-cols-[280px_minmax(360px,1fr)_440px]">
        <aside className="border-r bg-card p-4">
          <form
            className="mb-4 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (newChannel.trim()) addSource.mutate(newChannel);
            }}
          >
            <Input value={newChannel} onChange={(event) => setNewChannel(event.target.value)} placeholder="@channel" />
            <Button type="submit" variant="outline" size="icon" aria-label="Добавить канал" disabled={addSource.isPending}>
              <Plus className="h-4 w-4" />
            </Button>
          </form>

          <div className="space-y-2">
            <ChannelButton
              active={!selectedSourceId}
              source={{ id: "", username: "Все каналы", title: "", description: "" }}
              onClick={() => setSelectedSourceId("")}
            />
            {(sources.data?.sources ?? []).map((source) => (
              <ChannelButton
                key={source.id}
                source={source}
                active={selectedSourceId === source.id}
                onClick={() => setSelectedSourceId(source.id)}
              />
            ))}
          </div>
        </aside>

        <section className="border-r p-4">
          <div className="mb-4 grid grid-cols-[1fr_150px] gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск" />
            </div>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            {(posts.data?.posts ?? []).map((post) => (
              <button
                key={post.id}
                onClick={() => setSelectedPostId(post.id)}
                className="w-full rounded-md border bg-card p-3 text-left hover:border-primary"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="line-clamp-1 text-sm font-medium">{post.edited_text || post.raw_text || "Медиа-пост"}</span>
                  <span className="rounded-sm bg-muted px-2 py-1 text-xs text-muted-foreground">{post.status}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{post.source_username}</span>
                  <span>{post.posted_at ? new Date(post.posted_at).toLocaleDateString("ru-RU") : ""}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <aside className="bg-card p-4">
          {selectedPost ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Редактор</h2>
                  <p className="text-xs text-muted-foreground">{selectedPost.source_username}</p>
                </div>
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={draftStatus}
                  onChange={(event) => setDraftStatus(event.target.value as Post["status"])}
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              <textarea
                className="h-56 w-full resize-none rounded-md border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
              />

              <div className="mt-3 grid grid-cols-5 gap-2">
                {["B", "I", "U", "S", "Code"].map((label) => (
                  <Button key={label} variant="outline" onClick={() => setDraftText(`${draftText}${label === "Code" ? "`code`" : ""}`)}>
                    {label}
                  </Button>
                ))}
              </div>

              <div className="mt-4 rounded-md border bg-background p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Изображения</span>
                  <Button variant="outline" size="icon" aria-label="Добавить изображение">
                    <ImagePlus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {selectedPost.media.map((item) => (
                    <div key={item.id} className="relative aspect-square rounded-md border bg-muted p-2 text-xs">
                      <span className="line-clamp-2">{item.kind}</span>
                      <Button className="absolute bottom-2 right-2" variant="outline" size="icon" aria-label="Удалить изображение">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                <Input value={targetChannel} onChange={(event) => setTargetChannel(event.target.value)} placeholder="@target_channel" />
                <Button disabled={draft.isPending} onClick={() => draft.mutate()}>
                  Черновик
                </Button>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Нет выбранного поста</div>
          )}
        </aside>
      </section>
    </main>
  );
}

function ChannelButton({
  source,
  active,
  onClick,
}: {
  source: Pick<Source, "id" | "username" | "title" | "description" | "last_message_id">;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted ${
        active ? "border-primary bg-muted" : "bg-card"
      }`}
    >
      <span className="line-clamp-1">{source.title || source.username}</span>
      <span className="text-xs text-muted-foreground">{source.last_message_id ? "ok" : "new"}</span>
    </button>
  );
}
