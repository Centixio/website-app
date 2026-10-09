import type { Metadata } from "next";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "Privacy Policy" };

// Describes the data this codebase actually processes and the services it uses.
// Have it reviewed for your jurisdiction (GDPR/CCPA, etc.) before launch.
export default function PrivacyPage() {
  return (
    <article className="prose-legal mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-5xl">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated October 9, 2026</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account data:</strong> your email address and authentication details.</li>
        <li><strong>Project data:</strong> your descriptions, settings, chat messages, uploaded files and the generated website versions.</li>
        <li><strong>Billing data:</strong> subscription status and credit history. Card details are handled by Stripe and never reach our servers.</li>
        <li><strong>Technical data:</strong> basic logs needed to run, secure and debug the service, including preview error reports.</li>
      </ul>

      <h2>How we use it</h2>
      <p>To provide the service: generating and storing your websites, charging and tracking credits, preventing abuse, and supporting you. We don&apos;t sell your personal data.</p>

      <h2>Services we rely on</h2>
      <ul>
        <li><strong>Supabase</strong> — authentication, database and file storage.</li>
        <li><strong>Stripe</strong> — payments and subscriptions.</li>
        <li><strong>Anthropic</strong> — AI generation. Your descriptions, settings, project text and any reference screenshot are sent to generate and edit designs.</li>
        <li><strong>Google Fonts</strong> — fonts load from Google&apos;s servers in previews and exported sites.</li>
      </ul>

      <h2>Your uploads</h2>
      <p>Uploaded files are stored in a private bucket and shown to you through short-lived signed links. Previews run in a sandbox that cannot access your account.</p>

      <h2>Retention and deletion</h2>
      <p>Deleting a project removes its versions, messages and uploaded files. To delete your account and all associated data, contact us. Billing records may be kept as required by law.</p>

      <h2>Cookies</h2>
      <p>We use essential cookies to keep you signed in. We don&apos;t use advertising cookies.</p>

      <h2>Contact</h2>
      <p>Privacy questions or requests: <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.</p>
    </article>
  );
}
