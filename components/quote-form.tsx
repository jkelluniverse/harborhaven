/* The quote form — plain HTML POST to /api/lead, no client JS needed. The
   "company" field is the honeypot: visually hidden, humans leave it empty. */

const inputCls =
  "min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 text-lg text-[var(--hh-ink)]";
const labelCls = "mb-1 block font-medium text-[var(--hh-ink)]";

export function QuoteForm() {
  return (
    <form action="/api/lead" method="POST" className="flex flex-col gap-4">
      <div>
        <label htmlFor="q-name" className={labelCls}>Name *</label>
        <input id="q-name" name="name" required autoComplete="name" className={inputCls} />
      </div>
      <div>
        <label htmlFor="q-phone" className={labelCls}>Phone *</label>
        <input id="q-phone" name="phone" type="tel" required autoComplete="tel" className={inputCls} />
      </div>
      <div>
        <label htmlFor="q-email" className={labelCls}>Email</label>
        <input id="q-email" name="email" type="email" autoComplete="email" className={inputCls} />
      </div>
      <div>
        <label htmlFor="q-address" className={labelCls}>Property address *</label>
        <input id="q-address" name="propertyAddress" required autoComplete="street-address" className={inputCls} />
      </div>
      <fieldset>
        <legend className={labelCls}>What do you need? *</legend>
        <div className="flex flex-col gap-2">
          {[
            ["Home Watch", "Home Watch"],
            ["Permit only", "Permit only"],
            ["Project", "Project"],
            ["Something else", "Something else"],
          ].map(([value, label], i) => (
            <label
              key={value}
              className="flex min-h-12 items-center gap-3 rounded-xl border border-stone-300 bg-white px-4 text-lg text-[var(--hh-ink)]"
            >
              <input
                type="radio"
                name="serviceRequested"
                value={value}
                required
                defaultChecked={i === 0}
                className="size-6 accent-[var(--hh-harbor-bright)]"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="q-details" className={labelCls}>Tell us a bit about it</label>
        <textarea id="q-details" name="details" rows={3} className={`${inputCls} min-h-24 py-3`} />
      </div>
      <div>
        <label htmlFor="q-dates" className={labelCls}>When? (optional dates)</label>
        <input id="q-dates" name="preferredDates" className={inputCls} />
      </div>
      {/* Honeypot — hidden from humans, tempting to bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="q-company">Company</label>
        <input id="q-company" name="company" tabIndex={-1} autoComplete="off" />
      </div>
      <button
        type="submit"
        className="min-h-12 rounded-xl bg-[var(--hh-accent)] px-5 text-lg font-semibold text-white active:bg-[var(--hh-accent-dark)]"
      >
        Send request
      </button>
    </form>
  );
}
