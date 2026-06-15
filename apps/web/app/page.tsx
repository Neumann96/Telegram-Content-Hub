"use client";

import { CalendarDays, ImagePlus, Search, Send, Settings2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspaceStore } from "@/store/workspace";

async function getBootstrap() {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
  const response = await fetch(`${baseUrl}/api/bootstrap`);
  if (!response.ok) {
    throw new Error("Failed to load bootstrap data");
  }
  return response.json() as Promise<{ features: string[]; telegram_login_bot?: string }>;
}

const channels = ["@example_source", "@market_news", "@product_digest"];
const posts = [
  { id: "1", channel: "@example_source", title: "Новый пост для редакции", status: "new", date: "Сегодня" },
  { id: "2", channel: "@market_news", title: "Черновик с медиагруппой", status: "editing", date: "Вчера" },
  { id: "3", channel: "@product_digest", title: "Готово к публикации", status: "ready", date: "12 июн" },
];

export default function Home() {
  const { selectedPostId, setSelectedPostId } = useWorkspaceStore();
  const bootstrap = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap, retry: 1 });
  const selectedPost = posts.find((post) => post.id === selectedPostId) ?? posts[0];

  return (
    <main className="min-h-screen">
      <header className="flex h-14 items-center justify-between border-b bg-card px-5">
        <div>
          <h1 className="text-base font-semibold">Telegram Content Hub</h1>
          <p className="text-xs text-muted-foreground">
            API {bootstrap.isSuccess ? "подключен" : "ожидает подключения"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Settings2 className="h-4 w-4" />
            Источники
          </Button>
          <Button size="sm">
            <Send className="h-4 w-4" />
            Опубликовать
          </Button>
        </div>
      </header>

      <section className="grid min-h-[calc(100vh-3.5rem)] grid-cols-[260px_minmax(360px,1fr)_420px]">
        <aside className="border-r bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Каналы</h2>
            <Button variant="outline" size="icon" aria-label="Добавить канал">
              +
            </Button>
          </div>
          <div className="space-y-2">
            {channels.map((channel) => (
              <button
                key={channel}
                className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span>{channel}</span>
                <span className="text-xs text-muted-foreground">on</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="border-r p-4">
          <div className="mb-4 grid grid-cols-[1fr_140px_120px] gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Поиск по тексту" />
            </div>
            <Button variant="outline">
              <CalendarDays className="h-4 w-4" />
              Дата
            </Button>
            <Button variant="outline">Канал</Button>
          </div>
          <div className="space-y-2">
            {posts.map((post) => (
              <button
                key={post.id}
                onClick={() => setSelectedPostId(post.id)}
                className="w-full rounded-md border bg-card p-3 text-left hover:border-primary"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{post.title}</span>
                  <span className="rounded-sm bg-muted px-2 py-1 text-xs text-muted-foreground">{post.status}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{post.channel}</span>
                  <span>{post.date}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <aside className="bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Редактор</h2>
              <p className="text-xs text-muted-foreground">{selectedPost.channel}</p>
            </div>
            <Button variant="outline" size="sm">Черновик</Button>
          </div>
          <textarea
            className="h-56 w-full resize-none rounded-md border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            defaultValue={`${selectedPost.title}\n\nТекст будет храниться как raw_text плюс telegram_entities JSON, чтобы не терять форматирование Telegram.`}
          />
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button variant="outline">B</Button>
            <Button variant="outline">I</Button>
            <Button variant="outline">Code</Button>
          </div>
          <div className="mt-4 rounded-md border bg-background p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Изображения</span>
              <Button variant="outline" size="icon" aria-label="Добавить изображение">
                <ImagePlus className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((item) => (
                <div key={item} className="aspect-square rounded-md border bg-muted" />
              ))}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
