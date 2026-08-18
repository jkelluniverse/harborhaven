import Link from "next/link";
import { QuoteForm } from "@/components/quote-form";
import { Logo } from "@/components/logo";

/* Public home page — single scrolling page built from
   docs/HH-SITE-COPY-DRAFT-1.md. Copy is used as written; edits go through
   Jacob. Every section ends near a quote CTA. */

const PHONE = "(941) 961-2252";
const PHONE_HREF = "tel:+19419612252";
// TODO(Jacob): confirm the public email address — placeholder per copy doc.
const EMAIL = "info@harborhavenhomewatch.com";

const AREAS = [
  "Sarasota", "Siesta Key", "Lido Key", "Bird Key",
  "Longboat Key", "University Park", "Lakewood Ranch",
];

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "Harbor Haven Home Watch, LLC",
  telephone: "+1-941-961-2252",
  address: { "@type": "PostalAddress", addressLocality: "Sarasota", addressRegion: "FL", postalCode: "34236" },
  areaServed: AREAS.map((a) => ({ "@type": "Place", name: a })),
  url: "https://harborhavenhomewatch.com",
  description: "Home watch, permit pulling, and project management in Sarasota, Florida.",
};

function Cta({ href = "/quote", children }: { href?: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--hh-harbor)] px-6 text-lg font-semibold text-white active:bg-[var(--hh-harbor-bright)]"
    >
      {children}
    </Link>
  );
}

export default function HomePage() {
  return (
    <div className="bg-[var(--hh-white)] text-lg text-[var(--hh-ink)]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />

      {/* Nav */}
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 backdrop-blur">
        <nav className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Logo size={44} />
          <div className="hidden gap-4 sm:flex">
            <a href="#home-watch" className="min-h-12 py-3 font-medium text-[var(--hh-harbor)]">Home Watch</a>
            <a href="#permits" className="min-h-12 py-3 font-medium text-[var(--hh-harbor)]">Permits &amp; Projects</a>
          </div>
          <Cta href="#quote">Request a quote</Cta>
        </nav>
      </header>

      {/* Hero */}
      <section className="bg-[var(--hh-harbor)] px-4 py-16 text-center text-white">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
            Your eyes on your Sarasota home — and your hands on the project.
          </h1>
          <p className="mt-4 text-xl text-stone-200">
            Home watch for seasonal residents. Permits and project management for
            anyone who needs work done right.
          </p>
          <p className="mt-4 text-base text-stone-300">{AREAS.join(" · ")}</p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {/* On the deep-green hero, the CTA inverts to cream for contrast. */}
            <Link
              href="#quote"
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--hh-sand)] px-6 text-lg font-semibold text-[var(--hh-harbor)] active:bg-white"
            >
              Request a quote
            </Link>
            <a
              href={PHONE_HREF}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white px-6 text-lg font-semibold text-white"
            >
              Call {PHONE}
            </a>
          </div>
        </div>
      </section>

      {/* Two front doors */}
      <section className="mx-auto grid max-w-3xl gap-4 px-4 py-12 sm:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-2xl bg-[var(--hh-sand)] p-6">
          <h2 className="text-2xl font-bold text-[var(--hh-harbor)]">Home Watch</h2>
          <p>
            Scheduled visits while you&rsquo;re away. Every visit ends with a
            time-stamped photo report in your inbox. If something&rsquo;s wrong,
            you hear about it the same day — and we handle it.
          </p>
          <Cta href="#quote">Request home watch</Cta>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl bg-[var(--hh-sand)] p-6">
          <h2 className="text-2xl font-bold text-[var(--hh-harbor)]">Permits &amp; Project Management</h2>
          <p>
            Need a permit pulled? Need a renovation run start to finish? We pull
            permits under a licensed general contractor and manage your project —
            subs, supplies, schedule, and final walkthrough — so you deal with
            one person.
          </p>
          <Cta href="#quote">Request a project quote</Cta>
        </div>
      </section>

      {/* Home watch detail */}
      <section id="home-watch" className="bg-[var(--hh-sand)] px-4 py-12">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-[var(--hh-harbor)]">Home Watch, in detail</h2>
          <p className="mt-3">
            Florida is hard on empty houses. AC fails, humidity climbs, pests
            move in, a slow leak becomes a floor. Home Watch is a scheduled
            visual inspection that catches these early.
          </p>
          <ul className="mt-4 flex list-disc flex-col gap-2 pl-6">
            <li>Weekly or bi-weekly visits, on a schedule you choose</li>
            <li>Photo report after every visit, time-stamped</li>
            <li>Same-day call if we find a problem, and we coordinate the fix with your vendor or ours</li>
            <li>Key holder service for contractors, deliveries, and emergencies</li>
            <li>Storm prep and post-storm checks</li>
            <li>Pre-arrival prep and post-departure lock-up</li>
          </ul>
          <p className="mt-4">Fully insured. Set up remotely if you&rsquo;re not in town.</p>
          <div className="mt-5"><Cta href="#quote">Request a quote</Cta></div>
        </div>
      </section>

      {/* Permits detail */}
      <section id="permits" className="px-4 py-12">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-[var(--hh-harbor)]">Permits &amp; Projects, in detail</h2>
          <p className="mt-3">
            <strong>Permit only.</strong> Licensed contractors and homeowners who
            need a City of Sarasota permit but can&rsquo;t pull one themselves:
            we pull it under our general contractor&rsquo;s license. Flat fee,
            fast turnaround.
          </p>
          <p className="mt-3">
            <strong>Managed projects.</strong> From driveway and decking to
            painting, fencing, tile, roofing, stucco, gutters, concrete,
            electrical, and plumbing — we quote it, permit it if required, hire
            from our vetted subcontractor list, track every dollar, and walk it
            with you at the end before the final bill.
          </p>
          <p className="mt-3">
            You get one estimate, one point of contact, staged billing on larger
            jobs, and a link to pay by bank transfer or card.
          </p>
          <div className="mt-5"><Cta href="#quote">Request a quote</Cta></div>
        </div>
      </section>

      {/* Also */}
      <section className="bg-[var(--hh-sand)] px-4 py-12">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-[var(--hh-harbor)]">Also</h2>
          <p className="mt-3">
            <strong>Concierge.</strong> Meet a contractor, accept a delivery,
            stock the fridge before you land, airport runs. Ask.
          </p>
          <p className="mt-3">
            <strong>Realtors &amp; vacant listings.</strong> Showing prep, curb
            appeal, routine checks until it sells.
          </p>
        </div>
      </section>

      {/* Testimonials: pending — carry the two existing ones verbatim once
          confirmed with Chris (copy doc §What clients say). Deliberately not
          rendered until the real text is in hand. */}

      {/* FAQ */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-[var(--hh-harbor)]">Questions people ask</h2>
          <dl className="mt-4 flex flex-col gap-4">
            {[
              ["What is home watch?", "A scheduled visual inspection of your home while you're away — we check the things that go wrong in empty Florida houses and send you a photo report every visit."],
              ["How often do you visit?", "Weekly or bi-weekly, on a schedule you choose."],
              ["What if you find a problem?", "You get a call the same day, and we coordinate the fix with your vendor or ours."],
              ["Can you pull a permit for my contractor?", "Yes — we pull City of Sarasota permits under our general contractor's license. Flat fee, fast turnaround."],
              ["How do I pay?", "You get a link by text or email — bank transfer is free, or pay by card."],
              ["Are you insured?", "Yes, fully insured."],
            ].map(([q, a]) => (
              <div key={q}>
                <dt className="font-bold text-[var(--hh-harbor)]">{q}</dt>
                <dd className="mt-1">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Quote form */}
      <section id="quote" className="bg-[var(--hh-sand)] px-4 py-12">
        <div className="mx-auto max-w-lg">
          <h2 className="text-2xl font-bold text-[var(--hh-harbor)]">Request a quote</h2>
          <p className="mb-5 mt-2">
            Tell us what you need — Chris will call you within one business day.
          </p>
          <QuoteForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[var(--hh-harbor)] px-4 py-10 text-center text-base text-stone-300">
        <p className="font-semibold text-white">Harbor Haven Home Watch, LLC</p>
        <p className="mt-1">
          Sarasota, FL 34236 · <a href={PHONE_HREF} className="underline">{PHONE}</a> ·{" "}
          <a href={`mailto:${EMAIL}`} className="underline">{EMAIL}</a>
        </p>
        <p className="mt-3">
          <Link href="/login" className="underline">Owner login</Link>
        </p>
        <p className="mt-3">© Harbor Haven Home Watch, LLC</p>
      </footer>
    </div>
  );
}
