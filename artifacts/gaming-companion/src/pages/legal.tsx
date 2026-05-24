import { Link } from "wouter";
import { SITE_CONFIG } from "@/lib/site-config";

function LegalShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-12 max-w-3xl mx-auto w-full">
      <Link
        href="/about"
        className="text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-primary"
      >
        ← Back to Unstuck
      </Link>
      <h1 className="mt-4 text-3xl font-bold font-mono tracking-wider text-primary">
        {title}
      </h1>
      <p className="mt-2 text-xs font-mono text-muted-foreground uppercase tracking-widest">
        Effective {SITE_CONFIG.legalEffectiveDate}
      </p>
      <div className="prose prose-invert mt-8 max-w-none text-sm leading-relaxed text-foreground/90 [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-mono [&_h2]:uppercase [&_h2]:tracking-wider [&_h2]:text-primary [&_h3]:mt-6 [&_h3]:font-semibold [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1 [&_a]:text-primary [&_a]:underline">
        {children}
      </div>
    </div>
  );
}

export function AboutPage() {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-16 max-w-4xl mx-auto w-full">
      <h1 className="text-5xl font-bold font-mono tracking-wider text-primary">
        {SITE_CONFIG.productName}
      </h1>
      <p className="mt-4 text-xl text-muted-foreground">
        An AI gaming companion that watches your screen and helps you get
        unstuck — boss fights, puzzles, builds, quests, anything.
      </p>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        <Tile
          title="Ask"
          body="Type or screenshot a question. Get a concise answer grounded in your current game."
        />
        <Tile
          title="Watch Mode"
          body="Unstuck observes your screen every few seconds and proactively offers tips."
        />
        <Tile
          title="Game-aware"
          body="Detects what you're playing and tailors answers to that game's mechanics."
        />
      </div>

      <h2 className="mt-12 text-base font-mono uppercase tracking-wider text-primary">
        Pricing
      </h2>
      <ul className="mt-3 text-sm space-y-2 text-foreground/90">
        <li>
          <b>Free</b> — 40 chats and 1 hour of Watch Mode per month. Hard cap;
          no overage; voice mode not included.
        </li>
        <li>
          <b>Pro — $19/month</b> — 150 chats and 3 hours of Watch Mode
          included, plus voice mode. Then $0.04 / chat and $0.15 / minute of
          Watch Mode usage.
        </li>
        <li>
          <b>Pro+ — $39/month</b> — 400 chats and 8 hours of Watch Mode
          included, plus voice mode. Then $0.04 / chat and $0.12 / minute of
          Watch Mode usage.
        </li>
        <li>
          <b>Elite — $99/month</b> — 1,500 chats and 25 hours of Watch Mode
          included, plus voice mode. Then $0.03 / chat and $0.10 / minute of
          Watch Mode usage.
        </li>
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Subscriptions auto-renew monthly. Overage is billed at the end of each
        billing period via Paddle. A $5/day per-user safety fuse caps any
        single day's spend.
      </p>

      <h2 className="mt-12 text-base font-mono uppercase tracking-wider text-primary">
        System requirements
      </h2>
      <ul className="mt-3 text-sm space-y-1 text-foreground/90">
        <li>Windows 10 or Windows 11 (64-bit)</li>
        <li>At least 4 GB RAM available to the app</li>
        <li>Internet connection</li>
      </ul>

      <h2 className="mt-12 text-base font-mono uppercase tracking-wider text-primary">
        Company & contact
      </h2>
      <p className="mt-3 text-sm text-foreground/90">
        {SITE_CONFIG.legalEntityName}. For support, write to{" "}
        <a
          className="text-primary underline"
          href={`mailto:${SITE_CONFIG.contactEmail}`}
        >
          {SITE_CONFIG.contactEmail}
        </a>
        .
      </p>

      <div className="mt-12 flex flex-wrap gap-x-6 gap-y-2 text-xs font-mono uppercase tracking-wider">
        <Link href="/sign-in" className="text-primary hover:underline">
          Open the app →
        </Link>
      </div>
    </div>
  );
}

export function PricingPage() {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-16 max-w-5xl mx-auto w-full">
      <Link
        href="/about"
        className="text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-primary"
      >
        ← Back to Unstuck
      </Link>
      <h1 className="mt-4 text-4xl font-bold font-mono tracking-wider text-primary">
        Pricing
      </h1>
      <p className="mt-3 text-sm text-muted-foreground max-w-2xl">
        Four plans. All prices in USD. Paid plans bill monthly and auto-renew
        until you cancel. Cancel anytime — your plan stays active through the
        end of the period you've already paid for. Sold by{" "}
        {SITE_CONFIG.legalEntityName} via Paddle.com Market Limited (our
        Merchant of Record), with PayPal also available at checkout.
      </p>

      <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <PriceCard
          name="Free"
          price="$0"
          cadence=""
          included={[
            "40 chats / month",
            "1 hour of Watch Mode / month",
            "Text + screenshot chat only",
            "Hard cap — usage stops at the limit",
          ]}
          overage="No overage. When the cap is hit, the app blocks until next month. Voice mode is not included on the free tier."
        />
        <PriceCard
          name="Pro"
          price="$19"
          cadence="/ month USD"
          highlight
          included={[
            "150 chats / month",
            "3 hours of Watch Mode / month",
            "Voice mode (mic in, spoken replies)",
            "Cancel anytime",
          ]}
          overage="Then $0.04 / additional chat and $0.15 / additional minute of Watch Mode, billed at the end of each period."
        />
        <PriceCard
          name="Pro+"
          price="$39"
          cadence="/ month USD"
          included={[
            "400 chats / month",
            "8 hours of Watch Mode / month",
            "Voice mode included",
            "Cancel anytime",
          ]}
          overage="Then $0.04 / additional chat and $0.12 / additional minute of Watch Mode, billed at the end of each period."
        />
        <PriceCard
          name="Elite"
          price="$99"
          cadence="/ month USD"
          included={[
            "1,500 chats / month",
            "25 hours of Watch Mode / month",
            "Voice mode included",
            "Priority response on support",
          ]}
          overage="Then $0.03 / additional chat and $0.10 / additional minute of Watch Mode, billed at the end of each period."
        />
      </div>

      <h2 className="mt-14 text-base font-mono uppercase tracking-wider text-primary">
        How overage billing works
      </h2>
      <ul className="mt-3 text-sm space-y-2 text-foreground/90 list-disc pl-5">
        <li>
          Your monthly allowance resets at the start of each billing period.
        </li>
        <li>
          On Pro, Pro+, and Elite, going over your included allowance does
          not block you — you keep using the app at the per-unit overage
          rates above.
        </li>
        <li>
          We total your overage usage at the end of the billing period and
          charge it as a single line item via Paddle alongside your next
          renewal.
        </li>
        <li>
          A safety fuse caps any single user at <b>$5 / day</b> of total cost
          regardless of plan. If you somehow blow through this, the app pauses
          until 00:00 UTC. This is to protect you from a stuck Watch Mode loop
          or a bad prompt.
        </li>
      </ul>

      <h2 className="mt-12 text-base font-mono uppercase tracking-wider text-primary">
        Cancellation & refunds
      </h2>
      <p className="mt-3 text-sm text-foreground/90">
        Cancel from your account at any time — see the{" "}
        <Link href="/legal/refund" className="text-primary underline">
          Refund Policy
        </Link>{" "}
        for full details including the 14-day satisfaction window.
      </p>

      <h2 className="mt-12 text-base font-mono uppercase tracking-wider text-primary">
        Questions
      </h2>
      <p className="mt-3 text-sm text-foreground/90">
        Email{" "}
        <a
          className="text-primary underline"
          href={`mailto:${SITE_CONFIG.contactEmail}`}
        >
          {SITE_CONFIG.contactEmail}
        </a>{" "}
        and we'll get back to you.
      </p>

      <div className="mt-14 flex flex-wrap gap-x-6 gap-y-2 text-xs font-mono uppercase tracking-wider">
        <Link href="/about" className="text-muted-foreground hover:text-primary">
          About
        </Link>
        <Link href="/legal/terms" className="text-muted-foreground hover:text-primary">
          Terms of Service
        </Link>
        <Link href="/legal/privacy" className="text-muted-foreground hover:text-primary">
          Privacy Policy
        </Link>
        <Link href="/legal/refund" className="text-muted-foreground hover:text-primary">
          Refund Policy
        </Link>
        <Link href="/sign-in" className="text-primary hover:underline">
          Open the app →
        </Link>
      </div>
    </div>
  );
}

function PriceCard({
  name,
  price,
  cadence,
  included,
  overage,
  highlight,
}: {
  name: string;
  price: string;
  cadence: string;
  included: string[];
  overage: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "border p-6 flex flex-col " +
        (highlight
          ? "border-primary bg-primary/5"
          : "border-border bg-card/40")
      }
    >
      <div className="text-xs font-mono uppercase tracking-widest text-primary">
        {name}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-bold font-mono">{price}</span>
        {cadence && (
          <span className="text-xs text-muted-foreground">{cadence}</span>
        )}
      </div>
      <ul className="mt-5 space-y-2 text-sm text-foreground/90 flex-1">
        {included.map((line) => (
          <li key={line}>· {line}</li>
        ))}
      </ul>
      <p className="mt-5 text-xs text-muted-foreground border-t border-border/50 pt-4">
        {overage}
      </p>
    </div>
  );
}

function Tile({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-border bg-card/40 p-5">
      <div className="text-xs font-mono uppercase tracking-widest text-primary">
        {title}
      </div>
      <p className="mt-2 text-sm text-foreground/90">{body}</p>
    </div>
  );
}

export function TermsPage() {
  return (
    <LegalShell title="Terms of Service">
      <p>
        These Terms of Service ("Terms") govern your access to and use of{" "}
        {SITE_CONFIG.productName} (the "Service"), operated by{" "}
        {SITE_CONFIG.legalEntityName} ("we", "us"). By creating an account or
        using the Service you agree to these Terms.
      </p>

      <h2>1. The Service</h2>
      <p>
        {SITE_CONFIG.productName} is a desktop application and accompanying
        cloud service that watches the user's screen (with their consent) and
        responds to questions about the game they are playing, using
        third-party large language models. The Service is provided on an
        "as-is" basis and may produce inaccurate or incomplete answers.
      </p>

      <h2>2. Accounts</h2>
      <p>
        You need an account to use the Service. You are responsible for the
        security of your credentials and for all activity that occurs under
        your account. You must be at least 13 years old (or the minimum age of
        digital consent in your jurisdiction, whichever is higher).
      </p>

      <h2>3. Subscriptions and Billing</h2>
      <p>
        Paid subscriptions are sold by Paddle.com Market Limited (or its
        affiliates), which acts as our Merchant of Record. PayPal is also
        offered as an alternative payment method at checkout. Plan prices,
        included monthly allowances, and overage rates are displayed in the
        app's Upgrade screen and on our public website.
      </p>
      <p>
        Subscriptions renew automatically each month at the then-current
        price. If your usage in a billing period exceeds the included
        allowance, the additional usage is billed at the per-unit overage
        rates shown when you subscribed. Overage is charged at the end of
        each billing period.
      </p>
      <p>
        You can cancel at any time from the in-app Upgrade screen. Cancellation
        takes effect at the end of the current billing period.
      </p>

      <h2>4. Acceptable use</h2>
      <ul>
        <li>
          Do not use the Service to violate the terms of any game you play,
          to facilitate cheating in competitive online games, or to abuse
          anti-cheat systems.
        </li>
        <li>Do not share your account credentials.</li>
        <li>
          Do not use the Service to send us screenshots that contain other
          people's private information.
        </li>
        <li>
          Do not attempt to bypass usage limits, the daily spend safety cap,
          or any rate-limiting we apply.
        </li>
      </ul>

      <h2>5. Content and intellectual property</h2>
      <p>
        You retain all rights to the screenshots and prompts you submit. By
        submitting them you grant us a limited license to process them through
        our third-party AI providers solely to generate your responses. We do
        not use your content to train models.
      </p>

      <h2>6. Disclaimers</h2>
      <p>
        Game advice provided by the Service is generated by AI and may be
        wrong, out of date, or inappropriate for your situation. Use it at your
        own risk. We are not affiliated with the publishers of any games you
        play.
      </p>

      <h2>7. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, our total liability for any
        claim arising out of or relating to the Service will not exceed the
        amount you paid us in the 12 months immediately preceding the event
        that gave rise to the claim.
      </p>

      <h2>8. Termination</h2>
      <p>
        We may suspend or terminate your access if you materially breach these
        Terms (including by repeatedly hitting the daily spend safety cap from
        abusive use). You may stop using the Service at any time.
      </p>

      <h2>9. Governing law</h2>
      <p>
        These Terms are governed by the laws of {SITE_CONFIG.jurisdiction},
        without regard to its conflict-of-laws principles.
      </p>

      <h2>10. Changes to the Terms</h2>
      <p>
        We may update these Terms from time to time. The "Effective" date at
        the top of this page reflects the most recent change. Continued use
        of the Service after a change means you accept the new Terms.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions? Write to{" "}
        <a href={`mailto:${SITE_CONFIG.contactEmail}`}>
          {SITE_CONFIG.contactEmail}
        </a>
        .
      </p>
    </LegalShell>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <p>
        This Privacy Policy explains what personal data we collect when you
        use {SITE_CONFIG.productName}, why we collect it, and who we share it
        with.
      </p>

      <h2>1. What we collect</h2>
      <ul>
        <li>
          <b>Account data</b> — your email address and an opaque user ID,
          provided by our authentication provider (Clerk).
        </li>
        <li>
          <b>Conversation content</b> — the chat messages and screenshots you
          submit to the Service, along with the AI's responses, stored on our
          servers so you can resume past sessions.
        </li>
        <li>
          <b>Watch Mode screenshots</b> — while Watch Mode is switched on, the
          app captures a screenshot of your active display roughly every 5
          seconds and sends it to the AI so it can proactively offer tips.
          These screenshots are processed and discarded within minutes of the
          AI call; they are not kept long-term.
        </li>
        <li>
          <b>Voice audio</b> — if you use voice mode, the audio of your spoken
          prompts is sent to our transcription provider (OpenAI Whisper).
          Audio is not retained after transcription.
        </li>
        <li>
          <b>Game detection data</b> — the name of the foreground game on your
          machine while the app is running, plus a short-lived game-profile
          record so the AI remembers your build / quest progress between
          sessions for the games you play.
        </li>
        <li>
          <b>Usage records</b> — the number of chats, seconds of Watch Mode
          and voice minutes you used, along with the cost of the underlying
          AI calls. Used for billing, the daily spend safety cap, and your
          in-app usage dashboard.
        </li>
        <li>
          <b>Billing data</b> — the subscription tier you are on and a
          customer/subscription identifier from Paddle or PayPal. We do not
          see or store your full payment card details.
        </li>
        <li>
          <b>Diagnostics</b> — crash reports and anonymous product-analytics
          events (which screens are used, which features are clicked). No
          screenshots, chat content, or voice audio is included in these.
        </li>
      </ul>

      <h2>2. Who we share it with (processors)</h2>
      <ul>
        <li>
          <b>Anthropic</b> — to generate AI responses to your prompts
          (Claude Sonnet 4.6 for chat, Claude Haiku 4.5 for Watch Mode).
        </li>
        <li>
          <b>OpenAI</b> — for voice transcription (Whisper) and text-to-speech
          replies when voice mode is on. Audio is not retained after the call.
        </li>
        <li>
          <b>Exa</b> — to retrieve web search results that ground the AI's
          answers, when relevant.
        </li>
        <li>
          <b>Clerk</b> — to authenticate your account.
        </li>
        <li>
          <b>Paddle</b> — Merchant of Record for subscriptions (default
          payment processor).
        </li>
        <li>
          <b>PayPal</b> — alternative payment processor if you choose PayPal
          at checkout.
        </li>
        <li>
          <b>Sentry</b> (EU region) — error and crash diagnostics.
        </li>
        <li>
          <b>PostHog</b> (EU region) — anonymous product analytics.
        </li>
        <li>
          <b>Replit</b> — to host the cloud portion of the Service.
        </li>
      </ul>
      <p>
        We do not sell your personal data to anyone, and we do not use your
        prompts, screenshots, or voice audio to train AI models. Our AI
        providers (Anthropic, OpenAI) are contractually bound to the same
        no-training commitment for API traffic.
      </p>

      <h2>3. Retention</h2>
      <p>
        Conversation history is kept while your account exists so you can
        resume past sessions. Usage records are kept for as long as needed
        for billing reconciliation and tax compliance (typically 7 years).
        Watch Mode screenshots and voice audio are processed and discarded
        within minutes of the AI call.
      </p>

      <h2>4. Your rights</h2>
      <p>
        You may request a copy of the personal data we hold about you, ask
        us to correct it, or ask us to delete your account by writing to{" "}
        <a href={`mailto:${SITE_CONFIG.privacyEmail}`}>
          {SITE_CONFIG.privacyEmail}
        </a>
        . We respond within 30 days. Depending on your jurisdiction you may
        have additional rights under GDPR, UK GDPR, or CCPA.
      </p>

      <h2>5. Cookies</h2>
      <p>
        The web portion of the Service uses strictly necessary cookies set by
        our authentication provider to keep you signed in, plus a
        first-party PostHog cookie for anonymous product analytics. We do not
        use advertising cookies and we do not share data with ad networks.
      </p>

      <h2>6. Security</h2>
      <p>
        We protect data in transit with TLS, and at rest with the encryption
        provided by our hosting and database providers. Authentication tokens
        from Clerk are short-lived. Access to production systems is limited
        to people who need it.
      </p>

      <h2>7. Changes</h2>
      <p>
        We will update this policy from time to time. Material changes will
        be announced inside the app or by email to the address on file.
      </p>

      <h2>8. Contact</h2>
      <p>
        Privacy questions:{" "}
        <a href={`mailto:${SITE_CONFIG.privacyEmail}`}>
          {SITE_CONFIG.privacyEmail}
        </a>
        .
      </p>
    </LegalShell>
  );
}

export function RefundPage() {
  return (
    <LegalShell title="Refund Policy">
      <p>
        We want you to feel good about paying for {SITE_CONFIG.productName}.
        This page explains when refunds are available and how to request one.
      </p>

      <h2>1. Cancelling a subscription</h2>
      <p>
        You can cancel at any time from the in-app Upgrade screen. Cancellation
        stops automatic renewal — you will continue to have paid access until
        the end of the current billing period.
      </p>

      <h2>2. 14-day satisfaction window</h2>
      <p>
        If you upgrade to a paid plan and decide it is not for you, write to{" "}
        <a href={`mailto:${SITE_CONFIG.refundsEmail}`}>
          {SITE_CONFIG.refundsEmail}
        </a>{" "}
        within 14 days of the upgrade and we will refund that subscription
        period in full, provided you have not used substantially all of the
        included monthly allowance (we consider over 80% of either the chat
        or Watch Mode allowance to be "substantially used").
      </p>

      <h2>3. Overage charges</h2>
      <p>
        Usage above the plan's included allowance is billed at the per-unit
        overage rates shown on the Upgrade screen at the time you subscribed.
        Overage charges are based on usage that has already occurred and are
        non-refundable, except where required by law or where we made a
        billing error.
      </p>

      <h2>4. Billing errors</h2>
      <p>
        If you believe you were billed incorrectly, contact{" "}
        <a href={`mailto:${SITE_CONFIG.refundsEmail}`}>
          {SITE_CONFIG.refundsEmail}
        </a>{" "}
        within 60 days of the charge and we will investigate and refund any
        amount that was charged in error.
      </p>

      <h2>5. Statutory consumer rights</h2>
      <p>
        Nothing in this policy limits any non-waivable rights you have under
        the consumer-protection laws of your country (for example, the EU
        consumer right of withdrawal). Refunds are processed by Paddle, our
        Merchant of Record, back to the original payment method.
      </p>

      <h2>6. Contact</h2>
      <p>
        Refund requests:{" "}
        <a href={`mailto:${SITE_CONFIG.refundsEmail}`}>
          {SITE_CONFIG.refundsEmail}
        </a>
        .
      </p>
    </LegalShell>
  );
}
