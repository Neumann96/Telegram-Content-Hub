"use client";

import {
  ArrowDown,
  ArrowUp,
  Bold,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Edit3,
  ImagePlus,
  Italic,
  Link,
  ListFilter,
  LogIn,
  LogOut,
  MessageCircle,
  Plus,
  Quote,
  Search,
  Send,
  Strikethrough,
  Trash2,
  Underline,
} from "lucide-react";
import type { ComponentType, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearStoredUser,
  createMedia,
  createPublishTask,
  createSource,
  deleteMedia,
  getBootstrap,
  getPosts,
  getSources,
  getStoredUser,
  loginWithTelegram,
  saveDraft,
  storeUser,
  updateMedia,
  type Media,
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

const statuses: Array<Post["status"] | ""> = ["", "new", "editing", "ready", "published", "archived"];
const editorStatuses: Post["status"][] = ["new", "editing", "ready", "published", "archived"];
const statusLabels: Record<Post["status"] | "", string> = {
  "": "Все статусы",
  new: "Новые",
  editing: "В работе",
  ready: "Готово",
  published: "Опубликовано",
  archived: "Архив",
};
const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const panels = [
  { id: "sources", label: "Каналы", icon: ListFilter },
  { id: "posts", label: "Посты", icon: MessageCircle },
  { id: "editor", label: "Редактор", icon: Edit3 },
] as const;
const botOverrideKey = "telegram-content-hub-login-bot";
const fallbackLoginBot = "asd20342bot";

type Panel = (typeof panels)[number]["id"];
type FormatAction = "bold" | "italic" | "underline" | "strike" | "code" | "quote" | "spoiler" | "link";

export default function Home() {
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { selectedPostId, setSelectedPostId } = useWorkspaceStore();
  const [newChannel, setNewChannel] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [statusFilter, setStatusFilter] = useState<Post["status"] | "">("");
  const [draftText, setDraftText] = useState("");
  const [draftStatus, setDraftStatus] = useState<Post["status"]>("editing");
  const [targetChannel, setTargetChannel] = useState("");
  const [activePanel, setActivePanel] = useState<Panel>("posts");
  const [user, setUser] = useState<User | null>(null);
  const [botOverride, setBotOverride] = useState("");
  const [newMediaUrl, setNewMediaUrl] = useState("");
  const [newMediaKind, setNewMediaKind] = useState("photo");

  useEffect(() => {
    setUser(getStoredUser());
    setBotOverride(window.localStorage.getItem(botOverrideKey) ?? "");
  }, []);

  const bootstrap = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });
  const sources = useQuery({ queryKey: ["sources", user?.id], queryFn: getSources });
  const postParams = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedSourceId) params.set("source_id", selectedSourceId);
    if (search) params.set("q", search);
    if (dateFrom) params.set("date_from", dateFrom);
    if (statusFilter) params.set("status", statusFilter);
    return params;
  }, [dateFrom, search, selectedSourceId, statusFilter]);
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
    onSuccess: () => {
      setTargetChannel("");
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  const addMedia = useMutation({
    mutationFn: () =>
      createMedia({
        post_id: selectedPost!.id,
        kind: newMediaKind,
        storage_url: newMediaUrl,
        sort_order: nextMediaOrder(selectedPost?.media ?? []),
      }),
    onSuccess: () => {
      setNewMediaUrl("");
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  const patchMedia = useMutation({
    mutationFn: ({ mediaId, payload }: { mediaId: string; payload: Parameters<typeof updateMedia>[1] }) => updateMedia(mediaId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posts"] }),
  });

  const removeMedia = useMutation({
    mutationFn: deleteMedia,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posts"] }),
  });

  const handleTelegramAuth = useCallback((payload: TelegramLoginPayload) => telegramLogin.mutate(payload), [telegramLogin]);

  function logout() {
    clearStoredUser();
    setUser(null);
    queryClient.invalidateQueries();
  }

  function saveBotOverride(value: string) {
    const normalized = value.trim().replace(/^@/, "");
    setBotOverride(normalized);
    if (normalized) {
      window.localStorage.setItem(botOverrideKey, normalized);
    } else {
      window.localStorage.removeItem(botOverrideKey);
    }
  }

  function selectPost(postId: string) {
    setSelectedPostId(postId);
    setActivePanel("editor");
  }

  function applyFormat(action: FormatAction) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? draftText.length;
    const end = textarea?.selectionEnd ?? draftText.length;
    const selected = draftText.slice(start, end) || placeholderFor(action);
    const formatted = formatText(action, selected);
    setDraftText(`${draftText.slice(0, start)}${formatted}${draftText.slice(end)}`);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start, start + formatted.length);
    });
  }

  function replaceMedia(item: Media) {
    const url = window.prompt("Новый URL изображения", item.storage_url);
    if (!url || url.trim() === item.storage_url) return;
    patchMedia.mutate({ mediaId: item.id, payload: { storage_url: url.trim(), sort_order: item.sort_order, kind: item.kind } });
  }

  function moveMedia(item: Media, direction: -1 | 1) {
    const media = [...(selectedPost?.media ?? [])].sort((left, right) => left.sort_order - right.sort_order);
    const index = media.findIndex((candidate) => candidate.id === item.id);
    const swap = media[index + direction];
    if (!swap) return;
    patchMedia.mutate({ mediaId: item.id, payload: { sort_order: swap.sort_order } });
    patchMedia.mutate({ mediaId: swap.id, payload: { sort_order: item.sort_order } });
  }

  const serverBot = bootstrap.data?.telegram_login_bot?.replace(/^@/, "") ?? "";
  const loginBot = serverBot || botOverride;
  const authConfig = bootstrap.data?.auth;

  return (
    <main className="min-h-screen">
      <header className="flex min-h-14 flex-col gap-3 border-b bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between lg:px-5">
        <div className="min-w-0">
          <h1 className="text-base font-semibold">Telegram Content Hub</h1>
          <p className="text-xs text-muted-foreground">
            {posts.isError ? "API недоступен" : user ? "Рабочее пространство Phase 1" : "Войдите через Telegram"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AuthPanel
            botName={loginBot || fallbackLoginBot}
            serverBotName={serverBot}
            botTokenConfigured={authConfig?.telegram_bot_token_configured ?? false}
            user={user}
            isLoading={telegramLogin.isPending}
            error={telegramLogin.error?.message}
            botOverride={botOverride}
            onSaveBotOverride={saveBotOverride}
            onAuth={handleTelegramAuth}
            onLogout={logout}
          />
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
                "flex h-10 items-center justify-center gap-2 rounded-lg border border-transparent text-sm font-medium text-muted-foreground transition-[background-color,border-color,color,transform] duration-200 ease-out active:scale-[0.98]",
                activePanel === panel.id && "border-primary/60 bg-primary/10 text-primary",
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
          <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_180px_170px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск" />
            </div>
            <DateFilter value={dateFrom} onChange={setDateFrom} />
            <StatusFilter value={statusFilter} onChange={setStatusFilter} />
          </div>

          <div className="space-y-2">
            {(posts.data?.posts ?? []).map((post) => (
              <button
                key={post.id}
                onClick={() => selectPost(post.id)}
                className={cn(
                  "w-full rounded-lg border bg-card p-3 text-left transition-[background-color,border-color,color,transform] duration-200 ease-out hover:border-primary/70 hover:bg-muted/70 active:scale-[0.99]",
                  selectedPost?.id === post.id && "border-primary bg-primary/10",
                )}
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <span className="line-clamp-2 min-w-0 text-sm font-medium">{post.edited_text || post.raw_text || "Медиа-пост"}</span>
                  <span className="shrink-0 rounded-md border border-primary/25 bg-primary/10 px-2 py-1 text-xs text-primary">{post.status}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <span>{post.source_username}</span>
                  <span>{post.posted_at ? new Date(post.posted_at).toLocaleDateString("ru-RU") : ""}</span>
                </div>
              </button>
            ))}
            {!posts.isLoading && (posts.data?.posts ?? []).length === 0 && (
              <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Постов пока нет</div>
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
                  className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none transition-[border-color,background-color,color] duration-200 ease-out hover:border-primary/55 focus:border-primary focus:ring-2 focus:ring-ring"
                  value={draftStatus}
                  onChange={(event) => setDraftStatus(event.target.value as Post["status"])}
                >
                  {editorStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              <textarea
                ref={textareaRef}
                className="h-56 w-full resize-y rounded-lg border border-input bg-background p-3 text-sm outline-none transition-[border-color,background-color,color] duration-200 ease-out placeholder:text-muted-foreground hover:border-primary/55 focus:border-primary focus:ring-2 focus:ring-ring sm:resize-none"
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
              />

              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
                <ToolbarButton label="Жирный" onClick={() => applyFormat("bold")} icon={Bold} />
                <ToolbarButton label="Курсив" onClick={() => applyFormat("italic")} icon={Italic} />
                <ToolbarButton label="Подчеркнуть" onClick={() => applyFormat("underline")} icon={Underline} />
                <ToolbarButton label="Зачеркнуть" onClick={() => applyFormat("strike")} icon={Strikethrough} />
                <ToolbarButton label="Код" onClick={() => applyFormat("code")} icon={Code2} />
                <ToolbarButton label="Цитата" onClick={() => applyFormat("quote")} icon={Quote} />
                <ToolbarButton label="Спойлер" onClick={() => applyFormat("spoiler")} text="||" />
                <ToolbarButton label="Ссылка" onClick={() => applyFormat("link")} icon={Link} />
              </div>

              <div className="mt-4 rounded-lg border bg-background p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">Изображения</span>
                  <span className="text-xs text-muted-foreground">{selectedPost.media.length}</span>
                </div>
                <form
                  className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[90px_minmax(0,1fr)_auto]"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (newMediaUrl.trim()) addMedia.mutate();
                  }}
                >
                  <select
                    className="h-10 rounded-lg border border-input bg-background px-2 text-sm outline-none transition-[border-color,background-color,color] duration-200 ease-out hover:border-primary/55 focus:border-primary focus:ring-2 focus:ring-ring"
                    value={newMediaKind}
                    onChange={(event) => setNewMediaKind(event.target.value)}
                  >
                    <option value="photo">photo</option>
                    <option value="video">video</option>
                    <option value="document">document</option>
                    <option value="animation">animation</option>
                  </select>
                  <Input value={newMediaUrl} onChange={(event) => setNewMediaUrl(event.target.value)} placeholder="https://... или telegram://..." />
                  <Button type="submit" variant="outline" size="icon" aria-label="Добавить изображение" disabled={addMedia.isPending}>
                    <ImagePlus className="h-4 w-4" />
                  </Button>
                </form>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[...selectedPost.media].sort((left, right) => left.sort_order - right.sort_order).map((item) => (
                    <div key={item.id} className="rounded-lg border bg-muted p-2 text-xs">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <button className="min-w-0 text-left" type="button" onClick={() => replaceMedia(item)}>
                          <span className="block font-medium">{item.kind}</span>
                          <span className="line-clamp-2 text-muted-foreground">{item.storage_url}</span>
                        </button>
                        <Button variant="outline" size="icon" aria-label="Удалить медиа" onClick={() => removeMedia.mutate(item.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" size="sm" onClick={() => moveMedia(item, -1)}>
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => moveMedia(item, 1)}>
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Input value={targetChannel} onChange={(event) => setTargetChannel(event.target.value)} placeholder="@target_channel" />
                <Button disabled={draft.isPending} onClick={() => draft.mutate()}>
                  Сохранить черновик
                </Button>
              </div>
            </>
          ) : (
            <div className="flex min-h-60 items-center justify-center rounded-lg border bg-background text-sm text-muted-foreground">
              Нет выбранного поста
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

function DateFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedDate = parseInputDate(value);
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => selectedDate ?? new Date());
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthLabel = viewDate.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  const days = getCalendarDays(year, month);

  useEffect(() => {
    if (selectedDate) {
      setViewDate(selectedDate);
    }
  }, [value]);

  useOutsidePointerDown(rootRef, () => setIsOpen(false));

  function moveMonth(direction: -1 | 1) {
    setViewDate(new Date(year, month + direction, 1));
  }

  function selectDate(date: Date) {
    onChange(formatInputDate(date));
    setViewDate(date);
    setIsOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm outline-none transition-[background-color,border-color,color] duration-200 ease-out hover:border-primary/55 focus-visible:border-primary/55",
          isOpen && "border-primary/55",
        )}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className={cn("truncate", !value && "text-muted-foreground")}>{selectedDate ? selectedDate.toLocaleDateString("ru-RU") : "Дата"}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-12 z-20 w-72 rounded-xl border bg-card p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/35 bg-background text-muted-foreground transition-[background-color,border-color,color,transform] duration-200 ease-out hover:border-primary/60 hover:bg-primary/10 hover:text-primary active:scale-[0.96]"
              onClick={() => moveMonth(-1)}
              aria-label="Предыдущий месяц"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-0 truncate text-sm font-medium capitalize">{monthLabel}</span>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/35 bg-background text-muted-foreground transition-[background-color,border-color,color,transform] duration-200 ease-out hover:border-primary/60 hover:bg-primary/10 hover:text-primary active:scale-[0.96]"
              onClick={() => moveMonth(1)}
              aria-label="Следующий месяц"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
            {weekDays.map((day) => (
              <span key={day} className="py-1">
                {day}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const isSelected = value === formatInputDate(day.date);
              const isToday = isSameDate(day.date, new Date());
              return (
                <button
                  key={day.key}
                  type="button"
                  className={cn(
                    "flex h-8 items-center justify-center rounded-lg border border-transparent text-xs transition-[background-color,border-color,color,transform] duration-200 ease-out hover:border-primary/50 hover:bg-primary/10 hover:text-primary active:scale-[0.94]",
                    !day.isCurrentMonth && "text-muted-foreground/50",
                    isToday && "border-primary/30 text-primary",
                    isSelected && "border-primary bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                  )}
                  onClick={() => selectDate(day.date)}
                >
                  {day.date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="h-9 rounded-lg border border-primary/35 bg-background px-3 text-sm text-muted-foreground transition-[background-color,border-color,color,transform] duration-200 ease-out hover:border-primary/60 hover:bg-primary/10 hover:text-primary active:scale-[0.98]"
              onClick={() => {
                onChange(formatInputDate(new Date()));
                setViewDate(new Date());
                setIsOpen(false);
              }}
            >
              Сегодня
            </button>
            <button
              type="button"
              className="h-9 rounded-lg border border-primary/35 bg-background px-3 text-sm text-muted-foreground transition-[background-color,border-color,color,transform] duration-200 ease-out hover:border-primary/60 hover:bg-primary/10 hover:text-primary active:scale-[0.98]"
              onClick={() => {
                onChange("");
                setIsOpen(false);
              }}
            >
              Сбросить
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatusFilter({
  value,
  onChange,
}: {
  value: Post["status"] | "";
  onChange: (value: Post["status"] | "") => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useOutsidePointerDown(rootRef, () => setIsOpen(false));

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm outline-none transition-[background-color,border-color,color] duration-200 ease-out hover:border-primary/55 focus-visible:border-primary/55",
          isOpen && "border-primary/55",
        )}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className={cn("truncate", !value && "text-muted-foreground")}>{statusLabels[value]}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-12 z-20 w-full min-w-44 rounded-xl border bg-card p-1">
          {statuses.map((status) => {
            const isActive = status === value;
            return (
              <button
                key={status || "all"}
                type="button"
                className={cn(
                  "flex h-9 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm text-muted-foreground transition-[background-color,color,transform] duration-200 ease-out hover:bg-primary/10 hover:text-primary active:scale-[0.98]",
                  isActive && "bg-primary/10 text-primary",
                )}
                onClick={() => {
                  onChange(status);
                  setIsOpen(false);
                }}
              >
                <span>{statusLabels[status]}</span>
                {status ? <span className="text-xs opacity-70">{status}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function AuthPanel({
  botName,
  serverBotName,
  botTokenConfigured,
  user,
  isLoading,
  error,
  botOverride,
  onSaveBotOverride,
  onAuth,
  onLogout,
}: {
  botName: string;
  serverBotName: string;
  botTokenConfigured: boolean;
  user: User | null;
  isLoading: boolean;
  error?: string;
  botOverride: string;
  onSaveBotOverride: (value: string) => void;
  onAuth: (payload: TelegramLoginPayload) => void;
  onLogout: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draftBot, setDraftBot] = useState(botOverride);

  useEffect(() => {
    setDraftBot(botOverride);
  }, [botOverride]);

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
      <div className="flex items-center gap-2 rounded-lg border bg-background px-2 py-1">
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
      <form
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 sm:w-auto"
        onSubmit={(event) => {
          event.preventDefault();
          onSaveBotOverride(draftBot);
        }}
      >
        <Input value={draftBot} onChange={(event) => setDraftBot(event.target.value)} placeholder="login bot username" />
        <Button type="submit" variant="outline" size="sm">
          Включить вход
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-9 items-center gap-2 rounded-lg border bg-background px-2">
        <div ref={containerRef} className={cn("flex items-center", isLoading && "pointer-events-none opacity-60")} />
        {!serverBotName ? (
          <Button variant="outline" size="sm" onClick={() => onSaveBotOverride("")}>
            Сменить бота
          </Button>
        ) : null}
      </div>
      {!botTokenConfigured ? (
        <span className="max-w-72 text-xs text-muted-foreground">TELEGRAM_BOT_TOKEN не задан: вход работает без проверки подписи.</span>
      ) : null}
      {error ? <span className="max-w-72 text-xs text-muted-foreground">{error}</span> : null}
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
        "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-[background-color,border-color,color,transform] duration-200 ease-out hover:border-primary/60 hover:bg-muted/80 active:scale-[0.98]",
        active ? "border-primary bg-primary/10 text-primary" : "bg-card",
      )}
    >
      <span className="line-clamp-1 min-w-0">{source.title || source.username}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{source.last_message_id ? "ok" : "new"}</span>
    </button>
  );
}

function ToolbarButton({
  label,
  onClick,
  icon: Icon,
  text,
}: {
  label: string;
  onClick: () => void;
  icon?: ComponentType<{ className?: string }>;
  text?: string;
}) {
  return (
    <Button variant="outline" size="icon" aria-label={label} title={label} onClick={onClick}>
      {Icon ? <Icon className="h-4 w-4" /> : <span className="text-xs font-semibold">{text}</span>}
    </Button>
  );
}

function useOutsidePointerDown<T extends HTMLElement>(ref: RefObject<T | null>, onOutside: () => void) {
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const element = ref.current;
      if (!element || !(event.target instanceof Node) || element.contains(event.target)) return;
      onOutside();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onOutside, ref]);
}

function parseInputDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, month, index - startOffset + 1);
    return {
      key: formatInputDate(date),
      date,
      isCurrentMonth: date.getMonth() === month,
    };
  });
}

function isSameDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function nextMediaOrder(media: Media[]) {
  return media.reduce((max, item) => Math.max(max, item.sort_order), -1) + 1;
}

function placeholderFor(action: FormatAction) {
  if (action === "link") return "текст";
  if (action === "quote") return "цитата";
  return "текст";
}

function formatText(action: FormatAction, text: string) {
  switch (action) {
    case "bold":
      return `*${text}*`;
    case "italic":
      return `_${text}_`;
    case "underline":
      return `__${text}__`;
    case "strike":
      return `~${text}~`;
    case "code":
      return text.includes("\n") ? `\`\`\`\n${text}\n\`\`\`` : `\`${text}\``;
    case "quote":
      return text
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "spoiler":
      return `||${text}||`;
    case "link":
      return `[${text}](https://example.com)`;
  }
}
