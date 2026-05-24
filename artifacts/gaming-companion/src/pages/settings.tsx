import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGetSettings, getGetSettingsQueryKey, useSaveSettings } from "@workspace/api-client-react";
import { Loader2, Save, Terminal, Gamepad2, Eye, EyeOff, Keyboard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const settingsSchema = z.object({
  steamApiKey: z.string(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showSteamKey, setShowSteamKey] = useState(false);

  const { data: settings, isLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() }
  });

  const saveMutation = useSaveSettings();

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      steamApiKey: "",
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({ steamApiKey: "" });
    }
  }, [settings, form]);

  const onSubmit = async (data: SettingsFormValues) => {
    try {
      await saveMutation.mutateAsync({
        data: {
          steamApiKey: data.steamApiKey || null,
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      form.setValue("steamApiKey", "");
      toast({
        title: "SYSTEM UPDATED",
        description: "Configuration parameters saved successfully.",
        className: "bg-card border-primary/50 font-mono text-primary",
      });
    } catch {
      toast({
        title: "UPDATE FAILED",
        description: "Unable to write configuration to memory.",
        variant: "destructive",
        className: "font-mono rounded-none",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-4xl mx-auto w-full">
      <div className="mb-8 flex items-center gap-3 pb-4 border-b border-border">
        <Terminal className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-mono tracking-widest text-primary font-bold">SYSTEM CONFIGURATION</h1>
      </div>

      <div className="grid gap-6">
        <Card className="bg-card/50 border-border rounded-none relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-primary/80"></div>
          <CardHeader>
            <CardTitle className="font-mono flex items-center gap-2 text-lg">
              <Keyboard className="w-5 h-5 text-muted-foreground" />
              KEYBOARD SHORTCUTS
            </CardTitle>
            <CardDescription className="font-mono text-xs uppercase tracking-wider">
              Global hotkeys — work even while a game is focused
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border border border-border bg-background/50 font-mono text-sm">
              {[
                {
                  label: "Show / hide chat overlay",
                  primary: ["Ctrl", "Shift", "Space"],
                  fallback: ["Alt", "Space"],
                },
                {
                  label: "Voice input — tap once to start, tap again to send",
                  primary: ["Ctrl", "Shift", "V"],
                  fallback: ["Alt", "V"],
                },
                {
                  label: "Hands-free mode (auto-listen on / off)",
                  primary: ["Ctrl", "Shift", "H"],
                  fallback: ["Alt", "H"],
                },
                {
                  label: "Close / hide overlay while focused",
                  primary: ["Esc"],
                },
              ].map((row) => (
                <li
                  key={row.label}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="text-foreground/90 text-xs sm:text-sm">
                    {row.label}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1">
                      {row.primary.map((k) => (
                        <kbd
                          key={k}
                          className="rounded-none border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-primary"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                    {row.fallback && (
                      <>
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                          or
                        </span>
                        <span className="flex items-center gap-1">
                          {row.fallback.map((k) => (
                            <kbd
                              key={k}
                              className="rounded-none border border-border bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground"
                            >
                              {k}
                            </kbd>
                          ))}
                        </span>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mt-3">
              If the primary combo is taken by another app, Unstuck
              automatically falls back to the alternate. The active binding is
              shown inside the overlay.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border rounded-none relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/80"></div>
          <CardHeader>
            <CardTitle className="font-mono flex items-center gap-2 text-lg">
              <Gamepad2 className="w-5 h-5 text-muted-foreground" />
              GAME DETECTION
            </CardTitle>
            <CardDescription className="font-mono text-xs uppercase tracking-wider">
              Steam API integration for expanded title coverage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="rounded-none border border-border p-4 bg-background/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="font-mono text-sm tracking-widest text-foreground">STEAM API KEY</p>
                      <p className="font-mono text-[10px] uppercase text-muted-foreground">
                        Optional — improves detection for obscure or indie titles
                      </p>
                    </div>
                    {settings?.hasSteamApiKey && (
                      <span className="font-mono text-[10px] uppercase tracking-widest text-green-500 border border-green-500/40 bg-green-500/10 px-2 py-1">
                        CONFIGURED
                      </span>
                    )}
                  </div>

                  <FormField
                    control={form.control}
                    name="steamApiKey"
                    render={({ field }) => (
                      <FormItem>
                        <div className="relative">
                          <FormControl>
                            <Input
                              {...field}
                              type={showSteamKey ? "text" : "password"}
                              placeholder={settings?.hasSteamApiKey ? "••••••••••••  (leave blank to keep)" : "Enter Steam Web API key…"}
                              className="font-mono text-sm rounded-none bg-background border-border pr-10"
                              autoComplete="off"
                            />
                          </FormControl>
                          <button
                            type="button"
                            onClick={() => setShowSteamKey((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            tabIndex={-1}
                          >
                            {showSteamKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <FormMessage className="font-mono text-xs" />
                        <p className="font-mono text-[10px] text-muted-foreground uppercase mt-1">
                          Get a free key at{" "}
                          <a
                            href="https://steamcommunity.com/dev/apikey"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline underline-offset-2"
                          >
                            steamcommunity.com/dev/apikey
                          </a>
                          . Without a key, game detection still uses Steam store search as a fallback.
                        </p>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={saveMutation.isPending}
                    className="font-mono rounded-none uppercase tracking-widest h-12 px-8 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Save className="mr-2 h-4 w-4" />
                    Commit Changes
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
