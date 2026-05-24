import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { useGetSettings, getGetSettingsQueryKey, useSaveSettings } from "@workspace/api-client-react";
import { Loader2, Save, Terminal, Zap, Gamepad2, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const settingsSchema = z.object({
  screenshotInterval: z.number().min(5).max(300),
  autoCapture: z.boolean(),
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
      screenshotInterval: 5,
      autoCapture: true,
      steamApiKey: "",
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        screenshotInterval: settings.screenshotInterval,
        autoCapture: settings.autoCapture,
        steamApiKey: "",
      });
    }
  }, [settings, form]);

  const onSubmit = async (data: SettingsFormValues) => {
    try {
      await saveMutation.mutateAsync({
        data: {
          screenshotInterval: data.screenshotInterval,
          autoCapture: data.autoCapture,
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
              <Zap className="w-5 h-5 text-muted-foreground" />
              TELEMETRY MODULE
            </CardTitle>
            <CardDescription className="font-mono text-xs uppercase tracking-wider">
              Screen capture settings for AI context
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="autoCapture"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-none border border-border p-4 bg-background/50">
                      <div className="space-y-1">
                        <FormLabel className="font-mono text-sm tracking-widest text-foreground">AUTO-CAPTURE VISUALS</FormLabel>
                        <FormDescription className="font-mono text-[10px] uppercase">
                          Periodically capture screen state for AI context
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="data-[state=checked]:bg-primary"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="screenshotInterval"
                  render={({ field }) => (
                    <FormItem className={`space-y-4 rounded-none border border-border p-4 bg-background/50 transition-opacity ${!form.watch("autoCapture") ? "opacity-50 pointer-events-none" : ""}`}>
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <FormLabel className="font-mono text-sm tracking-widest">CAPTURE INTERVAL</FormLabel>
                          <FormDescription className="font-mono text-[10px] uppercase">
                            Delay between automatic captures
                          </FormDescription>
                        </div>
                        <div className="font-mono font-bold text-primary bg-primary/10 border border-primary/20 px-3 py-1">
                          {field.value}s
                        </div>
                      </div>
                      <FormControl>
                        <Slider
                          min={5}
                          max={300}
                          step={5}
                          value={[field.value]}
                          onValueChange={(vals) => field.onChange(vals[0])}
                          disabled={!form.watch("autoCapture")}
                          className="py-4"
                        />
                      </FormControl>
                      <FormMessage className="font-mono text-xs" />
                    </FormItem>
                  )}
                />

                <div className="pt-4 flex justify-end">
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
                        Enables detection of thousands of additional Steam titles
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
