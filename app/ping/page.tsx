// Minimal page with zero imports — temporary probe for the production
// redirect-loop debug. If even this 307s, no page content is at fault.
export default function PingPage() {
  return <p>ping ok</p>;
}
