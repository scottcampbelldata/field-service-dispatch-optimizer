const CASE_STUDY = "https://scottcampbell.io/projects/dispatch-optimizer/";

// Title band and summary aside, as on the scottcampbell.io project pages.
export function ReportBand() {
  return (
    <div className="report-band">
      <div className="report-band-inner">
        <div>
          <div className="report-kicker">Decision optimization on a synthetic benchmark</div>
          <h1>Schedule 12 technicians against 110 jobs and SLA deadlines</h1>
          <p className="report-lead">
            OR-Tools CP-SAT assigns a seeded field service backlog by skill, SLA
            window, travel and shift capacity. Every control change below runs a
            real solve.
          </p>
        </div>
        <dl className="glance" aria-label="Board summary">
          <dt>The question</dt>
          <dd>Which technician should take each job so fewer SLA deadlines are missed?</dd>
          <dt>The data</dt>
          <dd>A synthetic Dallas-Fort Worth backlog and crew, seeded and reproducible. No real customer data.</dd>
          <dt>The read</dt>
          <dd>
            Over 200 randomized scenarios, warm-started CP-SAT matches greedy plus
            2-opt, which takes a median 12 SLA breaches a day off the naive
            baseline. <a href={CASE_STUDY}>Read the case study</a>.
          </dd>
        </dl>
      </div>
    </div>
  );
}
