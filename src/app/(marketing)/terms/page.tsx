import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { CREDIT_POLICY } from "@/config/pricing";

export const metadata: Metadata = { title: "Terms of Service" };

// Baseline terms describing how the product actually works. Have them reviewed
// by counsel for your jurisdiction before launch; edit freely.
export default function TermsPage() {
  return (
    <article className="prose-legal mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-5xl">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated October 9, 2026</p>

      <h2>1. The service</h2>
      <p>{brand.name} generates websites from descriptions you provide, lets you refine them, and lets you download the resulting files. Generated output can contain mistakes; review it before publishing.</p>

      <h2>2. Your account</h2>
      <p>You are responsible for activity on your account and for keeping your credentials secure. You must be old enough to form a binding contract where you live.</p>

      <h2>3. Your content</h2>
      <p>You keep ownership of the text, images, models and other material you upload, and of the websites you download. You grant us the limited permission needed to store, process and display that material to provide the service. Only upload material you have the right to use. Reference screenshots are used for general visual direction only.</p>

      <h2>4. Acceptable use</h2>
      <p>Do not use {brand.name} to create unlawful, deceptive or infringing content, to impersonate others, to build pages that collect credentials or payments under false pretenses, or to attack or overload the service.</p>

      <h2>5. Credits, subscriptions and payments</h2>
      <p>Payments are processed by Stripe. Subscriptions renew each billing period until canceled; you can cancel any time from the billing page, effective at the end of the current period.</p>
      <ul>
        {CREDIT_POLICY.map((p) => (
          <li key={p.title}>
            <strong>{p.title}.</strong> {p.body}
          </li>
        ))}
      </ul>

      <h2>6. Exports and third-party code</h2>
      <p>Downloaded websites include third-party libraries under their own licenses (listed in each export&apos;s notices file). Our procedural 3D models and site runtime are released under CC0. Exported sites are static; features such as contact forms only work with services you configure.</p>

      <h2>7. Availability and changes</h2>
      <p>We may change, suspend or discontinue features. We will give reasonable notice of material changes to these terms.</p>

      <h2>8. Disclaimers and liability</h2>
      <p>The service is provided “as is”. To the extent permitted by law, we are not liable for indirect or consequential losses, and our total liability is limited to the amounts you paid us in the twelve months before the claim.</p>

      <h2>9. Contact</h2>
      <p>Questions about these terms: <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.</p>
    </article>
  );
}
