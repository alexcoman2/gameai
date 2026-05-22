import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useGetSettings, getGetSettingsQueryKey, useSaveSettings } from "@workspace/api-client-react";
import { Loader2, Save, Terminal, ShieldAlert, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const settingsSchema = z.object({
  apiKey: z.string().optional(),
  screenshotInterval: z.number().min(10).max(300),
  autoCapture: z.boolean(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() }
  });

  const saveMutation = useSaveSettings();

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      apiKey: "",
      screenshotInterval: 60,
      autoCapture: false,
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        apiKey: "",
        screenshotInterval: settings.screenshotInterval,
        autoCapture: settings.autoCapture,
      });
    }
  }, [settings, form]);

  const onSubmit = async (data: SettingsFormValues) => {
    try {
      const payload: any = {
        screenshotInterval: data.screenshotInterval,
        autoCapture: data.autoCapture,
      };
      
      // Only send API key if it was modified
      if (data.apiKey && data.apiKey.trim() !== "") {
        payload.apiKey = data.apiKey;
      } else {
        payload.apiKey = null;
      }

      await saveMutation.mutateAsync({ data: payload });
      
      queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      
      toast({
        title: "SYSTEM UPDATED",
        description: "Configuration parameters saved successfully.",
        className: "bg-card border-primary/50 font-mono text-primary",
      });
      
      // Clear the api key field after saving
      form.setValue("apiKey", "");
      
    } catch (error) {
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
    <div className="flex-1 p-4 md:p-6 max-w-4xl mx-auto w-full">
      <div className="mb-8 flex items-center gap-3 pb-4 border-b border-border">
        <Terminal className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-mono tracking-widest text-primary font-bold">SYSTEM CONFIGURATION</h1>
      </div>

      <div className="grid gap-6">
        <Card className="bg-card/50 border-border rounded-none relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-primary/80"></div>
          <CardHeader>
            <CardTitle className="font-mono flex items-center gap-2 text-lg">
              <ShieldAlert className="w-5 h-5 text-muted-foreground" />
              AUTHENTICATION
            </CardTitle>
            <CardDescription className="font-mono text-xs uppercase tracking-wider">
              AI Core Access Credentials
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <div className="space-y-6">
                  <FormField
                    control={form.control}
                    name="apiKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase tracking-widest text-primary/80">Claude API Key</FormLabel>
                        <FormControl>
                          <Input 
                            type="password"
                            placeholder={settings?.hasApiKey ? "•••••••••••••••••••••••• (Configured)" : "ENTER API KEY..."} 
                            className="font-mono rounded-none bg-background border-border focus-visible:border-primary placeholder:text-muted-foreground/50 h-12"
                            {...field} 
                          />
                        </FormControl>
                        <FormDescription className="font-mono text-[10px] uppercase">
                          {settings?.hasApiKey 
                            ? "Status: ACTIVE. Leave blank to retain current key."
                            : "Status: UNAUTHORIZED. Key required for operation."}
                        </FormDescription>
                        <FormMessage className="font-mono text-xs" />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="w-full h-px bg-border my-8"></div>

                <div className="space-y-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Zap className="w-5 h-5 text-muted-foreground" />
                    <h3 className="font-mono text-lg font-semibold tracking-tight">TELEMETRY MODULE</h3>
                  </div>

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
                      <FormItem className={`space-y-4 rounded-none border border-border p-4 bg-background/50 transition-opacity ${!form.watch("autoCapture") ? 'opacity-50 pointer-events-none' : ''}`}>
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
                            min={10}
                            max={300}
                            step={10}
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
                </div>

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
      </div>
    </div>
  );
}
