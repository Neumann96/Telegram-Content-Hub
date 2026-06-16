"use client";

import {
  CalendarDays,
  Edit3,
  ImagePlus,
  ListFilter,
  LogIn,
  LogOut,
  MessageCircle,
  Plus,
  Search,
  Send,
  Settings2,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearStoredUser,
  createPublishTask,
  createSource,
  getBootstrap,
  getPosts,
  getSources,
  getStoredUser,
  loginWithTelegram,
  saveDraft,
  storeUser,
  type Post,
  type Source,
  type TelegramLoginPayload,
  type User,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/workspace";

declare global {
  interface Window {
    onTelegramAuth?: (payload: TelegramLoginPayload) => void;
  }
}

const statuses: Post["status"][] = ["new", "editing", "ready", "published", "archived"];
const panels = [
  { id: "sources", label: "Каналы", icon: ListFilter },
  { id: "posts", label: "Посты", icon: MessageCircle },
  { id: "editor", label: "Редактор", icon: Edit3 },
] as const;

type Panel = (typeof panels)[number]["id"];

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
  const [activePanel, setActivePanel] = useState<Panel>("posts");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  const bootstrap = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });
  const sources = useQuery({ queryKey: ["sources", user?.id], queryFn: getSources });
  const postParams = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedSourceId) params.set("source_id", selectedSourceId);
    if (search) params.set("q", search);
    if (dateFrom) params.set("date_from", dateFrom);
    return params;
  }, [dateFrom, search, selectedSourceId]);
  const posts = useQuery({
    queryKey: ["posts", user?.id, postParams.toString()],
    queryFn: () => getPosts(postParams),
  });

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

  const telegramLogin = useMutation({
    mutationFn: loginWithTelegram,
    onSuccess: ({ user: loggedInUser }) => {
      storeUser(loggedInUser);
      setUser(loggedInUser);
      queryClient.invalidateQueries();
    },
  });

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

  function logout() {
    clearStoredUser();
    setUser(null);
    queryClient.invalidateQueries();
  }

  function selectPost(postId: string) {
    setSelectedPostId(postId);
    setActivePanel("editor");
  }

  const loginBot = bootstrap.data?.telegram_login_bot?.replace(/^@/, "") ?? "";

  return (
    <main className="min-h-screen">
      <header className="flex min-h-14 flex-col gap-3 border-b bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between lg:px-5">
        <div className="min-w-0">
          <h1 className="text-base font-semibold">Telegram Content Hub</h1>
          <p className="text-xs text-muted-foreground">
            {posts.isError ? "API недоступен" : user ? "Phase 1 workspace" : "Войдите через Telegram"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AuthPanel
            botName={loginBot}
            user={user}
            isLoading={telegramLogin.isPending}
            error={telegramLogin.error?.message}
            onAuth={(payload) => telegramLogin.mutate(payload)}
            onLogout={logout}
          />
          <Button variant="outline" size="sm">
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">Источники</span>
          </Button>
          <Button size="sm" disabled={!selectedPost || !targetChannel || publish.isPending} onClick={() => publish.mutate()}>
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Опубликовать</span>
          </Button>
        </div>
      </header>

      <nav className="grid grid-cols-3 border-b bg-card p-2 lg:hidden">
        {panels.map((panel) => {
          const Icon = panel.icon;
          return (
            <button
              key={panel.id}
              onClick={() => setActivePanel(panel.id)}
              className={cn(
                "flex h-10 items-center justify-center gap-2 rounded-md text-sm font-medium text-muted-foreground",
                activePanel === panel.id && "bg-muted text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {panel.label}
            </button>
          );
        })}
      </nav>

      <section className="grid min-h-[calc(100vh-7.5rem)] grid-cols-1 lg:min-h-[calc(100vh-3.5rem)] lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(360px,1fr)_440px]">
        <aside className={cn("border-r bg-card p-4", activePanel !== "sources" && "hidden lg:block")}>
          <form
            className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2"
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
              onClick={() => {
                setSelectedSourceId("");
                setActivePanel("posts");
              }}
            />
            {(sources.data?.sources ?? []).map((source) => (
              <ChannelButton
                key={source.id}
                source={source}
                active={selectedSourceId === source.id}
                onClick={() => {
                  setSelectedSourceId(source.id);
                  setActivePanel("posts");
                }}
              />
            ))}
          </div>
        </aside>

        <section className={cn("border-r p-4", activePanel !== "posts" && "hidden lg:block")}>
          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск" />
            </div>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            {(posts.data?.posts ?? []).map((post) => (
              <button
                key={post.id}
                onClick={() => selectPost(post.id)}
                className={cn(
                  "w-full rounded-md border bg-card p-3 text-left hover:border-primary",
                  selectedPost?.id === post.id && "border-primary",
                )}
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <span className="line-clamp-2 min-w-0 text-sm font-medium">{post.edited_text || post.raw_text || "Медиа-пост"}</span>
                  <span className="shrink-0 rounded-sm bg-muted px-2 py-1 text-xs text-muted-foreground">{post.status}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <span>{post.source_username}</span>
                  <span>{post.posted_at ? new Date(post.posted_at).toLocaleDateString("ru-RU") : ""}</span>
                </div>
              </button>
            ))}
            {!posts.isLoading && (posts.data?.posts ?? []).length === 0 && (
              <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">Постов пока нет</div>
            )}
          </div>
        </section>

        <aside className={cn("bg-card p-4 lg:col-span-2 xl:col-span-1", activePanel !== "editor" && "hidden lg:block")}>
          {selectedPost ? (
            <>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                className="h-56 w-full resize-y rounded-md border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring sm:resize-none"
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
              />

              <div className="mt-3 grid grid-cols-5 gap-2">
                {["B", "I", "U", "S", "Code"].map((label) => (
                  <Button
                    key={label}
                    variant="outline"
                    className="min-w-0 px-2"
                    onClick={() => setDraftText(`${draftText}${label === "Code" ? "`code`" : ""}`)}
                  >
                    <span className="truncate">{label}</span>
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
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Input value={targetChannel} onChange={(event) => setTargetChannel(event.target.value)} placeholder="@target_channel" />
                <Button disabled={draft.isPending} onClick={() => draft.mutate()}>
                  Черновик
                </Button>
              </div>
            </>
          ) : (
            <div className="flex min-h-60 items-center justify-center rounded-md border bg-background text-sm text-muted-foreground">
              Нет выбранного поста
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

function AuthPanel({
  botName,
  user,
  isLoading,
  error,
  onAuth,
  onLogout,
}: {
  botName: string;
  user: User | null;
  isLoading: boolean;
  error?: string;
  onAuth: (payload: TelegramLoginPayload) => void;
  onLogout: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!botName || user || !containerRef.current) return;

    window.onTelegramAuth = onAuth;
    containerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botName);
    script.setAttribute("data-size", "medium");
    script.setAttribute("data-radius", "6");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    containerRef.current.appendChild(script);

    return () => {
      if (window.onTelegramAuth === onAuth) {
        delete window.onTelegramAuth;
      }
    };
  }, [botName, onAuth, user]);

  if (user) {
    const displayName = user.first_name || user.username || "Telegram";
    return (
      <div className="flex items-center gap-2 rounded-md border bg-background px-2 py-1">
        {user.photo_url ? <img className="h-7 w-7 rounded-full" src={user.photo_url} alt="" /> : <LogIn className="h-4 w-4 text-muted-foreground" />}
        <span className="max-w-32 truncate text-sm">{displayName}</span>
        <Button variant="outline" size="icon" aria-label="Выйти" onClick={onLogout}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (!botName) {
    return (
      <div className="flex h-9 items-center rounded-md border bg-background px-3 text-xs text-muted-foreground">
        TELEGRAM_LOGIN_BOT_USERNAME не задан
      </div>
    );
  }

  return (
    <div className="flex min-h-9 items-center gap-2 rounded-md border bg-background px-2">
      <div ref={containerRef} className={cn("flex items-center", isLoading && "pointer-events-none opacity-60")} />
      {error ? <span className="max-w-40 truncate text-xs text-muted-foreground">{error}</span> : null}
    </div>
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
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted",
        active ? "border-primary bg-muted" : "bg-card",
      )}
    >
      <span className="line-clamp-1 min-w-0">{source.title || source.username}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{source.last_message_id ? "ok" : "new"}</span>
    </button>
  );
}
